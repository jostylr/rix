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
import { PluginCatalog } from "../runtime/plugin-catalog.js";
import { createSystemLookup } from "../runtime/system-manifest.js";
import { Context } from "../runtime/context.js";
import {
    createEvent,
    getCurrentFilePath,
    getDiagnostics,
    isRixArray,
    rixIntValue,
    rixStringValue,
} from "../runtime/diagnostics.js";
import { Cell, copyAllMeta, deepCopyValue, shallowCopyValue } from "../runtime/cell.js";
import { HOLE, isHole } from "../runtime/hole.js";
import { UNDECIDED, decisionState } from "../runtime/decision.js";
import { runtimeDefaults } from "../runtime/runtime-config.js";
import { isReactiveNode } from "../runtime/reactive-graph.js";
import { CleanupGraceFault, isOperationalFault, faultToRixValue, TimeoutFault } from "../runtime/operational-fault.js";
import { withFinalizerActivationAsync, withFinalizerActivationSync } from "../runtime/finalization.js";
import {
    asyncStreamCapabilities,
    asyncStreamCanCompleteWithoutPull,
    asyncStreamSupportsConcurrentItems,
    claimAsyncStream,
    closeAsyncStream,
    consumeAsyncStreamSequential,
    createAsyncStream,
    expectedErrorAsyncStream,
    filterAsyncStream,
    isAsyncStream,
    mapAsyncStream,
    processAsyncStreamItem,
    pullRawAsyncStream,
} from "../runtime/async-stream.js";
import { ensureMutableReceiver, resolveMethod } from "../runtime/methods.js";
import { coreFunctions, destructureResolvedValue, PREP_TRIAL_NO_MATCH } from "./functions/core.js";
import { arithmeticFunctions } from "./functions/arithmetic.js";
import { comparisonFunctions } from "./functions/comparison.js";
import { logicFunctions } from "./functions/logic.js";
import { addEvaluationContext, controlFunctions, matchesBreakTarget, splitScopedBlockArgs, unwrapDefer } from "./functions/control.js";
import { collectionFunctions } from "./functions/collections.js";
import { functionFunctions } from "./functions/functions.js";
import { methodFunctions } from "./functions/methods.js";
import { propertyFunctions } from "./functions/properties.js";
import { advancedFunctions } from "./functions/advanced.js";
import { stdlibFunctions } from "./functions/stdlib.js";
import {
    diagnosticFunctions,
    runAbortTestAsync,
    runTestAsync,
} from "./functions/diagnostics.js";
import {
    applySymbolicSpec,
    installSymbolicVariants,
    isSymbolicSpec,
    symbolicCapabilities,
    symbolicFunctions,
} from "./functions/symbolic.js";
import { outputFunctions } from "./functions/output.js";
import { formulaSheetFunctions } from "./functions/formula-sheet.js";
import { reactiveGraphFunctions } from "./functions/reactive-graph.js";
import { retryCapabilities } from "./functions/retry.js";
import {
    reactiveBindingFunctions,
    REACTIVE_ACTIVE_GRAPH_ENV,
    REACTIVE_OUTPUT_READ_ENV,
} from "./functions/reactive-bindings.js";
import {
    createPolySystemValue,
    embeddedFunctions,
    notationParserFunction,
    sArithCapability,
} from "./functions/embedded.js";
import { installRegisteredTypes, registerBuiltinSemanticTypes } from "../runtime/type-system.js";
import {
    createDefaultComplexCollection,
    createDefaultExactCollection,
    isExactValue,
    multiplyScalars,
} from "../runtime/exact-values.js";
import { createAlgebraOutputCollection, createControlsOutputCollection, createGraphicsOutputCollection, createTimelineOutputCollection } from "../runtime/output.js";
import { createRendererCollection, RendererRegistry, renderResultValue } from "../runtime/renderer-registry.js";
import { installBundledPlugins } from "../../plugins/bundled.js";
import {
    constructQuantity,
    createDefaultUnitCollection,
    isUnitValue,
} from "../runtime/quantities.js";
import {
    emitNoPrepWarning,
    isMultifunctionValue,
    rebuildMultifunctionState,
    shouldWarnNoPrep,
} from "../runtime/multifunction.js";
import { installUnitExactVariants, unitExactFunctions } from "./functions/units.js";
import { parse } from "../parser/parser.js";
import { posToLineCol, tokenize } from "../parser/tokenizer.js";
import { mergeOperatorDefinitions } from "../parser/custom-operators.js";
import { lower } from "./lower.js";
import { irToText } from "./ir-to-text.js";
import { ensureLazyIndex, isLazySequence, materializeLazySequence } from "../runtime/lazy-sequence.js";
import {
    expectedErrorArgs,
    isPipeSkip,
    materializePipeSkip,
    PIPE_SKIP,
} from "../runtime/expected-error.js";
import { coerceShapeValue, createShaped, forEachShapedCell, isShaped, shapedIndexTuple } from "../runtime/shaped.js";
import { formatValue } from "./format.js";
import { Integer } from "@ratmath/core";
import {
    callWithConcreteArgs,
    createTailSelfCall,
    isTailSelfCall,
} from "./functions/functions.js";
import {
    AsyncScheduler,
    BACKGROUND_ERRORS_ENV,
    drainBackgroundTasks,
    disposeAsyncResources,
    registerBackgroundTask,
    registerAsyncResource,
    unregisterAsyncResource,
} from "../runtime/async-runtime.js";

const POSTFIX_CHECK_VALUE_ENV = "__postfix_check_value__";

function formatCheckValue(value) {
    try {
        return formatValue(value);
    } catch (_error) {
        return String(value);
    }
}

function withPostfixCheckValue(context, value, callback) {
    const hadPrevious = context.env?.has(POSTFIX_CHECK_VALUE_ENV) === true;
    const previous = context.getEnv(POSTFIX_CHECK_VALUE_ENV, undefined);
    context.setEnv(POSTFIX_CHECK_VALUE_ENV, value);
    try {
        return callback();
    } finally {
        if (hadPrevious) context.setEnv(POSTFIX_CHECK_VALUE_ENV, previous);
        else context.env?.delete(POSTFIX_CHECK_VALUE_ENV);
    }
}

async function withPostfixCheckValueAsync(context, value, callback) {
    const hadPrevious = context.env?.has(POSTFIX_CHECK_VALUE_ENV) === true;
    const previous = context.getEnv(POSTFIX_CHECK_VALUE_ENV, undefined);
    context.setEnv(POSTFIX_CHECK_VALUE_ENV, value);
    try {
        return await callback();
    } finally {
        if (hadPrevious) context.setEnv(POSTFIX_CHECK_VALUE_ENV, previous);
        else context.env?.delete(POSTFIX_CHECK_VALUE_ENV);
    }
}

function checkPostfixType(value, spec, context, registry, evaluateValue) {
    const name = String(spec?.name || "").toLowerCase();
    const structuralKinds = { array: "sequence", set: "set", map: "map", tuple: "tuple", shaped: "shaped" };
    const expectedType = spec?.semantic ? null : structuralKinds[name];

    if (!expectedType) {
        if (!spec?.semantic && name === "number") {
            const constructor = value?.constructor?.name;
            if (typeof value === "number" || ["Integer", "Rational", "RationalInterval"].includes(constructor)) return;
        }
        const semantic = registry.get("SEMANTIC_HAS");
        const passed = semantic?.impl([value, name], context, evaluateValue);
        if (passed === null || passed === undefined) {
            throw new Error(`##: check failed: expected semantic membership :${name}, received ${formatCheckValue(value)}`);
        }
        return;
    }

    if (value === null || value === undefined || value.type !== expectedType) {
        throw new Error(`##: check failed: expected ${name}, received ${formatCheckValue(value)}`);
    }

    const shape = spec?.shape;
    if (!shape) return;
    if (name === "shaped") {
        const actual = Array.from(value.shape || []);
        if (actual.length !== shape.length || actual.some((dimension, index) => dimension !== shape[index])) {
            throw new Error(`##: check failed: expected shaped[${shape.join("x")}], received shaped[${actual.join("x")}]`);
        }
        return;
    }

    if (shape.length !== 1) {
        throw new Error(`##: check failed: ${name} accepts one size, not [${shape.join("x")}]`);
    }
    const count = name === "map" ? value.entries?.size : value.values?.length;
    if (count !== shape[0]) {
        throw new Error(`##: check failed: expected ${name}[${shape[0]}], received ${name}[${count ?? "?"}]`);
    }
}

function invokeResolvedCallableSync(fn, args, context, evaluateValue, systemContext) {
    if (fn?.type === "sysref" && systemContext?.has(fn.name)) {
        const capability = systemContext.get(fn.name);
        if (capability.kind !== "function") throw new Error(`System ${capability.kind} .${capability.displayName} is not callable`);
        return capability.impl(args, context, evaluateValue, { signal: null });
    }
    return callWithConcreteArgs(fn, args, context, evaluateValue);
}

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
    registry.registerAll(formulaSheetFunctions);
    registry.registerAll(reactiveGraphFunctions);
    registry.registerAll(reactiveBindingFunctions);
    registry.registerAll(embeddedFunctions);
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
    DivUp: "DIVUP", DivRound: "DIVROUND", DivMod: "DIVMOD", Mod: "MOD", Pow: "POW",
    PowProd: "POWPROD", Neg: "NEG", Abs: "ABS", Sqrt: "SQRT",
    Factorial: "FACTORIAL", DoubleFactorial: "DOUBLE_FACTORIAL",
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

function createShapedSystemValue() {
    return {
        type: "system_namespace",
        namespace: "shaped",
        _ext: new Map([["GENERATE", {
            type: "method_builtin",
            name: "Generate",
            impl(args, context, evaluate, invoke, execution = null) {
                const shape = coerceShapeValue(args[1]);
                const callable = args[2];
                const empty = createShaped(shape);
                const tuples = [];
                forEachShapedCell(empty, (_value, tuple) => tuples.push(tuple));
                if (execution?.promiseAware === true) {
                    return tuples.reduce(async (pending, tuple) => {
                        const values = await pending;
                        values.push(await invoke(callable, [shapedIndexTuple(tuple)]));
                        return values;
                    }, Promise.resolve([])).then((values) => createShaped(shape, values));
                }
                const generated = tuples.map((tuple) =>
                    invoke(callable, [shapedIndexTuple(tuple)], context, evaluate));
                return createShaped(shape, generated);
            },
        }]]),
    };
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
const CUSTOM_OPERATOR_ENV_KEY = "__custom_operator_definitions__";
const CURRENT_FILE_ENV_KEY = "__current_file__";

function createNumberConfigValue() {
    const value = { type: "system_namespace", namespace: "number_config", _ext: new Map() };
    value._ext.set("NUMINPUT", {
        type: "method_builtin",
        name: "NumInput",
        impl(args, context) {
            return coreFunctions.NUM_INPUT.impl([args[1]], context);
        },
    });
    value._ext.set("NUMDISPLAY", {
        type: "method_builtin",
        name: "NumDisplay",
        impl(args, context) {
            return coreFunctions.NUM_DISPLAY.impl([args[1]], context);
        },
    });
    value._ext.set("NUMBER", {
        type: "method_builtin",
        name: "Number",
        impl(args, context) {
            const map = args[1]?.type === "map" ? args[1].entries : null;
            if (!map) throw new Error(".Config.Number expects a map with input and/or display");
            if (map.has("input")) coreFunctions.NUM_INPUT.impl([map.get("input")], context);
            if (map.has("display")) coreFunctions.NUM_DISPLAY.impl([map.get("display")], context);
            return args[1];
        },
    });
    value._ext.set("CURRENT", {
        type: "method_builtin",
        name: "Current",
        impl(_args, context) {
            return {
                type: "map",
                entries: new Map([
                    ["input", { type: "string", value: context.getEnv("numInput", "z[10]") }],
                    ["display", { type: "string", value: context.getEnv("numDisplay", "..") }],
                ]),
            };
        },
    });
    return value;
}

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
    ctx.registerValue("Config", createNumberConfigValue(), {
        doc: "Session-scoped RiX configuration, including numeric input and display",
        groups: ["Core", "Numerics"],
    });
    ctx.registerValue("Shaped", createShapedSystemValue(), {
        doc: "Shaped-storage constructors and explicit generation helpers",
        groups: ["Core", "Collections", "Arrays"],
    });
    const algebra = createAlgebraOutputCollection();
    ctx.registerValue("Algebra", algebra, { doc: "Algebra presentation helpers" });
    const graphics = createGraphicsOutputCollection();
    ctx.registerValue("Graphics", graphics, { doc: "Intrinsic portable 2D scene language" });
    const controls = createControlsOutputCollection();
    ctx.registerValue("Controls", controls, { doc: "Reactive control constructors" });
    const timeline = createTimelineOutputCollection();
    ctx.registerValue("Timeline", timeline, { doc: "Portable exact timeline constructors" });
    ctx.registerAll(stdlibFunctions);
    ctx.registerAll(symbolicCapabilities);
    ctx.registerCallableValue("Poly", createPolySystemValue(), symbolicCapabilities.POLY, {
        doc: `${symbolicCapabilities.POLY.doc}; exposes .Parse for backtick polynomial forms`,
        groups: ["Notation", "Symbolic"],
    });
    ctx.registerAll(outputFunctions);
    ctx.registerAll(formulaSheetFunctions);
    ctx.registerAll(reactiveGraphFunctions);
    ctx.register("Stream", asyncStreamCapabilities.STREAM);
    ctx.register("Retry", retryCapabilities.Retry);
    const sArith = sArithCapability.create();
    ctx.registerCallableValue("SArith", sArith.value, sArith.definition, {
        doc: sArith.definition.doc,
        groups: ["Notation", "Symbolic"],
    });
    ctx.register("NotationParser", {
        ...notationParserFunction,
        groups: ["Notation"],
    });
    ctx.register("EVAL", coreFunctions.EVAL);
    ctx.register("TypeExport", coreFunctions.TYPE_EXPORT);
    ctx.register("TypeImport", coreFunctions.TYPE_IMPORT);
    ctx.register("CertifiedApproximation", {
        ...coreFunctions.CERTIFIED_APPROXIMATION,
        groups: ["Core"],
    });
    ctx.register("Undecided", { ...coreFunctions.UNDECIDED_DIAGNOSTIC, groups: ["Core"] });
    ctx.register("RefinementRequest", { ...coreFunctions.REFINEMENT_REQUEST, groups: ["Core", "Numerics"] });
    ctx.register("RefinementEffectiveLimits", { ...coreFunctions.REFINEMENT_EFFECTIVE_LIMITS, groups: ["Core", "Numerics"] });
    ctx.register("RefinementSupports", { ...coreFunctions.REFINEMENT_SUPPORTS, groups: ["Core", "Numerics"] });
    ctx.register("RefinementCheck", { ...coreFunctions.REFINEMENT_CHECK, groups: ["Core", "Numerics"] });
    ctx.register("RefinementUnsupported", { ...coreFunctions.REFINEMENT_UNSUPPORTED, groups: ["Core", "Numerics"] });
    ctx.register("TraitRegister", coreFunctions.TRAIT_REGISTER);
    ctx.register("TypeRegister", coreFunctions.TYPE_REGISTER);
    ctx.register("TypeKnown", { ...coreFunctions.TYPE_KNOWN, groups: ["Core"] });
    ctx.register("ImmutableValue", { ...coreFunctions.IMMUTABLE_VALUE, groups: ["Core"] });
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
    const rendererRegistry = options.rendererRegistry || new RendererRegistry();
    ctx.attachRendererRegistry(rendererRegistry, {
        collection: createRendererCollection(rendererRegistry),
        renderValue(value, target, renderOptions, { evaluationContext, evaluate: evaluateValue } = {}) {
            return renderResultValue(rendererRegistry.render(value, target, renderOptions, {
                format: (item) => formatValue(item, { context: evaluationContext, evaluate: evaluateValue }),
            }));
        },
    });
    const pluginCatalog = installBundledPlugins(options.pluginCatalog || new PluginCatalog());
    ctx.attachPluginCatalog(pluginCatalog);
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
            operatorDefinitions: context.getEnv(CUSTOM_OPERATOR_ENV_KEY, new Map()),
        };
        context.setEnv(SCRIPT_RUNTIME_ENV_KEY, runtime);
        return runtime;
    }

    if (!runtime.systemLookup) {
        runtime.systemLookup = options.systemLookup || defaultSystemLookup;
    }
    runtime.operatorDefinitions = context.getEnv(
        CUSTOM_OPERATOR_ENV_KEY,
        runtime.operatorDefinitions || new Map(),
    );
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

    const ast = parse(source, runtime.systemLookup || defaultSystemLookup, {
        operatorDefinitions: runtime.operatorDefinitions,
        file: resolvedPath,
    });
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
    const child = new SystemContext(new Map(), false, {
        hostContext: systemContext._hostContext,
        pluginCatalog: systemContext._pluginCatalog,
        methodExtensions: systemContext._methodExtensions,
    });
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
    scriptContext.env = new Map(context.env);
    const importRuntime = {
        ...runtime,
        activeImports: [...runtime.activeImports, resolvedPath],
        frameStack: [...runtime.frameStack, {
            path: prepared.path,
            dir: prepared.dir,
            functionNames: capabilityFrame.functionNames,
            permissions: capabilityFrame.permissions,
        }],
    };
    scriptContext.setEnv(SCRIPT_RUNTIME_ENV_KEY, importRuntime);
    scriptContext.push(undefined, { isolated: true, callableBoundary: true });

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
        scriptContext.pop();
    }
}

