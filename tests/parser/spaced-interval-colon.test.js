import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { lintRix } from "../../src/eval/lint.js";
import { parse } from "../../src/parser/parser.js";
import { formatRix } from "../../src/tools/language-service/formatter.js";

const text = (code) => formatValue(parseAndEvaluate(code));
const codes = (code) => lintRix(code).map(({ code: id }) => id);
const shape = (code) => JSON.stringify(parse(code), (key, value) => (key === "pos" || key === "original" || key === "unspacedIntervalOperands" ? undefined : value));

describe("an unspaced interval colon is one operand for spaced operators", () => {
    test("spaced arithmetic combines whole intervals", () => {
        expect(text("1:2 + 1:2")).toBe("2:4");
        expect(text("1:2 + 3:4")).toBe("4:6");
        expect(text("1:2 - 1:2")).toBe("-1:1");
        expect(text("1:2 * 2")).toBe("2:4");
        expect(text("2 * 1:2")).toBe("2:4");
        expect(text("1:2 + 3")).toBe("4:5");
        expect(text("1:2 * 3:4")).toBe("3:8");
        expect(text("-1:1 ^ 2")).toBe("0:1");
        expect(text("(1:2) / 2:4")).toBe("1/4:1");
        expect(text("x := 1:2 + 1; x")).toBe("2:3");
    });

    test("fraction endpoints stay inside the interval", () => {
        expect(text("1/2:3/4")).toBe("1/2:3/4");
        expect(text("2 * 1/2:3/4")).toBe("1:1..1/2");
        expect(text("1/2:3/4 + 1")).toBe("1..1/2:1..3/4");
    });

    test("unspaced arithmetic beside a single colon stays on the endpoint", () => {
        expect(text("n := 3; 1:n+1")).toBe("1:4");
        expect(text("n := 3; 1+1:n")).toBe("2:3");
        expect(text("1:2*2")).toBe("1:4");
        expect(text("xs := [10, 20, 30, 40]; n := 2; xs[1:n+1]")).toBe("[10, 20, 30]");
        expect(text("xs := [10, 20, 30, 40]; n := 2; xs[n-1:n+1]")).toBe("[10, 20, 30]");
    });

    test("spaced colons keep the low precedence, so endpoints can hold arithmetic", () => {
        expect(text("1: 2+3 :4")).toBe("_");
        expect(text("1: 2+1 :4")).toBe("1");
        expect(text("1 : 2 + 3")).toBe("1:5");
        expect(text("1: 2 + 3")).toBe("1:5");
    });

    test("betweenness chains and fraction midpoints are unchanged", () => {
        expect(text("1:5:4")).toBe("_");
        expect(text("0:1/2:1")).toBe("1");
        expect(text("1:2:3")).toBe("1");
    });

    test("comparisons, assignments and lambdas see the interval as before", () => {
        expect(text("1:2 < 3")).toBe("1");
        expect(shape("x->x:y + 1;")).toBe(shape("x -> x:y + 1;"));
        expect(shape("x->x:y + 1;")).not.toBe(shape("x->x:y+1;"));
        expect(shape("a:b==c:d;")).toBe(shape("a:b == c:d;"));
    });

    test("fully unspaced arithmetic between two intervals combines them and is linted", () => {
        expect(text("1:2+3:4")).toBe("4:6");
        expect(text("1:2-3:4")).toBe("-3:-1");
        expect(text("1:2*3:4")).toBe("3:8");
        expect(shape("1:2+3+4:5;")).toBe(shape("1:2 + 3 + 4:5;"));
        expect(codes("a := 1:2+3:4;")).toContain("RX1710");
        expect(codes("a := 1:2*3:4;")).toContain("RX1710");
        expect(codes("a := 1:2 + 3:4; b := 1: 2+3 :4; n := 3; c := 1:n+1; d := 0:1/2:1;")).not.toContain("RX1710");
    });

    test("brackets are single items in a run and parse their own contents", () => {
        expect(text("(1:2)+3")).toBe("4:5");
        expect(text("F(i) -> i + 1; F(1:2 + 3:4)")).toBe("5:7");
        expect(text("[1:2 + 1, 3:4][1]")).toBe("2:3");
    });
});

describe("the formatter keeps the spacing that an interval colon depends on", () => {
    const sources = [
        "a := 1:2+3:4;", "b := 1:2 + 3:4;", "c := 1: 2+3 :4;", "d := 1:n+1;", "e := 2*1:2;",
        "f := 2 * 1:2;", "g := 1 : 2 + 3;", "h := (1:2)+3;", "i := 1:2 * 2;", "j := 1:2 / 2;",
        "k := 2 / 1:2;", "l := -1:1 ^ 2;", "m := xs[1:n+1];", "n := xs[1:n + 1];", "o := 1/2:3/4 + 1;",
    ];
    for (const profile of ["readable", "compact"]) {
        test(`${profile} output parses to the same tree and is stable`, () => {
            for (const source of sources) {
                const formatted = formatRix(source, { profile });
                expect(shape(formatted)).toBe(shape(source));
                expect(formatRix(formatted, { profile })).toBe(formatted);
            }
        });
    }

    test("spacing is preserved literally", () => {
        expect(formatRix("d := 1:n+1;")).toBe("d := 1:n+1;\n");
        expect(formatRix("c := 1: 2+3 :4;")).toBe("c := 1: 2 + 3 :4;\n");
        expect(formatRix("t := 1:2   +   3:4;")).toBe("t := 1:2 + 3:4;\n");
    });
});
