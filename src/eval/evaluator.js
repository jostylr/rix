/**
 * RiX Evaluator
 *
 * Walks an IR tree and dispatches to system functions via the registry.
 * IR nodes have the form: { fn: "NAME", args: [...] }
 *
 * The evaluate function is the core recursive interpreter.
 */

import fs from "node:fs";
import path from "node:path";
import { Registry } from "./registry.js";
import { SystemContext } from "../runtime/system-context.js";
import { createSystemLookup } from "../runtime/system-manifest.js";
import { Context } from "../runtime/context.js";
import { Cell, copyAllMeta, deepCopyValue, shallowCopyValue } from "../runtime/cell.js";
import { isHole } from "../runtime/hole.js";
import { runtimeDefaults } from "../runtime/runtime-config.js";
import { coreFunctions } from "./functions/core.js";
import { arithmeticFunctions } from "./functions/arithmetic.js";
import { comparisonFunctions } from "./functions/comparison.js";
import { logicFunctions } from "./functions/logic.js";
import { controlFunctions } from "./functions/control.js";
import { collectionFunctions } from "./functions/collections.js";
import { functionFunctions } from "./functions/functions.js";
import { methodFunctions } from "./functions/methods.js";
import { propertyFunctions } from "./functions/properties.js";
import { advancedFunctions } from "./functions/advanced.js";
import { stdlibFunctions } from "./functions/stdlib.js";
import { diagnosticFunctions } from "./functions/diagnostics.js";
import { installSymbolicVariants, symbolicCapabilities, symbolicFunctions } from "./functions/symbolic.js";
import { outputFunctions } from "./functions/output.js";
import { installRegisteredTypes, registerBuiltinSemanticTypes } from "../runtime/type-system.js";
import { createDefaultComplexCollection, createDefaultExactCollection } from "../runtime/exact-values.js";
import { createAlgebraOutputCollection, createGraphicsOutputCollection, createPlotOutputCollection } from "../runtime/output.js";
import { installDrawPlugin } from "../plugins/draw.js";
import { createDefaultUnitCollection } from "../runtime/quantities.js";
import { installUnitExactVariants, unitExactFunctions } from "./functions/units.js";
import { parse } from "../parser/parser.js";
import { posToLineCol } from "../parser/tokenizer.js";
import { lower } from "./lower.js";
import { isLazySequence, materializeLazySequence } from "../runtime/lazy-sequence.js";

/**
 * Create the internal operator/language registry (no user-accessible stdlib).
 * Stdlib functions are now in SystemContext, accessible only via `.Name()`.
 */
export function createDefaultRegistry(options = {}) {
    registerBuiltinSemanticTypes();
    const registry = new Registry();
    registry.registerAll(coreFunctions);
    registry.registerAll(arithmeticFunctions);
    registry.registerAll(comparisonFunctions);
    registry.registerAll(logicFunctions);
    registry.registerAll(controlFunctions);
    registry.registerAll(collectionFunctions);
    registry.registerAll(functionFunctions);
    registry.registerAll(methodFunctions);
    registry.registerAll(propertyFunctions);
    registry.registerAll(advancedFunctions);
    registry.registerAll(unitExactFunctions);
    registry.registerAll(symbolicFunctions);
    registry.registerAll(outputFunctions);
    installRegisteredTypes(registry);
    installUnitExactVariants(registry);
    installSymbolicVariants(registry);
    for (const loadStartup of options.startupLoaders || []) {
        loadStartup(registry);
    }
    // Note: stdlibFunctions no longer registered here — use createDefaultSystemContext()
    return registry;
}