async function evaluateScriptImportAsync(spec, context, registry, systemContext, state) {
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
    scriptContext.env = new Map(context.env);
    const importRuntime = {
        ...runtime,
        activeImports: [...runtime.activeImports, resolvedPath],
        frameStack: [...runtime.frameStack, {
            path: prepared.path,
            dir: prepared.dir,
            functionNames: capabilityFrame.functionNames,
            permissions: capabilityFrame.permissions,
        }],
    };
    scriptContext.setEnv(SCRIPT_RUNTIME_ENV_KEY, importRuntime);
    scriptContext.push(undefined, { isolated: true, callableBoundary: true });

    try {
        bindScriptInputs(scriptContext, context, spec.inputs || [], prepared.inputContract);

        let finalResult = null;
        for (const node of prepared.bodyIr) {
            finalResult = await evaluateAsyncInternal(
                node,
                scriptContext,
                registry,
                capabilityFrame.systemContext,
                state,
            );
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
    // Runtime semantic operator variants occasionally need to dispatch a
    // scalar operation through the same registry (for example, elementwise
    // Shaped arithmetic). Keep that service available to nested dispatches,
    // including callers that invoke evaluate() directly rather than through
    // parseAndEvaluate().
    if (context?.getEnv?.("__registry__", null) !== registry) {
        context?.setEnv?.("__registry__", registry);
    }

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

        if (fn === "POSTFIX_CHECK_VALUE") {
            return context.getEnv(POSTFIX_CHECK_VALUE_ENV, null);
        }

        if (fn === "POSTFIX_PREDICATE_CHECK") {
            const value = evalFn(args[0]);
            const passed = withPostfixCheckValue(context, value, () => evalFn(args[1]));
            if (passed === null || passed === undefined) {
                throw new Error(`##@ check failed for ${formatCheckValue(value)}`);
            }
            return value;
        }

        if (fn === "POSTFIX_TYPE_CHECK") {
            const value = evalFn(args[0]);
            checkPostfixType(value, args[1], context, registry, evalFn);
            return value;
        }

        if (fn === "POSTFIX_FINALIZER") {
            const value = evalFn(args[0]);
            const cleanup = evalFn(args[1]);
            context.registerFinalizer(() =>
                invokeResolvedCallableSync(cleanup, [value], context, evalFn, systemContext));
            return value;
        }

        if (fn === "POSTFIX_FAULT_RECOVERY") {
            try {
                return evalFn(args[0]);
            } catch (error) {
                if (!isOperationalFault(error)) throw error;
                const handler = evalFn(args[1]);
                return invokeResolvedCallableSync(handler, [faultToRixValue(error)], context, evalFn, systemContext);
            }
        }

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

const ASYNC_COLLECTION_FNS = new Set([
    "ARRAY", "ARRAY_CAPTURE", "TUPLE", "SET", "MAP_OBJ",
    "SHAPED_LITERAL",
]);
const ASYNC_PIPE_FNS = new Set(["PMAP", "PFILTER", "PEXPECT", "PFOREACH", "PANY", "PALL"]);
const ASYNC_RESOLVED_BARRIER_FNS = new Set(["PSLICE_STRICT", "PSLICE_CLAMP"]);
const SYNC_REACTIVE_FORMULA_CAPABILITY_IMPLS = new Set([
    reactiveGraphFunctions.REACTIVEGRAPH.impl,
    formulaSheetFunctions.FORMULASHEET.impl,
    formulaSheetFunctions.RIXCELIMPORT.impl,
    formulaSheetFunctions.RIXCELIMPORTCSV.impl,
    formulaSheetFunctions.RIXCELIMPORTTSV.impl,
]);

function splitAsyncBlockArgs(args) {
    const first = args[0];
    if (first && !first.fn && (
        Array.isArray(first.imports) || first.name !== undefined || first.concurrencyLimit !== undefined
        || first.timeoutSeconds !== undefined
    )) {
        return { meta: first, body: args.slice(1) };
    }
    return { meta: {}, body: args };
}

function applyAsyncImports(imports, context) {
    for (const spec of imports || []) {
        if (spec.mode === "alias") context.importAlias(spec.local, spec.source);
        else context.importCopy(spec.local, spec.source);
    }
}

function deepCopyDetachedValue(value, seen = new WeakMap()) {
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (isReactiveNode(value)) {
        throw new Error("Reactive cells must use alias imports in detached blocks");
    }
    if (isAsyncStream(value)) {
        throw new Error("Async streams cannot be copied into detached blocks; create the stream inside the block");
    }
    if (value.type === "function" || value.type === "lambda") {
        const clone = { ...value };
        seen.set(value, clone);
        clone.__closureScopes = (value.__closureScopes || []).map((scope) => ({
            ...scope,
            bindings: new Map([...scope.bindings].map(([name, cell]) => [
                name,
                new Cell(deepCopyDetachedValue(cell.value, seen)),
            ])),
        }));
        return clone;
    }
    if (value.type === "multifunction" && Array.isArray(value.values)) {
        const clone = { ...value, values: [] };
        seen.set(value, clone);
        clone.values = value.values.map((variant) => deepCopyDetachedValue(variant, seen));
        return clone;
    }
    if (value.type === "partial") {
        const clone = { ...value, template: [] };
        seen.set(value, clone);
        clone.fn = deepCopyDetachedValue(value.fn, seen);
        clone.template = value.template.map((entry) => deepCopyDetachedValue(entry, seen));
        return clone;
    }
    const copy = deepCopyValue(value);
    seen.set(value, copy);
    return copy;
}

function captureDetachedImports(imports, context) {
    const bindings = new Map();
    for (const spec of imports || []) {
        const cell = context.getCell(spec.source);
        if (!cell) throw new Error(`Undefined outer variable for detached import: ${spec.source}`);
        if (spec.mode === "alias") {
            if (!isReactiveNode(cell.value)) {
                throw new Error(`Detached alias import '${spec.local}=${spec.source}' requires a reactive cell`);
            }
            bindings.set(spec.local, cell);
            continue;
        }
        const snapshot = isReactiveNode(cell.value) ? cell.value.peek() : cell.value;
        bindings.set(spec.local, new Cell(deepCopyDetachedValue(snapshot)));
    }
    return bindings;
}

function isTruthyAsync(value) {
    return decisionState(value) === "truth";
}

function markLexicalAsyncCallable(value, state) {
    const enabled = !!state?.scheduler && state.parallelCollections !== false;
    if (value && (value.type === "function" || value.type === "lambda")) {
        value.__parallelCollections = enabled;
    }
    if (isMultifunctionValue(value)) {
        for (const variant of value.values) variant.__parallelCollections = enabled;
    }
    return value;
}

function matchesAsyncBreak(error, name) {
    if (!error || error.kind !== "break") return false;
    if (error.targetType !== null && error.targetType !== "async") return false;
    if (error.targetName !== null && error.targetName !== name) return false;
    return true;
}

function resolvePartialAsync(partial, callArgs) {
    const filled = partial.template.map((entry) =>
        entry?.type === "placeholder" ? callArgs[entry.index - 1] : entry);
    const maxIndex = partial.template.reduce(
        (max, entry) => entry?.type === "placeholder" ? Math.max(max, entry.index) : max,
        0,
    );
    return { fn: partial.fn, args: [...filled, ...callArgs.slice(maxIndex)] };
}

function isPlaceholderNodeAsync(node) {
    return node && typeof node === "object" && node.fn === "PLACEHOLDER";
}

async function evaluateCallArgsAsync(argNodes, context, registry, systemContext, state) {
    const values = [];
    for (const arg of argNodes) {
        if (arg?.fn !== "SPREAD") {
            values.push(await evaluateAsyncInternal(arg, context, registry, systemContext, state));
            continue;
        }
        let spread = await evaluateAsyncInternal(arg.args[0], context, registry, systemContext, state);
        if (isLazySequence(spread)) spread = materializeLazySequence(spread);
        if (!spread || !["tuple", "sequence", "array", "set"].includes(spread.type)) {
            throw new Error("Spread operator requires an iterable collection (array, tuple, sequence, set)");
        }
        values.push(...(spread.values || spread.elements || []));
    }
    return values;
}

async function bindAsyncCallScope(params, callArgs, context, registry, systemContext, state) {
    const scope = new Map();
    const positional = params?.positional || [];
    const hasRest = positional.at(-1)?.isRest === true;
    const ordinaryCount = hasRest ? positional.length - 1 : positional.length;
    for (let index = 0; index < ordinaryCount; index++) {
        const param = positional[index];
        const missing = index >= callArgs.length || isHole(callArgs[index]);
        const value = missing && param.holeDefault
            ? await evaluateAsyncInternal(param.holeDefault, context, registry, systemContext, state)
            : missing ? HOLE : callArgs[index];
        scope.set(param.name, value);
    }
    if (hasRest) {
        scope.set(positional.at(-1).name, {
            type: "sequence",
            values: callArgs.slice(ordinaryCount),
        });
    }
    return scope;
}

function asyncPrepFailureError(fn, entryIndex) {
    const label = fn?.name || "<lambda>";
    return new Error(`${label} prep failed at entry ${entryIndex + 1}`);
}

function asyncPrepUndecidedError(fn, entryIndex, undecided = UNDECIDED) {
    const label = fn?.name || "<lambda>";
    const error = new Error(`${label} prep remained undecided at entry ${entryIndex + 1}`);
    error.undecided = undecided;
    return error;
}

async function runCallablePrepAsync(fn, context, registry, systemContext, state) {
    const conditionals = Array.isArray(fn?.params?.conditionals) ? fn.params.conditionals : [];
    const prep = Array.isArray(fn?.params?.prep) ? fn.params.prep : [];
    const entries = [...conditionals, ...prep];
    if (entries.length === 0) return { ok: true };

    const strict = fn?.params?.prepStrict === true;
    const undecidedMode = fn?.params?.prepUndecided || "stop";
    for (let index = 0; index < entries.length; index++) {
        try {
            const value = await evaluateAsyncInternal(
                entries[index],
                context,
                registry,
                systemContext,
                state,
            );
            const prepState = decisionState(value);
            if (prepState === "undecided") {
                if (undecidedMode === "throw") throw asyncPrepUndecidedError(fn, index, value);
                return {
                    ok: false,
                    undecided: true,
                    value,
                    fallthrough: undecidedMode === "fallthrough",
                };
            }
            if (prepState === "null") {
                if (strict) throw asyncPrepFailureError(fn, index);
                return { ok: false };
            }
        } catch (error) {
            if (error?.message?.includes("prep remained undecided")) throw error;
            if (strict) throw error;
            return { ok: false };
        }
    }
    return { ok: true };
}

function traceAsyncCallEvent(context, entry) {
    const trace = context.getEnv("__trace_context__");
    if (trace?.active) trace.log.push(entry);
}

function createCallableAsyncState(fn, callerState, context) {
    if (fn.__parallelCollections !== true) {
        return {
            state: callerState
                ? { ...callerState, parallelCollections: false }
                : { parallelCollections: false },
            ownsScheduler: false,
        };
    }
    if (callerState?.scheduler) {
        return {
            state: { ...callerState, parallelCollections: true },
            ownsScheduler: false,
        };
    }
    const limit = context.getEnv(
        "defaultAsyncConcurrency",
        runtimeDefaults.defaultAsyncConcurrency,
    );
    const scheduler = new AsyncScheduler(limit);
    return {
        state: {
            scheduler,
            group: scheduler.defaultGroup,
            signal: scheduler.defaultGroup.signal,
            limit,
            name: null,
            parallelCollections: true,
        },
        ownsScheduler: true,
    };
}

async function invokeUserCallableAsync(fn, callArgs, context, registry, systemContext, state, options = {}) {
    const callableAsync = createCallableAsyncState(fn, state, context);
    const callableState = callableAsync.state;
    const callName = options.callName ?? fn.name ?? null;
    const shareBody = options.shareBody !== false;
    const parentCallable = options.parentCallable ?? fn.__parentMultifunction ?? null;
    const returnPrepStatus = options.returnPrepStatus === true;
    const closureScopes = Array.isArray(fn.__closureScopes) ? fn.__closureScopes : [];
    const trace = context.getEnv("__trace_context__");
    const restoredEnv = new Map();
    let pushed = 0;
    let scopeActive = false;
    let callActive = false;
    let traceActive = false;
    let primaryError = null;
    let schedulerCleanupError = null;

    const traceEnter = (args) => {
        if (!trace?.active || trace.currentDepth >= trace.depth) return false;
        trace.log.push({ event: "enter", fn: callName || "<lambda>", depth: trace.currentDepth, args });
        trace.currentDepth += 1;
        return true;
    };
    const traceExit = (value, threw = false) => {
        if (!traceActive || !trace) return;
        trace.currentDepth -= 1;
        if (!threw) trace.log.push({ event: "exit", fn: callName || "<lambda>", depth: trace.currentDepth, value });
    };

    try {
        if (fn.__rixCapturedEnv && context?.setEnv) {
            for (const [key, value] of fn.__rixCapturedEnv) {
                restoredEnv.set(key, {
                    has: context.env?.has(key) === true,
                    value: context.getEnv(key, undefined),
                });
                context.setEnv(key, value);
            }
        }
        traceActive = traceEnter(callArgs);
        for (const closure of closureScopes) {
            context.push(closure instanceof Map ? closure : closure.bindings, {
                scopedEnv: closure.scopedEnv,
                isolated: closure.isolated === true,
                readThrough: closure.readThrough === true,
                callableBoundary: closure.callableBoundary === true,
                snapshot: !!state?.admission,
                readOnly: !!state?.admission,
            });
            pushed++;
        }
        context.push(await bindAsyncCallScope(fn.params, callArgs, context, registry, systemContext, callableState));
        scopeActive = true;
        if (callName) {
            context.pushCall(callName);
            callActive = true;
        }

        while (true) {
            const prepResult = await runCallablePrepAsync(
                fn,
                context,
                registry,
                systemContext,
                callableState,
            );
            if (!prepResult.ok) {
                const value = prepResult.undecided ? prepResult.value ?? UNDECIDED : null;
                traceExit(value);
                traceActive = false;
                return returnPrepStatus
                    ? {
                        matched: prepResult.undecided === true && prepResult.fallthrough !== true,
                        value,
                        unresolved: prepResult.undecided === true,
                    }
                    : value;
            }

            let result;
            context.pushCurrentCallable(fn, parentCallable);
            try {
                result = shareBody
                    ? await context.withSharedBodyAsync(fn.body, () =>
                        evaluateAsyncInternal(fn.body, context, registry, systemContext, callableState))
                    : await evaluateAsyncInternal(fn.body, context, registry, systemContext, callableState);
            } finally {
                context.popCurrentCallable();
            }
            if (!isTailSelfCall(result)) {
                traceExit(result);
                traceActive = false;
                return returnPrepStatus ? { matched: true, value: result } : result;
            }

            traceExit(result.args);
            traceActive = traceEnter(result.args);

            context.pop();
            scopeActive = false;
            context.push(await bindAsyncCallScope(
                fn.params,
                result.args,
                context,
                registry,
                systemContext,
                callableState,
            ));
            scopeActive = true;
        }
    } catch (error) {
        primaryError = error;
        if (callableAsync.ownsScheduler) {
            callableState.scheduler.cancelGroup(callableState.group, error);
        }
        throw error;
    } finally {
        if (callableAsync.ownsScheduler) {
            try {
                await callableState.scheduler.waitForIdle(callableState.group);
            } catch (error) {
                schedulerCleanupError = error;
            } finally {
                callableState.scheduler.closeGroup(callableState.group);
            }
        }
        for (const [key, entry] of restoredEnv) {
            if (entry.has) context.setEnv(key, entry.value);
            else context.env?.delete(key);
        }
        if (traceActive && trace) trace.currentDepth -= 1;
        if (callActive) context.popCall();
        if (scopeActive) context.pop();
        while (pushed-- > 0) context.pop();
        if (schedulerCleanupError) {
            if (primaryError) {
                const existing = Array.isArray(primaryError.suppressed) ? primaryError.suppressed : [];
                primaryError.suppressed = [...existing, schedulerCleanupError];
            } else {
                throw schedulerCleanupError;
            }
        }
    }
}

async function invokeMultifunctionAsync(multifunction, callArgs, context, registry, systemContext, state, options = {}) {
    const ownerName = options.callName ?? multifunction.__name ?? null;
    const namedOnly = options.namedOnly ?? null;
    rebuildMultifunctionState(multifunction);

    const variants = namedOnly ? [namedOnly] : multifunction.values;
    let unresolved = null;
    for (let index = 0; index < variants.length; index++) {
        const variant = variants[index];
        if (!variant || (variant.type !== "function" && variant.type !== "lambda")) {
            const displayIndex = namedOnly ? variant?.__name || "named" : `${index + 1}`;
            throw new Error(`Multifunction variant ${displayIndex} is not a function`);
        }

        const actualIndex = namedOnly ? multifunction.values.indexOf(variant) : index;
        const variantName = variant.__name ?? null;
        traceAsyncCallEvent(context, {
            event: "variant",
            fn: ownerName || "<multifunction>",
            depth: context.getEnv("__trace_context__")?.currentDepth ?? 0,
            variantIndex: actualIndex + 1,
            variantName,
        });

        const prepEntries =
            (Array.isArray(variant?.params?.conditionals) ? variant.params.conditionals.length : 0) +
            (Array.isArray(variant?.params?.prep) ? variant.params.prep.length : 0);
        if (!namedOnly && prepEntries === 0 && actualIndex < multifunction.values.length - 1 && shouldWarnNoPrep(context)) {
            emitNoPrepWarning(context, ownerName, actualIndex, variantName);
        }

        const result = await invokeUserCallableAsync(
            variant,
            callArgs,
            context,
            registry,
            systemContext,
            state,
            {
                callName: ownerName,
                parentCallable: multifunction,
                returnPrepStatus: true,
            },
        );
        if (!result.matched) {
            if (result.unresolved) unresolved = result.value;
            traceAsyncCallEvent(context, {
                event: "prep_fail",
                fn: ownerName || "<multifunction>",
                depth: context.getEnv("__trace_context__")?.currentDepth ?? 0,
                variantIndex: actualIndex + 1,
                variantName,
            });
            continue;
        }

        traceAsyncCallEvent(context, {
            event: "variant_selected",
            fn: ownerName || "<multifunction>",
            depth: context.getEnv("__trace_context__")?.currentDepth ?? 0,
            variantIndex: actualIndex + 1,
            variantName,
        });
        return result.value;
    }
    return unresolved ?? null;
}

async function invokeCallableAsync(fn, callArgs, context, registry, systemContext, state) {
    if (!fn) throw new Error("Cannot call null/undefined");
    if (isReactiveNode(fn)) {
        return invokeCallableAsync(fn.peek(), callArgs, context, registry, systemContext, state);
    }
    if (fn.type === "arityCap") {
        return invokeCallableAsync(fn.fn, callArgs.slice(0, fn.cap), context, registry, systemContext, state);
    }
    if (fn.type === "partial") {
        const resolved = resolvePartialAsync(fn, callArgs);
        return invokeCallableAsync(resolved.fn, resolved.args, context, registry, systemContext, state);
    }
    if (fn.type === "method_lift") {
        if (callArgs.length < 1) throw new Error(`..${fn.methodName} requires a receiver`);
        return invokeMethodAsync(
            callArgs[0],
            fn.methodName,
            fn.capturedArgs,
            context,
            registry,
            systemContext,
            state,
        );
    }
    if (fn.type === "function" || fn.type === "lambda") {
        return invokeUserCallableAsync(fn, callArgs, context, registry, systemContext, state);
    }
    if (isSymbolicSpec(fn)) return applySymbolicSpec(fn, callArgs);
    if (isUnitValue(fn)) {
        if (callArgs.length !== 1) throw new Error("A unit constructor expects exactly one scalar argument");
        return constructQuantity(callArgs[0], fn);
    }
    if (isExactValue(fn)) {
        if (callArgs.length !== 1) throw new Error("An exact generator expects exactly one scalar argument");
        return multiplyScalars(callArgs[0], fn);
    }
    if (isMultifunctionValue(fn)) {
        return invokeMultifunctionAsync(fn, callArgs, context, registry, systemContext, state, {
            callName: fn.__name,
        });
    }
    if (fn.type === "sysref") {
        if (systemContext?.has(fn.name)) {
            const capability = systemContext.get(fn.name);
            if (capability.kind !== "function") throw new Error(`System ${capability.kind} .${capability.displayName} is not callable`);
            return await capability.impl(callArgs, context, (node) =>
                evaluateAsyncInternal(node, context, registry, systemContext, state), {
                promiseAware: true,
                signal: state?.signal ?? null,
            });
        }
        return evaluateAsyncInternal({ fn: fn.name, args: callArgs }, context, registry, systemContext, state);
    }
    if (typeof fn === "function") return await fn(...callArgs);

    // Remaining host callables retain their concrete-call semantics. Their
    // result may itself be awaitable.
    return await callWithConcreteArgs(
        fn,
        callArgs,
        context,
        (node) => evaluate(node, context, registry, systemContext),
    );
}

/** Preserve the locator-aware callback contract used by the synchronous pipes.
 * Partials consume only arguments addressed by placeholders so implicit
 * locator/source values do not leak into variadic system functions.
 */
async function invokeTraversalCallbackAsync(fn, callArgs, context, registry, systemContext, state) {
    if (fn && fn.type === "arityCap") {
        return invokeTraversalCallbackAsync(
            fn.fn,
            callArgs.slice(0, fn.cap),
            context,
            registry,
            systemContext,
            state,
        );
    }
    if (fn && fn.type === "partial") {
        const maxIndex = fn.template.reduce(
            (maximum, entry) => entry?.type === "placeholder"
                ? Math.max(maximum, entry.index)
                : maximum,
            0,
        );
        return invokeCallableAsync(
            fn,
            callArgs.slice(0, maxIndex),
            context,
            registry,
            systemContext,
            state,
        );
    }
    if (fn && fn.type === "method_lift") {
        return invokeCallableAsync(fn, [callArgs[0]], context, registry, systemContext, state);
    }
    return invokeCallableAsync(fn, callArgs, context, registry, systemContext, state);
}

function asyncCapabilityString(value, label) {
    const text = rixStringValue(value);
    if (text === null) throw new Error(`${label} must be a string`);
    return text;
}

function asyncDiagnosticString(value) {
    return { type: "string", value: String(value) };
}

function asyncDiagnosticInteger(value) {
    return new Integer(BigInt(value));
}

async function evaluateConcreteLazyCapabilityAsync(
    capability,
    args,
    context,
    registry,
    systemContext,
    state,
) {
    // Preserve the synchronous handlers' validation-before-evaluation order.
    if (capability.impl === diagnosticFunctions.DUMP.impl && args.length !== 2) {
        return capability.impl(args, context, (value) => value);
    }
    if (
        capability.impl === diagnosticFunctions.INFOVALUE.impl
        && args.length !== 2
        && args.length !== 3
    ) {
        return capability.impl(args, context, (value) => value);
    }
    const values = [];
    for (const arg of args) {
        values.push(await evaluateAsyncInternal(arg, context, registry, systemContext, state));
    }
    return await capability.impl(values, context, (value) => value);
}

async function evaluateDefineCapabilityAsync(args, context, registry, systemContext, state) {
    const name = coreString(
        await evaluateAsyncInternal(args[0], context, registry, systemContext, state),
        ".Define name",
    );
    const params = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    return await evaluateAsyncInternal(
        { fn: "FUNCDEF", args: [name, params, args[2]] },
        context,
        registry,
        systemContext,
        state,
    );
}

async function evaluateStopCapabilityAsync(args, context, registry, systemContext, state) {
    const label = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    const condition = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    const values = [label, condition];
    if (decisionState(condition) === "truth" && args.length >= 3) {
        values.push(await evaluateAsyncInternal(
            args[2], context, registry, systemContext, state,
        ));
    }
    return diagnosticFunctions.STOP.impl(values, context, (value) => value);
}

async function evaluateMultiCapabilityAsync(args, context, registry, systemContext, state) {
    let result = null;
    for (const arg of args) {
        result = await evaluateAsyncInternal(arg, context, registry, systemContext, state);
    }
    return result;
}

async function evaluateDebugCapabilityAsync(args, context, registry, systemContext, state) {
    const label = asyncCapabilityString(
        await evaluateAsyncInternal(args[0], context, registry, systemContext, state),
        ".Debug label",
    );
    const exprNode = args[1];
    const filePath = getCurrentFilePath(context);
    const exprSource = irToText(exprNode);
    const astRepr = irToText(exprNode, { pretty: true });

    let finalValue;
    try {
        finalValue = await evaluateAsyncInternal(exprNode, context, registry, systemContext, state);
    } catch (error) {
        getDiagnostics(context).addEvent(createEvent({
            kind: "debug",
            label,
            file: filePath,
            data: {
                type: "map",
                entries: new Map([
                    ["exprSource", asyncDiagnosticString(exprSource)],
                    ["ast", asyncDiagnosticString(astRepr)],
                    ["error", asyncDiagnosticString(error?.message ?? error)],
                ]),
            },
        }));
        throw error;
    }

    getDiagnostics(context).addEvent(createEvent({
        kind: "debug",
        label,
        file: filePath,
        data: {
            type: "map",
            entries: new Map([
                ["exprSource", asyncDiagnosticString(exprSource)],
                ["ast", asyncDiagnosticString(astRepr)],
                ["final", finalValue],
            ]),
        },
    }));
    return finalValue;
}

function recordAsyncTraceEvent(context, label, filePath, depth, trackedVars, traceLog, finalValue) {
    const calls = traceLog.map((entry) => {
        const values = new Map([["event", asyncDiagnosticString(entry.event)]]);
        if (entry.fn) values.set("fn", asyncDiagnosticString(entry.fn));
        if (entry.scope) values.set("scope", asyncDiagnosticString(entry.scope));
        if (entry.depth !== undefined) values.set("depth", asyncDiagnosticInteger(entry.depth));
        if (entry.args) values.set("args", { type: "sequence", values: entry.args });
        if (entry.value !== undefined) values.set("value", entry.value);
        if (entry.var) values.set("var", asyncDiagnosticString(entry.var));
        if (entry.old !== undefined) values.set("old", entry.old);
        if (entry.new !== undefined) values.set("new", entry.new);
        if (entry.variantIndex !== undefined) {
            values.set("variantIndex", asyncDiagnosticInteger(entry.variantIndex));
        }
        if (entry.variantName) values.set("variantName", asyncDiagnosticString(entry.variantName));
        return { type: "map", entries: values };
    });
    getDiagnostics(context).addEvent(createEvent({
        kind: "trace",
        label,
        file: filePath,
        data: {
            type: "map",
            entries: new Map([
                ["depth", asyncDiagnosticInteger(depth)],
                ["trackedVars", {
                    type: "sequence",
                    values: trackedVars.map(asyncDiagnosticString),
                }],
                ["calls", { type: "sequence", values: calls }],
                ["final", finalValue],
            ]),
        },
    }));
}

async function evaluateTraceCapabilityAsync(args, context, registry, systemContext, state) {
    const label = asyncCapabilityString(
        await evaluateAsyncInternal(args[0], context, registry, systemContext, state),
        ".Trace label",
    );
    const depth = rixIntValue(
        await evaluateAsyncInternal(args[1], context, registry, systemContext, state),
    );
    if (depth === null || depth < 0 || !Number.isInteger(depth)) {
        throw new Error(".Trace depth must be a non-negative integer");
    }

    let trackedVars = [];
    let callableNode;
    if (args.length >= 4) {
        const varsValue = await evaluateAsyncInternal(args[2], context, registry, systemContext, state);
        if (isRixArray(varsValue)) {
            trackedVars = varsValue.values.map((value) => {
                const text = rixStringValue(value);
                if (text === null) throw new Error(".Trace trackedVars must be an array of strings");
                return text;
            });
        } else if (varsValue !== null) {
            throw new Error(".Trace trackedVars must be an array of strings");
        }
        callableNode = args[3];
    } else {
        callableNode = args[2];
    }

    const filePath = getCurrentFilePath(context);
    const traceLog = [];
    const traceContext = {
        depth,
        trackedVars: new Set(trackedVars),
        currentDepth: 0,
        log: traceLog,
        active: true,
    };
    const previousTrace = context.getEnv("__trace_context__");
    context.setEnv("__trace_context__", traceContext);

    let finalValue;
    try {
        const callable = await evaluateAsyncInternal(
            callableNode,
            context,
            registry,
            systemContext,
            state,
        );
        if (callable && (callable.type === "function" || callable.type === "lambda")) {
            finalValue = await invokeCallableAsync(
                callable,
                [],
                context,
                registry,
                systemContext,
                state,
            );
        } else if (typeof callable === "function") {
            finalValue = await callable();
        } else {
            finalValue = callable;
        }
    } finally {
        traceContext.active = false;
        context.setEnv("__trace_context__", previousTrace || null);
    }

    recordAsyncTraceEvent(context, label, filePath, depth, trackedVars, traceLog, finalValue);
    return finalValue;
}

async function evaluateEvalCapabilityAsync(args, context, registry, systemContext, state) {
    if (args.length === 0) throw new Error("Eval expects at least 1 argument");

    const astValue = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    let evalNodes;
    if (astValue && typeof astValue === "object" && astValue.fn === "DEFER") {
        evalNodes = [astValue.args[0]];
    } else if (astValue && typeof astValue === "object" && astValue.type === "string") {
        const runtime = context.getEnv("__script_runtime__");
        try {
            evalNodes = lower(parse(tokenize(astValue.value), runtime?.systemLookup));
        } catch (error) {
            throw new Error(`Eval string parse error: ${error.message}`);
        }
    } else {
        throw new Error("Eval expects a deferred AST value or a string of RiX code");
    }

    const bindings = args.length >= 2
        ? await evaluateAsyncInternal(args[1], context, registry, systemContext, state)
        : null;
    const modeValue = args.length >= 3
        ? await evaluateAsyncInternal(args[2], context, registry, systemContext, state)
        : null;
    let mode = "inherit";
    if (modeValue?.type === "string") mode = modeValue.value;
    else if (modeValue !== null && modeValue !== undefined) {
        throw new Error("Eval mode must be a string or colon-string like :fresh or :inherit");
    }
    if (mode !== "inherit" && mode !== "fresh") {
        throw new Error(`Eval mode must be 'inherit' or 'fresh', got '${mode}'`);
    }
    if (bindings !== null && bindings !== undefined && bindings.type !== "map") {
        throw new Error("Eval bindings must be a map or null");
    }

    const runBody = async () => {
        let result = null;
        for (const node of evalNodes) {
            result = await evaluateAsyncInternal(node, context, registry, systemContext, state);
        }
        return result;
    };
    const runSharedBody = () => evalNodes.length === 1
        ? context.withSharedBodyAsync(evalNodes[0], runBody)
        : runBody();

    if (mode === "inherit" && (!bindings || bindings.entries.size === 0)) {
        return await runSharedBody();
    }

    context.push(undefined, { isolated: mode === "fresh" });
    try {
        if (bindings?.entries) {
            for (const [key, value] of bindings.entries) {
                if (typeof key !== "string") {
                    throw new Error(`Eval binding key must be string, got ${String(key)}`);
                }
                context.setFresh(key, value);
            }
        }
        return await runSharedBody();
    } finally {
        context.pop();
    }
}

function withAsyncItemFinalizers(context, callback) {
    return withFinalizerActivationAsync(context, callback, {
        graceMs: context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
    });
}

function childBranchState(state, index) {
    return { ...state, branchPath: [...(state.branchPath || []), index] };
}

function asyncTaskPath(state, fallback = "item") {
    const scope = state.name ? `scope ${state.name}` : "async scope";
    const branch = (state.branchPath || []).map((index) => `branch ${index + 1}`).join(" / ");
    return branch ? `${scope} / ${branch}` : `${scope} / ${fallback}`;
}

async function orderedAsyncMap(items, state, worker) {
    if (items.length === 0) return [];
    const window = Math.max(1, state.limit * 2);
    const promises = new Array(items.length);
    const results = new Array(items.length);
    let nextToStart = 0;
    const start = (index) => {
        let promise;
        try {
            promise = Promise.resolve(worker(items[index], index));
        } catch (error) {
            promise = Promise.reject(error);
        }
        // A sibling may fail before its source-order turn is awaited. Attach a
        // rejection observer immediately while preserving the original promise.
        promise.catch(() => {});
        promises[index] = promise;
    };
    while (nextToStart < items.length && nextToStart < window) start(nextToStart++);
    for (let published = 0; published < items.length; published++) {
        results[published] = await promises[published];
        if (nextToStart < items.length) start(nextToStart++);
    }
    return results;
}

async function orderedAsyncTerminal(items, state, worker, terminal) {
    if (items.length === 0) return null;
    const scheduler = state.scheduler;
    const group = scheduler.createGroup(state.limit, state.group);
    const terminalState = { ...state, group, signal: group.signal };
    const window = Math.max(1, state.limit * 2);
    const promises = new Array(items.length);
    let nextToStart = 0;
    let candidateCount = 0;
    let lastCandidate = null;
    let uncertain = false;

    const start = (index) => {
        let promise;
        try {
            promise = Promise.resolve(worker(items[index], index, terminalState));
        } catch (error) {
            promise = Promise.reject(error);
        }
        promise.catch(() => {});
        promises[index] = promise;
    };
    const stop = async (result) => {
        if (!group.cancelled) scheduler.cancelGroup(group, streamEarlyStop("ordered terminal result"));
        await scheduler.waitForIdle(group);
        return result;
    };

    try {
        while (nextToStart < items.length && nextToStart < window) start(nextToStart++);
        for (let published = 0; published < items.length; published++) {
            const record = await promises[published];
            if (!record.dropped) {
                candidateCount++;
                lastCandidate = record.value;
                if (record.terminalState === "undecided") uncertain = true;
                if (terminal === "PANY" && record.terminalState === "truth") return await stop(record.value);
                if (terminal === "PALL" && record.terminalState === "null") return await stop(null);
            }
            if (nextToStart < items.length) start(nextToStart++);
        }
        await scheduler.waitForIdle(group);
        if (uncertain) return UNDECIDED;
        if (terminal === "PALL" && candidateCount > 0) return lastCandidate;
        return null;
    } catch (error) {
        if (!group.cancelled) scheduler.cancelGroup(group, error);
        await scheduler.waitForIdle(group);
        throw group.primaryError || error;
    } finally {
        scheduler.closeGroup(group);
    }
}

function streamEarlyStop(reason = "terminal result") {
    return Object.assign(new Error(`Async stream stopped after ${reason}`), {
        kind: "cancellation",
        streamEarlyStop: true,
    });
}

async function consumeAsyncStreamStructured(stream, terminal, context, registry, systemContext, state) {
    const scheduler = state.scheduler;
    const group = scheduler.createGroup(state.limit, state.group);
    const window = Math.max(1, state.limit * 2);
    const promises = [];
    let nextToStart = 0;
    let nextToPublish = 0;
    let outputIndex = 0;
    let accumulator = terminal.initial;
    const collected = [];
    let finalResult;
    let stopped = false;
    let stopReason = { kind: "complete" };
    let primary = null;
    let claimed = false;

    const start = (index) => {
        const itemContext = context.concurrentChild();
        const promise = scheduler.run((admission) => withAsyncItemFinalizers(itemContext, async () => {
            const itemState = { ...state, group, signal: group.signal, admission };
            const raw = await pullRawAsyncStream(stream, group.signal);
            if (raw.done) return { done: true, index };
            const processed = await processAsyncStreamItem(stream, raw, {
                signal: group.signal,
                invoke: (callable, args) => invokeTraversalCallbackAsync(
                    callable,
                    args,
                    itemContext,
                    registry,
                    systemContext,
                    itemState,
                ),
            });
            if (processed.unresolved !== undefined) {
                return { done: false, index, records: [], stop: true, unresolved: processed.unresolved };
            }
            const records = [];
            for (const value of processed.values) {
                let terminalValue = null;
                if (terminal.kind === "forEach") {
                    terminalValue = await invokeTraversalCallbackAsync(
                        terminal.callable,
                        [value, new Integer(BigInt(raw.sourceIndex)), stream._stream.callbackSource ?? stream],
                        itemContext,
                        registry,
                        systemContext,
                        itemState,
                    );
                } else if (terminal.kind === "find" || terminal.kind === "all") {
                    terminalValue = await invokeTraversalCallbackAsync(
                        terminal.callable,
                        [value, new Integer(BigInt(raw.sourceIndex)), stream._stream.callbackSource ?? stream],
                        itemContext,
                        registry,
                        systemContext,
                        itemState,
                    );
                }
                records.push({ value, terminalValue });
            }
            return { done: false, index, records, stop: processed.stop };
        }), group, {
            path: `stream ${stream._stream.label} / item ${index + 1}`,
            branchPath: [...(state.branchPath || []), index],
        });
        promise.catch(() => {});
        promises[index] = promise;
    };

    const cancelPending = (reason) => {
        if (!group.cancelled) scheduler.cancelGroup(group, reason);
    };

    try {
        claimAsyncStream(stream);
        claimed = true;
        if (terminal.kind === "count" && !stream._stream.finite && terminal.bound === null) {
            throw new Error("Count requires a finite or explicitly bounded async stream");
        }
        if (terminal.bound === 0 || asyncStreamCanCompleteWithoutPull(stream)) {
            stopReason = { kind: "early terminal" };
            if (terminal.kind === "collect") return { type: "sequence", values: [] };
            if (terminal.kind === "count") return new Integer(0n);
            if (terminal.kind === "forEach" || terminal.kind === "first" || terminal.kind === "find" || terminal.kind === "all") return null;
            return accumulator;
        }
        while (nextToStart < window) start(nextToStart++);
        while (!stopped) {
            const record = await promises[nextToPublish++];
            if (record.done) {
                stopReason = { kind: "complete" };
                cancelPending(streamEarlyStop("source completion"));
                break;
            }
            if (record.unresolved !== undefined) {
                finalResult = record.unresolved;
                stopped = true;
            }
            for (const entry of record.records) {
                outputIndex++;
                if (terminal.kind === "collect") collected.push(entry.value);
                else if (terminal.kind === "reduce") {
                    accumulator = await invokeTraversalCallbackAsync(
                        terminal.callable,
                        [accumulator, entry.value, new Integer(BigInt(outputIndex)), stream._stream.callbackSource ?? stream],
                        context,
                        registry,
                        systemContext,
                        state,
                    );
                } else if (terminal.kind === "first") {
                    finalResult = entry.value;
                    stopped = true;
                } else if (terminal.kind === "find") {
                    const entryState = decisionState(entry.terminalValue);
                    if (entryState === "truth") {
                        finalResult = entry.value;
                        stopped = true;
                    } else if (entryState === "undecided" && finalResult === undefined) {
                        finalResult = UNDECIDED;
                    }
                } else if (terminal.kind === "all") {
                    const entryState = decisionState(entry.terminalValue);
                    if (entryState === "null") {
                        finalResult = null;
                        stopped = true;
                    } else if (entryState === "undecided") {
                        finalResult = UNDECIDED;
                    } else {
                        if (finalResult !== UNDECIDED) finalResult = entry.value;
                    }
                }
                if (terminal.bound !== null && outputIndex >= terminal.bound) stopped = true;
                if (stopped) break;
            }
            if (record.stop) stopped = true;
            if (stopped) {
                stopReason = { kind: "early terminal" };
                cancelPending(streamEarlyStop());
                break;
            }
            start(nextToStart++);
        }
        await scheduler.waitForIdle(group);
        if (terminal.kind === "collect") finalResult = { type: "sequence", values: collected };
        else if (terminal.kind === "count") finalResult = new Integer(BigInt(outputIndex));
        else if (terminal.kind === "forEach") finalResult = null;
        else if (terminal.kind === "reduce") finalResult = accumulator;
        else if (finalResult === undefined) finalResult = null;
        return finalResult;
    } catch (error) {
        stopReason = error;
        primary = error;
        cancelPending(error);
        await scheduler.waitForIdle(group);
        throw error;
    } finally {
        scheduler.closeGroup(group);
        if (claimed) {
            try {
                await closeAsyncStream(stream, stopReason);
            } catch (cleanupError) {
                if (!primary) throw cleanupError;
                const existing = Array.isArray(primary.suppressed) ? primary.suppressed : [];
                primary.suppressed = [...existing, cleanupError];
            }
        }
    }
}

function createAsyncMethodExecution(context, registry, systemContext, state) {
    return {
        promiseAware: true,
        signal: state?.signal ?? null,
        invoke: (callable, args) => invokeCallableAsync(
            callable,
            args,
            context,
            registry,
            systemContext,
            state,
        ),
        consume: (stream, terminal) => withReleasedAsyncAdmission(state, async () => {
            try {
                if (state?.scheduler && state.parallelCollections !== false && asyncStreamSupportsConcurrentItems(stream)) {
                    return await consumeAsyncStreamStructured(stream, terminal, context, registry, systemContext, state);
                }
                return await consumeAsyncStreamSequential(stream, terminal, {
                    signal: state?.signal ?? null,
                    invoke: (callable, args) => invokeTraversalCallbackAsync(
                        callable,
                        args,
                        context,
                        registry,
                        systemContext,
                        state,
                    ),
                });
            } finally {
                unregisterAsyncResource(context, stream?._stream?.root);
            }
        }),
    };
}

async function invokeMethodAsync(target, methodName, callArgs, context, registry, systemContext, state) {
    if (methodName.endsWith("!")) ensureMutableReceiver(target);
    const fn = resolveMethod(target, methodName, context);
    if (fn?.type === "method_builtin") {
        try {
            return await fn.impl(
                [target, ...callArgs],
                context,
                (node) => evaluateAsyncInternal(node, context, registry, systemContext, state),
                (callable, args) => invokeCallableAsync(callable, args, context, registry, systemContext, state),
                createAsyncMethodExecution(context, registry, systemContext, state),
            );
        } finally {
            if (isAsyncStream(target) && methodName === "CLOSE") {
                unregisterAsyncResource(context, target._stream.root);
            }
        }
    }
    return invokeCallableAsync(fn, [target, ...callArgs], context, registry, systemContext, state);
}

function asyncCollectionEntry(node, context, registry, systemContext, state) {
    if (state.parallelCollections === false) {
        return evaluateAsyncInternal(node, context, registry, systemContext, state);
    }
    if (containsNestedAsyncCollection(node)) {
        // Structural parents consume no permit; their leaves do.
        return evaluateAsyncInternal(node, context, registry, systemContext, state);
    }
    const itemContext = context.concurrentChild();
    return state.scheduler.run((admission) =>
        withAsyncItemFinalizers(itemContext, () => evaluateAsyncInternal(
            node,
            itemContext,
            registry,
            systemContext,
            { ...state, admission },
        )), state.group, {
            branchPath: state.branchPath,
            path: asyncTaskPath(state),
        });
}

async function resolveAsyncCollectionArg(arg, context, registry, systemContext, state) {
    if (arg?.fn === "HOLE") return arg;
    if (arg?.fn === "GENERATOR") {
        const resolved = [];
        for (const component of arg.args) {
            if (component?.fn?.startsWith("GEN_")) {
                const opArgs = [];
                for (const operand of component.args || []) {
                    opArgs.push(await evaluateAsyncInternal(operand, context, registry, systemContext, state));
                }
                resolved.push({ ...component, args: opArgs });
            } else {
                resolved.push(await evaluateAsyncInternal(component, context, registry, systemContext, state));
            }
        }
        return { ...arg, args: resolved };
    }
    if (arg?.fn === "SPREAD") {
        const value = await asyncCollectionEntry(arg.args[0], context, registry, systemContext, state);
        return { fn: "SPREAD", args: [value] };
    }
    if (arg && !arg.fn && arg.expression) {
        return {
            ...arg,
            expression: await asyncCollectionEntry(arg.expression, context, registry, systemContext, state),
        };
    }
    return asyncCollectionEntry(arg, context, registry, systemContext, state);
}

async function withReleasedAsyncAdmission(state, callback) {
    if (state?.parallelCollections === false) return callback();
    const admission = state?.admission;
    const released = admission ? state.scheduler.suspend(admission) : false;
    try {
        return await callback();
    } finally {
        if (released) await state.scheduler.resume(admission);
    }
}

async function evaluateAsyncCollectionBody(irNode, context, registry, systemContext, state) {
    const definition = registry.get(irNode.fn);
    if (!definition) throw new Error(`Unknown collection constructor: ${irNode.fn}`);
    const args = irNode.args;
    const hasHeader = args[0]?.header && !args[0].fn;
    const start = hasHeader ? 1 : 0;
    const resolved = hasHeader ? [args[0]] : [];

    if (irNode.fn === "MAP_OBJ") {
        const resolveMapEntry = async (entry, entryIndex) => {
            const entryState = childBranchState(state, entryIndex);
            if (entry?.fn === "ASSIGN") {
                return { ...entry, args: [entry.args[0], await asyncCollectionEntry(entry.args[1], context, registry, systemContext, entryState)] };
            }
            if (entry?.fn === "MAP_PAIR") {
                const [kind, key, value, mode] = entry.args;
                const itemContext = context.concurrentChild();
                const resolveEntry = async (admission = null) => {
                    const itemState = admission ? { ...entryState, admission } : entryState;
                    return {
                        ...entry,
                        args: [
                            kind,
                            kind === "identifier" ? key : await evaluateAsyncInternal(key, itemContext, registry, systemContext, itemState),
                            await evaluateAsyncInternal(value, itemContext, registry, systemContext, itemState),
                            mode,
                        ],
                    };
                };
                // Nested constructors are structural: their leaves acquire the
                // permits, not this map-entry wrapper.
                return state.parallelCollections === false || containsNestedAsyncCollection(value)
                    ? resolveEntry()
                    : state.scheduler.run((admission) =>
                        withAsyncItemFinalizers(itemContext, () => resolveEntry(admission)), state.group, {
                        branchPath: entryState.branchPath,
                        path: asyncTaskPath(entryState, "map entry"),
                    });
            }
            return resolveAsyncCollectionArg(entry, context, registry, systemContext, entryState);
        };
        if (state.parallelCollections === false) {
            for (let index = 0; index < args.slice(start).length; index++) {
                resolved.push(await resolveMapEntry(args.slice(start)[index], index));
            }
        } else {
            resolved.push(...await orderedAsyncMap(args.slice(start), state, resolveMapEntry));
        }
    } else if (irNode.fn === "SHAPED_LITERAL") {
        const shapeIndex = hasHeader ? 1 : 0;
        resolved.push(args[shapeIndex]);
        const entries = args.slice(shapeIndex + 1);
        if (state.parallelCollections === false) {
            for (let index = 0; index < entries.length; index++) {
                resolved.push(await resolveAsyncCollectionArg(entries[index], context, registry, systemContext, childBranchState(state, index)));
            }
        } else {
            resolved.push(...await orderedAsyncMap(entries, state,
                (arg, index) => resolveAsyncCollectionArg(arg, context, registry, systemContext, childBranchState(state, index))));
        }
    } else {
        const entries = args.slice(start);
        if (state.parallelCollections === false) {
            for (let index = 0; index < entries.length; index++) {
                resolved.push(await resolveAsyncCollectionArg(entries[index], context, registry, systemContext, childBranchState(state, index)));
            }
        } else {
            resolved.push(...await orderedAsyncMap(entries, state,
                (arg, index) => resolveAsyncCollectionArg(arg, context, registry, systemContext, childBranchState(state, index))));
        }
    }

    const resolvedEvaluate = (node) => node?.fn ? evaluate(node, context, registry, systemContext) : node;
    return await definition.impl(resolved, context, resolvedEvaluate, systemContext);
}

async function evaluateAsyncCollection(irNode, context, registry, systemContext, state) {
    return withReleasedAsyncAdmission(state, () =>
        evaluateAsyncCollectionBody(irNode, context, registry, systemContext, state));
}

function collectionItems(collection) {
    if (isShaped(collection)) {
        const items = [];
        forEachShapedCell(collection, (value, tuple) => {
            items.push({ value, locator: shapedIndexTuple(tuple) });
        });
        return items;
    }
    if (collection?.type === "map" && collection.entries instanceof Map) {
        return [...collection.entries].map(([key, value]) => ({
            key,
            value,
            locator: { type: "string", value: key },
        }));
    }
    const isStringObject = collection?.type === "string";
    if (typeof collection === "string" || isStringObject) {
        const raw = isStringObject ? collection.value : collection;
        return Array.from(raw).map((value) => ({ value: isStringObject ? { type: "string", value } : value }));
    }
    if (collection && Array.isArray(collection.values)) {
        return collection.values.map((value) => ({ value }));
    }
    throw new Error("Async pipe requires a finite collection");
}

function assembleAsyncPipeResult(collection, items, records, stages = []) {
    if (records.some((record) => record.unresolved === true)) return UNDECIDED;
    if (isShaped(collection)) {
        const kept = records.filter((record) => record.keep);
        if (stages.some((stage) => stage.fn === "PFILTER")) {
            return {
                type: "sequence",
                values: kept.map((record) => ({
                    type: "tuple",
                    values: [record.value, items[record.index].locator],
                })),
            };
        }
        return createShaped(collection.shape, kept.map((record) => record.value));
    }
    if (collection?.type === "map") {
        return { type: "map", entries: new Map(records.filter((r) => r.keep).map((r) => [items[r.index].key, r.value])) };
    }
    const values = records.filter((record) => record.keep).map((record) => record.value);
    if (typeof collection === "string" || collection?.type === "string") {
        const joined = values.map((value) => value?.type === "string" ? value.value : value).join("");
        return collection?.type === "string" ? { type: "string", value: joined } : joined;
    }
    return { type: collection?.type || "sequence", values };
}

function containsNestedAsyncCollection(node) {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(containsNestedAsyncCollection);
    if (node.fn && (ASYNC_COLLECTION_FNS.has(node.fn) || node.fn === "ASYNC_SCOPE")) return true;
    return node.fn && Array.isArray(node.args)
        ? node.args.some(containsNestedAsyncCollection)
        : false;
}

function rawFusedSource(sourceNode) {
    if (!sourceNode?.fn || !["ARRAY", "ARRAY_CAPTURE", "TUPLE", "SET"].includes(sourceNode.fn)) return null;
    const header = sourceNode.args[0]?.header && !sourceNode.args[0].fn ? sourceNode.args[0] : null;
    const entries = header ? sourceNode.args.slice(1) : sourceNode.args;
    if (entries.some((entry) =>
        entry?.fn === "SPREAD"
        || entry?.fn === "GENERATOR"
        || containsNestedAsyncCollection(entry?.expression || entry))) {
        return null;
    }
    const type = sourceNode.fn === "TUPLE" ? "tuple" : sourceNode.fn === "SET" ? "set" : "sequence";
    return { fn: sourceNode.fn, header, entries, shell: { type, values: [] } };
}

function captureFusedSourceValue(source, entry, value, context, registry, systemContext) {
    const definition = registry.get(source.fn);
    const resolvedEntry = entry && !entry.fn && entry.expression
        ? { ...entry, expression: value }
        : value;
    const args = source.header ? [source.header, resolvedEntry] : [resolvedEntry];
    const collection = definition.impl(
        args,
        context,
        (node) => node?.fn ? evaluate(node, context, registry, systemContext) : node,
        systemContext,
    );
    return collection.values[0];
}

async function runAsyncPipeStages(value, index, key, collection, stages, callables, context, registry, systemContext, state, explicitLocator = null) {
    let current = value;
    let keep = true;
    let dropped = false;
    let terminalPassed = null;
    let terminalState = null;
    let unresolved = false;
    const locator = explicitLocator ?? (key !== undefined
        ? { type: "string", value: key }
        : new Integer(BigInt(index + 1)));
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
        const stage = stages[stageIndex];
        if (stage.fn === "PEXPECT") {
            const errorArgs = expectedErrorArgs(current);
            if (errorArgs === null) continue;
            const result = await invokeCallableAsync(
                callables[stageIndex],
                errorArgs,
                context,
                registry,
                systemContext,
                state,
            );
            if (result === null || result === undefined) {
                keep = false;
                dropped = true;
                break;
            }
            current = result;
            continue;
        }
        const result = await invokeTraversalCallbackAsync(
            callables[stageIndex],
            [current, locator, collection],
            context,
            registry,
            systemContext,
            state,
        );
        if (stage.fn === "PMAP") current = result;
        else if (stage.fn === "PFILTER") {
            const resultState = decisionState(result);
            if (resultState === "undecided") {
                unresolved = true;
                break;
            }
            if (resultState === "null") {
                keep = false;
                dropped = true;
                break;
            }
        } else if (stage.fn === "PANY" || stage.fn === "PALL") {
            terminalState = decisionState(result);
            terminalPassed = terminalState === "truth";
            keep = true;
            break;
        } else if (stage.fn === "PFOREACH") {
            break;
        }
    }
    return { index, value: current, keep, dropped, terminalPassed, terminalState, unresolved };
}

function asyncTerminalResult(terminal, records) {
    if (terminal === "PANY") {
        const match = records.find((record) => !record.dropped && record.terminalState === "truth");
        if (match) return match.value;
        return records.some((record) => !record.dropped && record.terminalState === "undecided") ? UNDECIDED : null;
    }
    if (terminal === "PALL") {
        const candidates = records.filter((record) => !record.dropped);
        if (candidates.length === 0 || candidates.some((record) => record.terminalState === "null")) return null;
        if (candidates.some((record) => record.terminalState === "undecided")) return UNDECIDED;
        return candidates.at(-1).value;
    }
    if (terminal === "PFOREACH") return null;
    return undefined;
}

async function evaluateAsyncStreamPipe(stream, stages, callables, context, registry, systemContext, state) {
    let derived = stream;
    for (let index = 0; index < stages.length; index++) {
        if (stages[index].fn === "PMAP") derived = mapAsyncStream(derived, callables[index]);
        else if (stages[index].fn === "PFILTER") derived = filterAsyncStream(derived, callables[index]);
        else if (stages[index].fn === "PEXPECT") derived = expectedErrorAsyncStream(derived, callables[index]);
        else if (stages[index].fn === "PFOREACH") {
            return createAsyncMethodExecution(context, registry, systemContext, state).consume(derived, {
                kind: "forEach",
                callable: callables[index],
                initial: null,
                bound: null,
            });
        }
        else if (stages[index].fn === "PANY" || stages[index].fn === "PALL") {
            return createAsyncMethodExecution(context, registry, systemContext, state).consume(derived, {
                kind: stages[index].fn === "PANY" ? "find" : "all",
                callable: callables[index],
                initial: null,
                bound: null,
            });
        }
        else throw new Error("Async stream pipes support lazy |>> and |>? stages; use an explicit stream terminal to consume");
    }
    return derived;
}

function lazySequenceAsyncStream(source) {
    let index = 1;
    return createAsyncStream({
        label: "lazy sequence",
        finite: source._lazy.knownLength !== null,
        callbackSource: source,
        next(signal) {
            if (signal?.aborted) throw signal.reason;
            const value = ensureLazyIndex(source, index);
            if (source._lazy.done && source._lazy.cache.length < index) return { done: true };
            index++;
            return { done: false, value };
        },
    });
}

function expectedPipeScalarSource(source, stages) {
    if (stages[0]?.fn !== "PEXPECT") return false;
    if (expectedErrorArgs(source) !== null || source?.type === "tuple") return true;
    if (isAsyncStream(source) || isLazySequence(source) || isShaped(source) || source?.type === "map") return false;
    return !Array.isArray(source?.values);
}

async function evaluateScalarExpectedPipe(source, stages, callables, context, registry, systemContext, state) {
    const record = await runAsyncPipeStages(
        source,
        0,
        undefined,
        source,
        stages,
        callables,
        context,
        registry,
        systemContext,
        state,
    );
    if (stages.at(-1)?.fn === "PFOREACH") return null;
    return record.keep ? record.value : PIPE_SKIP;
}

async function evaluateSequentialAsyncPipe(irNode, context, registry, systemContext, state) {
    const stages = [];
    let sourceNode = irNode;
    while (sourceNode?.fn && ASYNC_PIPE_FNS.has(sourceNode.fn)) {
        if (sourceNode.fn === "PFOREACH" && stages.length > 0) break;
        stages.unshift({ fn: sourceNode.fn, callableNode: sourceNode.args[1] });
        sourceNode = sourceNode.args[0];
    }
    const callables = [];
    for (const stage of stages) {
        callables.push(await evaluateAsyncInternal(stage.callableNode, context, registry, systemContext, state));
    }
    const collection = await evaluateAsyncInternal(sourceNode, context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isAsyncStream(collection)) {
        return evaluateAsyncStreamPipe(collection, stages, callables, context, registry, systemContext, state);
    }
    if (isLazySequence(collection)) {
        return evaluateAsyncStreamPipe(
            lazySequenceAsyncStream(collection),
            stages,
            callables,
            context,
            registry,
            systemContext,
            state,
        );
    }
    if (expectedPipeScalarSource(collection, stages)) {
        return evaluateScalarExpectedPipe(collection, stages, callables, context, registry, systemContext, state);
    }
    const items = collectionItems(collection);
    const records = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        records.push(await runAsyncPipeStages(
            item.value,
            index,
            item.key,
            collection,
            stages,
            callables,
            context,
            registry,
            systemContext,
            state,
            item.locator,
        ));
    }
    const terminal = stages.at(-1)?.fn;
    if (terminal === "PANY" || terminal === "PALL" || terminal === "PFOREACH") {
        return asyncTerminalResult(terminal, records);
    }
    return assembleAsyncPipeResult(collection, items, records, stages);
}

async function evaluateAsyncPipe(irNode, context, registry, systemContext, state) {
    if (state.parallelCollections === false) {
        return evaluateSequentialAsyncPipe(irNode, context, registry, systemContext, state);
    }
    const stages = [];
    let sourceNode = irNode;
    while (sourceNode?.fn && ASYNC_PIPE_FNS.has(sourceNode.fn)) {
        if (sourceNode.fn === "PFOREACH" && stages.length > 0) break;
        stages.unshift({ fn: sourceNode.fn, callableNode: sourceNode.args[1] });
        sourceNode = sourceNode.args[0];
    }
    const callables = [];
    for (const stage of stages) {
        callables.push(await evaluateAsyncInternal(stage.callableNode, context, registry, systemContext, state));
    }
    const fusedSource = rawFusedSource(sourceNode);
    if (fusedSource) {
        const terminal = stages.at(-1)?.fn;
        const runEntry = (entry, index, taskState = state) => {
            const itemContext = context.concurrentChild();
            const branchState = childBranchState(taskState, index);
            return taskState.scheduler.run((admission) => withAsyncItemFinalizers(itemContext, async () => {
                const itemState = { ...branchState, admission };
                const rawNode = entry?.expression || entry;
                const resolved = await evaluateAsyncInternal(rawNode, itemContext, registry, systemContext, itemState);
                const captured = captureFusedSourceValue(
                    fusedSource,
                    entry,
                    resolved,
                    itemContext,
                    registry,
                    systemContext,
                );
                return runAsyncPipeStages(
                    captured,
                    index,
                    undefined,
                    fusedSource.shell,
                    stages,
                    callables,
                    itemContext,
                    registry,
                    systemContext,
                    itemState,
                );
            }), taskState.group, {
                branchPath: branchState.branchPath,
                path: `${asyncTaskPath(branchState)} / fused pipe`,
            });
        };
        if (terminal === "PANY" || terminal === "PALL") {
            return orderedAsyncTerminal(fusedSource.entries, state, runEntry, terminal);
        }
        const records = await orderedAsyncMap(fusedSource.entries, state, runEntry);
        if (terminal === "PANY" || terminal === "PALL" || terminal === "PFOREACH") {
            return asyncTerminalResult(terminal, records);
        }
        return assembleAsyncPipeResult(
            fusedSource.shell,
            fusedSource.entries.map((value) => ({ value })),
            records,
            stages,
        );
    }

    const collection = await evaluateAsyncInternal(sourceNode, context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isAsyncStream(collection)) {
        return evaluateAsyncStreamPipe(collection, stages, callables, context, registry, systemContext, state);
    }
    if (isLazySequence(collection)) {
        return evaluateAsyncStreamPipe(
            lazySequenceAsyncStream(collection),
            stages,
            callables,
            context,
            registry,
            systemContext,
            state,
        );
    }
    if (expectedPipeScalarSource(collection, stages)) {
        return evaluateScalarExpectedPipe(collection, stages, callables, context, registry, systemContext, state);
    }
    const items = collectionItems(collection);
    const terminal = stages.at(-1)?.fn;
    const runItem = (item, index, taskState = state) => {
        const itemContext = context.concurrentChild();
        const branchState = childBranchState(taskState, index);
        return taskState.scheduler.run((admission) => withAsyncItemFinalizers(itemContext, () => runAsyncPipeStages(
            item.value,
            index,
            item.key,
            collection,
            stages,
            callables,
            itemContext,
            registry,
            systemContext,
            { ...branchState, admission },
            item.locator,
        )), taskState.group, {
            branchPath: branchState.branchPath,
            path: `${asyncTaskPath(branchState)} / pipe`,
        });
    };

    if (terminal === "PANY" || terminal === "PALL") {
        return orderedAsyncTerminal(items, state, runItem, terminal);
    }
    const records = await orderedAsyncMap(items, state, runItem);
    if (terminal === "PANY" || terminal === "PALL" || terminal === "PFOREACH") {
        return asyncTerminalResult(terminal, records);
    }
    return assembleAsyncPipeResult(collection, items, records, stages);
}

function asyncReductionItems(collection) {
    if (isShaped(collection)) {
        const items = [];
        forEachShapedCell(collection, (value, tuple) => {
            items.push({ value, locator: shapedIndexTuple(tuple) });
        });
        return items;
    }
    if (collection?.type === "map") {
        if (!(collection.entries instanceof Map)) throw new Error("PREDUCE: invalid map");
        return [...collection.entries].map(([key, value]) => ({
            value,
            locator: { type: "string", value: key },
        }));
    }
    const isStringObject = collection?.type === "string";
    if (typeof collection === "string" || isStringObject) {
        const raw = isStringObject ? collection.value : collection;
        return Array.from(raw).map((value, index) => ({
            value: isStringObject ? { type: "string", value } : value,
            locator: new Integer(BigInt(index + 1)),
        }));
    }
    if (collection && Array.isArray(collection.values)) {
        return collection.values.map((value, index) => ({
            value,
            locator: new Integer(BigInt(index + 1)),
        }));
    }
    throw new Error("PREDUCE requires a collection");
}

async function evaluateAsyncReduce(args, context, registry, systemContext, state) {
    let collection = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isLazySequence(collection)) collection = materializeLazySequence(collection);

    const initProvided = args.length > 2;
    const explicitInit = initProvided
        ? await evaluateAsyncInternal(args[2], context, registry, systemContext, state)
        : null;
    const callable = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    const items = asyncReductionItems(collection);
    if (items.length === 0) return initProvided ? explicitInit : null;

    let accumulator = initProvided ? explicitInit : items[0].value;
    const start = initProvided ? 0 : 1;
    for (let index = start; index < items.length; index++) {
        const item = items[index];
        accumulator = await invokeTraversalCallbackAsync(
            callable,
            [accumulator, item.value, item.locator, collection],
            context,
            registry,
            systemContext,
            state,
        );
    }
    return accumulator;
}

