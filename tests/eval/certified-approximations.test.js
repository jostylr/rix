import { describe, expect, it } from "bun:test";
import { BaseSystem, CertifiedApproximation, Integer, RationalInterval } from "@ratmath/core";
import {
    UNDECIDED,
    formatValue,
    isUndecided,
    parseAndEvaluate,
    parseAndEvaluateAsync,
    reviveDecisionValue,
    undecidedReason,
} from "../../src/index.js";
import { deepCopyValue, shallowCopyValue } from "../../src/runtime/cell.js";
import { keyOf } from "../../src/eval/functions/keyof.js";

describe("certified approximations and undecided decisions", () => {
    it("evaluates decimal, continued-fraction, and based approximation literals", () => {
        const decimal = parseAndEvaluate("23.456?789");
        expect(decimal).toBeInstanceOf(CertifiedApproximation);
        expect(decimal.enclosure.toString()).toBe("2932/125:23457/1000");
        expect(formatValue(decimal)).toBe("23.456?789");

        expect(parseAndEvaluate("3.~7~15?")).toBeInstanceOf(CertifiedApproximation);
        expect(parseAndEvaluate("0xA.B?C").enclosure.toString()).toBe("171/16:43/4");
        try {
            expect(parseAndEvaluate('0J = "0?"; 0J"??"').value).toBe(3n);
        } finally {
            BaseSystem.unregisterPrefix("J");
        }
        const roundTrip = parseAndEvaluate("x = 23.456?789; .TypeImport(.TypeExport(x))");
        expect(roundTrip.toString()).toBe("23.456?789");
    });

    it("accepts leading decimals, grouped digits, compressed runs, and no E notation", () => {
        expect(parseAndEvaluate(".123").toString()).toBe("123/1000");
        expect(parseAndEvaluate("1_000").value).toBe(1000n);
        expect(parseAndEvaluate("0.{0~7}1").toString()).toBe("1/100000000");
        expect(() => parseAndEvaluate("1E3")).toThrow();
        expect(parseAndEvaluate("1_^3").value).toBe(1000n);
    });

    it("preserves Ask and spaced infix-question syntax", () => {
        expect(parseAndEvaluate("23.456 ? 789")).toBeNull();
        expect(() => parseAndEvaluate("23.456?(1)")).toThrow(/ASK/);
    });

    it("propagates arithmetic without treating the approximation as a collection", () => {
        const result = parseAndEvaluate("23.456? + 1");
        expect(result).toBeInstanceOf(CertifiedApproximation);
        const spelling = formatValue(result);
        expect(spelling).toBe("24.456?");
        const roundTrip = parseAndEvaluate(spelling);
        expect(roundTrip).toBeInstanceOf(CertifiedApproximation);
        expect(roundTrip.enclosure.equals(result.enclosure)).toBe(true);
        expect(parseAndEvaluate("0 * 23.456?")).toBeInstanceOf(Integer);
        expect(parseAndEvaluate("(1:2) + 23.456?")).toBeInstanceOf(RationalInterval);
    });

    it("returns three-state comparison results", () => {
        expect(isUndecided(parseAndEvaluate("23.456? < 23.4565"))).toBe(true);
        expect(parseAndEvaluate("23.456? < 30").value).toBe(1n);
        expect(parseAndEvaluate("23.456? == 30")).toBeNull();
        expect(parseAndEvaluate("x := 23.456?; x == x").value).toBe(1n);
        expect(isUndecided(parseAndEvaluate(".Min(23.456?, 23.4565)") )).toBe(true);
        expect(parseAndEvaluate("[23.456?, 23.4565] |<> _")).toBe(UNDECIDED);
    });

    it("supports standalone undecided, formatting, identity copies, and keys", () => {
        const value = parseAndEvaluate("?");
        expect(value).toBe(UNDECIDED);
        expect(formatValue(parseAndEvaluate("[?, 1, _]"))).toBe("[?, 1, _]");
        expect(shallowCopyValue(value)).toBe(value);
        expect(deepCopyValue(value)).toBe(value);
        expect(keyOf(value)).toBe("?:undecided");
        expect(JSON.parse(JSON.stringify(value), reviveDecisionValue)).toBe(value);
        expect(parseAndEvaluate(".TypeImport(.TypeExport(?))")).toBe(value);
        expect(() => keyOf(parseAndEvaluate("2?"))).toThrow(/approximations/);
        expect(() => parseAndEvaluate("? + 3")).toThrow(/arithmetic/);
    });

    it("implements strong three-valued logic", () => {
        expect(parseAndEvaluate("! ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("_ && ?")).toBeNull();
        expect(parseAndEvaluate("1 && ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("1 || ?").value).toBe(1n);
        expect(parseAndEvaluate("_ || ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("? && _")).toBeNull();
        expect(parseAndEvaluate("? || 7").value).toBe(7n);
    });

    it("selects each decision branch and supplies omitted defaults", () => {
        expect(parseAndEvaluate("1 ?: 10 ?_ 20 ?? 30").value).toBe(10n);
        expect(parseAndEvaluate("_ ?: 10 ?_ 20 ?? 30").value).toBe(20n);
        expect(parseAndEvaluate("? ?: 10 ?_ 20 ?? 30").value).toBe(30n);
        expect(parseAndEvaluate("_ ?: 10")).toBeNull();
        expect(parseAndEvaluate("? ?: 10")).toBe(UNDECIDED);
    });

    it("mirrors decision conditionals and logic in async evaluation", async () => {
        expect(await parseAndEvaluateAsync("? ?: 10 ?? 30")).toEqual(new Integer(30n));
        expect(await parseAndEvaluateAsync("? && _")).toBeNull();
        expect(await parseAndEvaluateAsync("? || 4")).toEqual(new Integer(4n));
    });

    it("exposes explicit certified bounded conversions", () => {
        expect(formatValue(parseAndEvaluate("(1/7).ToDecimalApproximation(5)"))).toBe("0.14285?");
        expect(formatValue(parseAndEvaluate("(103993/33102).ToContinuedFractionApproximation(3)")))
            .toBe("3.~7~15?");
        expect(formatValue(parseAndEvaluate("(103993/33102).ToContinuedFractionString()")))
            .not.toContain("?");
        const constructed = parseAndEvaluate('.CertifiedApproximation(3/2, 1:2, {= reason=:budgetExhausted })');
        expect(constructed).toBeInstanceOf(CertifiedApproximation);
        expect(constructed.enclosure.toString()).toBe("1:2");
        expect(formatValue(parseAndEvaluate('1/97 ~> ".10"'))).toBe("0.0103092783?");
        expect(formatValue(parseAndEvaluate('103993/33102 ~> ".~3"'))).toBe("3.~7~15?");
        expect(formatValue(parseAndEvaluate('(3/2).ToContinuedFractionString({= long=1 })'))).toBe("1.~1~1");
        expect(formatValue(parseAndEvaluate('(1234567/100).ToLocaleString({= decimal=",", group=".", groupSize=3 })')))
            .toBe("12.345,67");
    });

    it("uses halos as bounded-resolution requests without fuzzy membership", () => {
        expect(parseAndEvaluate("0.54 < {~ 0.55, 0.001 }").value).toBe(1n);
        expect(parseAndEvaluate("0.55 < {~ 0.55, 0.001 }")).toBeNull();
        expect(parseAndEvaluate("0.551? ? {~ 0.55:0.56, 0.001 }").value).toBe(1n);
        expect(parseAndEvaluate("0.5495 ? {~ 0.55:0.56, 0.001 }")).toBeNull();
        const overlap = parseAndEvaluate("0.549? ? {~ 0.55:0.56, 0.001 }");
        expect(isUndecided(overlap)).toBe(true);
        expect(undecidedReason(overlap)).toBe("haloOverlap");
        expect(formatValue(overlap)).toBe("?");
        expect(undecidedReason(parseAndEvaluate("d := 0.549? ? {~ 0.55:0.56, 0.001 }; .TypeImport(.TypeExport(d))")))
            .toBe("haloOverlap");
        expect(undecidedReason(parseAndEvaluate("0.549? < {~ 0.55, 0.001 }")))
            .toBe("haloResolutionReached");
        expect(undecidedReason(parseAndEvaluate("0.549? !? {~ 0.55:0.56, 0.001 }")))
            .toBe("haloOverlap");
        expect(parseAndEvaluate(`
            provider := {= };
            provider._proto = {=
                NumericsCapabilities=(self) -> {= timeout=1, memory=2000, maxWork=3 },
                Refine=(self, request) -> {;
                    limitsMerged = request[:timeout] == 1 &&
                        request[:memory] == 1000 && request[:work][:maxWork] == 3;
                    {= interval=limitsMerged ?: 0.54:0.541 ?_ 0.549:0.551 };
                }
            };
            provider < {~ 0.55, 0.001, {= timeout=2, memory=1000, maxWork=10 } }
        `).value).toBe(1n);
    });

    it("does not accept undecided as an ordinary predicate", () => {
        expect(parseAndEvaluate("[1, 2] |>? (x) -> ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1, 2] |>/| (x) -> ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1, 2] |>#| (x) -> ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1 |+1 |? (x) -> ? |;2]")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1, 2] |>&& (x) -> ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1, 2] |>|| (x) -> ?")).toBe(UNDECIDED);
        expect(parseAndEvaluate("[1, 2] |>|| (x) -> (x == 2 ?: 1 ?? ?)").value).toBe(2n);
        expect(parseAndEvaluate("{? ? ? 1; 2 }")).toBe(UNDECIDED);
    });

    it("records unresolved tests and leaves undecided stops unresolved", () => {
        expect(parseAndEvaluate('.Stop("maybe", ?)')).toBe(UNDECIDED);
        const result = parseAndEvaluate('.Test("uncertain", {; }, [?])');
        expect(result.entries.get("passed")).toBeNull();
        expect(result.entries.get("summary").entries.get("unresolved").value).toBe(1n);
        expect(result.entries.get("results").values[0].entries.get("unresolved").value).toBe(1n);
    });

    it("stops an undecided loop before body, update, and after slots", () => {
        const result = parseAndEvaluate("count = 0; result = {@ i = 0; ?; @count += 1; i += 1; @count = 99 }; [result, count]");
        expect(result.values[0]).toBe(UNDECIDED);
        expect(result.values[1].value).toBe(0n);
    });

    it("returns unresolved from approximate assertions and function guards", () => {
        expect(parseAndEvaluate("23.456? :<: 23.4565")).toBe(UNDECIDED);
        expect(parseAndEvaluate("Guarded(x ? x < 0.55) -> x; Guarded(0.5?)")).toBe(UNDECIDED);
    });

    it("blocks multifunction fallthrough when an earlier guard is undecided", () => {
        const source = `
            Classify = {>
                (x) ?- [x < 0.55] /Below/ -> :below,
                (x) ?- [x >= 0.55] /AtOrAbove/ -> :above,
                (x) /Fallback/ -> .Error("undecided guard fell through")
            };
            [Classify(0.5), Classify(0.6), Classify(0.5?)]
        `;
        const result = parseAndEvaluate(source);
        expect(result.values[0].value).toBe("below");
        expect(result.values[1].value).toBe("above");
        expect(result.values[2]).toBe(UNDECIDED);
        expect(parseAndEvaluate("Strict(x) ?!- [x < 0.55] -> :below; Strict(0.5?)"))
            .toBe(UNDECIDED);
    });

    it("supports explicit undecided fallthrough and required-decision guards", () => {
        const source = `
            Classify = {>
                (x) ??- [x < 0.55] /Below/ -> :below,
                (x) /Fallback/ -> :fallback
            };
            Classify(0.5?)
        `;
        expect(parseAndEvaluate(source).value).toBe("fallback");
        let requiredError;
        try {
            parseAndEvaluate("Required(x) ??!- [x < {~ 0.55, 0.001 }] -> x; Required(0.549?)");
        } catch (error) {
            requiredError = error;
        }
        expect(requiredError?.message).toMatch(/remained undecided/);
        expect(undecidedReason(requiredError?.undecided)).toBe("haloResolutionReached");
        expect(parseAndEvaluate("{? 0.5? ??- x: [x < 0.55]; 7 }").value).toBe(7n);
    });
});
