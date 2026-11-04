import { describe, expect, test } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { evaluate, createDefaultRegistry, createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { lintRix } from "../../src/eval/lint.js";
import { Context } from "../../src/runtime/context.js";

const registry = createDefaultRegistry();
const systemContext = createDefaultSystemContext();

function run(source) {
    const context = new Context();
    let result = null;
    for (const node of lower(parse(tokenize(source), () => ({ type: "identifier" })))) {
        result = evaluate(node, context, registry, systemContext);
    }
    return formatValue(result);
}

describe("ordering comparisons", () => {
    test("a null operand makes the comparison null", () => {
        for (const source of ["_ < 1", "1 > _", "_ >= _", "1 <= _"]) expect(run(source)).toBe("_");
    });

    test("an undecided operand leaves a chain undecided", () => {
        expect(run("23.456? < 23.4565 < 30")).toBe("?");
        expect(run("1 < 23.456? < 23.4565")).toBe("?");
        expect(run("23.456? < 23.4565 < 3")).toBe("_");
    });

    test("values from different ordered domains cannot be ordered", () => {
        expect(() => run('5 < "abc"')).toThrow("Cannot order Integer and string");
        expect(() => run('"abc" >= 5')).toThrow("Cannot order string and Integer");
        expect(() => run("[1, 2] < [1, 3]")).toThrow("Cannot order");
    });

    test("numbers and strings still order within their own domain", () => {
        expect(run("1/2 < 3")).toBe("1");
        expect(run('"a" < "b"')).toBe("1");
        expect(run("1:2 < 3:4")).toBe("1");
        expect(run("3 < 1/2")).toBe("_");
    });
});

describe("collection equality compares values", () => {
    test("arrays, tuples and nested collections", () => {
        expect(run("[1, 2] == [1, 2]")).toBe("1");
        expect(run("[1, 2] == [1, 3]")).toBe("_");
        expect(run("[1, 2] != [1, 3]")).toBe("1");
        expect(run("[1, 2] != [1, 2]")).toBe("_");
        expect(run("{: 1, 2 } == {: 1, 2 }")).toBe("1");
        expect(run("{: 1, 2 } == [1, 2]")).toBe("_");
        expect(run('[[1, [2]], "x"] == [[1, [2]], "x"]')).toBe("1");
        expect(run("[1/2] == [0.5]")).toBe("1");
        expect(run("[] == []")).toBe("1");
    });

    test("sets ignore order and maps compare by key", () => {
        expect(run("{| 1, 2 |} == {| 2, 1 |}")).toBe("1");
        expect(run("{| 1, 2 |} == {| 2, 3 |}")).toBe("_");
        expect(run("{= a=1, b=[1, 2] } == {= b=[1, 2], a=1 }")).toBe("1");
        expect(run("{= a=1 } == {= a=2 }")).toBe("_");
    });

    test("an undecided element leaves the comparison undecided unless another decides it", () => {
        expect(run("[1:2] == [1:2]")).toBe("?");
        expect(run("[1:2, 3] == [1:2, 4]")).toBe("_");
    });

    test("identity stays separate from value equality", () => {
        expect(run("a := [1, 2]; b := [1, 2]; a == b")).toBe("1");
        expect(run("a := [1, 2]; b := [1, 2]; a === b")).toBe("_");
        expect(run("a = [1, 2]; b = a; a === b")).toBe("1");
    });
});

describe("string literals are never punctuation", () => {
    test("a lone separator or closer string is an ordinary argument", () => {
        expect(run('[1, 2].Join(",")')).toBe("1,2");
        expect(run('.Len([",", ";", ")", "]"])')).toBe("4");
        expect(run('.Len({| "," |})')).toBe("1");
        expect(run('{= a = ";" }[:a]')).toBe(";");
        expect(run('"(" ++ ")"')).toBe("()");
    });
});

describe("implicit products followed by a parenthesised factor", () => {
    test("k m (m + 1) multiplies all three factors", () => {
        expect(run("k := 2; m := 3; k m (m + 1)")).toBe("24");
        expect(run("x := 2; y := 3; 2 x y (x + y)")).toBe("60");
        expect(run("n := 3; n(n + 1)")).toBe("12");
    });
});

describe("adjacency: a space is multiplication, no space is one tight term", () => {
    test("a space is ordinary multiplication, read left to right with / and *", () => {
        expect(run("a := 6; b := 2; c := 5; a/b c")).toBe("15");
        expect(run("a := 6; b := 2; c := 5; a/b (c + 1)")).toBe("18");
        expect(run("a := 6; b := 2; c := 5; a // b c")).toBe("15");
        expect(run("x := 3; y := 2; 2 x / 3 y")).toBe("4");
        expect(run("a := 2; b := 3; 1 + a b^2 + 1")).toBe("20");
        expect(run("x := 6; 1/2 x")).toBe("3");
        expect(run("x := 6; 1/2 (x + 2)")).toBe("4");
        expect(run("1/2 3")).toBe("1..1/2");
    });

    test("adjacency with no space is one tight term", () => {
        expect(run("a := 6; x := 3; a/2x")).toBe("1");
        expect(run("x := 6; 1/2x")).toBe("1/12");
        expect(run("x := 3; y := 2; 2x/3y")).toBe("1");
        expect(run("a := 6; b := 2; c := 5; a/b(c + 1)")).toBe("1/2");
        expect(run("2/3^2")).toBe("2/9");
    });

    test("a unit follows the same rule and prints so that it reads back", () => {
        expect(run("1/2 ~[m]")).toBe("1/2 ~[m]");
        expect(run("1/2~[m]")).toBe("1/2 ~[1/m]");
        expect(run("2~[m]/3~[s]")).toBe("2/3 ~[m/s]");
        expect(run("2/3 ~[m/s] == 2~[m]/3~[s]")).toBe("1");
        expect(run("3/2 ~{pi} == 3/2 * .Exact[:pi]")).toBe("1");
        expect(run("1/2 - 1/2 ~{i}")).toBe("1/2 - 1/2 ~{i}");
        expect(run("1..1/2~[m]")).toBe("1..1/2~[m]");
    });

    test("implicit application still takes the whole multiplicative chunk", () => {
        expect(run("Sq(x) -> x^2; x := 3; Sq 2 x")).toBe("36");
        expect(run("Sq(x) -> x^2; x := 3; 2 Sq x")).toBe("18");
    });

    test("RX1709 flags a factor or unit written directly after an integer fraction", () => {
        const codes = (source) => lintRix(source).map(({ code }) => code);
        expect(codes("x := 6; 1/2x;")).toContain("RX1709");
        expect(codes("1/2~[m];")).toContain("RX1709");
        expect(codes("x := 6; 1/2(x + 1);")).toContain("RX1709");
        expect(codes("x := 6; 1/2 x; 1/2 ~[m]; 1/(2x); x/2;")).not.toContain("RX1709");
    });
});

describe("freshly built arrays and maps are mutable like literals", () => {
    test("pipe, range, sort and concatenation results accept index assignment", () => {
        expect(run("a := [1, 2, 3] |>> (x -> x); a[1] ~= 9; a")).toBe("[9, 2, 3]");
        expect(run("a := [1, 2, 3] |>? (x -> x > 1); a[1] ~= 9; a")).toBe("[9, 3]");
        expect(run("r := .IRANGE(1, 3); r[1] ~= 9; r")).toBe("[9, 2, 3]");
        expect(run("a := .Sort([3, 1]); a[1] ~= 9; a")).toBe("[9, 3]");
        expect(run("a := [1, 2] ++ [3]; a[1] ~= 9; a")).toBe("[9, 2, 3]");
        expect(run("m := {= a=1 } |>> (v -> v + 1); m[:b] ~= 5; m")).toBe("{= a=2, b=5 }");
    });

    test("a value made immutable stays immutable, and its pipe result is a separate mutable copy", () => {
        expect(() => run("a := [1, 2, 3]; a._mutable = _; a[1] ~= 0")).toThrow("not mutable");
        expect(run("a := [1, 2, 3]; a._mutable = _; b := a |>> (x -> x); b[1] ~= 0; [a, b]")).toBe("[[1, 2, 3], [0, 2, 3]]");
    });
});

describe("sequence element limit", () => {
    test("an explicit count may exceed the default limit", () => {
        expect(run("[1, |+ 1, |; 12000] |>: @+[2]")).toBe("72006000");
        expect(run("a := [1, |+ 1, |; 12000]; .Len(a)")).toBe("12000");
        expect(run("[1, |+ 1, |^ 12000] |>> (x -> 2x) |>: @+[2]")).toBe("144012000");
    });

    test("a sequence without an explicit count keeps the default limit and says how to lift it", () => {
        expect(() => run("a := [1, |+ 1, |^ (x -> x > 20000)]; a[10500]")).toThrow("give the sequence an explicit count");
    });
});

describe("a pipe after an unparenthesised lambda body", () => {
    const trap = "[1, 2, 3] |>> ((i) -> [i, 2] |>: @*[2]);";

    test("the runtime error explains the binding", () => {
        expect(() => run(trap)).toThrow("'->' binds tighter than a pipe");
        expect(run("[1, 2, 3] |>> ((i) -> ([i, 2] |>: @*[2]))")).toBe("[2, 4, 6]");
    });

    test("RX1708 is off at the default level and on when thorough", () => {
        const codes = (options) => lintRix(trap, options).map(({ code }) => code);
        expect(codes()).not.toContain("RX1708");
        expect(codes({ level: "thorough" })).toContain("RX1708");
        expect(lintRix("Sum(xs) -> xs |>: @+[2];", { level: "pedantic", profile: "all" }).map(({ code }) => code)).not.toContain("RX1708");
    });
});

describe("large exact powers", () => {
    test("2^524288 is computed without exhausting memory", () => {
        expect(run("2^524288 % 7")).toBe("4");
    });
});
