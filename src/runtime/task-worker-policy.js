/** Worker eligibility is an explicit core subset, never inferred from host metadata. */
export const TASK_IR = new Set([
    "LITERAL", "STRING", "RETRIEVE", "ADD", "SUB", "MUL", "DIV", "INTDIV", "DIVUP", "DIVROUND", "DIVMOD", "MOD", "POW", "NEG", "ABS", "FACTORIAL", "DOUBLE_FACTORIAL",
    "EQ", "NEQ", "LT", "LE", "GT", "GE", "NOT", "AND", "OR", "TERNARY", "DEFER", "ARRAY", "TUPLE", "SET", "INTERVAL", "INDEX", "RANDOM", "SYS_CALL",
]);
export const TASK_CAPABILITIES = new Set(["ADD", "SUB", "MUL", "DIV", "POW", "NEG", "ABS", "MIN", "MAX", "FLOOR", "CEIL", "ROUND", "GCD", "LCM"]);
const registries = new WeakMap(), systems = new WeakMap();
function fingerprint(entry) { return entry ? [entry.impl, ...(entry.variants || []).flatMap((variant) => [variant.impl, variant.prepare, variant.prep, variant.guard])] : []; }
export function markTaskRegistry(registry) { registries.set(registry, new Map([...TASK_IR].map((name) => [name, fingerprint(registry.get(name))]))); }
export function markTaskSystem(system) { systems.set(system, new Map([...TASK_CAPABILITIES].map((name) => [name, fingerprint(system.get(name))]))); }
function unchanged(table, owner, name) { const expected = table.get(owner)?.get(name), actual = fingerprint(owner?.get(name)); return expected?.length > 0 && expected.length === actual.length && expected.every((value, index) => value === actual[index]); }
export function trustedTaskOperation(registry, name) { return unchanged(registries, registry, name); }
export function trustedTaskCapability(system, name) { return unchanged(systems, system, name); }