async function stableAsyncMergeSort(items, compare) {
    if (items.length < 2) return [...items];
    const middle = Math.floor(items.length / 2);
    const left = await stableAsyncMergeSort(items.slice(0, middle), compare);
    const right = await stableAsyncMergeSort(items.slice(middle), compare);
    const merged = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
        if (await compare(left[leftIndex], right[rightIndex]) <= 0) {
            merged.push(left[leftIndex++]);
        } else {
            merged.push(right[rightIndex++]);
        }
    }
    merged.push(...left.slice(leftIndex), ...right.slice(rightIndex));
    return merged;
}

async function evaluateAsyncSort(args, context, registry, systemContext, state) {
    let collection = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isLazySequence(collection)) collection = materializeLazySequence(collection);
    if (collection?.type === "map") {
        throw new Error("PSORT does not support maps — maps have no defined order");
    }

    const isStringObject = collection?.type === "string";
    const isString = typeof collection === "string" || isStringObject;
    let items;
    if (isString) {
        const raw = isStringObject ? collection.value : collection;
        items = Array.from(raw).map((value) => isStringObject ? { type: "string", value } : value);
    } else if (collection && Array.isArray(collection.values)) {
        items = collection.values;
    } else {
        throw new Error("PSORT requires a collection");
    }

    const callable = args[1] === undefined
        ? null
        : await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    let uncertainOrdering = false;
    const comparatorResult = (result) => {
        if (result === UNDECIDED) {
            uncertainOrdering = true;
            return 0;
        }
        if (result?.constructor?.name === "Integer") return Number(result.value);
        if (typeof result === "number") return result;
        return 0;
    };
    const compare = async (left, right) => {
        if (callable && !isHole(callable)) {
            const result = await invokeCallableAsync(
                callable,
                [left, right],
                context,
                registry,
                systemContext,
                state,
            );
            return comparatorResult(result);
        }
        if (left?.isCertifiedApproximation || right?.isCertifiedApproximation
            || left?.constructor?.name === "RationalInterval" || right?.constructor?.name === "RationalInterval") {
            return comparatorResult(await evaluateAsyncInternal(
                { fn: "COMPARE", args: [left, right] },
                context,
                registry,
                systemContext,
                state,
            ));
        }
        if (isString) {
            const leftValue = left?.type === "string" ? left.value : left;
            const rightValue = right?.type === "string" ? right.value : right;
            return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        }
        const leftNumber = left?.constructor?.name === "Integer" ? Number(left.value) : Number(left);
        const rightNumber = right?.constructor?.name === "Integer" ? Number(right.value) : Number(right);
        return leftNumber - rightNumber;
    };
    const sorted = await stableAsyncMergeSort(items, compare);
    if (uncertainOrdering) return UNDECIDED;

    if (isString) {
        const joined = sorted.map((value) => value?.type === "string" ? value.value : value).join("");
        return isStringObject ? { type: "string", value: joined } : joined;
    }
    return { type: collection.type || "sequence", values: sorted };
}

