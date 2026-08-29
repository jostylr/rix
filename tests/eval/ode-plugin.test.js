import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { Rational } from "@ratmath/core";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    return value.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("pure RiX ODE plugin", () => {
    test("is bundled with portable IVP and solution contracts", () => {
        const info = parseAndEvaluate('.Plugin.Info("ode")', runtime());
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "requires").values.map(text)).toEqual([
            "rix.calculus@1",
            "rix.numerics@2",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.ode.problem@1",
            "rix.ode.solution@1",
            "rix.ode.dense-segment@1",
            "rix.ode.event@1",
            "rix.ode.event-result@1",
        ]);
    });

    test("retains state order, parameters, units, events, and assumptions in an IVP", () => {
        const problem = parseAndEvaluate(`
            .Plugin.Load("ode");
            t := .calculus.Variable(:t);
            y := .calculus.Variable(:y);
            .ode.IVP(y+t,0,1,0:1,{=
                independent=:t,stateNames=[:y],parameters={= rate=2 },
                units={= t=:seconds,y=:meters },events=[:zeroCrossing],
                assumptions=[:continuouslyDifferentiable]
            });
        `, runtime());

        expect(text(entry(problem, "schema"))).toBe("rix.ode.problem@1");
        expect(text(entry(problem, "problemkind"))).toBe("initialValueProblem");
        expect(entry(problem, "dimension").value).toBe(1n);
        expect(entry(problem, "statenames").values.map(text)).toEqual(["y"]);
        expect(text(entry(entry(problem, "units"), "t"))).toBe("seconds");
        expect(entry(problem, "events").values.map(text)).toEqual(["zeroCrossing"]);
    });

    test("keeps Euler and RK4 explicitly approximate with exact rational steps", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            problem := .ode.IVP(y,0,1,0:1);
            euler := problem.Euler({= steps=4 });
            rk4 := problem.RK4({= steps=1 });
            {: euler,rk4,euler.At(1/2) };
        `, runtime());
        const euler = result.values[0];
        const rk4 = result.values[1];

        expect(text(entry(euler, "status"))).toBe("approximate");
        expect(entry(euler, "certified")).toBeNull();
        expect(entry(euler, "finalstate").values[0].toString()).toBe("625/256");
        expect(entry(euler, "segments").values).toHaveLength(4);
        expect(entry(rk4, "finalstate").values[0].toString()).toBe("65/24");
        expect(result.values[2].toString()).toBe("25/16");
    });

    test("builds a validated Picard tube with checked derivative evidence", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            problem := .ode.IVP(y,0,1,0:1);
            solution := problem.ValidatedPicard({= steps=4,maxTubeIterations=8,maxSubintervals=2 });
            {: solution,solution.At(1/2) };
        `, runtime());
        const solution = result.values[0];

        expect(text(entry(solution, "status"))).toBe("validated");
        expect(text(entry(solution, "classification"))).toBe("certifiedTube");
        expect(entry(solution, "certified").value).toBe(1n);
        expect(entry(solution, "segments").values).toHaveLength(4);
        const first = entry(solution, "segments").values[0];
        expect(text(entry(first, "segmentkind"))).toBe("validatedTube");
        expect(text(entry(first, "uniqueness"))).toBe("picardLindelof");
        const final = entry(solution, "finalstate").values[0];
        expect(final.low.lessThan(new Rational(3n))).toBe(true);
        expect(final.high.greaterThan(new Rational(2n))).toBe(true);
        expect(result.values[1].low.lessThanOrEqual(new Rational(1n))).toBe(true);
        expect(result.values[1].high.greaterThan(new Rational(1n))).toBe(true);
    });

    test("preserves certified partial work when a tube budget is insufficient", () => {
        const solution = parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            problem := .ode.IVP(100*y,0,1,0:1);
            problem.ValidatedPicard({= steps=1,maxTubeIterations=1,tubeRadius=1 });
        `, runtime());

        expect(text(entry(solution, "status"))).toBe("partial");
        expect(entry(solution, "certified")).toBeNull();
        expect(entry(solution, "segments").values).toHaveLength(1);
        expect(text(entry(entry(solution, "segments").values[0], "segmentkind")))
            .toBe("unresolvedTube");
        expect(entry(entry(solution, "work"), "completedsteps").value).toBe(0n);
    });

    test("executes vector RK4 and returns vector dense output", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ode");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            problem := .ode.IVP([y,-x],0,[1,0],0:1,{= stateNames=[:x,:y] });
            solution := problem.RK4({= steps=1 });
            {: solution,solution.At(1) };
        `, runtime());
        const solution = result.values[0];
        expect(entry(solution, "finalstate").values.map(String)).toEqual(["13/24", "-5/6"]);
        expect(result.values[1].values.map(String)).toEqual(["13/24", "-5/6"]);
    });

    test("certifies a vector Picard tube with a checked Jacobian contraction", () => {
        const solution = parseAndEvaluate(`
            .Plugin.Load("ode");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            problem := .ode.IVP([y,-x],0,[1,0],0:1/2,{= stateNames=[:x,:y] });
            problem.ValidatedPicard({= steps=4,maxTubeIterations=8,maxSubintervals=2 });
        `, runtime());
        expect(text(entry(solution, "status"))).toBe("validated");
        expect(entry(solution, "finalstate").values).toHaveLength(2);
        const first = entry(solution, "segments").values[0];
        expect(entry(first, "contractionbound").lessThan(new Rational(1n))).toBe(true);
        expect(entry(first, "tube").values).toHaveLength(2);
    });

    test("adapts RK4 by exact step doubling without claiming a global certificate", () => {
        const solution = parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            .ode.IVP(y,0,1,0:1).AdaptiveRK4({=
                initialSteps=1,tolerance=1/10000,maxAttempts=100
            });
        `, runtime());
        expect(text(entry(solution, "status"))).toBe("approximate");
        expect(text(entry(solution, "method"))).toBe("adaptiveRK4");
        expect(entry(solution, "certified")).toBeNull();
        expect(entry(entry(solution, "work"), "acceptedsteps").value).toBeGreaterThan(0n);
        expect(text(entry(entry(solution, "errormodel"), "localestimate"))).toBe("stepDoubling");
    });

    test("isolates observed event candidates and certifies validated exclusions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            crossing := .ode.Event(y-1/2,{= name=:half,direction=:rising });
            observed := .ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[crossing] })
                .RK4({= steps=4 }).IsolateEvents()[1];
            excluded := .ode.IVP(.calculus.Constant(0),0,1,0:1,{= events=[.ode.Event(y)] })
                .ValidatedPicard({= steps=2 }).IsolateEvents()[1];
            {: observed,excluded };
        `, runtime());
        const observed = result.values[0];
        const excluded = result.values[1];
        expect(entry(observed, "candidates").values.length).toBeGreaterThan(0);
        const candidate = entry(observed, "candidates").values[0];
        expect(text(entry(candidate, "classification"))).toBe("observedCandidate");
        expect(entry(candidate, "interval").low.lessThanOrEqual(new Rational(1n, 2n))).toBe(true);
        expect(entry(candidate, "interval").high.greaterThanOrEqual(new Rational(1n, 2n))).toBe(true);
        expect(entry(excluded, "candidates").values).toHaveLength(0);
        expect(entry(excluded, "exclusions").values).toHaveLength(2);
        expect(entry(entry(excluded, "exclusions").values[0], "certified").value).toBe(1n);
    });

    test("rejects midpoint loss for interval initial states in approximate solvers", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("ode");
            y := .calculus.Variable(:y);
            .ode.IVP(y,0,1:2,0:1).Euler({= steps=4 });
        `, runtime())).toThrow("requires a point initial state");
    });
});