// Public, syntax-equivalent core names. Each delegates to its one evaluator
// Registry operation, so `a + b` and `.Add(a, b)` cannot drift apart.
// Structural forms use explicit public data forms (`.Pair`, `.Params`, and
// colon-string names) rather than exposing misleading raw IR details.
const CORE_SYNTAX_CAPABILITIES = {
    Add: "ADD", Sub: "SUB", Mul: "MUL", Div: "DIV", IntDiv: "INTDIV",
    DivUp: "DIVUP", DivRound: "DIVROUND", Mod: "MOD", Pow: "POW",
    PowProd: "POWPROD", Neg: "NEG", Abs: "ABS", Sqrt: "SQRT",
    Equal: "EQ", NotEqual: "NEQ", Less: "LT", Greater: "GT",
    LessEqual: "LTE", GreaterEqual: "GTE", SameCell: "SAME_CELL",
    Min: "MIN", Max: "MAX", And: "AND", Or: "OR", Not: "NOT",
    Array: "ARRAY", Tuple: "TUPLE", Set: "SET", Interval: "INTERVAL",
    Union: "UNION", Intersect: "INTERSECT", Difference: "SET_DIFF",
    SymmetricDifference: "SET_SYMDIFF", Product: "SET_PROD", Concat: "CONCAT",
    Block: "BLOCK", Case: "CASE", Loop: "LOOP", If: "TERNARY",
    Pipe: "PIPE", PipeExplicit: "PIPE_EXPLICIT", Slice: "PSLICE_STRICT",
    SliceClamp: "PSLICE_CLAMP", Split: "PSPLIT", Chunk: "PCHUNK",
    PMap: "PMAP", Filter: "PFILTER", Reduce: "PREDUCE", Reverse: "PREVERSE",
    Sort: "PSORT", All: "PALL", Any: "PANY",
    Assign: "ASSIGN", AssignCopy: "ASSIGN_COPY", AssignUpdate: "ASSIGN_UPDATE",
    AssignDeepCopy: "ASSIGN_DEEP_COPY", AssignDeepUpdate: "ASSIGN_DEEP_UPDATE",
    Lambda: "LAMBDA",
};

// `@>` and friends are first-class operator references and historically carry
// these compact internal names. Keep them as compatibility entry points; the
// normal public spellings above remain `.Greater`, `.Equal`, and so on.
const LEGACY_OPERATOR_CAPABILITIES = ["EQ", "NEQ", "LT", "GT", "LTE", "GTE", "SAME_CELL"];

function coreOperationCapability(operation, definition) {
    return {
        lazy: definition.lazy === true,
        pure: definition.pure === true,
        doc: definition.doc || `Core operation ${operation}`,
        impl(args, _context, evaluate) {
            // `args` are evaluated for eager capabilities and raw IR for lazy
            // ones, exactly matching the target Registry operation contract.
            return evaluate({ fn: operation, args });
        },
    };
}

