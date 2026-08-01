import { describe, expect, test } from "bun:test";

import { parseAndEvaluate } from "../../src/eval/evaluator.js";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { getDiagnostics } from "../../src/runtime/diagnostics.js";
import { Context } from "../../src/runtime/context.js";

describe("postfix checks and diagnostic taps", () => {
  test("tokenizes and parses ## operators ahead of comments", () => {
    const tokens = tokenize("x ##@ == 2 ##: number ##! Debug(\"x\")");
    expect(tokens.filter((token) => ["##@", "##:", "##!"].includes(token.value)).map((token) => token.value))
      .toEqual(["##@", "##:", "##!"]);

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

  test("checks structural kinds, counts, tensor shapes, and semantic types", () => {
    expect(parseAndEvaluate("[1, 2, 3] ##: array[3]").type).toBe("sequence");
    expect(parseAndEvaluate("{| 1, 2 |} ##: set[2]").type).toBe("set");
    expect(parseAndEvaluate("{= a = 1 } ##: map[1]").type).toBe("map");
    expect(parseAndEvaluate("{: 1, 2 } ##: tuple[2]").type).toBe("tuple");
    expect(parseAndEvaluate("{:2x2: 1, 2; 3, 4 } ##: tensor[2x2]").type).toBe("tensor");
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
});
