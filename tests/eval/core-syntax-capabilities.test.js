import { describe, expect, test } from "bun:test";
import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";

function evaluate(code) {
    return parseAndEvaluate(code, {
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    });
}

describe("core syntax capabilities", () => {
    test("PascalCase core calls share syntax operations", () => {
        expect(evaluate(".Add(2, 3)").value).toBe(5n);
        expect(evaluate(".Min(3, 1, 2)").value).toBe(1n);
        expect(evaluate(".Max(3, 1, 2)").value).toBe(3n);
        expect(evaluate(".Interval(1, 2)").toString()).toBe("1:2");
    });

    test("the original all-caps normalizations remain compatible", () => {
        expect(evaluate(".ADD(2, 3)").value).toBe(5n);
        expect(evaluate(".MIN(3, 1, 2)").value).toBe(1n);
    });

    test("assignment, maps, and lambdas have public function representations", () => {
        expect(evaluate(".Assign(:x, 7); x").value).toBe(7n);
        const map = evaluate(".Map(.Pair(:x, 7), .Pair(:y, 9))");
        expect(map.entries.get("x").value).toBe(7n);
        expect(map.entries.get("y").value).toBe(9n);
        expect(evaluate("F = .Lambda(.Params(:x), .Add(x, 1)); F(4)").value).toBe(5n);
        expect(evaluate(".Define(:F, .Params(:x), .Mul(x, 2)); F(4)").value).toBe(8n);
    });
});