async function evaluateAsyncResolvedBarrier(irNode, context, registry, systemContext, state) {
    const definition = registry.get(irNode.fn);
    const resolved = [];
    for (const arg of irNode.args) {
        resolved.push(await evaluateAsyncInternal(arg, context, registry, systemContext, state));
    }
    return await definition.impl(resolved, context, (value) => value, systemContext);
}

function isAsyncCallableValue(value) {
    return typeof value === "function" || [
        "function", "lambda", "partial", "sysref", "arityCap", "multifunction",
    ].includes(value?.type);
}

function asyncBarrierLinearItems(collection, operation) {
    if (collection?.type === "map") {
        throw new Error(`${operation} does not support maps — maps have no defined order`);
    }
    const isStringObject = collection?.type === "string";
    const isString = typeof collection === "string" || isStringObject;
    if (isString) {
        const raw = isStringObject ? collection.value : collection;
        return {
            isString,
            isStringObject,
            items: Array.from(raw).map((value) => isStringObject ? { type: "string", value } : value),
        };
    }
    if (collection && Array.isArray(collection.values)) {
        return { isString, isStringObject, items: collection.values };
    }
    return { isString, isStringObject, items: null };
}

function assembleAsyncPieces(collection, pieces, isString, isStringObject) {
    if (isString) {
        return {
            type: "sequence",
            values: pieces.map((piece) => {
                const joined = piece.map((value) => value?.type === "string" ? value.value : value).join("");
                return isStringObject ? { type: "string", value: joined } : joined;
            }),
        };
    }
    return {
        type: "sequence",
        values: pieces.map((piece) => ({
            type: collection.type === "tuple" ? "tuple" : collection.type || "sequence",
            values: piece,
        })),
    };
}

