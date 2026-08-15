import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";
import { forEachShapedCell } from "../../src/runtime/shaped.js";

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
            [unique[:status], unique[:solution], under[:status], under[:nullspace].Len(),
             inconsistent[:status], .linalg.Determinant([2, 1; 1, -1]), .linalg.Inverse([1, 2; 3, 5])];
        `);
        expect(result.values[0].value).toBe("unique");
        expect(flat(result.values[1])).toEqual(["2", "1"]);
        expect(result.values[2].value).toBe("underdetermined");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("inconsistent");
        expect(String(result.values[5])).toBe("-3");
        expect(flat(result.values[6])).toEqual(["-5", "2", "3", "-1"]);
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
            [vectorSkew.components, covectorSkew.components,
             .linalg.SameTensor(vector, vectorSkew), operatorRoundTrip.components];
        `);
        expect(flat(result.values[0])).toEqual(["-1", "3"]);
        expect(flat(result.values[1])).toEqual(["2", "5"]);
        expect(result.values[2]).not.toBeNull();
        expect(flat(result.values[3])).toEqual(["1", "2", "3", "4"]);
        expect(formatValue(parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("plane", 2);
            a := .linalg.Frame(vspace, "a", :defining);
            b := .linalg.Frame(vspace, {= name="b", relativeTo=a, basis=[1, 1; 0, 1] });
            v := .linalg.Vector([2, 3], a);
            .linalg.Transform!(v, b);
            [v.components];
        `))).toBe("[{:2: -1, 3 }]");
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
            [changed.Frames().Map((frame)->frame[:name]), roundTrip.components, .linalg.SameTensor(t, roundTrip)];
        `);
        expect(result.values[0].values.map((name) => name.value)).toEqual(["frame", "frame"]);
        expect(flat(result.values[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
        expect(result.values[2]).not.toBeNull();
    });

    test("lineage retains the origin plus the configured recent representation limit", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace({= name="V", dimension=2, lineageLimit=2 });
            e := .linalg.Frame(vspace, "e", :defining);
            f := .linalg.Frame(vspace, {= relativeTo=e, basis=[1,1;0,1] });
            x0 := {:2: /Vector: E/ 1, 2};
            x1 := x0.Transform(f);
            x2 := x1.Transform(e);
            x3 := x2.Transform(f);
            [x3.identity[:origin] != _, x3.identity[:representations].Len(), .linalg.SameTensor(x0, x3)];
        `);
        expect(result.values[0]).not.toBeNull();
        expect(String(result.values[1])).toBe("3");
        expect(result.values[2]).not.toBeNull();
    });
});

describe("optimize Phase 1 plugin", () => {
    test("solves exact standard-form linear programs", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
            solved := .optimize.Solve(program);
            unbounded := .optimize.Maximize([1], {:1x1: 0}, [1]);
            [solved.status, solved.solution, solved.objectiveValue, solved.feasible, unbounded.status];
        `);
        expect(result.values[0].value).toBe("optimal");
        expect(flat(result.values[1])).toEqual(["2", "2"]);
        expect(String(result.values[2])).toBe("10");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("unbounded");
    });

    test("keeps evaluation, minimization, and bounded-work results in pure RiX", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([1], {:1x1: 1}, [4]);
            inside := program.Evaluate([2]);
            outside := .optimize.Evaluate(program, [5]);
            minimum := .optimize.Minimize([1], {:1x1: 1}, [4]);
            limited := .optimize.Solve(
                .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]),
                {= maxIterations=1 }
            );
            [inside.objectiveValue, inside.feasible, outside.feasible,
             minimum.status, minimum.objectiveValue, limited.status, .Plugin.Info("optimize")[:kind]];
        `);
        expect(String(result.values[0])).toBe("2");
        expect(String(result.values[1])).toBe("1");
        expect(result.values[2]).toBeNull();
        expect(result.values[3].value).toBe("optimal");
        expect(String(result.values[4])).toBe("0");
        expect(result.values[5].value).toBe("iterationLimit");
        expect(result.values[6].value).toBe("rix");
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
            answer := .solve.System(system, {= values={= a=3, b=1 } });
            [answer[:status], answer[:classification], answer[:solution][:x],
             answer[:solution][:y], .Plugin.Info("solve")[:kind]];
        `);
        expect(result.values[0].value).toBe("unique");
        expect(result.values[1].value).toBe("linearEqualities");
        expect(String(result.values[2])).toBe("2");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("rix");
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
