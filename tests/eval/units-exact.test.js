import { describe, expect, test } from "bun:test";
import { Integer, Rational } from "@ratmath/core";
import {
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";
import { getDiagnostics } from "../../src/runtime/diagnostics.js";

function evalRiX(code, options = {}) {
    return parseAndEvaluate(code, {
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
        ...options,
    });
}

function rationalParts(value) {
    if (value instanceof Integer) return [value.value, 1n];
    if (value instanceof Rational) return [value.numerator, value.denominator];
    throw new Error(`Expected exact rational, got ${formatValue(value)}`);
}

describe("RiX collection registries", () => {
    test(".Units and .Exact are ordinary RiX maps", () => {
        const units = evalRiX(".Units");
        const exact = evalRiX(".Exact");
        expect(units.type).toBe("map");
        expect(exact.type).toBe("map");
        expect(units.entries.get("m")?.type).toBe("unit");
        expect(exact.entries.get("pi")?.type).toBe("exact_generator");
    });

    test("a host can replace the canonical RiX registry collections", () => {
        const baseSystem = createDefaultSystemContext();
        const onlyMeters = {
            type: "map",
            entries: new Map([["m", baseSystem.get("UNITS").value.entries.get("m")]]),
        };
        const customSystem = createDefaultSystemContext({ units: onlyMeters });
        expect(formatValue(evalRiX("2~[m]", { systemContext: customSystem }))).toBe("2~[m]");
        expect(() => evalRiX("2~[s]", { systemContext: customSystem })).toThrow(/unknown unit/i);
    });

    test("registry entries have stable RiX map keys", () => {
        expect(evalRiX("u := .Units[:m]; d := {= (u)=7 }; d[u]").toString()).toBe("7");
        expect(evalRiX("p := .Exact[:pi]; d := {= (p)=9 }; d[p]").toString()).toBe("9");
    });

    test("lexical registry overlays are used by sugar", () => {
        const value = evalRiX("Exact := .Exact.Merge({= tau=2*.Exact[:pi] }); 3~{tau}");
        expect(formatValue(value)).toBe("6~{pi}");
    });
});

describe("physical unit values", () => {
    test("explicit multiplication and scientific sugar create equivalent quantities", () => {
        const explicit = evalRiX("m := .Units[:m]; 3*m");
        const sugar = evalRiX("3~[m]");
        expect(explicit.type).toBe("quantity");
        expect(formatValue(explicit)).toBe("3~[m]");
        expect(formatValue(sugar)).toBe("3~[m]");
        expect(explicit.baseMagnitude.equals(sugar.baseMagnitude)).toBe(true);
    });

    test("unit values construct quantities when called", () => {
        expect(formatValue(evalRiX(".Units[:m](3)"))).toBe("3~[m]");
        expect(formatValue(evalRiX("m := .Units[:m]; m(3)"))).toBe("3~[m]");
    });

    test("compound, derived, and inverse units compose through arithmetic", () => {
        expect(formatValue(evalRiX("9~[m] / 3~[s]"))).toBe("3~[m/s]");
        expect(formatValue(evalRiX("3 / .Units[:m]"))).toBe("3~[1/m]");
        expect(formatValue(evalRiX("1~[N] + 1~[kg*m/s^2]"))).toBe("2~[N]");
        expect(formatValue(evalRiX("5~[m] / 2~[m]"))).toBe("2..1/2");
    });

    test("compatible addition converts to and preserves the left display unit", () => {
        expect(formatValue(evalRiX("60~[s] + 2~[min]"))).toBe("180~[s]");
        expect(formatValue(evalRiX("2~[min] + 60~[s]"))).toBe("3~[min]");
    });

    test("equality and ordering normalize compatible quantities", () => {
        expect(evalRiX("1~[m] == 100~[cm]")).toBeInstanceOf(Integer);
        expect(evalRiX("1~[m] != 100~[cm]")).toBe(null);
        expect(evalRiX("1~[m] < 2~[m]")).toBeInstanceOf(Integer);
        expect(evalRiX(".Units[:N] == .Units[:kg] * .Units[:m] / .Units[:s]^2")).toBeInstanceOf(Integer);
        expect(() => evalRiX("1~[m] < 2~[s]")).toThrow(/incompatible.*ordering/i);
    });

    test("implicit compatible conversion can emit an opt-in warning", () => {
        const context = new Context();
        context.setEnv("warnings", { implicitUnitConversion: true });
        evalRiX("60~[s] + 2~[min]", { context });
        const warning = getDiagnostics(context).events.at(-1);
        expect(warning.entries.get("label").value).toBe("Implicit unit conversion");
        expect(warning.entries.get("data").entries.get("from").value).toBe("min");
        expect(warning.entries.get("data").entries.get("to").value).toBe("s");
    });

    test("incompatible addition and conversion fail with dimensions in the error", () => {
        expect(() => evalRiX("1~[m] + 1~[s]")).toThrow(/incompatible.*Length.*Time/i);
        expect(() => evalRiX('.ConvertUnit(1~[m], "s")')).toThrow(/incompatible.*Length.*Time/i);
        expect(() => evalRiX("1~[unknownUnit]")).toThrow(/unknown unit/i);
    });

    test("explicit conversion accepts a unit value or unit expression string", () => {
        expect(formatValue(evalRiX(".ConvertUnit(90~[s], .Units[:min])"))).toBe("1..1/2~[min]");
        expect(formatValue(evalRiX('.ConvertUnit(36~[km/h], "m/s")'))).toBe("10~[m/s]");
    });

    test("affine unit calls and conversions preserve exact values", () => {
        const c = evalRiX(".Units[:degC](20)");
        expect(formatValue(c)).toBe("20~[degC]");
        expect(formatValue(evalRiX(".ConvertUnit(.Units[:degC](20), .Units[:degF])"))).toBe("68~[degF]");
        expect(() => evalRiX(".Units[:degC] * .Units[:m]")).toThrow(/affine unit.*compound/i);
        expect(() => evalRiX(".Units[:degC](20) + .Units[:degC](10)")).toThrow(/affine quantity points/i);
        expect(formatValue(evalRiX(".Units[:degC](20) - .Units[:degC](10)"))).toBe("10~[deltaDegC]");
    });

    test("a local Units overlay can add a unit derived from a quantity", () => {
        const value = evalRiX(`
            fortnight := .DefineUnit(:fortnight, 14 * .Units[:day]);
            Units := .Units.Merge({= fortnight=fortnight });
            .ConvertUnit(1~[fortnight], .Units[:day])
        `);
        expect(formatValue(value)).toBe("14~[day]");
    });
});

describe("exact generators", () => {
    test("mathematical sugar and explicit generators are the same exact expression", () => {
        expect(formatValue(evalRiX("3~{pi}"))).toBe("3~{pi}");
        expect(formatValue(evalRiX("3 * .Exact[:pi]"))).toBe("3~{pi}");
        expect(formatValue(evalRiX(".Exact[:pi](3)"))).toBe("3~{pi}");
    });

    test("known algebraic relations reduce exactly", () => {
        const i2 = evalRiX(".Exact[:i]^2");
        const r2 = evalRiX(".Exact[:sqrt2]^2");
        expect(rationalParts(i2)).toEqual([-1n, 1n]);
        expect(rationalParts(r2)).toEqual([2n, 1n]);
    });

    test("sums and products retain canonical sparse terms", () => {
        expect(formatValue(evalRiX("1 + 3~{sqrt2}"))).toBe("1 + 3~{sqrt2}");
        expect(formatValue(evalRiX(".Exact[:pi] * .Exact[:sqrt2]"))).toBe("1~{pi*sqrt2}");
    });

    test("exact expressions can be physical quantity magnitudes", () => {
        const value = evalRiX("1/2~{pi}~[rad]");
        expect(value.type).toBe("quantity");
        expect(formatValue(value)).toBe("1/2~{pi}~[rad]");
    });

    test("new algebraic generators can be stored in a lexical Exact collection", () => {
        const value = evalRiX(`
            sqrt3 := .DefineExactGenerator(:sqrt3, [-3, 0, 1]);
            Exact := .Exact.Merge({= sqrt3=sqrt3 });
            1~{sqrt3}^2
        `);
        expect(rationalParts(value)).toEqual([3n, 1n]);
    });
});
