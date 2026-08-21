import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (value) => value.values.map((item) => item.value);

describe("symbolic transformation registry", () => {
    test("lists stable descriptors and filters by owner, category, input, and domain policy", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            all := .symbolic.Transformations();
            ratfun := .symbolic.FindTransformations({= owner=:ratfun });
            calculus := .symbolic.Transformations({= category=:calculus });
            expressions := .symbolic.Transformations({= input=:CalculusExpression });
            preserving := .symbolic.Transformations({= domainPolicy=:preserveSource });
            {: all.Len(),
               ratfun.Map((entry)->entry[:id]),
               calculus.Len(), expressions.Len(), preserving.Len() };
        `);

        expect(String(result.values[0])).toBe("22");
        expect(strings(result.values[1])).toEqual([
            "ratfun.together",
            "ratfun.factored",
            "ratfun.partial-fractions",
            "ratfun.pole-zero-evidence",
            "ratfun.expand-presentation",
        ]);
        expect(String(result.values[2])).toBe("9");
        expect(String(result.values[3])).toBe("8");
        expect(String(result.values[4])).toBe("6");
    });

    test("names the owning call without centralizing executable implementations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            descriptor := .symbolic.Transformation("ratfun.factored");
            R := .rf\`(x^2-1)/(x-1)\`;
            presentation := .ratfun.Factored(R);
            restored := .ratfun.Expand(presentation);
            {: descriptor[:schema], descriptor[:owner], descriptor[:operation],
               descriptor[:call], descriptor.Has("handler"), restored==R };
        `);

        expect(result.values[0].value).toBe("rix.symbolic.transformation-descriptor@1");
        expect(result.values[1].value).toBe("ratfun");
        expect(result.values[2].value).toBe("Factored");
        expect(result.values[3].value).toBe(".ratfun.Factored(value)");
        expect(result.values[4]).toBeNull();
        expect(String(result.values[5])).toBe("1");
    });

    test("keeps descriptors immutable and diagnoses invalid queries", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("symbolic");
            .symbolic.Transformation("fracfun.cancel").Set!("owner","other");
        `)).toThrow("immutable");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("symbolic");
            .symbolic.Transformations(:ratfun);
        `)).toThrow("filters must be a Map");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("symbolic");
            .symbolic.Transformation("missing.operation");
        `)).toThrow("Unknown symbolic transformation missing.operation");
    });
});
