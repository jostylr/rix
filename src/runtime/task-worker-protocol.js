import { Integer, Rational, Fraction, RationalInterval, FractionInterval, RationalIntervalSet } from "@ratmath/core";
import { attachBuiltinProto } from "./methods.js";
import { encodeOutputJSON, decodeOutputJSON } from "./output-json.js";
import { TASK_IR, TASK_CAPABILITIES, trustedTaskOperation, trustedTaskCapability } from "./task-worker-policy.js";
import { createRuntimeRng } from "./random.js";
export const TASK_WORKER_PROTOCOL = "rix.task-worker/1";
export const TASK_LIMITS = Object.freeze({ maxBytes: 1_000_000, maxNodes: 10_000, maxEdges: 50_000, maxDepth: 64, maxDigits: 4096, unknownTags: "strict-error" });
const fault = (message) => Object.assign(new Error(message), { code: "TASK_WORKER_PROTOCOL" });
export function inertTaskMessage(value) {
    let count = 0; const active = new Set();
    function visit(item, depth) {
        if (++count > 50_000 || depth > 64) throw fault("Task message structure limit exceeded");
        if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
        if (!item || typeof item !== "object" || active.has(item) || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item))) throw fault("Task message must be inert JSON data");
        active.add(item);
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
            if (descriptor.get || descriptor.set || ["__proto__", "constructor", "prototype"].includes(key)) throw fault("Task message contains an accessor or unsafe key");
            visit(descriptor.value, depth + 1);
        }
        active.delete(item);
    }
    visit(value, 0);
    const text = JSON.stringify(value);
    if (new TextEncoder().encode(text).length > TASK_LIMITS.maxBytes) throw fault("Task message byte limit exceeded");
    return JSON.parse(text);
}
export function inspectTaskIR(ir, checkOperation = () => true, checkCapability = () => true) {
    const captures = new Set(), grants = new Set();
    function visit(node) {
        if (node === null || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (typeof node.fn !== "string" || !TASK_IR.has(node.fn) || !checkOperation(node.fn)) throw fault(`Unsupported worker operation: ${node.fn}`);
        if (!Array.isArray(node.args)) throw fault("Worker IR requires argument arrays");
        if (node.fn === "RETRIEVE") { if (typeof node.args[0] !== "string") throw fault("Invalid capture name"); captures.add(node.args[0]); }
        if (node.fn === "SYS_CALL") {
            const name = node.args[0];
            if (!TASK_CAPABILITIES.has(name) || !checkCapability(name)) throw fault(`Unsupported worker capability: ${name}`);
            grants.add(name);
        }
        node.args.forEach(visit);
    }
    visit(ir); return { captures, grants };
}
function randomSnapshot(context) {
    const rng = context.getScopedEnv("rng", null);
    if (context.getEnv("randomFunction", null) || context.getEnv("randomSeedSource", null)) throw fault("Host random sources require owner execution");
    if (!rng) return null;
    if (rng.implementation !== "default" || rng.algorithm !== "mulberry32" || ![rng.seed, rng.state, rng.forkCounter].every(Number.isSafeInteger)) throw fault("Custom RNG requires owner execution");
    return { algorithm: "mulberry32", seed: rng.seed >>> 0, state: rng.state >>> 0, forkCounter: rng.forkCounter };
}
export function restoreTaskRandom(context, random) {
    if (!random) return;
    if (random.algorithm !== "mulberry32" || ![random.seed, random.state, random.forkCounter].every((value) => Number.isSafeInteger(value) && value >= 0) || random.seed > 0xffffffff || random.state > 0xffffffff) throw fault("Invalid task RNG state");
    const rng = createRuntimeRng("default", { seed: random.seed });
    Object.assign(rng, random); context.setScopedEnv("rng", rng);
}
export function snapshotTaskRandom(context) { return randomSnapshot(context); }
function inspectCapturedValue(value) {
    const seen = new Set(); let count = 0;
    const shapedProto = attachBuiltinProto({ type: "shaped", shape: [0], data: [], _ext: new Map() })._ext.get("_proto");
    function visit(item, depth) {
        if (++count > 50_000 || depth > 64) throw fault("Capture work limit exceeded");
        if (typeof item === "function" || typeof item === "symbol") throw fault("Callable capture requires owner execution");
        if (!item || typeof item !== "object" || seen.has(item)) return;
        seen.add(item);
        const descriptors = Object.getOwnPropertyDescriptors(item);
        for (const descriptor of Object.values(descriptors)) if (descriptor.get || descriptor.set) throw fault("Capture accessors require owner execution");
        if (item instanceof Integer || item instanceof Rational || item instanceof Fraction) {
            const prototype = Object.getPrototypeOf(item), keys = Reflect.ownKeys(descriptors);
            const plainFraction = prototype === Fraction.prototype && keys.length === 1 && keys[0] === "_isInfinite" && descriptors._isInfinite.value === (item.denominator === 0n);
            const plainNumber = [Integer.prototype, Rational.prototype].includes(prototype) && keys.length === 0;
            // The codec preserves exact components, not own methods, semantic metadata
            // or arbitrary host fields. Keep every customized numeric value with its owner.
            if (!plainNumber && !plainFraction) throw fault("Custom numeric capture requires owner execution");
            return;
        }
        if (item instanceof RationalInterval || item instanceof FractionInterval) { if (Reflect.ownKeys(descriptors).length || ![RationalInterval.prototype, FractionInterval.prototype].includes(Object.getPrototypeOf(item))) throw fault("Custom interval requires owner execution"); visit(item.low, depth + 1); visit(item.high, depth + 1); return; }
        if (item instanceof RationalIntervalSet) { if (Reflect.ownKeys(descriptors).length || Object.getPrototypeOf(item) !== RationalIntervalSet.prototype) throw fault("Custom interval set requires owner execution"); visit(item.components, depth + 1); return; }
        if (![Object.prototype, null, Array.prototype, Map.prototype].includes(Object.getPrototypeOf(item))) throw fault("Custom capture prototype requires owner execution");
        const extension = descriptors._ext?.value;
        if (extension instanceof Map && [...Map.prototype.keys.call(extension)].some((name) => !["_mutable", "__type", "scalarDomain", "scalardomain", "immutable", "_proto", "__proto", "__traits", "_type"].includes(name))) throw fault("Custom extension requires owner execution");
        if (extension instanceof Map) for (const [key, entry] of Map.prototype.entries.call(extension)) if (!["_proto", "__proto", "__traits"].includes(key)) visit(entry, depth + 1);
        if (descriptors.type?.value === "shaped" && extension?.has("_proto") && extension.get("_proto") !== shapedProto) throw fault("Custom Shaped methods require owner execution");
        if (item instanceof Map) for (const [key, entry] of Map.prototype.entries.call(item)) { visit(key, depth + 1); visit(entry, depth + 1); }
        for (const [name, descriptor] of Object.entries(descriptors)) if (name !== "_ext") visit(descriptor.value, depth + 1);
    }
    visit(value, 0);
}
export function prepareTaskRequest(ir, context, registry, system) {
    try {
        ir = inertTaskMessage(ir);
        const { captures, grants } = inspectTaskIR(ir, (name) => name === "SYS_CALL" || trustedTaskOperation(registry, name), (name) => trustedTaskCapability(system, name));
        const values = new Map();
        for (const name of captures) { const value = context.get(name); if (value === undefined) return null; inspectCapturedValue(value); values.set(name, value); }
        const captured = encodeOutputJSON({ type: "map", entries: values }, TASK_LIMITS);
        // Symbol identities, output descriptors, live references and custom semantic values stay with their owner.
        const wire = JSON.parse(captured);
        if (wire.mathematics?.length || wire.nodes.some((node) => !["map", "array", "record", "sequence", "tuple", "set", "integer", "rational", "fraction", "interval", "fraction-interval", "interval-set", "string", "number", "boolean", "null", "shaped", "hole", "undecided"].includes(node.tag))) return null;
        return inertTaskMessage({ ir, captured, grants: [...grants], rangePolicy: context.getScopedEnv("__range_math_policy__", null), random: randomSnapshot(context) });
    } catch { return null; }
}
export function decodeTaskValue(text) { return decodeOutputJSON(text, TASK_LIMITS).value; }
export function encodeTaskValue(value) { return encodeOutputJSON(value, TASK_LIMITS); }
export function validateTaskRequest(task) {
    task = inertTaskMessage(task);
    if (!Array.isArray(task.grants) || task.grants.some((name) => !TASK_CAPABILITIES.has(name))) throw fault("Invalid worker grant");
    inspectTaskIR(task.ir, () => true, (name) => task.grants.includes(name));
    const captured = decodeTaskValue(task.captured);
    if (captured?.type !== "map") throw fault("Task captures must be a map");
    return { task, captured };
}
