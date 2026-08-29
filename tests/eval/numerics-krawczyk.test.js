import { describe, expect, test } from "bun:test";
import {
    Context,
    checkKrawczykResult,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

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

describe("checked multidimensional Krawczyk boxes", () => {
    test("certifies the unique solution of an exact linear system", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            system := [x+y-3,x-y-1];
            jacobian := .calculus.JacobianResult(system,[:x,:y]);
            .numerics.Krawczyk(system,jacobian,{= x=0:3,y=0:3 },{= trace=1 });
        `, runtime());

        expect(text(entry(result, "status"))).toBe("classified");
        expect(text(entry(result, "classification"))).toBe("unique");
        expect(text(entry(result, "rootexistence"))).toBe("unique");
        expect(entry(result, "certified").value).toBe(1n);
        expect(entry(entry(result, "checker"), "accepted").value).toBe(1n);
        const axes = entry(entry(result, "box"), "axes");
        expect(entry(axes, "x").toString()).toBe("[2,2]");
        expect(entry(axes, "y").toString()).toBe("[1,1]");
        expect(entry(result, "trace").values).toHaveLength(1);
    });

    test("certifies a nonlinear root using a checked interval Jacobian", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            system := [x^2+y^2-1,x-y];
            jacobian := .calculus.JacobianResult(system,[:x,:y]);
            .numerics.Krawczyk(
                system,jacobian,{= x=(1/2):1,y=(1/2):1 },{= maxIterations=4 }
            );
        `, runtime());

        expect(text(entry(result, "classification"))).toBe("unique");
        expect(text(entry(result, "rootexistence"))).toBe("unique");
        expect(entry(entry(result, "work"), "graphevaluations").value).toBeGreaterThan(0n);
    });

    test("excludes a box when one operator coordinate is disjoint", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            system := [x^2+1,y];
            jacobian := .calculus.JacobianResult(system,[:x,:y]);
            .numerics.Krawczyk(system,jacobian,{= x=1:2,y=(-1):1 });
        `, runtime());

        expect(text(entry(result, "classification"))).toBe("excluded");
        expect(text(entry(result, "rootexistence"))).toBe("none");
        expect(entry(result, "box")).toBeNull();
        expect(entry(entry(result, "checker"), "accepted").value).toBe(1n);
    });

    test("returns a certified unresolved result for a singular midpoint preconditioner", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            system := [x^2,y];
            jacobian := .calculus.JacobianResult(system,[:x,:y]);
            .numerics.Krawczyk(system,jacobian,{= x=(-1):1,y=(-1):1 });
        `, runtime());

        expect(text(entry(result, "status"))).toBe("unknown");
        expect(text(entry(result, "classification"))).toBe("singularPreconditioner");
        expect(text(entry(result, "rootexistence"))).toBe("unproved");
        expect(entry(result, "certified").value).toBe(1n);
        expect(entry(result, "diagnostics").values.map(text)).toContain("singularMidpointJacobian");
    });

    test("rejects a changed classification during independent replay", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            system := [x+y-3,x-y-1];
            .numerics.Krawczyk(
                system,.calculus.JacobianResult(system,[:x,:y]),{= x=0:3,y=0:3 }
            );
        `, runtime());
        const changed = { ...result, entries: new Map(result.entries) };
        changed.entries.set("classification", { type: "string", value: "excluded" });

        expect(checkKrawczykResult(changed)).toMatchObject({
            accepted: false,
            certified: false,
            reason: "krawczykClaimMismatch",
        });
        const downgraded = { ...result, entries: new Map(result.entries) };
        downgraded.entries.set("certified", null);
        expect(checkKrawczykResult(downgraded)).toMatchObject({
            accepted: false,
            certified: false,
            reason: "krawczykClaimMismatch",
        });
    });
});
