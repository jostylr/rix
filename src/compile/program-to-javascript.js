/** General RiX-to-JavaScript compiler, with interpreter support for dynamic nodes. */
import { createHash } from "node:crypto";
import { parse } from "../parser/parser.js";
import { lower } from "../eval/lower.js";
import { createDefaultRegistry } from "../eval/evaluator.js";
import { compileFastRiXProgram } from "./to-javascript.js";

function literal(value, seen = new WeakSet()) {
    if (value === undefined) return "undefined";
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "number") {
        if (Number.isNaN(value)) return "NaN";
        if (value === Infinity) return "Infinity";
        if (value === -Infinity) return "-Infinity";
        return Object.is(value, -0) ? "-0" : String(value);
    }
    if (typeof value !== "object") throw new Error(`Cannot compile IR value of type ${typeof value}`);
    if (seen.has(value)) throw new Error("Cannot compile cyclic IR data");
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
        result = `[${value.map((item) => literal(item, seen)).join(", ")}]`;
    } else if (value instanceof RegExp) {
        result = `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
    } else if (value instanceof Map) {
        result = `new Map([${[...value].map(([key, item]) => `[${literal(key, seen)}, ${literal(item, seen)}]`).join(", ")}])`;
    } else if (value instanceof Set) {
        result = `new Set([${[...value].map((item) => literal(item, seen)).join(", ")}])`;
    } else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        result = `{${Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]: ${literal(item, seen)}`).join(", ")}}`;
    } else {
        throw new Error(`Cannot compile IR data with prototype ${value.constructor?.name || "unknown"}`);
    }
    seen.delete(value);
    return result;
}

function collectNodes(value, path, found, seen = new WeakSet()) {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectNodes(item, `${path}[${index}]`, found, seen));
        return;
    }
    if (typeof value.fn === "string" && Array.isArray(value.args)) found.push({ node: value, path });
    for (const [key, item] of Object.entries(value)) collectNodes(item, `${path}[${JSON.stringify(key)}]`, found, seen);
}

const special = new Set([
    "DEFER", "SPREAD", "SCRIPT_IMPORT", "POSTFIX_CHECK_VALUE",
    "POSTFIX_PREDICATE_CHECK", "POSTFIX_TYPE_CHECK", "POSTFIX_FINALIZER",
    "POSTFIX_FAULT_RECOVERY", "SYS_OBJ", "SYS_GET", "SYS_CALL", "SYS_SET",
]);
let standardRegistry;

function emitFunction({ node, path }, index) {
    const args = node.args || [];
    const values = args.map((arg, argIndex) => {
        const reference = `${path}.args[${argIndex}]`;
        return arg && typeof arg === "object" && !Array.isArray(arg) && typeof arg.fn === "string"
            ? `evaluate(${reference}, context, registry, systemContext)`
            : reference;
    });
    return `function compiled${index}(context, registry, systemContext) {\n`
        + `    const capability = registry.get(${JSON.stringify(node.fn)});\n`
        + `    if (!capability) throw new Error(${JSON.stringify(`Unknown system function: ${node.fn}`)});\n`
        + `    const evalNode = (child) => evaluate(child, context, registry, systemContext);\n`
        + `    if (capability.lazy) return capability.impl(${path}.args, context, evalNode, systemContext);\n`
        + `    const values = [${values.join(", ")}];\n`
        + `    if (!capability.holeAware && values.some(isHole)) throw new Error(${JSON.stringify(`Cannot use undefined/hole value in computation (in ${node.fn})`)});\n`
        + `    return capability.impl(values, context, evalNode, systemContext);\n`
        + `}\n`;
}

export function compileProgramToJavaScript(source, options = {}) {
    const nodes = lower(parse(source, options.systemLookup, {
        operatorDefinitions: options.operatorDefinitions,
        file: options.sourceName || "<source>",
    }));
    // A compile-time registry identifies operations with the standard registry
    // calling convention. Runtime lookup remains dynamic, so plugins may still
    // replace an operation's implementation or lazy/eager policy.
    const registry = standardRegistry ||= createDefaultRegistry();
    const found = [];
    collectNodes(nodes, "irNodes", found);
    const compiled = found.filter(({ node }) => registry.get(node.fn) && !special.has(node.fn)
        && !node.args?.some((arg) => arg?.fn === "SPREAD"));
    const sourceHash = createHash("sha256").update(source).digest("hex");
    const importPath = options.runtimeImport || "@ratmath/rix/compiler-runtime";
    let fastCode = null;
    if (!options.systemLookup && !options.operatorDefinitions) {
        try {
            fastCode = compileFastRiXProgram(nodes);
        } catch (error) {
            if (!String(error?.message).startsWith("RiX-to-JS experiment does not support ")) throw error;
        }
    }
    const definitions = compiled.map(emitFunction).join("\n");
    const registrations = compiled.map(({ path }, index) => `dispatch.set(${path}, compiled${index});`).join("\n");
    return `// Generated RiX module; execute only when this JavaScript artifact is trusted.\n`
        + `import { resolve } from "node:path";\n`
        + `import { fileURLToPath, pathToFileURL } from "node:url";\n`
        + `import { evaluate, formatValue, isHole, runCompiled, runCompiledAsync } from ${JSON.stringify(importPath)};\n`
        + (fastCode ? `import { Integer } from "@ratmath/core";\n`
            + `import { decisionState, UNDECIDED, NO_MATCH, FastPathBailout, isFastResultCompatible, rixModulo, rixEqual, rixGenerator, rixMap, rixFunction, rixMultifunction, rixInvoke } from "@ratmath/rix/compiler-fast-runtime";\n` : "")
        + `export const sourceHash = ${JSON.stringify(sourceHash)};\n`
        + `export const compiledOperationCount = ${compiled.length};\n`
        + `export const fastPathAvailable = ${Boolean(fastCode)};\n`
        + `const source = ${JSON.stringify(source)};\n`
        + `const sourceFile = fileURLToPath(new URL(${JSON.stringify(options.sourceName || "source.rix")}, import.meta.url));\n`
        + `const irNodes = ${literal(nodes)};\n`
        + `const dispatch = new WeakMap();\n${definitions}${registrations}\n`
        + (fastCode || "")
        + `export function run(options = {}) { ${fastCode ? "if (options && typeof options === 'object' && Object.keys(options).length === 0) { try { const value = fastRun(); if (isFastResultCompatible(value)) return value; } catch (error) { if (!(error instanceof FastPathBailout)) throw error; } } " : ""}return runCompiled(source, irNodes, dispatch, { file: sourceFile, ...options }); }\n`
        + `export function runAsync(options = {}) { return runCompiledAsync(source, irNodes, { file: sourceFile, ...options }); }\n`
        + `if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {\n`
        + `    const result = process.argv.includes("--async") ? await runAsync() : run();\n`
        + `    if (result !== null && result !== undefined) console.log(formatValue(result));\n`
        + `}\n`;
}
