/** Host capstone: explicit safe admission, cooperative cancellation, and cleanup. */
import assert from "node:assert/strict";
import { createDefaultSystemContext, parseAndEvaluateAsync } from "../../src/eval/evaluator.js";

export async function cancellationCapstone() {
  const controller = new AbortController();
  const reason = new Error("capstone cancelled");
  const started = [];
  const cleaned = [];
  const systemContext = createDefaultSystemContext({ frozen: false });
  systemContext.registerHost("pending", {
    effect: "read", concurrency: "safe", cancellation: "cooperative",
    async impl([value], _context, _evaluate, execution) {
      const id = Number(value.value);
      started.push(id);
      try {
        await new Promise((_resolve, reject) => {
          const stop = () => {
            execution.signal.removeEventListener("abort", stop);
            reject(execution.signal.reason ?? reason);
          };
          if (execution.signal.aborted) return stop();
          execution.signal.addEventListener("abort", stop, { once: true });
          // Cancel after both branches have actually entered; no timing race.
          if (started.length === 2) controller.abort(reason);
        });
      } finally {
        cleaned.push(id);
      }
      return value;
    },
  });
  systemContext.freeze();
  let failure;
  try {
    await parseAndEvaluateAsync("{$:2$ [.pending(1),.pending(2)] }", {
      systemContext, signal: controller.signal,
    });
  } catch (error) {
    failure = error;
  }
  assert.match(String(failure), /capstone cancelled/);
  assert.deepEqual(started.toSorted(), [1, 2]);
  assert.deepEqual(cleaned.toSorted(), [1, 2]);
  // Ordinary static work remains usable in a new evaluation after cancellation.
  const fallback = await parseAndEvaluateAsync("1/3 + 1/6");
  assert.equal(String(fallback), "1/2");
  return { status: "cancelled", started, cleaned, staticResult: String(fallback) };
}

if (import.meta.main) console.log(JSON.stringify(await cancellationCapstone(), null, 2));