async function evaluateAsyncSplit(args, context, registry, systemContext, state) {
    let collection = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isLazySequence(collection)) collection = materializeLazySequence(collection);
    const separator = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    const isRegex = typeof separator === "function"
        && separator.toString?.().startsWith("[Regex");
    if (!isAsyncCallableValue(separator) || isRegex) {
        const definition = registry.get("PSPLIT");
        return definition.impl([collection, separator], context, (value) => value, systemContext);
    }

    const { items, isString, isStringObject } = asyncBarrierLinearItems(collection, "PSPLIT");
    if (!items) return null;
    const pieces = [];
    let currentPiece = [];
    let inSeparator = false;
    for (let index = 0; index < items.length; index++) {
        const locator = new Integer(BigInt(index + 1));
        const separatorValue = await invokeTraversalCallbackAsync(
            separator,
            [items[index], locator, collection],
            context,
            registry,
            systemContext,
            state,
        );
        const separatorState = decisionState(separatorValue);
        if (separatorState === "undecided") return UNDECIDED;
        const separates = separatorState === "truth";
        if (separates) {
            if (!inSeparator) {
                pieces.push(currentPiece);
                currentPiece = [];
                inSeparator = true;
            }
        } else {
            inSeparator = false;
            currentPiece.push(items[index]);
        }
    }
    pieces.push(currentPiece);
    return assembleAsyncPieces(collection, pieces, isString, isStringObject);
}

