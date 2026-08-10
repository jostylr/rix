import { describe, expect, test } from "bun:test";
import { explainRixScopes, lintRix, parseAndEvaluate } from "../../src/index.js";

function codes(source) {
    return lintRix(source).map(({ code }) => code);
}

describe("RiX static lint diagnostics", () => {
    test("distinguishes missing and spurious outer capture", () => {
        const missing = lintRix("x = 5; {; x; };");
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatchObject({ code: "RX1001", severity: "warning" });
        expect(missing[0].hint).toContain("@x");

        const spurious = lintRix("{; x = 5; @x; };");
        expect(spurious).toHaveLength(1);
        expect(spurious[0]).toMatchObject({ code: "RX1002", severity: "warning" });
        expect(spurious[0].hint).toContain("Remove '@'");

        expect(codes("F(x)->x+1; {; G=F; };" )).toContain("RX1001");
        expect(codes("F(x)->x+1; {; F(2); };" )).not.toContain("RX1001");
    });

    test("understands loop locals, body locals, and enclosing captures", () => {
        const source = `
            values = [1,2,3];
            total = 0;
            {@ index = 1; index <= @values.Len(); {;
                item = @values[index];
                @total += @item * @index;
            }; index += 1 };
        `;
        const diagnostics = lintRix(source);
        expect(diagnostics.filter(({ code }) => code === "RX1002").map(({ message }) => message))
            .toEqual(expect.arrayContaining([
                expect.stringContaining("@item"),
                expect.stringContaining("@index"),
            ]));
        expect(diagnostics.some(({ message }) => message.includes("@values"))).toBe(false);
        expect(diagnostics.some(({ message }) => message.includes("@total"))).toBe(false);
    });

    test("warns about numeric decisions and undecided fallthrough", () => {
        expect(codes("F = (value, subtract ?= 0) -> subtract ?: -value ?_ value;"))
            .toContain("RX1101");
        expect(codes("x := 0.5?; x < 0.55 ?: :below ?_ :above;"))
            .toContain("RX1102");
        expect(codes("x := 0.5?; x < 0.55 ?: :below ?_ :above ?? :refine;"))
            .not.toContain("RX1102");
    });

    test("recognizes statically known immutable update targets", () => {
        const diagnostics = lintRix("x := .ImmutableValue({= n=1 }); x ~= {= n=2 };");
        expect(diagnostics.find(({ code }) => code === "RX1201")?.message).toContain("appears immutable");

        const polynomial = lintRix("p := `x^2`.P(); p ~= `x`.P();");
        expect(polynomial.some(({ code }) => code === "RX1201")).toBe(true);
    });

    test("reports shadowing and capture-dense lazy branches", () => {
        expect(codes("x=1; 1 ?: {; x=2; x; } ?_ _;" )).toContain("RX1302");
        const dense = lintRix("a=1;b=2;c=3;d=4; 1 ?: {; @a+@b+@c+@d+@a; } ?_ _;");
        expect(dense.find(({ code }) => code === "RX2001")).toMatchObject({ severity: "info" });
    });

    test("corrected translation patterns stay clean", () => {
        const source = `
            WeightedSum = values -> {;
                total := 0;
                {@ index = 1; index <= @values.Len(); {;
                    item = @values[index];
                    @total += item * index;
                }; index += 1 };
                total;
            };
        `;
        expect(lintRix(source).filter(({ severity }) => severity !== "info")).toEqual([]);
    });

    test("explains identifier ownership for editor and CLI consumers", () => {
        const scopes = explainRixScopes("value=1; {; local=2; value+local; @local; };");
        expect(scopes.find(({ name, status }) => name === "value" && status === "capture-required"))
            .toMatchObject({ owner: "root", recommendation: "@value" });
        expect(scopes.find(({ name, status }) => name === "local" && status === "current"))
            .toMatchObject({ owner: "block", access: "bare" });
        expect(scopes.find(({ name, status }) => name === "local" && status === "spurious-outer"))
            .toMatchObject({ recommendation: "local" });
    });
});

describe("RiX actionable runtime diagnostics", () => {
    test("suggests capture direction and records the selected branch", () => {
        expect(() => parseAndEvaluate("x = 5; 1 ?: {; x; } ?_ _;"))
            .toThrow(/RX1001[\s\S]*while evaluating '\?:' branch/);
        expect(() => parseAndEvaluate("{; x = 5; @x; };"))
            .toThrow(/RX1002: 'x' belongs to the current scope/);
    });

    test("records loop phase and iteration on a lazy failure", () => {
        expect(() => parseAndEvaluate("{@ i=0; i<1; missing; i+=1 };"))
            .toThrow(/while evaluating loop body, iteration 1/);
    });

    test("explains immutable identity-preserving updates", () => {
        expect(() => parseAndEvaluate("x := .ImmutableValue({= n=1 }); x ~= {= n=2 };"))
            .toThrow(/RX1201: '~=' preserves cell identity/);
    });
});
