import { expect, test } from "bun:test";
import { Context, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { expressionField } from "../../src/runtime/math-expression.js";
import { createStandardSystemContext } from "../../src/tools/execution/standard-policy.js";

test("editor standard policy admits core expression construction without plugins", () => {
    const result = parseAndEvaluate('.IsExpression(.ExpressionVariable(:x)+1)', {
        context:new Context(), systemContext:createStandardSystemContext(createDefaultSystemContext),
    });
    expect(result.value).toBe(1n);
});

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    test(`${mode}: core expressions need no plugin`, async () => {
        const value = await evaluate(`
            x := .ExpressionVariable(:x);
            expression := x^2 + 3*x + 1;
            {: .IsExpression(expression),expression.Kind(),x.Record()[:name],(2+3),-x };
        `,{ context:new Context() });
        expect(value.values[0].value).toBe(1n);
        expect(value.values[1].value).toBe("operator");
        expect(value.values[2].value).toBe("x");
        expect(value.values[3].value).toBe(5n);
        expect(expressionField(value.values[4],"operation").value).toBe("negate");
    });
}

test("core construction validates constants, arity, and immutable records", () => {
    for (const code of [
        '.ExpressionVariable(1)',
        '.ExpressionConstant("bad")',
        '.ExpressionOperation(:add,[1])',
        'x := .ExpressionVariable(:x); x[:name] = :y',
    ]) expect(() => parseAndEvaluate(code,{context:new Context()})).toThrow();
});
