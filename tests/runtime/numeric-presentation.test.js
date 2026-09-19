import { describe, expect, test } from "bun:test";
import { Integer, Rational, RationalInterval, Fraction, CertifiedApproximation } from "@ratmath/core";
import { createNumericPolicy, presentNumericValue, withNumericPresentation } from "../../src/runtime/numeric-presentation.js";
import { encodeOutputJSON, decodeOutputJSON } from "../../src/runtime/output-json.js";
const r = (n,d=1) => new Rational(BigInt(n),BigInt(d));
const display = (value,policy) => presentNumericValue(value,policy).text;

describe("shared exact numeric presentation", () => {
    test("mixed and formal fractions preserve exact sources and unreduced parentage", () => {
        expect(display(r(-7,3),{fraction:"mixed"})).toBe("-2..1/3");
        const formal=new Fraction(2000n,4000n);
        expect(display(formal,{notation:"decimal",fraction:"mixed"})).toBe("2000/4000");
        const shown=presentNumericValue(formal,{locale:"de-DE",grouping:true});
        expect(shown.value).toBe(formal);
        expect(shown.source).toBe("2000/4000");
        expect(shown.text).toBe("2.000/4.000");
    });
    test("decimal rounding uses integer arithmetic and tie-to-even for both signs", () => {
        const p={notation:"decimal",decimalPlaces:2};
        expect(display(r(1,8),p)).toBe("≈ 0.12");
        expect(display(r(3,8),p)).toBe("≈ 0.38");
        expect(display(r(-1,8),p)).toBe("≈ -0.12");
        expect(display(r(-1,8),{...p,rounding:"floor"})).toBe("≈ -0.13");
        expect(display(r(-1,8),{...p,rounding:"ceil"})).toBe("≈ -0.12");
        expect(display(r(1,4),p)).toBe("0.25");
        expect(display(r(1,3),p)).toBe(display(r(334,1000),p));
        expect(presentNumericValue(r(1,3),p).source).not.toBe(presentNumericValue(r(334,1000),p).source);
    });
    test("huge rationals and exponent carries never pass exact values through Number", () => {
        const huge=10n**1000n;
        expect(display(r(huge+1n,huge),{notation:"scientific",significantDigits:5})).toBe("≈ 1.0000E+0");
        expect(display(r(huge,3),{notation:"scientific",significantDigits:3})).toBe("≈ 3.33E+999");
        expect(display(r(99999,10000),{notation:"scientific",significantDigits:3})).toBe("≈ 1.00E+1");
        expect(display(r(99999,100),{notation:"engineering",significantDigits:3})).toBe("≈ 1.00E+3");
        expect(display(r(999999999999999999n,100000000000000000n),{notation:"scientific",significantDigits:18})).toBe("9.99999999999999999E+0");
    });
    test("bounded repeating notation is exact or explicitly exhausted", () => {
        expect(display(r(1,6),{notation:"repeating"})).toBe("0.1#6");
        expect(display(r(1,3),{notation:"repeating",maxPeriod:1})).toBe("0.#3");
        expect(display(r(1,7),{notation:"repeating",maxPeriod:2,significantDigits:3})).toBe("≈ 0.143 [period limit]");
        expect(display(r(123456,100),{notation:"decimal",decimalPlaces:2,locale:"de-DE",grouping:true})).toBe("1.234,56");
    });
    test("outward decimal endpoints preserve both interval orders", () => {
        for (let n=-20;n<=20;n++) for (const reverse of [false,true]) {
            const low=r(n,7),high=r(n+1,7),interval=new RationalInterval(reverse?high:low,reverse?low:high);
            const result=presentNumericValue(interval,{notation:"decimal",decimalPlaces:2});
            const [start,end]=result.text.replace(/^≈ /,"").split(":").map(s=>new Rational(s));
            expect((reverse?end:start).lessThanOrEqual(low)).toBe(true);
            expect((reverse?start:end).greaterThanOrEqual(high)).toBe(true);
            expect(result.value).toBe(interval);
            expect(result.orientation).toBe(reverse?"descending":"ascending");
        }
        const narrow=new RationalInterval(r(1,3),r(1001,3000));
        expect(display(narrow,{notation:"decimal",decimalPlaces:2})).toBe("≈ 0.33:0.34");
    });
    test("certification, approximation and import policy remain separate from source", () => {
        const value=new CertifiedApproximation(r(1,3),new RationalInterval(r(33,100),r(34,100)));
        expect(display(value,{notation:"decimal",decimalPlaces:2})).toContain("certified enclosure 0.33:0.34");
        expect(presentNumericValue(0.5).evidence).toBe("approximate-input");
        const shown=withNumericPresentation(r(1,3),{notation:"decimal",decimalPlaces:2});
        const loaded=decodeOutputJSON(encodeOutputJSON(shown)).value;
        expect(loaded.value.equals(r(1,3))).toBe(true);
        expect(loaded.numericPolicy).toEqual(shown.numericPolicy);
        expect(()=>createNumericPolicy({significantDigits:100000})).toThrow("within");
        expect(()=>createNumericPolicy({locale:"unrecognized"})).toThrow("locale");
        expect(()=>createNumericPolicy({surprise:1})).toThrow("unknown");
        expect(()=>presentNumericValue(Infinity)).toThrow("nonfinite");
        expect(()=>encodeOutputJSON({...shown,numericPolicy:{schema:"future"}})).toThrow("version");
    });
});
