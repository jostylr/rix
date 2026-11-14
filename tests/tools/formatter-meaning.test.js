import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.js";
import { formatRix } from "../../src/tools/language-service/formatter.js";

const meaning = (source) => JSON.stringify(parse(source), (key, value) => (
    key === "pos" || key === "original" || key === "endsLineAt" || key === "unspacedIntervalOperands"
    || (key === "end" && typeof value === "number") ? undefined : value
));

describe("the formatter never changes what source means", () => {
    const cases = [
        ["1/2x;", "1/2x;"],
        ["2x/3y;", "2x/3y;"],
        ["1/2 x;", "1/2 x;"],
        ["2x*3y;", "2x * 3y;"],
        ["3x^2+1;", "3x^2 + 1;"],
        ["F(3) (3, 4);", "F(3) (3, 4);"],
        ["x * 2 [1, 2];", "x * 2 [1, 2];"],
        ["eps := 10^-20;", "eps := 10^-20;"],
        ["q := 3~[m*s] * 2~[s];", "q := 3~[m*s] * 2~[s];"],
        ["c := {& ::b == ::a-0 & ::b==::a };", "c := {& ::b == ::a - 0 & ::b == ::a };"],
        ['Mixed(x) -> x _> "..";', 'Mixed(x) -> x _> "..";'],
        ['m := {= mode=":=" };', 'm := {= mode = ":=" };'],
        ["e := {;  };", "e := {; };"],
        ["[-2, 3] |>> {> (x) ?- [x < 0] -> -x, (x) -> x };", "[-2, 3]\n    |>> {> (x) ?-[x < 0] -> -x, (x) -> x };"],
        ["G({#x});", "G({#x});"],
        ["{@ i := 0; i < 9; {!@ i}; i += 1 };", "{@ i := 0; i < 9; {!@ i }; i += 1 };"],
        ["[ ! ?, ? && _ ];", "[! ?, ? && _];"],
        ["x := 1 ##@ == 1\ny := 2 ##@ == 2", "x := 1 ##@ == 1\ny := 2 ##@ == 2"],
        ["v := 3 ##@ == {: 1, 2, 3, 4 };", "v := 3 ##@ == {: 1, 2, 3, 4 };"],
        ["s := @@source;", "s := @@source;"],
    ];
    for (const [source, expected] of cases) {
        test(JSON.stringify(source), () => {
            for (const profile of ["readable", "compact"]) {
                const formatted = formatRix(source, { profile });
                expect(meaning(formatted)).toBe(meaning(source));
                expect(formatRix(formatted, { profile })).toBe(formatted);
            }
            expect(formatRix(source, { profile: "compact" })).toBe(`${expected}\n`);
        });
    }

    test("a statement the layout cannot keep is left as written", () => {
        // `.Units`-style unit text is read verbatim; even if a future layout
        // rule touched it, the result is checked against the original parse.
        const source = "a := 1;\nb := 3~[m/s^2];\n";
        expect(meaning(formatRix(source))).toBe(meaning(source));
    });
});
