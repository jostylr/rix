import { describe, expect, test } from "bun:test";

import { createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/eval/evaluator.js";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { getDiagnostics } from "../../src/runtime/diagnostics.js";
import { Context } from "../../src/runtime/context.js";
import { OperationalFault } from "../../src/runtime/operational-fault.js";

describe("postfix checks and diagnostic taps", () => {
  test("tokenizes and parses ## operators ahead of comments", () => {
    const tokens = tokenize("x ##@ == 2 ##: number ##! Debug(\"x\") ##_ Close ##!> Recover");
    expect(tokens.filter((token) => ["##@", "##:", "##!", "##_", "##!>"].includes(token.value)).map((token) => token.value))
      .toEqual(["##@", "##:", "##!", "##_", "##!>"]);

    const [ast] = parse("x ##@ == 2 ##: number");
    expect(ast.type).toBe("PostfixTypeCheck");
    expect(ast.expression.type).toBe("PostfixPredicateCheck");
  });

  test("checks the complete assignment RHS once and preserves its value", () => {
    const context = new Context();
    const result = parseAndEvaluate("x := 1 + 1 ##: number ##@ == 2; x", { context });
    expect(result.value).toBe(2n);
    expect(context.get("x").value).toBe(2n);
  });

  test("fails predicate checks when the predicate returns null", () => {
    expect(() => parseAndEvaluate("2 ##@ == 3")).toThrow("##@ check failed");
  });

  test("checks structural kinds, counts, shaped dimensions, and semantic types", () => {
    expect(parseAndEvaluate("[1, 2, 3] ##: array[3]").type).toBe("sequence");
    expect(parseAndEvaluate("{| 1, 2 |} ##: set[2]").type).toBe("set");
    expect(parseAndEvaluate("{= a = 1 } ##: map[1]").type).toBe("map");
    expect(parseAndEvaluate("{: 1, 2 } ##: tuple[2]").type).toBe("tuple");
    expect(parseAndEvaluate("{:2x2: 1, 2; 3, 4 } ##: shaped[2x2]").type).toBe("shaped");
    expect(parseAndEvaluate("5 ##: number").value).toBe(5n);
    expect(parseAndEvaluate("5 ##: :integer").value).toBe(5n);
    expect(() => parseAndEvaluate("[1, 2] ##: array[3]")).toThrow("expected array[3]");
  });

  test("diagnostic taps preserve values and emit the expected events", () => {
    const context = new Context();
    const result = parseAndEvaluate(`
      2 ##! Debug("debug value");
      3 ##! Info("info value", 2);
      4 ##! Dump("dump value");
      5 ##! Log("log alias");
      6
    `, { context });

    expect(result.value).toBe(6n);
    const events = getDiagnostics(context).events;
    expect(events.map((event) => event.entries.get("kind")?.value))
      .toEqual(["debug", "info", "log", "log"]);
    expect(events[1].entries.get("data").entries.get("display").value).toBe("3");
    expect(events[2].entries.get("data").entries.get("display").value).toBe("4");
    expect(events[3].entries.get("data").entries.get("display").value).toBe("5");
  });

  test("Trace taps trace the wrapped expression", () => {
    const context = new Context();
    const result = parseAndEvaluate('F(n) -> n + 1; F(2) ##! Trace("F", 2)', { context });
    expect(result.value).toBe(3n);
    const trace = getDiagnostics(context).events.find((event) => event.entries.get("kind")?.value === "trace");
    expect(trace).toBeDefined();
  });

  test("##_ preserves acquisitions and runs cleanup in LIFO order", () => {
    const closed = [];
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("close", {
      impl: ([value]) => {
        closed.push(Number(value.value));
        return null;
      },
    });
    systemContext.freeze();

    const result = parseAndEvaluate("{; first := 1 ##_ .close; second := 2 ##_ .close; first + second };", {
      systemContext,
    });
    expect(result.value).toBe(3n);
    expect(closed).toEqual([2, 1]);
  });

  test("cleanup failure is suppressed behind a body failure", () => {
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("close", { impl: () => { throw new Error("cleanup failed"); } });
    systemContext.registerHost("fail", { impl: () => { throw new Error("body failed"); } });
    systemContext.freeze();

    let caught;
    try {
      parseAndEvaluate("{; 1 ##_ .close; .fail() };", { systemContext });
    } catch (error) {
      caught = error;
    }
    expect(caught.message).toContain("body failed");
    expect(caught.suppressed).toHaveLength(1);
    expect(caught.suppressed[0].message).toContain("cleanup failed");
  });

  test("async cleanup is awaited before a block publishes its result", async () => {
    const events = [];
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("close", {
      impl: async ([value]) => {
        await Promise.resolve();
        events.push(`close:${Number(value.value)}`);
      },
    });
    systemContext.freeze();

    const result = await parseAndEvaluateAsync("{$:1$ 4 ##_ .close };", { systemContext });
    events.push("published");
    expect(result.value).toBe(4n);
    expect(events).toEqual(["close:4", "published"]);
  });

  test("##!> recovers typed operational faults but not language errors", async () => {
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("fault", {
      impl: () => { throw new OperationalFault("network unavailable", { code: "NET_DOWN" }); },
    });
    systemContext.registerHost("bug", { impl: () => { throw new Error("language bug"); } });
    systemContext.freeze();

    const recovered = await parseAndEvaluateAsync(".fault() ##!> ((fault) -> 42);", { systemContext });
    expect(recovered.value).toBe(42n);
    await expect(parseAndEvaluateAsync(".bug() ##!> ((fault) -> 42);", { systemContext }))
      .rejects.toThrow("language bug");
  });

  test("async cleanup has a bounded grace period", async () => {
    const context = new Context();
    context.setEnv("asyncCleanupGraceMs", 5);
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("hang", { impl: () => new Promise(() => {}) });
    systemContext.freeze();

    const recovered = await parseAndEvaluateAsync(
      "({; 1 ##_ .hang; 2 }) ##!> ((fault) -> 8);",
      { context, systemContext },
    );
    expect(recovered.value).toBe(8n);
  });
});
