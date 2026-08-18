import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (value) => value.values.map((item) => String(item));

describe("semantic RationalFunction plugin", () => {
    test("is opt-in, loads Polynomial transitively, and exposes aliases", () => {
        expect(() => parseAndEvaluate(".ratfun([1], [1, 1])")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            A := .ratfun(.p\`x + 1\`, .p\`x - 1\`);
            B := .rationalFunction(.p\`x + 1\`, .p\`x - 1\`);
            C := .rf(.p\`x + 1\`, .p\`x - 1\`);
            [A(3), B(3), C(3)];
        `);
        expect(strings(result)).toEqual(["2", "2", "2"]);
    });

    test("supports backtick labels, symbolic and structural .R conversion, and records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            A := .rf\`(x^2 - 1)/(x - 1)\`;
            B := \`.ratfun.Var(t):(t^2 - 4)/(t - 2)\`;
            C := ({#u# (u^2 - 9)/(u - 3)}).R();
            D := (\`(z^2 - 16)/(z - 4)\`).R(:z);
            Copy := .ratfun(A.Record());
            [A(5), B(5), C(5), D(5), Copy(5), A.Record().Get("schema"), B.Variable()];
        `);
        expect(strings(result)).toEqual(["6", "7", "8", "9", "6", "[object Object]", "[object Object]"]);
        expect(result.values[5].value).toBe("rix.rational-function@1");
        expect(result.values[6].value).toBe("t");
    });

    test("canonicalizes to coprime expanded polynomials with monic denominator", () => {
        const rationalFunction = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(2x^3 - 2x)/(4x^2 - 4)\`;
            R;
        `);
        expect(rationalFunction.type).toBe("lambda");
        expect(rationalFunction._ext.get("schema").value).toBe("rix.rational-function@1");
        expect(rationalFunction._ext.get("variable").value).toBe("x");
        expect(rationalFunction._ext.get("canonical").value).toBe(1n);
        expect(rationalFunction._ext.get("equalitypolicy").value).toBe("canonicalReducedFractionField");
        expect(rationalFunction._ext.get("domainpolicy").value).toBe("reducedDenominatorNonzero");
        expect(rationalFunction._ext.get("__type").value).toBe("RationalFunction");
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(2x^3 - 2x)/(4x^2 - 4)\`;
            [R.Numerator().Coefficients(), R.Denominator().Coefficients(), R(3), R == .rf\`x/2\`];
        `);
        expect(result.values[0].values.map(String)).toEqual(["1/2", "0"]);
        expect(result.values[1].values.map(String)).toEqual(["1"]);
        expect(String(result.values[2])).toBe("3/2");
        expect(result.values[3]).toBeInstanceOf(Integer);
        expect(result.values[3].value).toBe(1n);
    });

    test("does not confuse unequal canonical rational functions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            A := .rf\`(2*x+3)/(x^2-1)\`;
            B := .rf\`(2*x+4)/(x^2-1)\`;
            [A == B, A != B, A == .rf\`(2*x+3)/(x^2-1)\`];
        `);
        expect(result.values[0]).toBeNull();
        expect(String(result.values[1])).toBe("1");
        expect(String(result.values[2])).toBe("1");
    });

    test("promotes Polynomial division and closes ordinary field operations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            P := .p\`x^2 - 1\`;
            Q := .p\`x - 1\`;
            R := P/Q;
            S := 1/Q;
            A := R + S;
            B := R*S;
            C := S/R;
            D := Q^-2;
            E := -S;
            [R(2), A(2), B(2), C(2), D(2), E(2), R.IsPolynomial(), R.ToPolynomial()(4)];
        `);
        expect(strings(result)).toEqual(["3", "4", "3", "1/3", "1", "-1", "1", "5"]);
    });

    test("composes RationalFunctions with Polynomials and other RationalFunctions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(x + 1)/(x - 1)\`;
            P := .p\`x^2\`;
            Q := .rf\`1/x\`;
            A := R(P);
            B := R.Compose(Q);
            [A(2), B(2), A.RationalFunction() == .rf\`(x^2 + 1)/(x^2 - 1)\`];
        `);
        expect(strings(result)).toEqual(["5/3", "-3", "1"]);
    });

    test("uses reduced fraction-field domains and rejects zero denominators", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(x^2 - 1)/(x - 1)\`;
            D := R.Domain();
            [R(1), D.Get("condition"), D.Get("cancelledInputRestrictionsPreserved")];
        `);
        expect(String(result.values[0])).toBe("2");
        expect(result.values[1].value).toBe("reduced denominator != 0");
        expect(result.values[2].value).toBe(0n);
        expect(() => parseAndEvaluate('.Plugin.Load("ratfun"); .rf`1/0`')).toThrow("zero");
        expect(() => parseAndEvaluate('.Plugin.Load("ratfun"); R:=.rf`1/x`; R.ToPolynomial()')).toThrow("denominator 1");
    });

    test("algebra loads ratfun and reactive dependency chains rebuild canonical values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            $$y := 2;
            $$P := \`.p.Var(x):x + @($y)\`;
            Q := .p\`x - 1\`;
            $$R := $P/Q;
            $$S := $R + 1/Q;
            before := [$R(3), $S(3)];
            $y := 4;
            after := [$R(3), $S(3)];
            [before, after];
        `);
        expect(result.values.map(strings)).toEqual([["5/2", "3"], ["7/2", "4"]]);
    });

    test("builds verified together and factored presentation round trips", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`6*(x-2)^3*(x+1)/((x-3)^2*(x^2+1))\`;
            together := R.Together();
            factored := R.Factored();
            [
                R.CoefficientDomain()[:id], R.CoefficientDomain()[:exact],
                together[:schema], together.Expand() == R,
                .ratfun.Expand(together.Record()) == R,
                factored[:schema], factored[:complete], factored[:verified],
                factored[:numerator][:factors].Map((entry)->[entry[:root],entry[:multiplicity]]),
                factored[:denominator][:factors].Map((entry)->[entry[:root],entry[:multiplicity]]),
                factored[:denominator][:residual].Coefficients(),
                .ratfun.Expand(factored.Record()) == R
            ];
        `);
        expect(result.values.slice(0, 8).map((value) => String(value?.value ?? value))).toEqual([
            "Q", "1", "rix.rational-function.together@1", "1", "1",
            "rix.rational-function.factored@1", "0", "1",
        ]);
        expect(result.values[8].values.map((entry) => entry.values.map(String))).toEqual([["-1", "1"], ["2", "3"]]);
        expect(result.values[9].values.map((entry) => entry.values.map(String))).toEqual([["3", "2"]]);
        expect(result.values[10].values.map(String)).toEqual(["1", "0", "1"]);
        expect(String(result.values[11])).toBe("1");

        expect(() => parseAndEvaluate(`
            .Plugin.Load("ratfun");
            view := (.rf\`(x+1)/(x-1)\`).Together().Record();
            .ratfun.Expand(view.Set("numerator", .poly([1,2]).Record()));
        `)).toThrow("failed exact reconstruction verification");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("ratfun");
            view := (.rf\`(x+1)/(x-1)\`).Factored().Record();
            .ratfun.Expand(view.Set("coefficientdomain", :R));
        `)).toThrow("requires coefficient domain :Q");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("ratfun");
            record := (.rf\`(x+1)/(x-1)\`).Record().Set("coefficientdomain", :R);
            .ratfun(record);
        `)).toThrow("records require coefficient domain :Q");
    });

    test("computes exact partial fractions with polynomial, repeated, and residual parts", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            simple := (.rf\`(2*x+3)/(x^2-1)\`).PartialFractions();
            repeated := (.rf\`(x+2)/((x-1)^2)\`).PartialFractions();
            mixedSource := .rf\`(x^5+x^3+2*x+1)/((x-1)^2*(x^2+1))\`;
            mixed := mixedSource.PartialFractions();
            irreducible := (.rf\`(x+1)/(x^2+1)\`).PartialFractions();
            polynomial := (.rf\`x^2+1\`).PartialFractions();
            [
                simple[:terms].Map((term)->[term[:root],term[:power],term[:coefficient]]),
                simple.Expand() == .rf\`(2*x+3)/(x^2-1)\`,
                repeated[:terms].Map((term)->[term[:root],term[:power],term[:coefficient]]),
                mixed[:polynomialPart].Coefficients(),
                mixed[:terms].Map((term)->[term[:root],term[:power],term[:coefficient]]),
                mixed[:residual][:numerator].Coefficients(), mixed[:residual][:denominator].Coefficients(),
                mixed[:linearComplete], .ratfun.Expand(mixed.Record()) == mixedSource,
                irreducible[:terms].Len(), irreducible[:residual][:numerator].Coefficients(),
                irreducible[:residual][:denominator].Coefficients(), irreducible[:linearComplete],
                polynomial[:polynomialPart].Coefficients(), polynomial[:terms].Len(), polynomial.Expand() == .rf\`x^2+1\`
            ];
        `);
        expect(result.values[0].values.map((entry) => entry.values.map(String))).toEqual([
            ["-1", "1", "-1/2"], ["1", "1", "5/2"],
        ]);
        expect(String(result.values[1])).toBe("1");
        expect(result.values[2].values.map((entry) => entry.values.map(String))).toEqual([
            ["1", "1", "1"], ["1", "2", "3"],
        ]);
        expect(result.values[3].values.map(String)).toEqual(["1", "2"]);
        expect(result.values[4].values.map((entry) => entry.values.map(String))).toEqual([
            ["1", "1", "5/2"], ["1", "2", "5/2"],
        ]);
        expect(result.values[5].values.map(String)).toEqual(["1/2", "-1"]);
        expect(result.values[6].values.map(String)).toEqual(["1", "0", "1"]);
        expect(result.values.slice(7, 10).map(String)).toEqual(["0", "1", "0"]);
        expect(result.values[10].values.map(String)).toEqual(["1", "1"]);
        expect(result.values[11].values.map(String)).toEqual(["1", "0", "1"]);
        expect(String(result.values[12])).toBe("0");
        expect(result.values[13].values.map(String)).toEqual(["1", "0", "1"]);
        expect([String(result.values[14]), String(result.values[15])]).toEqual(["0", "1"]);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("ratfun");
            view := (.rf\`(2*x+3)/(x^2-1)\`).PartialFractions().Record();
            term := view[:terms][1].Set("coefficient", -1);
            .ratfun.Expand(view.Set("terms", view[:terms].Set(1,term)));
        `)).toThrow("failed exact reconstruction verification");
    }, 20000);

    test("returns exact reduced pole and zero multiplicity evidence", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            source := .rf\`6*(x-2)^3*(x+1)/((x-3)^2*(x^2+1))\`;
            evidence := source.PoleZeroEvidence();
            cancelled := (.rf\`(x^2-1)/(x-1)\`).PoleZeroEvidence();
            zero := (.rf\`0\`).PoleZeroEvidence();
            [
                evidence[:schema], evidence[:verified], evidence[:coprime],
                evidence[:zeros][:entries].Map((entry)->[entry[:point],entry[:multiplicity]]),
                evidence[:zeros][:complete], evidence[:poles][:entries].Map((entry)->[entry[:point],entry[:multiplicity]]),
                evidence[:poles][:complete], evidence[:poles][:residual].Coefficients(),
                evidence[:cancelledSourceRestrictionsPreserved],
                cancelled[:zeros][:entries].Map((entry)->entry[:point]), cancelled[:poles][:entries].Len(),
                zero[:zeros][:status], zero[:zeros][:complete], zero[:poles][:complete]
            ];
        `);
        expect(result.values.slice(0, 3).map((value) => String(value?.value ?? value))).toEqual(["rix.rational-function.divisor-evidence@1", "1", "1"]);
        expect(result.values[3].values.map((entry) => entry.values.map(String))).toEqual([["-1", "1"], ["2", "3"]]);
        expect(String(result.values[4])).toBe("1");
        expect(result.values[5].values.map((entry) => entry.values.map(String))).toEqual([["3", "2"]]);
        expect(String(result.values[6])).toBe("0");
        expect(result.values[7].values.map(String)).toEqual(["1", "0", "1"]);
        expect(String(result.values[8])).toBe("0");
        expect(result.values[9].values.map(String)).toEqual(["-1"]);
        expect(String(result.values[10])).toBe("0");
        expect(result.values[11].value).toBe("identicallyZero");
        expect([String(result.values[12]), String(result.values[13])]).toEqual(["0", "1"]);
    });

    test("records explicit transformation provenance", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(x+1)/(x-1)\`;
            S := R - 1;
            C := R.Compose(.rf\`1/x\`);
            P := R.PartialFractions();
            [S.provenance[1][:schema], S.provenance[1][:operation],
             C.provenance[1][:operation], P[:provenance][1][:operation],
             P.Record()[:provenance][1][:operation]];
        `);
        expect(result.values.map((value) => value.value)).toEqual([
            "rix.algebra.transformation@1", "subtract", "compose", "partialFractions", "partialFractions",
        ]);
    });
});
