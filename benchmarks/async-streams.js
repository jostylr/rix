/** Bounded, reproducible fixtures; wall time is informational, exact checksums are assertions.
 * bun benchmarks/async-streams.js --items=32 --exponent=512 --rounds=2
 * No network services, external files, permissions or detached tasks are used.
 */
import { Context, createDefaultSystemContext, createDefaultRegistry, parseAndEvaluateAsync } from "../src/index.js";
import { TaskWorkerPool } from "../src/runtime/task-worker-pool.js";
import { createEvaluationBudget, EVALUATION_BUDGET_ENV } from "../src/runtime/evaluation-budget.js";
const option = (name, fallback, maximum) => {
    const token = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    const value = token ? Number(token.split("=")[1]) : fallback;
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`--${name} must be 1..${maximum}`);
    return value;
};
const items = option("items", 32, 256), exponent = option("exponent", 512, 4096), rounds = option("rounds", 2, 8);
const registry = createDefaultRegistry(), systemContext = createDefaultSystemContext({ frozen: false });
let active = 0, maximum = 0, calls = 0;
systemContext.registerHost("benchIo", { concurrency: "safe", cancellation: "cooperative", async impl([value]) {
    active++; maximum = Math.max(maximum, active); calls++;
    try { await new Promise((resolve) => setTimeout(resolve, 1)); return value; }
    finally { active--; }
} }); systemContext.freeze();
const checksum = (value) => {
    let hash = 2166136261;
    const visit = (entry) => {
        if (entry?.values) for (const child of entry.values) visit(child);
        else for (const character of `${entry.toString()},`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    };
    visit(value); return hash.toString(16).padStart(8, "0");
};
const rows = [];
const fixture = `[${Array.from({ length: items }, (_, i) => i + 1).join(",")}]`;
const expected = new Map();
async function measure(kind, mode, source, pool = null) {
    for (let round = 0; round < rounds; round++) {
        const context = new Context();
        const budget = createEvaluationBudget({ maxSteps: 2000000, maxTimeMs: 30000 });
        context.setEnv(EVALUATION_BUDGET_ENV, budget);
        if (pool) context.setEnv("__async_task_worker_pool__", pool);
        let firstPublication = null, streamStats = null;
        const start = performance.now();
        context.setEnv("__trace_context__", { active: true, depth: 0, currentDepth: 0, trackedVars: new Set(), log: { push(event) {
            if (event.event === "stream-publish") firstPublication ??= performance.now() - start;
            if (event.event === "stream-close") streamStats = event.stream;
        } } });
        active = 0; maximum = 0; calls = 0;
        const value = await parseAndEvaluateAsync(source, { context, registry, systemContext });
        const milliseconds = performance.now() - start;
        const check = checksum(value);
        if (expected.has(kind) && expected.get(kind) !== check) throw new Error(`${kind} exact checksum mismatch`);
        expected.set(kind, check);
        if (active !== 0) throw new Error("Benchmark leaked an active I/O operation");
        rows.push({ kind, mode, round, milliseconds, firstPublication, checksum: check, evaluatorSteps: budget.steps, calls, maxIoActive: maximum,
            ...(streamStats ? { stream: streamStats } : {}), ...(pool ? { worker: pool.snapshot() } : {}) });
    }
}
for (const concurrency of [1, 4]) {
    await measure("io-pipeline", `event-loop-${concurrency}`, `{$:${concurrency}$ .Stream(${fixture}).Map(.benchIo).Chunk(4).Map(.benchIo).Collect() }`);
    await measure("scheduler-overhead", `event-loop-${concurrency}`, `{$:${concurrency}$ .Stream(${fixture}).Map((x)->x+1).Chunk(4).Map((x)->x).Collect() }`);
}
const cpu = `{$:4$ [${Array.from({ length: items }, (_, i) => `(123456789^${exponent}+${i + 1})/(987654321^${Math.max(1, Math.floor(exponent / 4))}+${i + 1})`).join(",")}] }`;
await measure("exact-cpu", "event-loop", cpu);
for (const workers of [1, 2, 4]) {
    const pool = new TaskWorkerPool({ maxWorkers: workers, maxTimeMs: 30000, workerFactory: () => new Worker(new URL("../src/runtime/task-worker-entry.js", import.meta.url), { type: "module" }) });
    try { await measure("exact-cpu", `workers-${workers}`, cpu, pool); }
    finally { await pool.dispose(); }
}
console.log(JSON.stringify({ schema: "rix.benchmark.async-streams@1", seed: 0, items, exponent, rounds, runtime: `Bun ${Bun.version}`, rows }, null, 2));