function coreString(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string or colon-string`);
}

function parameterListCapability(args) {
    return {
        positional: args.map((value) => ({ name: coreString(value, ".Params entry"), holeDefault: null })),
        keyword: [],
        conditionals: [],
        prep: [],
        prepStrict: false,
        metadata: {},
    };
}

function mapPairCapability(args) {
    if (args.length !== 2) throw new Error(".Pair expects exactly a key and a value");
    return { type: "map_pair", key: args[0], value: args[1] };
}

function coreMapCapability(args, _context, evaluate) {
    // MAP_OBJ is lazy because literal entries preserve capture metadata. Public
    // Pair values are already concrete, which MAP_OBJ also accepts.
    return evaluate({ fn: "MAP_OBJ", args });
}

function defineCapability(args, _context, evaluate) {
    const name = coreString(evaluate(args[0]), ".Define name");
    const params = evaluate(args[1]);
    return evaluate({ fn: "FUNCDEF", args: [name, params, args[2]] });
}
const SCRIPT_RUNTIME_ENV_KEY = "__script_runtime__";
const SOURCE_ENV_KEY = "__source__";
const CURRENT_FILE_ENV_KEY = "__current_file__";

/**
 * Create a default SystemContext with all stdlib capabilities, frozen by default.
 * Syntax-equivalent core operations are also exposed in PascalCase, so
 * `.Add(a, b)` and `a + b` share one implementation.
 * Pass { frozen: false } to get a mutable context for host-side customisation.
 *
 * @param {Object} [options]
 * @param {boolean} [options.frozen=true] - Start frozen (default) or mutable
 */
export function createDefaultSystemContext(options = {}) {
    const frozen = options.frozen !== false; // default true
    const ctx = new SystemContext(new Map(), false); // always build unfrozen
    const units = options.units || createDefaultUnitCollection();
    const exact = options.exact || createDefaultExactCollection();
    const complex = options.complex || createDefaultComplexCollection(exact);
    ctx.registerValue("Units", units, { doc: "Canonical RiX unit collection" });
    ctx.registerValue("Exact", exact, { doc: "Canonical RiX exact-generator collection" });
    ctx.registerValue("Complex", complex, { doc: "Exact complex-number operations" });
    const algebra = createAlgebraOutputCollection();
    ctx.registerValue("Algebra", algebra, { doc: "Algebra presentation helpers" });
    const graphics = createGraphicsOutputCollection();
    ctx.registerValue("Graphics", graphics, { doc: "Intrinsic portable 2D scene language" });
    installDrawPlugin(ctx);
    const plot = createPlotOutputCollection();
    ctx.registerValue("Plot", plot, { doc: "Portable plotting helpers" });
    ctx.registerAll(stdlibFunctions);
    ctx.registerAll(symbolicCapabilities);
    ctx.registerAll(outputFunctions);
    ctx.register("EVAL", coreFunctions.EVAL);
    ctx.register("TypeExport", coreFunctions.TYPE_EXPORT);
    ctx.register("TypeImport", coreFunctions.TYPE_IMPORT);
    ctx.register("TraitRegister", coreFunctions.TRAIT_REGISTER);
    ctx.register("TypeRegister", coreFunctions.TYPE_REGISTER);
    ctx.register("TypeInstall", coreFunctions.TYPE_INSTALL);
    ctx.register("CapabilityRegister", coreFunctions.CAPABILITY_REGISTER);
    ctx.register("ImportJS", coreFunctions.IMPORT_JS);
    ctx.register("JSCall", coreFunctions.JS_CALL);
    ctx.register("LOOP", controlFunctions.LOOP);
    // User-callable property functions (KEYOF, KEYS, VALUES)
    const userPropertyNames = ["KEYOF", "KEYS", "VALUES"];
    for (const name of userPropertyNames) {
        if (propertyFunctions[name]) ctx.register(name, propertyFunctions[name]);
    }
    const syntaxSources = {
        ...coreFunctions,
        ...arithmeticFunctions,
        ...comparisonFunctions,
        ...logicFunctions,
        ...controlFunctions,
        ...collectionFunctions,
        ...functionFunctions,
    };
    for (const [displayName, operation] of Object.entries(CORE_SYNTAX_CAPABILITIES)) {
        const definition = syntaxSources[operation];
        if (definition) {
            ctx.register(displayName, coreOperationCapability(operation, definition));
        }
    }
    for (const operation of LEGACY_OPERATOR_CAPABILITIES) {
        const definition = syntaxSources[operation];
        if (definition) ctx.register(operation, coreOperationCapability(operation, definition));
    }
    // Public structural constructors use concrete values at the boundary while
    // continuing to hand their canonical representation to the same IR ops.
    ctx.register("Params", { impl: parameterListCapability, doc: "Create a positional parameter descriptor from names" });
    ctx.register("Pair", { impl: mapPairCapability, doc: "Create a key/value entry for .Map" });
    ctx.register("Map", { impl: coreMapCapability, doc: "Create a map from .Pair(key, value) entries" });
    ctx.register("Define", {
        lazy: true,
        impl: defineCapability,
        doc: "Define a named function from a name, .Params descriptor, and body",
    });
    // Diagnostic system capabilities (.Warn, .Info, .Error, .Stop, .Test, .Debug, .Trace)
    ctx.registerAll(diagnosticFunctions);
    ctx.register("ConvertUnit", unitExactFunctions.CONVERTUNIT);
    ctx.register("DefineUnit", unitExactFunctions.DEFINEUNIT);
    ctx.register("DefineExactGenerator", unitExactFunctions.DEFINEEXACTGENERATOR);
    ctx.installManagementNamespaces();
    for (const [group, members] of Object.entries(runtimeDefaults.capabilityGroups)) {
        ctx.registerGroup(group, members);
    }
    if (frozen) ctx.freeze();
    return ctx;
}

function getScriptRuntime(context, options = {}) {
    let runtime = context.getEnv(SCRIPT_RUNTIME_ENV_KEY);
    if (!runtime) {
        runtime = {
            systemLookup: options.systemLookup || defaultSystemLookup,
            preparedScripts: new Map(),
            activeImports: [],
            frameStack: [],
        };
        context.setEnv(SCRIPT_RUNTIME_ENV_KEY, runtime);
        return runtime;
    }

    if (!runtime.systemLookup) {
        runtime.systemLookup = options.systemLookup || defaultSystemLookup;
    }
    return runtime;
}

function getScriptCapabilityConfig(context, systemContext = null) {
    const groupOverride = context.getEnv("capabilityGroups", null);
    const policyOverride = context.getEnv("defaultScriptCapabilityPolicy", null);
    const permissionOverride = context.getEnv("scriptPermissionNames", null);

    return {
        capabilityGroups: {
            ...runtimeDefaults.capabilityGroups,
            ...(systemContext?.getCapabilityGroups?.() || {}),
            ...(groupOverride || {}),
        },
        defaultPolicy: {
            ...runtimeDefaults.defaultScriptCapabilityPolicy,
            ...(policyOverride || {}),
        },
        permissionNames: new Set(permissionOverride || runtimeDefaults.scriptPermissionNames),
    };
}

function getHostAvailablePermissions(context) {
    return new Set(getScriptCapabilityConfig(context).permissionNames);
}

function stripMeta(value) {
    if (value && typeof value === "object" && value._ext) {
        delete value._ext;
    }
    return value;
}

function cloneValueForBinding(value, mode) {
    if (mode === "copy") {
        return stripMeta(shallowCopyValue(value));
    }
    if (mode === "copy_meta") {
        const next = stripMeta(shallowCopyValue(value));
        copyAllMeta(value, next, "shallow");
        return next;
    }
    if (mode === "deep_copy") {
        return stripMeta(deepCopyValue(value));
    }
    if (mode === "deep_copy_meta") {
        const next = stripMeta(deepCopyValue(value));
        copyAllMeta(value, next, "deep");
        return next;
    }
    return value;
}

function buildBoundCell(sourceCell, mode) {
    if (mode === "alias") {
        return sourceCell;
    }
    return new Cell(cloneValueForBinding(sourceCell.value, mode));
}

function applyBindingToCurrentScope(context, target, sourceCell, mode) {
    if (mode === "alias") {
        context.setCell(target, sourceCell);
        return sourceCell.value;
    }
    const clonedCell = buildBoundCell(sourceCell, mode);
    context.setCell(target, clonedCell);
    return clonedCell.value;
}

function resolveCallerBindingCell(context, spec) {
    const sourceScope = spec.sourceScope || "current";
    const cell =
        sourceScope === "ancestor"
            ? context.getAncestorCell(spec.source)
            : context.getImmediateCell(spec.source);

    if (!cell) {
        const scopeLabel = sourceScope === "ancestor" ? "ancestor" : "current";
        throw new Error(`Undefined ${scopeLabel} variable for script binding: ${spec.source}`);
    }
    return cell;
}

function unwrapScriptBoundaryNode(node) {
    return node?.type === "Statement" ? node.expression : node;
}

function extractScriptInterface(ast, resolvedPath) {
    const meaningful = [];
    for (let i = 0; i < ast.length; i++) {
        const node = unwrapScriptBoundaryNode(ast[i]);
        if (!node || node.type === "Comment") continue;
        meaningful.push({ index: i, node });
    }

    let inputContract = null;
    let exportBindings = null;
    const removeIndices = new Set();

    if (meaningful.length > 0 && meaningful[0].node.type === "ScriptBindingsDeclaration") {
        inputContract = meaningful[0].node.bindings;
        removeIndices.add(meaningful[0].index);
    }

    if (
        meaningful.length > 0 &&
        meaningful[meaningful.length - 1].node.type === "ScriptBindingsDeclaration" &&
        meaningful[meaningful.length - 1].index !== meaningful[0]?.index
    ) {
        exportBindings = meaningful[meaningful.length - 1].node.bindings;
        removeIndices.add(meaningful[meaningful.length - 1].index);
    }

    const body = ast.filter((_, index) => !removeIndices.has(index));
    for (const stmt of body) {
        const node = unwrapScriptBoundaryNode(stmt);
        if (node?.type === "ScriptBindingsDeclaration") {
            throw new Error(`Script input/export declarations must appear only as the first or last statement (${resolvedPath})`);
        }
    }

    return { inputContract, exportBindings, body };
}

function prepareScript(resolvedPath, runtime) {
    const cached = runtime.preparedScripts.get(resolvedPath);
    if (cached) {
        return cached;
    }

    let source;
    try {
        source = fs.readFileSync(resolvedPath, "utf8");
    } catch (error) {
        throw new Error(`Unable to load script '${resolvedPath}': ${error.message}`);
    }

    const ast = parse(source, runtime.systemLookup || defaultSystemLookup);
    const { inputContract, exportBindings, body } = extractScriptInterface(ast, resolvedPath);
    const bodyIr = lower(body);
    attachSourceInfo(bodyIr, source, resolvedPath);
    const prepared = {
        path: resolvedPath,
        dir: path.dirname(resolvedPath),
        inputContract,
        exportBindings,
        bodyIr,
    };

    runtime.preparedScripts.set(resolvedPath, prepared);
    return prepared;
}

function attachHiddenProperty(target, key, value) {
    Object.defineProperty(target, key, {
        value,
        enumerable: false,
        configurable: true,
    });
}

function attachSourceInfo(node, source, file = "<repl>", seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) {
        return node;
    }
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) attachSourceInfo(item, source, file, seen);
        return node;
    }

    if (node.fn) {
        attachHiddenProperty(node, "__source", source);
        attachHiddenProperty(node, "__file", file);
    }

    if (Array.isArray(node.args)) {
        for (const arg of node.args) attachSourceInfo(arg, source, file, seen);
    }
    return node;
}

function getNodeLocation(irNode, context) {
    if (!irNode?.pos) return null;

    const source = irNode.__source ?? context?.getEnv?.(SOURCE_ENV_KEY, null);
    if (!source) return null;

    const file = irNode.__file ?? context?.getEnv?.(CURRENT_FILE_ENV_KEY, "<repl>");
    let offset = irNode.pos[1] ?? irNode.pos[0];
    if ((irNode.fn === "RETRIEVE" || irNode.fn === "OUTER_RETRIEVE") && typeof irNode.args?.[0] === "string") {
        const nameOffset = findIdentifierOffset(source, irNode.args[0], offset);
        if (nameOffset !== -1) {
            offset = nameOffset;
        }
    }
    const { line, col } = posToLineCol(source, offset);
    const filePart = file && file !== "<repl>" ? `${file}:` : "";
    return `${filePart}line ${line}, column ${col}`;
}

function findIdentifierOffset(source, name, approximateOffset) {
    const isIdentChar = (ch) => /[A-Za-z0-9_]/.test(ch);
    let offset = Math.max(0, Math.min(approximateOffset ?? source.length, source.length));
    while (offset >= 0) {
        const found = source.lastIndexOf(name, offset);
        if (found === -1) return -1;
        const before = found > 0 ? source[found - 1] : "";
        const after = source[found + name.length] || "";
        if (!isIdentChar(before) && !isIdentChar(after)) {
            return found;
        }
        offset = found - 1;
    }
    return -1;
}

function annotateEvaluationError(error, irNode, context) {
    if (!error || typeof error !== "object" || error.__rixLocationAttached) {
        return error;
    }

    const location = getNodeLocation(irNode, context);
    if (!location) return error;

    error.message = `${error.message} (${location})`;
    error.__rixLocationAttached = true;
    if (!error.rixLocation) {
        error.rixLocation = location;
    }
    return error;
}

function restrictSystemContext(systemContext, allowedNames) {
    const child = new SystemContext(new Map(), false, { hostContext: systemContext._hostContext });
    for (const name of systemContext.getAllNames()) {
        if (allowedNames.has(name)) {
            const entry = systemContext.get(name);
            if (entry.kind !== "function") child.registerValue(entry.displayName, entry.value, entry);
            else if (Object.prototype.hasOwnProperty.call(entry, "value")) {
                child.registerCallableValue(entry.displayName, entry.value, entry, entry);
            } else child.register(entry.displayName, entry, entry);
        }
    }
    for (const [group, members] of Object.entries(systemContext.getCapabilityGroups())) {
        child.registerGroup(group, members.filter((name) => allowedNames.has(name)));
    }
    child._rebindManagementNamespaces();
    child.freeze();
    return child;
}

function expandCapabilityTarget(modifier, availableFunctions, availablePermissions, groups, permissionNames) {
    if (modifier.targetType === "all") {
        return {
            functions: new Set(availableFunctions),
            permissions: new Set(availablePermissions),
        };
    }

    if (modifier.targetType === "function") {
        return {
            functions: new Set([modifier.target]),
            permissions: new Set(),
        };
    }

    const groupEntries = groups[modifier.target];
    if (!Array.isArray(groupEntries)) {
        throw new Error(`Unknown capability group: ${modifier.target}`);
    }

    const functions = new Set();
    const permissions = new Set();
    for (const name of groupEntries) {
        if (permissionNames.has(name)) {
            permissions.add(name);
        } else {
            functions.add(name);
        }
    }
    return { functions, permissions };
}

function deriveScriptCapabilityFrame(systemContext, parentPermissions, modifiers, context) {
    const { capabilityGroups, defaultPolicy, permissionNames } = getScriptCapabilityConfig(context, systemContext);
    const availableFunctions = new Set(systemContext.getAllNames());
    const availablePermissions = new Set(parentPermissions);

    const allowedFunctions = defaultPolicy.includeAllFunctions
        ? new Set(availableFunctions)
        : new Set((defaultPolicy.functions || []).filter((name) => availableFunctions.has(name)));
    const allowedPermissions = new Set(
        (defaultPolicy.permissions || []).filter((name) => availablePermissions.has(name)),
    );

    for (const modifier of modifiers || []) {
        const expanded = expandCapabilityTarget(
            modifier,
            availableFunctions,
            availablePermissions,
            capabilityGroups,
            permissionNames,
        );

        if (modifier.action === "add") {
            for (const name of expanded.functions) {
                if (availableFunctions.has(name)) {
                    allowedFunctions.add(name);
                }
            }
            for (const name of expanded.permissions) {
                if (availablePermissions.has(name)) {
                    allowedPermissions.add(name);
                }
            }
            continue;
        }

        for (const name of expanded.functions) {
            allowedFunctions.delete(name);
        }
        for (const name of expanded.permissions) {
            allowedPermissions.delete(name);
        }
    }

    return {
        systemContext: restrictSystemContext(systemContext, allowedFunctions),
        functionNames: allowedFunctions,
        permissions: allowedPermissions,
    };
}

function validateInputsAgainstContract(inputSpecs, inputContract) {
    if (!Array.isArray(inputContract) || inputContract.length === 0) {
        return;
    }

    const actualByTarget = new Map((inputSpecs || []).map((spec) => [spec.target, spec]));
    for (const contract of inputContract) {
        const actual = actualByTarget.get(contract.target);
        if (!actual) {
            throw new Error(`Missing required script input: ${contract.target}`);
        }

        if (contract.mode === "alias" && actual.mode !== "alias") {
            throw new Error(`Script input '${contract.target}' requires alias passing`);
        }
        if (contract.mode !== "alias" && actual.mode === "alias") {
            throw new Error(`Script input '${contract.target}' requires copy-style passing`);
        }
    }
}

function bindScriptInputs(scriptContext, parentContext, inputSpecs, inputContract) {
    validateInputsAgainstContract(inputSpecs, inputContract);

    for (const spec of inputSpecs || []) {
        const sourceCell = resolveCallerBindingCell(parentContext, spec);
        applyBindingToCurrentScope(scriptContext, spec.target, sourceCell, spec.mode);
    }
}

function buildExportBundle(scriptContext, exportBindings) {
    const entries = new Map();

    for (const spec of exportBindings || []) {
        const sourceCell = scriptContext.getCell(spec.source);
        if (!sourceCell) {
            throw new Error(`Cannot export undefined script binding: ${spec.source}`);
        }
        entries.set(spec.target, buildBoundCell(sourceCell, spec.mode));
    }

    return {
        type: "export_bundle",
        entries,
    };
}

function getExportBundleCell(bundle, name) {
    if (!bundle || bundle.type !== "export_bundle" || !(bundle.entries instanceof Map)) {
        return null;
    }
    return bundle.entries.get(name) ?? null;
}

function applyCallerOutputBindings(context, outputSpecs, bundle) {
    for (const spec of outputSpecs || []) {
        const sourceCell = getExportBundleCell(bundle, spec.source);
        if (!sourceCell) {
            throw new Error(`Unknown script export: ${spec.source}`);
        }
        applyBindingToCurrentScope(context, spec.target, sourceCell, spec.mode);
    }
}

function resolveScriptPath(requestedPath, runtime, context) {
    const currentFrame = runtime.frameStack[runtime.frameStack.length - 1];
    const baseDir = currentFrame?.dir || context.getEnv("scriptBaseDir", process.cwd());
    const relativePath = requestedPath.endsWith(".rix") ? requestedPath : `${requestedPath}.rix`;
    return path.resolve(baseDir, relativePath);
}

function evaluateScriptImport(spec, context, registry, systemContext) {
    const runtime = getScriptRuntime(context);
    const parentFrame = runtime.frameStack[runtime.frameStack.length - 1] || null;

    if (parentFrame && !parentFrame.permissions.has("IMPORTS")) {
        throw new Error("Script imports are not allowed in this script context");
    }

    const resolvedPath = resolveScriptPath(spec.path, runtime, context);
    if (runtime.activeImports.includes(resolvedPath)) {
        throw new Error(`Cyclic script import detected: ${[...runtime.activeImports, resolvedPath].join(" -> ")}`);
    }

    const prepared = prepareScript(resolvedPath, runtime);
    const parentPermissions = parentFrame
        ? new Set(parentFrame.permissions)
        : getHostAvailablePermissions(context);
    const capabilityFrame = deriveScriptCapabilityFrame(
        systemContext,
        parentPermissions,
        spec.capabilityModifiers || [],
        context,
    );

    const scriptContext = new Context();
    scriptContext.env = context.env;
    scriptContext.push(undefined, { isolated: true, callableBoundary: true });

    runtime.activeImports.push(resolvedPath);
    runtime.frameStack.push({
        path: prepared.path,
        dir: prepared.dir,
        functionNames: capabilityFrame.functionNames,
        permissions: capabilityFrame.permissions,
    });

    try {
        bindScriptInputs(scriptContext, context, spec.inputs || [], prepared.inputContract);

        let finalResult = null;
        for (const node of prepared.bodyIr) {
            finalResult = evaluate(node, scriptContext, registry, capabilityFrame.systemContext);
        }

        if (!prepared.exportBindings || prepared.exportBindings.length === 0) {
            if (spec.outputs && spec.outputs.length > 0) {
                throw new Error("Caller-side script outputs require the imported script to declare exports");
            }
            return finalResult;
        }

        const bundle = buildExportBundle(scriptContext, prepared.exportBindings);
        applyCallerOutputBindings(context, spec.outputs || [], bundle);
        return bundle;
    } finally {
        runtime.frameStack.pop();
        runtime.activeImports.pop();
        scriptContext.pop();
    }
}

/**
 * Evaluate an IR node tree.
 *
 * @param {Object} irNode - IR node { fn, args } or a literal value
 * @param {Context} context - Evaluation context (variable scope)
 * @param {Registry} registry - Internal operator registry
 * @param {SystemContext} [systemContext] - User-accessible capability object (`.`)
 * @returns {*} The evaluated result
 */
export function evaluate(irNode, context, registry, systemContext) {
    // Null / undefined pass through
    if (irNode === null || irNode === undefined) {
        return null;
    }

    // Primitive values (strings used as names, numbers, etc.)
    if (typeof irNode !== "object") {
        return irNode;
    }

    // Arrays (e.g. param lists) — not IR nodes
    if (Array.isArray(irNode)) {
        return irNode;
    }

    // Not an IR node (no fn property) — pass through (e.g. param objects)
    if (!irNode.fn) {
        return irNode;
    }

    const { fn, args } = irNode;

    // DEFER: return the node itself without evaluating
    if (fn === "DEFER") {
        return irNode;
    }

    try {
        if (fn === "SCRIPT_IMPORT") {
            return evaluateScriptImport(args[0] || {}, context, registry, systemContext);
        }

        // Bind the recursive evaluator for callbacks
        const evalFn = (node) => evaluate(node, context, registry, systemContext);

        // --- System context operations (. prefix syntax) ---

        // SYS_OBJ: bare `.` — returns a copy of the system context as a RiX value
        if (fn === "SYS_OBJ") {
            if (!systemContext) throw new Error("No system context available");
            return systemContext.copy().toRixValue();
        }

        // SYS_GET: .Name — get a capability reference or meta flag
        if (fn === "SYS_GET") {
            const name = args[0];
            if (!systemContext) throw new Error("No system context available");
            // Meta flags
            if (name === "FREEZE" || name === "freeze") {
                return systemContext.frozen ? 1 : 0;
            }
            // Capability reference — return as sysref for callWithConcreteArgs compatibility
            if (!systemContext.has(name)) {
                throw new Error(`Unknown system capability: ${name}`);
            }
            const entry = systemContext.get(name);
            if (Object.prototype.hasOwnProperty.call(entry, "value")) return entry.value;
            if (entry.kind !== "function") return entry.value;
            return { type: "sysref", name };
        }

        // SYS_CALL: .Name(args) — call a system capability
        // Handled lazily so placeholder detection works for partial application
        if (fn === "SYS_CALL") {
            const name = args[0];
            const callArgNodes = args.slice(1);
            if (!systemContext) throw new Error("No system context available");
            const cap = systemContext.get(name);
            if (!cap) {
                throw new Error(`Unknown system capability: ${name}. Use .${name}() only if the capability exists.`);
            }
            if (cap.kind !== "function") {
                throw new Error(`System ${cap.kind} .${cap.displayName} is not directly callable; index it or assign one of its entries`);
            }
            // Partial application: if any arg is a placeholder, build a partial
            const isPlaceholder = (n) => n && typeof n === "object" && n.fn === "PLACEHOLDER";
            if (callArgNodes.some(isPlaceholder)) {
                const template = callArgNodes.map((a) => evalFn(a));
                return { type: "partial", fn: { type: "sysref", name }, template };
            }
            if (cap.lazy) {
                return cap.impl(callArgNodes, context, evalFn);
            }
            const callArgs = callArgNodes.map((a) => {
                if (a === null || a === undefined) return a;
                if (typeof a !== "object") return a;
                if (Array.isArray(a)) return a;
                if (!a.fn) return a;
                return evalFn(a);
            });
            return cap.impl(callArgs, context, evalFn);
        }

        // SYS_SET: .Name = val — set a system context meta flag (only freeze/immutable)
        if (fn === "SYS_SET") {
            const name = args[0];
            const value = evalFn(args[1]);
            if (!systemContext) throw new Error("No system context available");
            const normalised = name.toUpperCase ? name.toUpperCase() : name;
            if (normalised === "FREEZE") {
                if (value) systemContext.freeze();
                return value;
            }
            throw new Error(`Cannot set system context property '${name}' via assignment. Use .Withhold() or .With() to create a modified copy.`);
        }

        // --- Internal registry dispatch ---

        const funcDef = registry.get(fn);

        if (!funcDef) {
            throw new Error(`Unknown system function: ${fn}`);
        }

        // If the function is lazy, pass raw args (IR nodes)
        if (funcDef.lazy) {
            return funcDef.impl(args, context, evalFn, systemContext);
        }

        // Otherwise, evaluate all args first
        const evaluatedArgs = [];
        for (const arg of args) {
            if (arg === null || arg === undefined) {
                evaluatedArgs.push(arg);
            } else if (typeof arg !== "object" || Array.isArray(arg) || !arg.fn) {
                evaluatedArgs.push(arg);
            } else if (arg.fn === "SPREAD") {
                let spreadVal = evalFn(arg.args[0]);
                if (isLazySequence(spreadVal)) spreadVal = materializeLazySequence(spreadVal);
                if (spreadVal && (spreadVal.type === "tuple" || spreadVal.type === "sequence" || spreadVal.type === "array" || spreadVal.type === "set")) {
                    const items = spreadVal.values || spreadVal.elements || [];
                    evaluatedArgs.push(...items);
                } else {
                    throw new Error("Spread operator requires an iterable collection (array, tuple, sequence, set)");
                }
            } else {
                evaluatedArgs.push(evalFn(arg));
            }
        }

        // Hole check: standard (non-hole-aware) operations cannot consume holes
        if (!funcDef.holeAware) {
            for (const arg of evaluatedArgs) {
                if (isHole(arg)) {
                    throw new Error(`Cannot use undefined/hole value in computation (in ${fn})`);
                }
            }
        }

        return funcDef.impl(evaluatedArgs, context, evalFn, systemContext);
    } catch (error) {
        throw annotateEvaluationError(error, irNode, context);
    }
}

/**
 * Convenience: parse RiX source code, lower to IR, and evaluate.
 *
 * @param {string} code - RiX source code
 * @param {Object} [options]
 * @param {Context} [options.context] - Evaluation context (creates new if not provided)
 * @param {Registry} [options.registry] - Internal registry (creates default if not provided)
 * @param {SystemContext} [options.systemContext] - System capability object (creates default if not provided)
 * @param {Function} [options.systemLookup] - System symbol lookup for parser
 * @returns {*} The result of the last expression
 */
export function parseAndEvaluate(code, options = {}) {
    const context = options.context || new Context();
    const registry = options.registry || createDefaultRegistry();
    const systemContext = options.systemContext || createDefaultSystemContext();
    context.setEnv("__system_context__", systemContext);
    const systemLookup = createSystemLookup(systemContext, options.systemLookup || defaultSystemLookup);
    getScriptRuntime(context, { systemLookup });
    context.setEnv("__registry__", registry);
    if (typeof options.rng === "function") context.setEnv("randomFunction", options.rng);
    context.setEnv(SOURCE_ENV_KEY, code);
    context.setEnv(CURRENT_FILE_ENV_KEY, options.file || "<repl>");

    const ast = parse(code, systemLookup);
    const irNodes = lower(ast);
    attachSourceInfo(irNodes, code, options.file || "<repl>");

    let result = null;
    for (const irNode of irNodes) {
        result = evaluate(irNode, context, registry, systemContext);
    }
    return result;
}

/**
 * Default system lookup for the parser.
 * Recognizes common system identifiers.
 */
function defaultSystemLookup(name) {
    const builtins = {
        ABS: { type: "function", arity: 1 },
        MAX: { type: "function", arity: -1 },
        MIN: { type: "function", arity: -1 },
        AND: { type: "function", lazy: true },
        OR: { type: "function", lazy: true },
        NOT: { type: "function" },
        IF: { type: "identifier" },
        HELP: { type: "identifier" },
        LOAD: { type: "identifier" },
        UNLOAD: { type: "identifier" },
    };
    return builtins[name] || { type: "identifier" };
}