async function evaluateAsyncChunk(args, context, registry, systemContext, state) {
    let collection = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
    if (collection === null || collection === undefined) return null;
    if (isLazySequence(collection)) collection = materializeLazySequence(collection);
    const boundary = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
    if (!isAsyncCallableValue(boundary)) {
        const definition = registry.get("PCHUNK");
        return definition.impl([collection, boundary], context, (value) => value, systemContext);
    }

    const { items, isString, isStringObject } = asyncBarrierLinearItems(collection, "PCHUNK");
    if (!items) return null;
    const pieces = [];
    let currentPiece = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const locator = new Integer(BigInt(index + 1));
        const boundaryValue = await invokeTraversalCallbackAsync(
            boundary,
            [item, locator, collection],
            context,
            registry,
            systemContext,
            state,
        );
        const boundaryState = decisionState(boundaryValue);
        if (boundaryState === "undecided") return UNDECIDED;
        const endsChunk = boundaryState === "truth";
        currentPiece.push(item);
        if (endsChunk) {
            pieces.push(currentPiece);
            currentPiece = [];
        }
    }
    if (currentPiece.length > 0) pieces.push(currentPiece);
    return assembleAsyncPieces(collection, pieces, isString, isStringObject);
}

async function evaluateAsyncScopeBody(args, context, registry, systemContext, parentState) {
    const { meta, body } = splitAsyncBlockArgs(args);
    const enteredAt = performance.now();
    const configured = meta.concurrencyLimit ?? context.getEnv(
        "defaultAsyncConcurrency",
        runtimeDefaults.defaultAsyncConcurrency,
    );
    const hasParentScheduler = !!parentState?.scheduler;
    const effectiveLimit = hasParentScheduler ? Math.min(configured, parentState.limit) : configured;
    const scheduler = hasParentScheduler ? parentState.scheduler : new AsyncScheduler(effectiveLimit);
    const group = hasParentScheduler
        ? scheduler.createGroup(effectiveLimit, parentState.group)
        : scheduler.defaultGroup;
    const ownDeadline = meta.timeoutSeconds !== undefined
        ? enteredAt + meta.timeoutSeconds * 1000
        : Infinity;
    const inheritedDeadline = parentState?.deadlineMs ?? Infinity;
    const deadlineMs = Math.min(ownDeadline, inheritedDeadline);
    const deadlineFault = inheritedDeadline <= ownDeadline
        ? parentState?.deadlineFault
        : new TimeoutFault(meta.timeoutSeconds, {
            data: { timeoutSeconds: meta.timeoutSeconds, scope: meta.name ?? null },
        });
    const state = {
        scheduler,
        group,
        signal: group.signal,
        limit: effectiveLimit,
        name: meta.name ?? null,
        parallelCollections: true,
        deadlineMs,
        deadlineFault,
        branchPath: [],
    };
    let timeoutId = null;
    let removeParentAbort = null;
    if (parentState?.signal) {
        const abortFromParent = () => scheduler.cancelGroup(group, parentState.signal.reason);
        if (parentState.signal.aborted) abortFromParent();
        else {
            parentState.signal.addEventListener("abort", abortFromParent, { once: true });
            removeParentAbort = () => parentState.signal.removeEventListener("abort", abortFromParent);
        }
    }
    if (Number.isFinite(deadlineMs)) {
        timeoutId = setTimeout(() => {
            scheduler.cancelGroup(group, deadlineFault);
        }, Math.max(0, deadlineMs - performance.now()));
    }
    context.push(undefined, { isolated: true });
    try {
        return await withFinalizerActivationAsync(context, async () => {
            try {
                applyAsyncImports(meta.imports, context);
                let result = null;
                try {
                    for (const statement of body) {
                        result = await evaluateAsyncInternal(statement, context, registry, systemContext, state);
                    }
                    await state.scheduler.waitForIdle(state.group);
                    if (state.signal.aborted) throw state.signal.reason;
                    return result;
                } catch (error) {
                    if (!matchesAsyncBreak(error, state.name)) {
                        state.scheduler.cancelGroup(state.group, error);
                        await state.scheduler.waitForIdle(state.group);
                        throw error;
                    }
                    state.scheduler.cancelGroup(state.group, error);
                    await state.scheduler.waitForIdle(state.group);
                    return error.value;
                }
            } finally {
                if (timeoutId !== null) clearTimeout(timeoutId);
                removeParentAbort?.();
            }
        }, {
            graceMs: context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
        });
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        removeParentAbort?.();
        state.scheduler.closeGroup(state.group);
        context.pop();
    }
}

async function evaluateAsyncScope(args, context, registry, systemContext, parentState) {
    const releaseState = parentState
        ? { ...parentState, parallelCollections: true }
        : parentState;
    return withReleasedAsyncAdmission(releaseState, () =>
        evaluateAsyncScopeBody(args, context, registry, systemContext, parentState));
}

function readAsyncTemplateHole(source, start) {
    if (!source.startsWith("@{", start)) return null;
    let depth = 1;
    let quote = null;
    let index = start + 2;
    for (; index < source.length && depth > 0; index += 1) {
        const character = source[index];
        if (quote) {
            if (character === "\\") index += 1;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === "`") quote = character;
        else if (character === "{") depth += 1;
        else if (character === "}") depth -= 1;
    }
    if (depth !== 0) throw new Error("Unclosed @{...} interpolation in template");
    return { end: index, source: source.slice(start + 2, index - 1) };
}

async function evaluateOutputTemplateAsync(
    definition,
    args,
    context,
    registry,
    systemContext,
    state,
) {
    const body = args[0];
    const resolved = new Map();
    let rewritten = "";
    for (let index = 0; index < body.length;) {
        if (body.startsWith("@@{", index)) {
            rewritten += "@@{";
            index += 3;
            continue;
        }
        if (!body.startsWith("@{", index)) {
            rewritten += body[index];
            index += 1;
            continue;
        }
        const hole = readAsyncTemplateHole(body, index);
        let value = null;
        for (const node of lower(parse(hole.source))) {
            value = await evaluateAsyncInternal(node, context, registry, systemContext, state);
        }
        const name = `rixasynctemplatevalue${resolved.size}`;
        resolved.set(name, value);
        rewritten += `@{${name}}`;
        index = hole.end;
    }

    const evaluateResolved = (node) => {
        if (node?.fn === "RETRIEVE" && resolved.has(node.args?.[0])) {
            return resolved.get(node.args[0]);
        }
        return evaluate(node, context, registry, systemContext);
    };
    return definition.impl([rewritten], context, evaluateResolved, systemContext);
}

function isRawBasePrefixNode(node) {
    return node?.fn === "LITERAL"
        && typeof node.args?.[0] === "string"
        && /^0[A-Za-z]$/.test(node.args[0]);
}

async function evaluateBaseLazyAsync(
    fn,
    definition,
    args,
    context,
    registry,
    systemContext,
    state,
) {
    const resolved = new Map();
    const resolve = async (node) => {
        if (node === undefined || isRawBasePrefixNode(node)) return;
        resolved.set(
            node,
            await evaluateAsyncInternal(node, context, registry, systemContext, state),
        );
    };

    if (fn === "DEFINEBASE") {
        await resolve(args[1]);
    } else if (fn === "TOBASE" || fn === "TOBASE_EXACT") {
        await resolve(args[0]);
        await resolve(args[1]);
        await resolve(args[2]);
    } else if (fn === "CERTIFY_FORMAT") {
        await resolve(args[0]);
        await resolve(args[1]);
    } else if (fn === "FROMBASE") {
        await resolve(args[0]);
        await resolve(args[1]);
    }

    return definition.impl(
        args,
        context,
        (node) => resolved.has(node)
            ? resolved.get(node)
            : evaluate(node, context, registry, systemContext),
        systemContext,
    );
}

async function evaluateSelectedLazyOperandsAsync(
    definition,
    args,
    operands,
    context,
    registry,
    systemContext,
    state,
) {
    const resolved = new Map();
    for (const operand of operands) {
        resolved.set(
            operand,
            await evaluateAsyncInternal(operand, context, registry, systemContext, state),
        );
    }
    return await definition.impl(
        args,
        context,
        (node) => resolved.has(node)
            ? resolved.get(node)
            : evaluate(node, context, registry, systemContext),
        systemContext,
    );
}

function bracketLazyOperands(args, { assignment = false } = {}) {
    const specCount = args[1];
    const operands = [args[0]];
    if (assignment) operands.push(args[2 + specCount]);
    for (const spec of args.slice(2, 2 + specCount)) {
        if (spec?.fn === "FULL_SLICE") continue;
        if (spec?.fn === "SLICE_SPEC") operands.push(spec.args[0], spec.args[1]);
        else operands.push(spec);
    }
    return operands;
}

function startDetachedBlock(args, context, registry, systemContext, parentState) {
    const runtime = context.getEnv(SCRIPT_RUNTIME_ENV_KEY, null);
    const frame = runtime?.frameStack?.[runtime.frameStack.length - 1] ?? null;
    if (frame && !frame.permissions.has("BACKGROUND")) {
        throw new Error("Background tasks are not allowed in this script context");
    }
    if (context.getEnv(REACTIVE_ACTIVE_GRAPH_ENV, null)) {
        throw new Error("Reactive formulas cannot start detached background tasks");
    }
    const { meta, body } = splitAsyncBlockArgs(args);
    const importedBindings = captureDetachedImports(meta.imports, context);
    const taskContext = context.concurrentChild();
    const controller = new AbortController();
    const detachedState = {
        signal: controller.signal,
        parallelCollections: false,
        deadlineMs: parentState?.deadlineMs ?? Infinity,
        deadlineFault: parentState?.deadlineFault ?? null,
    };
    const task = Promise.resolve().then(async () => {
        taskContext.push(importedBindings, { isolated: true, callableBoundary: true });
        try {
            await withFinalizerActivationAsync(taskContext, async () => {
                taskContext.registerFinalizer(() => disposeAsyncResources(
                    taskContext,
                    { kind: "background shutdown" },
                ).then((failures) => {
                    if (failures.length > 0) throw failures[0];
                }));
                for (const statement of body) {
                    await evaluateAsyncInternal(statement, taskContext, registry, systemContext, detachedState);
                }
            }, {
                graceMs: taskContext.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
            });
        } finally {
            taskContext.pop();
        }
    }).catch((error) => {
        if (controller.signal.aborted && error === controller.signal.reason) return;
        const handler = context.getEnv("backgroundTaskError", null);
        if (typeof handler === "function") handler(error);
        const errors = context.getEnv(BACKGROUND_ERRORS_ENV, []);
        errors.push(error);
        context.setEnv(BACKGROUND_ERRORS_ENV, errors);
    });
    registerBackgroundTask(context, task);
    registerAsyncResource(context, task, async (_resource, reason) => {
        if (!controller.signal.aborted) controller.abort(reason);
        const shutdown = Promise.resolve().then(async () => {
            const failures = await disposeAsyncResources(taskContext, reason);
            await task;
            if (failures.length > 0) throw failures[0];
        });
        shutdown.catch(() => {});
        const graceMs = context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs);
        let timer;
        await Promise.race([
            shutdown,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new CleanupGraceFault(graceMs)), graceMs);
            }),
        ]).finally(() => clearTimeout(timer));
    });
    task.finally(() => unregisterAsyncResource(context, task));
    return null;
}

