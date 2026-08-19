import { describe, expect, test } from "bun:test";
import {
    Context,
    checkCalculusDerivativeTransformation,
    checkMultivariateRangeResult,
    createDefaultRegistry,
    createDefaultSystemContext,
    evaluateJacobianBoxRange,
    parseAndEvaluate,
} from "../../src/index.js";
import { RationalIntervalSet } from "@ratmath/core";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    const wanted = String(key).toLowerCase();
    for (const [candidate, result] of value.entries) {
        if (String(candidate).toLowerCase() === wanted) return result;
    }
    return undefined;
}

function text(value) {
    return value?.value ?? value ?? null;
}

describe("checked multivariate rational-box ranges", () => {
    test("checks trusted semantic chain rules and their domain obligations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            expResult := .calculus.DifferentiateResult(.calculus.Exp()(x),:x);
            logResult := .calculus.DifferentiateResult(.calculus.Log()(x),:x);
            sqrtResult := .calculus.DifferentiateResult(.calculus.Sqrt()(x),:x);
            asinResult := .calculus.DifferentiateResult(.calculus.Asin()(x),:x);
            complexLogResult := .calculus.DifferentiateResult(.calculus.ComplexLog()(x),:x);
            optimizedPower := .calculus.DifferentiateResult(.calculus.Exp()(x)^2,:x);
            {: expResult, logResult, sqrtResult, asinResult, complexLogResult, optimizedPower };
        `, runtime());
        const expCheck = checkCalculusDerivativeTransformation(result.values[0]);
        const logCheck = checkCalculusDerivativeTransformation(result.values[1]);
        expect(expCheck).toMatchObject({ accepted: true, certified: true });
        expect(logCheck).toMatchObject({ accepted: true, certified: true });
        expect(logCheck.obligations).toHaveLength(1);
        expect(logCheck.obligations[0]).toMatchObject({
            relation: "positive",
            reason: "realDerivativeDomain",
        });
        for (const transformation of result.values.slice(2)) {
            expect(checkCalculusDerivativeTransformation(transformation)).toMatchObject({
                accepted: true,
                certified: true,
            });
        }
    });

    test("checks arbitrary theorem-named rewrites and retains cancellation domains", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("symbolic");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            commute := .symbolic.RewriteResult(x+y,y+x,"add.commute");
            cancel := .symbolic.RewriteResult(x/x,1,"divide.cancelSelf");
            {: commute, cancel, .symbolic.CheckRewrite(cancel) };
        `, runtime());
        expect(entry(entry(result.values[0], "checker"), "accepted").value).toBe(1n);
        expect(entry(result.values[1], "obligations").values).toHaveLength(1);
        expect(text(entry(entry(result.values[1], "obligations").values[0], "relation")))
            .toBe("nonzero");
        expect(entry(result.values[2], "accepted").value).toBe(1n);
    });

    test("constructs rational boxes and certifies Jacobian subdivision", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            f := x*y;
            gradient := .calculus.GradientResult(f,[:x,:y]);
            box := .numerics.Box({= x=0:1, y=0:1 });
            enclosure := .numerics.JacobianRange(f,gradient,box,{= maxSubboxes=4 });
            {: box, enclosure, .numerics.CheckMultivariateRange(enclosure) };
        `, runtime());
        expect(entry(result.values[0], "dimension").value).toBe(2n);
        expect(entry(result.values[1], "certified").value).toBe(1n);
        expect(text(entry(result.values[1], "domainStatus"))).toBe("allDefined");
        expect(entry(entry(result.values[1], "work"), "subboxes").value).toBe(4n);
        expect(entry(result.values[2], "accepted").value).toBe(1n);
    });

    test("rejects a derivative collection whose entries are swapped", () => {
        const [expression, gradient, box] = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            f := x^2+y;
            {: f, .calculus.GradientResult(f,[:x,:y]),
               .numerics.Box({= x=0:1, y=0:1 }) };
        `, runtime()).values;
        const swapped = { ...gradient, entries: new Map(gradient.entries) };
        const results = entry(gradient, "results");
        swapped.entries.set("results", {
            ...results,
            values: [...results.values].reverse(),
        });
        const rejected = evaluateJacobianBoxRange(expression, swapped, box);
        expect(rejected).toMatchObject({ certified: false, status: "unknown" });
        expect(rejected.diagnostics).toContain("uncheckedGradientTransformation");
    });

    test("affine arithmetic preserves repeated-variable correlation", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            exact := .numerics.AffineRange(x-x,{= x=(-3):5 });
            nonlinear := .numerics.AffineRange(x*(1-x),{= x=0:1 });
            zeroPower := .numerics.AffineRange(x^0,{= x=(-1):1 });
            {: exact, nonlinear, zeroPower };
        `, runtime());
        expect(entry(result.values[0], "range").toString()).toBe("[0,0]");
        expect(entry(result.values[1], "range").toString()).toBe("[0,1/2]");
        expect(entry(entry(result.values[1], "checker"), "accepted").value).toBe(1n);
        expect(text(entry(result.values[2], "status"))).toBe("unknown");
        expect(text(entry(result.values[2], "domainStatus"))).toBe("unresolved");
    });

    test("certifies a Hessian-remainder multivariate Taylor model", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            f := x*y+x^2;
            gradient := .calculus.GradientResult(f,[:x,:y]);
            hessian := .calculus.HessianResult(f,[:x,:y]);
            enclosure := .numerics.TaylorModelRange(
                f,gradient,hessian,{= x=0:1, y=0:1 },{= maxSubboxes=2 }
            );
            enclosure;
        `, runtime());
        expect(entry(result, "certified").value).toBe(1n);
        expect(text(entry(result, "strategy"))).toBe("multivariateTaylorModel");
        expect(entry(entry(result, "work"), "subboxes").value).toBe(2n);
        expect(entry(entry(result, "checker"), "accepted").value).toBe(1n);

        const changed = { ...result, entries: new Map(result.entries) };
        changed.entries.set("range", RationalIntervalSet.empty);
        expect(checkMultivariateRangeResult(changed)).toMatchObject({
            accepted: false,
            reason: "multivariateRangeClaimMismatch",
        });
    });
});
