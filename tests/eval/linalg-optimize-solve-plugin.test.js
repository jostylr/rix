import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { formatValue, parseAndEvaluate } from "../../src/index.js";
import { forEachShapedCell } from "../../src/runtime/shaped.js";
import { Context } from "../../src/runtime/context.js";

function flat(value) {
    const result = [];
    forEachShapedCell(value, (entry) => result.push(String(entry)));
    return result;
}

describe("linalg Phase 1 plugin", () => {
    test("solves exact dense systems and reports rank states", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            unique := .linalg.Solve([2, 1; 1, -1], [5, 1]);
            under := .linalg.Solve({:1x2: 1, 1}, [2]);
            inconsistent := .linalg.Solve([1, 1; 2, 2], [1, 3]);
            [unique, under, inconsistent, .linalg.Determinant([2, 1; 1, -1]), .linalg.Inverse([1, 2; 3, 5])];
        `);
        expect(result.values[0].status).toBe("unique");
        expect(flat(result.values[0].solution)).toEqual(["2", "1"]);
        expect(result.values[1].status).toBe("underdetermined");
        expect(result.values[1].nullspace.values).toHaveLength(1);
        expect(result.values[2].status).toBe("inconsistent");
        expect(String(result.values[3])).toBe("-3");
        expect(flat(result.values[4])).toEqual(["-5", "2", "3", "-1"]);
    });

    test("changes vector and tensor Frames while retaining representation lineage", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace({= name="plane", dimension=2, over=:Rational });
            standard := .linalg.Frame(vspace, {= name="standard", basis=:defining });
            skew := .linalg.Frame(vspace, {= name="skew", relativeTo=standard, basis=[1, 1; 0, 1] });
            vector := {:2: /Vector: Standard/ 2, 3};
            covector := {:2: /Covector: Standard/ 2, 3};
            operator := {:2x2: /Tensor: Standard@Standard*/ 1, 2; 3, 4};
            vectorSkew := .linalg.Transform(vector, skew);
            covectorSkew := .linalg.Transform(covector, skew);
            operatorRoundTrip := .linalg.Transform(.linalg.Transform(operator, skew), standard);
            [vector, vectorSkew, covectorSkew, operatorRoundTrip];
        `);
        const [vector, vectorSkew, covectorSkew, operatorRoundTrip] = result.values;
        expect(flat(vectorSkew.components)).toEqual(["-1", "3"]);
        expect(flat(covectorSkew.components)).toEqual(["2", "5"]);
        expect(vectorSkew.equivalentTo).toBe(vector);
        expect(vectorSkew.identity).toBe(vector.identity);
        expect(flat(operatorRoundTrip.components)).toEqual(["1", "2", "3", "4"]);
        expect(formatValue(parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("plane", 2);
            a := .linalg.Frame(vspace, "a", :defining);
            b := .linalg.Frame(vspace, {= name="b", relativeTo=a, basis=[1, 1; 0, 1] });
            v := .linalg.Vector([2, 3], a);
            .linalg.Transform!(v, b);
            [v.components, v.equivalentTo.components, .linalg.SameTensor(v, v.equivalentTo)];
        `))).toBe("[{:2: -1, 3 }, {:2: 2, 3 }, 1]");
    });

    test("typed headers require Frames and vector arithmetic converts the right representation to the left", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("V", 2);
            e := .linalg.Frame(vspace, "e", :defining);
            f := .linalg.Frame(vspace, {= relativeTo=e, basis=[1, 1; 0, 1] });
            x := {:2: /Vector: E/ 2, 3};
            y := x.Transform(f);
            p := {:2: /Vector: E*/ 4, 5};
            [x.__type, p.__type, (x + y).components, .linalg.SameTensor(x, y), p.Pair(y)];
        `);
        expect(result.values[0].value).toBe("Vector");
        expect(result.values[1].value).toBe("Covector");
        expect(flat(result.values[2])).toEqual(["4", "6"]);
        expect(result.values[3]).not.toBeNull();
        expect(String(result.values[4])).toBe("23");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("V", 2);
            {:2: /Vector: Vspace/ 1, 2};
        `)).toThrow("a Frame");
    });

    test("independent tensor slots may use differently sized spaces and independent target Frames", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            v := .linalg.VectorSpace("V", 2);
            w := .linalg.VectorSpace("W", 3);
            e := .linalg.Frame(v, "e", :defining);
            f := .linalg.Frame(v, {= relativeTo=e, basis=[1, 1; 0, 1] });
            g := .linalg.Frame(w, "g", :defining);
            h := .linalg.Frame(w, {= relativeTo=g, basis=[1,0,1; 0,1,0; 0,0,1] });
            t := {:2x3: /Tensor: E@G*/ 1,2,3; 4,5,6};
            changed := t.Transform([f, h]);
            roundTrip := changed.Transform([e, g]);
            [changed.Frames(), roundTrip.components, .linalg.SameTensor(t, roundTrip)];
        `);
        expect(result.values[0].values.map((frame) => frame.name)).toEqual(["frame", "frame"]);
        expect(flat(result.values[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
        expect(result.values[2]).not.toBeNull();
    });

    test("lineage retains the origin plus the configured recent representation limit", () => {
        const context = new Context();
        context.setEnv("tensorLineageLimit", 2);
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("V", 2);
            e := .linalg.Frame(vspace, "e", :defining);
            f := .linalg.Frame(vspace, {= relativeTo=e, basis=[1,1;0,1] });
            x0 := {:2: /Vector: E/ 1, 2};
            x1 := x0.Transform(f);
            x2 := x1.Transform(e);
            x3 := x2.Transform(f);
            x3;
        `, { context });
        expect(result.identity.origin).not.toBeNull();
        expect(result.identity.representations).toHaveLength(3);
        expect(result.identity.representations[0]).toBe(result.identity.origin);
    });
});

describe("optimize Phase 1 plugin", () => {
    test("solves exact standard-form linear programs", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
            solved := .optimize.Solve(program);
            unbounded := .optimize.Maximize([1], {:1x1: 0}, [1]);
            [solved, unbounded];
        `);
        expect(result.values[0].status).toBe("optimal");
        expect(flat(result.values[0].solution)).toEqual(["2", "2"]);
        expect(String(result.values[0].objectiveValue)).toBe("10");
        expect(result.values[0].feasible).toBe(true);
        expect(result.values[1].status).toBe("unbounded");
    });

    test("rejects Phase 1 models without an initial feasible origin", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("optimize");
            .optimize.Minimize([1], {:1x1: 1}, [-1]);
        `)).toThrow("nonnegative b");
    });
});

describe("solve Phase 1 plugin", () => {
    test("solves affine symbolic equality systems with named exact values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            system := {#a,b:x,y# x + y == a; x - y == b };
            .solve.System(system, {= values={= a=3, b=1 } });
        `);
        expect(result.status).toBe("unique");
        expect(result.classification).toBe("linearEqualities");
        expect(String(result.solution.entries.get("x"))).toBe("2");
        expect(String(result.solution.entries.get("y"))).toBe("1");
        expect(result.solution.entries.get("x")).toBeInstanceOf(Rational);
    });

    test("rejects nonlinear and inequality systems explicitly", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("solve");
            .solve.System({#:x# x^2 == 4 });
        `)).toThrow("Nonlinear power");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("solve");
            .solve.System({#:x# x >= 1 });
        `)).toThrow("supports exact equalities");
    });
});