function asyncPreparedTrialFailure(preserveFailure) {
    return preserveFailure ? PREP_TRIAL_NO_MATCH : null;
}

async function evaluatePreparedTrialAsync(args, context, registry, systemContext, state, preserveFailure) {
    const candidateNode = args[0];
    const gates = args.slice(1);
    if (gates.length === 0) throw new Error("Prepared trial requires at least one gate");

    let candidate;
    try {
        candidate = await evaluateAsyncInternal(candidateNode, context, registry, systemContext, state);
    } catch (error) {
        if (gates[0]?.strict === true) throw error;
        return asyncPreparedTrialFailure(preserveFailure);
    }

    context.push();
    try {
        for (let gateIndex = 0; gateIndex < gates.length; gateIndex++) {
            const gate = gates[gateIndex] || {};
            const strict = gate.strict === true;
            try {
                destructureResolvedValue(
                    gate.pattern,
                    candidate,
                    "alias",
                    context,
                    (node) => evaluate(node, context, registry, systemContext),
                );
                const prep = Array.isArray(gate.prep) ? gate.prep : [];
                for (let entryIndex = 0; entryIndex < prep.length; entryIndex++) {
                    const value = await evaluateAsyncInternal(prep[entryIndex], context, registry, systemContext, state);
                    const prepState = decisionState(value);
                    if (prepState === "undecided") {
                        if (gate.undecidedMode === "throw") {
                            const error = new Error(`Prepared trial remained undecided at gate ${gateIndex + 1}, prep entry ${entryIndex + 1}`);
                            error.undecided = value;
                            throw error;
                        }
                        if (gate.undecidedMode === "fallthrough") {
                            return preserveFailure ? PREP_TRIAL_NO_MATCH : UNDECIDED;
                        }
                        return UNDECIDED;
                    }
                    if (prepState === "null") {
                        if (strict) {
                            throw new Error(`Prepared trial failed at gate ${gateIndex + 1}, prep entry ${entryIndex + 1}`);
                        }
                        return asyncPreparedTrialFailure(preserveFailure);
                    }
                }
            } catch (error) {
                if (error?.message?.includes("remained undecided")) throw error;
                if (strict) throw error;
                return asyncPreparedTrialFailure(preserveFailure);
            }
        }
        return candidate;
    } finally {
        context.pop();
    }
}

async function evaluateAsyncCase(args, context, registry, systemContext, state) {
    const { containerName, bodyArgs } = splitScopedBlockArgs(args);
    try {
        for (const branch of bodyArgs) {
            const inner = unwrapDefer(branch);
            if (inner?.fn === "CONDITION") {
                const condition = await evaluateAsyncInternal(inner.args[0], context, registry, systemContext, state);
                if (isTruthyAsync(condition)) {
                    return await evaluateAsyncInternal(inner.args[1], context, registry, systemContext, state);
                }
                continue;
            }
            if (inner?.fn === "PREP_TRIAL") {
                const result = await evaluatePreparedTrialAsync(
                    inner.args,
                    context,
                    registry,
                    systemContext,
                    state,
                    true,
                );
                if (result === PREP_TRIAL_NO_MATCH) continue;
                return result;
            }
            return await evaluateAsyncInternal(inner, context, registry, systemContext, state);
        }
    } catch (error) {
        if (matchesBreakTarget(error, "case", containerName)) return error.value;
        throw error;
    }
    return null;
}

async function evaluateAsyncLoop(args, context, registry, systemContext, state) {
    const {
        imports,
        containerName,
        maxIterations: configuredMax,
        unlimited,
        bodyArgs,
    } = splitScopedBlockArgs(args);
    if (bodyArgs.length > 5) throw new Error(`LOOP expected at most 5 arguments, got ${bodyArgs.length}`);
    const [rawInit, rawCondition, rawBody, rawUpdate, rawAfter] = bodyArgs.map(unwrapDefer);
    const usable = (node) => node?.fn === "HOLE" ? null : node;
    const [initNode, conditionNode, bodyNode, updateNode, afterNode] = [
        rawInit, rawCondition, rawBody, rawUpdate, rawAfter,
    ].map(usable);
    const shareCurrentScope = context.consumeSharedBody("LOOP");
    if (!shareCurrentScope) context.push(undefined, { isolated: true });
    const evaluateShared = (node) => context.withSharedBody(node, () => (
        evaluateAsyncInternal(node, context, registry, systemContext, state)
    ));
    try {
        applyAsyncImports(imports, context);
        try {
            if (initNode) await evaluateShared(initNode);
            let result = null;
            let iterations = 0;
            const maxIterations = unlimited
                ? null
                : configuredMax ?? context.getEnv("defaultLoopMax", runtimeDefaults.defaultLoopMax);
            while (true) {
                if (state?.signal?.aborted) throw state.signal.reason;
                if (conditionNode) {
                    let condition;
                    try {
                        condition = await evaluateShared(conditionNode);
                    } catch (error) {
                        throw addEvaluationContext(error, `while evaluating loop condition before iteration ${iterations + 1}`);
                    }
                    if (!isTruthyAsync(condition)) break;
                }
                if (maxIterations !== null && iterations >= maxIterations) {
                    throw new Error(`Loop exceeded max iteration count: ${maxIterations}`);
                }
                if (bodyNode) {
                    try {
                        result = await evaluateShared(bodyNode);
                    } catch (error) {
                        throw addEvaluationContext(error, `while evaluating loop body, iteration ${iterations + 1}`);
                    }
                }
                if (updateNode) {
                    try {
                        await evaluateShared(updateNode);
                    } catch (error) {
                        throw addEvaluationContext(error, `while evaluating loop update after iteration ${iterations + 1}`);
                    }
                }
                iterations++;
            }
            return afterNode ? await evaluateShared(afterNode) : result;
        } catch (error) {
            if (matchesBreakTarget(error, "loop", containerName)) return error.value;
            throw error;
        }
    } finally {
        if (!shareCurrentScope) context.pop();
    }
}

async function evaluateAsyncInternal(irNode, context, registry, systemContext, state = null) {
    if (context?.getEnv?.("__registry__", null) !== registry) {
        context?.setEnv?.("__registry__", registry);
    }
    if (irNode === null || irNode === undefined) return null;
    if (typeof irNode !== "object" || Array.isArray(irNode) || !irNode.fn) return irNode;
    const { fn, args } = irNode;
    if (fn === "DEFER") return irNode;

    try {
        if (state?.signal?.aborted) throw state.signal.reason;
        if (fn === "SCRIPT_IMPORT") {
            return await evaluateScriptImportAsync(args[0] || {}, context, registry, systemContext, state);
        }
        if (fn === "CASE") return await evaluateAsyncCase(args, context, registry, systemContext, state);
        if (fn === "LOOP") return await evaluateAsyncLoop(args, context, registry, systemContext, state);
        if (fn === "PREP_TRIAL" || fn === "PREP_TRIAL_CASE") {
            return await evaluatePreparedTrialAsync(
                args,
                context,
                registry,
                systemContext,
                state,
                fn === "PREP_TRIAL_CASE",
            );
        }
        if (fn === "HOLE_COALESCE") {
            const left = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            return isHole(left)
                ? evaluateAsyncInternal(args[1], context, registry, systemContext, state)
                : left;
        }
        if (fn === "POSTFIX_CHECK_VALUE") {
            return context.getEnv(POSTFIX_CHECK_VALUE_ENV, null);
        }
        if (fn === "POSTFIX_PREDICATE_CHECK") {
            const value = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            const passed = await withPostfixCheckValueAsync(context, value, () =>
                evaluateAsyncInternal(args[1], context, registry, systemContext, state));
            if (passed === null || passed === undefined) {
                throw new Error(`##@ check failed for ${formatCheckValue(value)}`);
            }
            return value;
        }
        if (fn === "POSTFIX_TYPE_CHECK") {
            const value = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            checkPostfixType(
                value,
                args[1],
                context,
                registry,
                (node) => evaluate(node, context, registry, systemContext),
            );
            return value;
        }
        if (fn === "POSTFIX_FINALIZER") {
            const value = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            const cleanup = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
            context.registerFinalizer((cleanupSignal) => invokeCallableAsync(
                cleanup,
                [value],
                context,
                registry,
                systemContext,
                state ? {
                    ...state,
                    signal: cleanupSignal,
                    scheduler: null,
                    group: null,
                    admission: null,
                    parallelCollections: false,
                } : null,
            ));
            return value;
        }
        if (fn === "POSTFIX_FAULT_RECOVERY") {
            try {
                return await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            } catch (error) {
                if (!isOperationalFault(error)) throw error;
                const handler = await evaluateAsyncInternal(args[1], context, registry, systemContext, state);
                return invokeCallableAsync(
                    handler,
                    [faultToRixValue(error)],
                    context,
                    registry,
                    systemContext,
                    state,
                );
            }
        }
        if (fn === "CALL_METHOD") {
            const target = await evaluateAsyncInternal(args[0], context, registry, systemContext, state);
            const methodName = args[1];
            const callArgs = [];
            for (const arg of args.slice(2)) {
                if (arg?.fn === "SPREAD") {
                    const spread = await evaluateAsyncInternal(arg.args[0], context, registry, systemContext, state);
                    if (!Array.isArray(spread?.values)) throw new Error("Method spread requires a finite collection");
                    callArgs.push(...spread.values);
                } else {
                    callArgs.push(await evaluateAsyncInternal(arg, context, registry, systemContext, state));
                }
            }
            return invokeMethodAsync(target, methodName, callArgs, context, registry, systemContext, state);
        }
        if (fn === "ASYNC_SCOPE") return await evaluateAsyncScope(args, context, registry, systemContext, state);
        if (fn === "DETACH") return startDetachedBlock(args, context, registry, systemContext, state);
        if (ASYNC_COLLECTION_FNS.has(fn)) {
            const collectionState = state || {
                scheduler: null,
                group: null,
                signal: null,
                limit: 1,
                name: null,
                parallelCollections: false,
            };
            return await evaluateAsyncCollection(irNode, context, registry, systemContext, collectionState);
        }
        if (ASYNC_PIPE_FNS.has(fn)) {
            return state
                ? await evaluateAsyncPipe(irNode, context, registry, systemContext, state)
                : await evaluateSequentialAsyncPipe(irNode, context, registry, systemContext, null);
        }
        if (fn === "PREDUCE" && registry.get(fn)?.impl === functionFunctions.PREDUCE.impl) {
            return await evaluateAsyncReduce(args, context, registry, systemContext, state);
        }
        if (fn === "PSORT" && registry.get(fn)?.impl === functionFunctions.PSORT.impl) {
            return await evaluateAsyncSort(args, context, registry, systemContext, state);
        }
        if (
            ASYNC_RESOLVED_BARRIER_FNS.has(fn)
            && registry.get(fn)?.impl === functionFunctions[fn]?.impl
        ) {
            return await evaluateAsyncResolvedBarrier(irNode, context, registry, systemContext, state);
        }
        if (fn === "PSPLIT" && registry.get(fn)?.impl === functionFunctions.PSPLIT.impl) {
            return await evaluateAsyncSplit(args, context, registry, systemContext, state);
        }
        if (fn === "PCHUNK" && registry.get(fn)?.impl === functionFunctions.PCHUNK.impl) {
            return await evaluateAsyncChunk(args, context, registry, systemContext, state);
        }

        const evalAsync = (node) => evaluateAsyncInternal(node, context, registry, systemContext, state);

        if (fn === "SYS_CALL") {
            const name = args[0];
            const capability = systemContext?.get(name);
            if (!capability) throw new Error(`Unknown system capability: ${name}`);
            if (capability.kind !== "function") throw new Error(`System ${capability.kind} .${capability.displayName} is not callable`);
            const callArgNodes = args.slice(1);
            if (callArgNodes.some(isPlaceholderNodeAsync)) {
                const template = await evaluateCallArgsAsync(
                    callArgNodes,
                    context,
                    registry,
                    systemContext,
                    state,
                );
                return { type: "partial", fn: { type: "sysref", name }, template };
            }
            if (capability.lazy && capability.impl === diagnosticFunctions.DEBUG.impl) {
                return await evaluateDebugCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (capability.lazy && capability.impl === diagnosticFunctions.TRACE.impl) {
                return await evaluateTraceCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (capability.lazy && capability.impl === coreFunctions.EVAL.impl) {
                return await evaluateEvalCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (
                capability.lazy
                && [coreFunctions.TYPE_EXPORT.impl, coreFunctions.TYPE_IMPORT.impl]
                    .includes(capability.impl)
            ) {
                return await evaluateSelectedLazyOperandsAsync(
                    capability,
                    callArgNodes,
                    [callArgNodes[0]],
                    context,
                    registry,
                    systemContext,
                    state,
                );
            }
            if (capability.lazy && capability.impl === defineCapability) {
                return await evaluateDefineCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (
                capability.lazy
                && (
                    capability.impl === diagnosticFunctions.DUMP.impl
                    || capability.impl === diagnosticFunctions.INFOVALUE.impl
                )
            ) {
                return await evaluateConcreteLazyCapabilityAsync(
                    capability, callArgNodes, context, registry, systemContext, state,
                );
            }
            if (capability.lazy && capability.impl === diagnosticFunctions.STOP.impl) {
                return await evaluateStopCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (capability.lazy && capability.impl === diagnosticFunctions.TEST.impl) {
                return await runTestAsync(callArgNodes, context, evalAsync);
            }
            if (
                capability.lazy
                && (
                    capability.impl === diagnosticFunctions.TESTERROR.impl
                    || capability.impl === diagnosticFunctions.TESTSTOP.impl
                )
            ) {
                return await runAbortTestAsync(
                    capability.impl === diagnosticFunctions.TESTERROR.impl ? "error" : "stop",
                    callArgNodes,
                    context,
                    evalAsync,
                );
            }
            if (capability.lazy && capability.impl === stdlibFunctions.MULTI.impl) {
                return await evaluateMultiCapabilityAsync(
                    callArgNodes, context, registry, systemContext, state,
                );
            }
            if (capability.lazy) return await capability.impl(callArgNodes, context, evalAsync, {
                promiseAware: true,
                signal: state?.signal ?? null,
            });
            const values = [];
            for (const arg of callArgNodes) values.push(await evalAsync(arg));
            if (state?.signal?.aborted) throw state.signal.reason;
            // ReactiveGraph epochs are deliberately synchronous. The async
            // entry point still awaits capability arguments, but constructors
            // that retain a formula evaluator must not capture `evalAsync`:
            // it would return a promise and unwind the graph's lexical scope
            // before the formula body executes.
            const capabilityEvaluate = SYNC_REACTIVE_FORMULA_CAPABILITY_IMPLS.has(capability.impl)
                ? (node) => evaluate(node, context, registry, systemContext)
                : evalAsync;
            return await capability.impl(values, context, capabilityEvaluate, {
                promiseAware: true,
                signal: state?.signal ?? null,
            });
        }
        if (["SYS_GET", "SYS_OBJ"].includes(fn)) return evaluate(irNode, context, registry, systemContext);

        if (fn === "SEQ") {
            let result = null;
            for (const arg of args) result = await evalAsync(arg);
            return result;
        }
        if (fn === "BLOCK" || fn === "SYSTEM") {
            const { meta, body } = splitAsyncBlockArgs(args);
            const shareCurrentScope = context.consumeSharedBody(fn);
            if (!shareCurrentScope) context.push(undefined, { isolated: true });
            try {
                return await withFinalizerActivationAsync(context, async () => {
                    applyAsyncImports(meta.imports, context);
                    let result = null;
                    try {
                        for (const arg of body) result = await evalAsync(arg);
                        return result;
                    } catch (error) {
                        if (fn === "BLOCK" && matchesBreakTarget(error, "block", meta.name ?? null)) {
                            return error.value;
                        }
                        throw error;
                    }
                }, {
                    graceMs: context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
                });
            } finally {
                if (!shareCurrentScope) context.pop();
            }
        }
        if (fn === "TERNARY") {
            const condition = await evalAsync(args[0]);
            const state = decisionState(condition);
            const branch = state === "truth" ? args[1] : state === "null" ? args[2] : args[3];
            const marker = state === "truth" ? "?:" : state === "null" ? "?_" : "??";
            try {
                return await evalAsync(branch?.fn === "DEFER" ? branch.args[0] : branch);
            } catch (error) {
                throw addEvaluationContext(error, `while evaluating '${marker}' branch`);
            }
        }
        if (fn === "AND" || fn === "OR") {
            let last = fn === "AND" ? new Integer(1n) : null;
            let uncertain = false;
            for (const arg of args) {
                last = await evalAsync(arg);
                const state = decisionState(last);
                if (fn === "AND" && state === "null") return null;
                if (fn === "OR" && state === "truth") return last;
                if (state === "undecided") uncertain = true;
            }
            return uncertain ? UNDECIDED : last;
        }
        if (fn === "BREAK") {
            const definition = registry.get(fn);
            const hasMeta = args[0] && !args[0].fn;
            context.push(undefined, { isolated: true, readThrough: true });
            let value;
            try {
                value = await evalAsync(hasMeta ? args[1] : args[0]);
            } finally {
                context.pop();
            }
            return definition.impl(hasMeta ? [args[0], value] : [value], context, (node) => node);
        }

        if (fn === "DESTRUCTURE_ASSIGN") {
            const value = await evalAsync(args[2]);
            return coreFunctions.DESTRUCTURE_ASSIGN.impl(
                [args[0], args[1], value],
                context,
                (node) => node?.fn ? evaluate(node, context, registry, systemContext) : node,
            );
        }

        if (["ASSIGN", "ASSIGN_COPY", "ASSIGN_UPDATE", "ASSIGN_DEEP_COPY", "ASSIGN_DEEP_UPDATE", "OUTER_ASSIGN", "OUTER_UPDATE", "GLOBAL"].includes(fn)) {
            const definition = registry.get(fn);
            if (fn === "ASSIGN" && ["RETRIEVE", "OUTER_RETRIEVE"].includes(args[1]?.fn)) {
                return definition.impl(args, context, (node) => evaluate(node, context, registry, systemContext));
            }
            const value = await evalAsync(args[1]);
            return definition.impl([args[0], value, ...args.slice(2)], context, (node) => node);
        }

        if (fn === "LAMBDA" || fn === "FUNCDEF") {
            return markLexicalAsyncCallable(evaluate(irNode, context, registry, systemContext), state);
        }
        if (fn === "MULTIFUNCDEF") {
            const multifunction = evaluate(irNode, context, registry, systemContext);
            const enabled = !!state?.scheduler && state.parallelCollections !== false;
            const variant = multifunction.values.at(args[1] === "prepend" ? 0 : -1);
            if (variant) variant.__parallelCollections = enabled;
            return multifunction;
        }
        if (fn === "SYSREF") {
            return evaluate(irNode, context, registry, systemContext);
        }
        if (fn === "SELF" || fn === "PARENT_SELF") {
            return registry.get(fn).impl(args, context, (node) => node);
        }
        if (fn === "TAIL_SELF") {
            const currentCallable = context.getCurrentCallable();
            if (currentCallable === undefined) {
                throw new Error("Self reference '$' is only valid within a function body");
            }
            if (args.some(isPlaceholderNodeAsync)) {
                const template = await evaluateCallArgsAsync(args, context, registry, systemContext, state);
                return { type: "partial", fn: currentCallable, template };
            }
            return createTailSelfCall(
                await evaluateCallArgsAsync(args, context, registry, systemContext, state),
            );
        }
        if (fn === "CALL" || fn === "CALL_EXPR") {
            const callable = fn === "CALL"
                ? context.getCallable(args[0])
                : await evalAsync(args[0]);
            const argNodes = args.slice(1);
            if (argNodes.some(isPlaceholderNodeAsync)) {
                const template = await evaluateCallArgsAsync(
                    argNodes,
                    context,
                    registry,
                    systemContext,
                    state,
                );
                const partialCallable = callable || (fn === "CALL" ? { type: "sysref", name: args[0] } : null);
                if (!partialCallable) throw new Error("Expression is not callable");
                return { type: "partial", fn: partialCallable, template };
            }
            if (!callable) throw new Error(`Undefined callable: ${args[0]}`);
            const callArgs = await evaluateCallArgsAsync(
                argNodes,
                context,
                registry,
                systemContext,
                state,
            );
            return invokeCallableAsync(callable, callArgs, context, registry, systemContext, state);
        }
        if (fn === "PIPE") {
            const value = await evalAsync(args[0]);
            if (isPipeSkip(value)) return PIPE_SKIP;
            const callable = await evalAsync(args[1]);
            return invokeCallableAsync(
                callable,
                value?.type === "tuple" ? value.values : [value],
                context,
                registry,
                systemContext,
                state,
            );
        }
        if (fn === "PIPE_EXPLICIT") {
            const value = await evalAsync(args[0]);
            const tupleValues = value?.type === "tuple" ? value.values : [value];
            const replace = (node) => {
                if (!node || typeof node !== "object") return node;
                if (node.fn === "PLACEHOLDER") return node.args[0] === 0 ? value : tupleValues[node.args[0] - 1];
                return node.fn ? { ...node, args: node.args.map(replace) } : node;
            };
            return evalAsync(replace(args[1]));
        }

        const definition = registry.get(fn);
        if (!definition) return await evaluate(irNode, context, registry, systemContext);
        if (definition.lazy) {
            if (definition.impl === propertyFunctions[fn]?.impl) {
                let operands = null;
                if (fn === "META_SET") operands = [args[0], args[2]];
                else if (fn === "META_MERGE") operands = [args[0], args[1]];
                else if (fn === "INDEX_SET") operands = [args[0], args[1], args[2]];
                else if (fn === "BRACKET_GET") operands = bracketLazyOperands(args);
                else if (fn === "BRACKET_SET") operands = bracketLazyOperands(args, { assignment: true });
                if (operands) {
                    return await evaluateSelectedLazyOperandsAsync(
                        definition,
                        args,
                        operands,
                        context,
                        registry,
                        systemContext,
                        state,
                    );
                }
            }
            if (
                [
                    "VALUE_OUTFIT",
                    "SEMANTIC_HAS",
                    "SEMANTIC_CONVERT_SOFT",
                    "SEMANTIC_CONVERT_STRICT",
                    "TYPE_EXPORT",
                    "TYPE_IMPORT",
                ].includes(fn)
                && definition.impl === coreFunctions[fn]?.impl
            ) {
                const operand = fn === "VALUE_OUTFIT" ? args[1] : args[0];
                return await evaluateSelectedLazyOperandsAsync(
                    definition,
                    args,
                    [operand],
                    context,
                    registry,
                    systemContext,
                    state,
                );
            }
            if (fn === "MULTIFUNCTION" && definition.impl === functionFunctions.MULTIFUNCTION.impl) {
                const result = await evaluateSelectedLazyOperandsAsync(
                    definition,
                    args,
                    args,
                    context,
                    registry,
                    systemContext,
                    state,
                );
                return markLexicalAsyncCallable(result, state);
            }
            if (
                (fn === "TEMPLATE_TEXT" || fn === "DOCUMENT_TEMPLATE")
                && definition.impl === outputFunctions[fn]?.impl
            ) {
                return await evaluateOutputTemplateAsync(
                    definition,
                    args,
                    context,
                    registry,
                    systemContext,
                    state,
                );
            }
            if (
                ["DEFINEBASE", "TOBASE", "TOBASE_EXACT", "CERTIFY_FORMAT", "FROMBASE"].includes(fn)
                && definition.impl === coreFunctions[fn]?.impl
            ) {
                return await evaluateBaseLazyAsync(
                    fn,
                    definition,
                    args,
                    context,
                    registry,
                    systemContext,
                    state,
                );
            }
            // Lazy operations not requiring promise-aware control flow retain
            // their established evaluator. Async-specific forms are handled above.
            const result = await definition.impl(
                args,
                context,
                (node) => evaluate(node, context, registry, systemContext),
                systemContext,
            );
            return fn === "MULTIFUNCTION" ? markLexicalAsyncCallable(result, state) : result;
        }

        const evaluatedArgs = [];
        for (const arg of args) evaluatedArgs.push(await evalAsync(arg));
        if (!definition.holeAware && evaluatedArgs.some(isHole)) {
            throw new Error(`Cannot use undefined/hole value in computation (in ${fn})`);
        }
        return await definition.impl(evaluatedArgs, context, (node) => evaluate(node, context, registry, systemContext), systemContext);
    } catch (error) {
        throw annotateEvaluationError(error, irNode, context);
    }
}

/** Promise-aware IR entry point. RiX values never expose the returned promises. */
export async function evaluateAsync(irNode, context, registry, systemContext) {
    return evaluateAsyncInternal(irNode, context, registry, systemContext, null);
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
 * @param {Map|Array} [options.operatorDefinitions] - Operator declarations supplied by the host
 * @param {Object} [options.operatorOwner] - Plugin identity used by shorthand method targets
 * @param {Set} [options.reactiveReads] - Receives reactive sources read by the final expression
 * @returns {*} The result of the last expression
 */
export function parseAndEvaluate(code, options = {}) {
    const context = options.context || new Context();
    const registry = options.registry || createDefaultRegistry();
    const systemContext = options.systemContext || createDefaultSystemContext();
    context.setEnv("__system_context__", systemContext);
    if (options.numberConfig?.input !== undefined) {
        coreFunctions.NUM_INPUT.impl([{ type: "string", value: String(options.numberConfig.input) }], context);
    }
    if (options.numberConfig?.display !== undefined) {
        coreFunctions.NUM_DISPLAY.impl([{ type: "string", value: String(options.numberConfig.display) }], context);
    }
    const systemLookup = createSystemLookup(systemContext, options.systemLookup || defaultSystemLookup);
    const runtime = getScriptRuntime(context, { systemLookup });
    runtime.operatorDefinitions = mergeOperatorDefinitions(
        context.getEnv(CUSTOM_OPERATOR_ENV_KEY, new Map()),
        options.operatorDefinitions,
    );
    context.setEnv("__registry__", registry);
    context.setEnv("__plugin_load_rix__", ({ source, sourcePath, metadata, options: pluginOptions, operatorDefinitions, context: pluginContext = context, registry: pluginRegistry = registry, systemContext: pluginSystemContext = systemContext }) => {
        const previousSource = pluginContext.getEnv(SOURCE_ENV_KEY, undefined);
        const previousFile = pluginContext.getEnv(CURRENT_FILE_ENV_KEY, undefined);
        const previousOwner = pluginContext.getEnv("__plugin_owner__", undefined);
        try {
            pluginContext.setEnv("__plugin_owner__", metadata?.id ? {
                pluginId: metadata.id,
                mount: pluginOptions?.as || metadata.mount || null,
            } : null);
            return parseAndEvaluate(source, {
                context: pluginContext,
                registry: pluginRegistry,
                systemContext: pluginSystemContext,
                file: sourcePath,
                operatorDefinitions,
                operatorOwner: metadata?.id ? {
                    pluginId: metadata.id,
                    mount: pluginOptions?.as || metadata.mount || null,
                } : null,
            });
        } finally {
            pluginContext.setEnv(SOURCE_ENV_KEY, previousSource);
            pluginContext.setEnv(CURRENT_FILE_ENV_KEY, previousFile);
            pluginContext.setEnv("__plugin_owner__", previousOwner);
        }
    });
    if (typeof options.rng === "function") context.setEnv("randomFunction", options.rng);
    context.setEnv(SOURCE_ENV_KEY, code);
    context.setEnv(CURRENT_FILE_ENV_KEY, options.file || "<repl>");

    const ast = parse(code, systemLookup, {
        operatorDefinitions: runtime.operatorDefinitions,
        operatorOwner: options.operatorOwner || null,
        file: options.file || "<repl>",
    });
    const irNodes = lower(ast);
    attachSourceInfo(irNodes, code, options.file || "<repl>");

    return withFinalizerActivationSync(context, () => {
        let result = null;
        for (const irNode of irNodes) {
            if (!(options.reactiveReads instanceof Set)) {
                result = evaluate(irNode, context, registry, systemContext);
                continue;
            }
            const reads = new Set();
            const previousObserver = {
                has: context.env?.has(REACTIVE_OUTPUT_READ_ENV) === true,
                value: context.getEnv(REACTIVE_OUTPUT_READ_ENV, undefined),
            };
            context.setEnv(REACTIVE_OUTPUT_READ_ENV, (source) => reads.add(source));
            try {
                result = evaluate(irNode, context, registry, systemContext);
            } finally {
                if (previousObserver.has) context.setEnv(REACTIVE_OUTPUT_READ_ENV, previousObserver.value);
                else context.env?.delete(REACTIVE_OUTPUT_READ_ENV);
            }
            options.reactiveReads.clear();
            for (const source of reads) options.reactiveReads.add(source);
        }
        return materializePipeSkip(result);
    });
}

/**
 * Parse, lower, and evaluate RiX source with implicit awaiting. Top-level
 * statements remain sequential; only explicit async constructs fan out.
 */
export async function parseAndEvaluateAsync(code, options = {}) {
    const context = options.context || new Context();
    const registry = options.registry || createDefaultRegistry();
    const systemContext = options.systemContext || createDefaultSystemContext();
    context.setEnv("__system_context__", systemContext);
    if (options.numberConfig?.input !== undefined) {
        coreFunctions.NUM_INPUT.impl([{ type: "string", value: String(options.numberConfig.input) }], context);
    }
    if (options.numberConfig?.display !== undefined) {
        coreFunctions.NUM_DISPLAY.impl([{ type: "string", value: String(options.numberConfig.display) }], context);
    }
    const systemLookup = createSystemLookup(systemContext, options.systemLookup || defaultSystemLookup);
    const runtime = getScriptRuntime(context, { systemLookup });
    runtime.operatorDefinitions = mergeOperatorDefinitions(
        context.getEnv(CUSTOM_OPERATOR_ENV_KEY, new Map()),
        options.operatorDefinitions,
    );
    context.setEnv("__registry__", registry);
    context.setEnv("__plugin_load_rix__", async ({ source, sourcePath, metadata, options: pluginOptions, operatorDefinitions, context: pluginContext = context, registry: pluginRegistry = registry, systemContext: pluginSystemContext = systemContext }) => {
        const previousOwner = pluginContext.getEnv("__plugin_owner__", undefined);
        try {
            pluginContext.setEnv("__plugin_owner__", metadata?.id ? {
                pluginId: metadata.id,
                mount: pluginOptions?.as || metadata.mount || null,
            } : null);
            return await parseAndEvaluateAsync(source, {
                context: pluginContext,
                registry: pluginRegistry,
                systemContext: pluginSystemContext,
                file: sourcePath,
                operatorDefinitions,
                operatorOwner: metadata?.id ? {
                    pluginId: metadata.id,
                    mount: pluginOptions?.as || metadata.mount || null,
                } : null,
            });
        } finally {
            pluginContext.setEnv("__plugin_owner__", previousOwner);
        }
    });
    if (typeof options.rng === "function") context.setEnv("randomFunction", options.rng);
    context.setEnv(SOURCE_ENV_KEY, code);
    context.setEnv(CURRENT_FILE_ENV_KEY, options.file || "<repl>");

    const ast = parse(code, systemLookup, {
        operatorDefinitions: runtime.operatorDefinitions,
        operatorOwner: options.operatorOwner || null,
        file: options.file || "<repl>",
    });
    const irNodes = lower(ast);
    attachSourceInfo(irNodes, code, options.file || "<repl>");

    return withFinalizerActivationAsync(context, async () => {
        let result = null;
        for (const irNode of irNodes) {
            if (!(options.reactiveReads instanceof Set)) {
                result = await evaluateAsync(irNode, context, registry, systemContext);
                continue;
            }
            const reads = new Set();
            const previousObserver = {
                has: context.env?.has(REACTIVE_OUTPUT_READ_ENV) === true,
                value: context.getEnv(REACTIVE_OUTPUT_READ_ENV, undefined),
            };
            context.setEnv(REACTIVE_OUTPUT_READ_ENV, (source) => reads.add(source));
            try {
                result = await evaluateAsync(irNode, context, registry, systemContext);
            } finally {
                if (previousObserver.has) context.setEnv(REACTIVE_OUTPUT_READ_ENV, previousObserver.value);
                else context.env?.delete(REACTIVE_OUTPUT_READ_ENV);
            }
            options.reactiveReads.clear();
            for (const source of reads) options.reactiveReads.add(source);
        }
        return materializePipeSkip(result);
    }, {
        graceMs: context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
    });
}

export { drainBackgroundTasks };

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
