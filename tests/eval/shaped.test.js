import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { evaluate, createDefaultRegistry, createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";
import { formatValue } from "../../src/eval/format.js";
import { isHole } from "../../src/runtime/hole.js";
import { forEachShapedCell, isShaped } from "../../src/runtime/shaped.js";

const defaultSystemContext = createDefaultSystemContext();

function evalRiX(code, ctx) {
    const context = ctx || new Context();
    const registry = createDefaultRegistry();
    const tokens = tokenize(code);
    const ast = parse(tokens, () => ({ type: "identifier" }));
    const irNodes = lower(ast);

    let result = null;
    for (const irNode of irNodes) {
        result = evaluate(irNode, context, registry, defaultSystemContext);
    }
    return result;
}

function unbox(value) {
    if (value === null || value === undefined) return value;
    if (isHole(value)) return "__HOLE__";
    if (value && value.type === "string") return value.value;
    if (value && (value.type === "sequence" || value.type === "array" || value.type === "tuple" || value.type === "set")) {
        return value.values.map(unbox);
    }
    if (value && value.constructor && value.constructor.name === "Integer") return Number(value.value);
    if (value && value.constructor && value.constructor.name === "Rational") {
        return Number(value.numerator) / Number(value.denominator);
    }
    return value;
}

function shapedSnapshot(tensor) {
    if (!isShaped(tensor)) {
        throw new Error("Expected a tensor");
    }

    const flat = [];
    forEachShapedCell(tensor, (value) => {
        flat.push(unbox(value));
    });

    return {
        shape: [...tensor.shape],
        flat,
    };
}

describe("Tensor literals and indexing", () => {
    test("semicolon array notation canonicalizes matrices and higher-rank tensors", () => {
        const matrix = evalRiX("[1, 2; 3, 4]");
        expect(shapedSnapshot(matrix)).toEqual({ shape: [2, 2], flat: [1, 2, 3, 4] });

        const rank3 = evalRiX("[1, 2; 3, 4 ;; 5, 6; 7, 8]");
        expect(shapedSnapshot(rank3)).toEqual({
            shape: [2, 2, 2],
            flat: [1, 5, 2, 6, 3, 7, 4, 8],
        });

        const rank4 = evalRiX("[1; 2 ;; 3; 4 ;;; 5; 6 ;; 7; 8]");
        expect(shapedSnapshot(rank4)).toEqual({
            shape: [2, 1, 2, 2],
            flat: [1, 5, 3, 7, 2, 6, 4, 8],
        });
    });

    test("semicolon tensor inference rejects ragged dimensions", () => {
        expect(() => evalRiX("[1, 2; 3]")).toThrow("ragged along columns");
        expect(() => evalRiX("[1; 2 ;; 3]")).toThrow("ragged along rows");
    });

    test("tensor literal stores row-major flat data", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m");
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3],
            flat: [1, 2, 3, 4, 5, 6],
        });
    });

    test("rank-3 tensor literal uses rows, columns, then depth slices", () => {
        const result = evalRiX("t := {:2x3x2: 1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12}; t");
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3, 2],
            flat: [1, 7, 2, 8, 3, 9, 4, 10, 5, 11, 6, 12],
        });
    });

    test("rank-3 tensor formatting preserves rows, columns, then depth slices", () => {
        const result = evalRiX("t := {:2x3x2: 1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12}; t");
        expect(formatValue(result)).toBe("{:2x3x2: 1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12 }");
    });

    test("tensor scalar indexing uses 1-based indices", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m[2, 3]");
        expect(unbox(result)).toBe(6);
    });

    test("tensor indexing accepts a tuple locator", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; idx := (2, 3); m[idx]");
        expect(unbox(result)).toBe(6);
    });

    test("tensor slices return views with the sliced shape", () => {
        const row = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m[1, ::]");
        expect(shapedSnapshot(row)).toEqual({
            shape: [3],
            flat: [1, 2, 3],
        });

        const col = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m[::, 2]");
        expect(shapedSnapshot(col)).toEqual({
            shape: [2],
            flat: [2, 5],
        });
    });

    test("tensor slices support reverse endpoints and negative indices", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m[-1:1, ::]");
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3],
            flat: [4, 5, 6, 1, 2, 3],
        });
    });

    test("tensor indexing is strict about bounds", () => {
        expect(() => evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m[3, 1]"))
            .toThrow("out of range");
    });

    test("tensor literal rejects a body whose row and column structure does not match the shape", () => {
        expect(() => evalRiX("t := {:2x3x2: 1, 2; 3, 4; 5, 6 ;; 7, 8; 9, 10; 11, 12}"))
            .toThrow("expects 3 columns per row");
    });
});

describe("Tensor views and assignment", () => {
    test("transpose produces a rank-2 tensor view", () => {
        const transposed = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m^^");
        expect(shapedSnapshot(transposed)).toEqual({
            shape: [3, 2],
            flat: [1, 4, 2, 5, 3, 6],
        });
    });

    test("transposed view reindexes elements correctly", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; mt := m^^; {: mt[1, 2], mt[2, 1] }");
        expect(unbox(result)).toEqual([4, 2]);
    });

    test("tensor scalar and slice assignment mutate the backing tensor", () => {
        const result = evalRiX("m := {:2x3:}; m[1, 2] = 9; m[::, 1] = 7; m");
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3],
            flat: [7, 9, "__HOLE__", 7, "__HOLE__", "__HOLE__"],
        });
    });
});

describe("Tensor-aware pipes", () => {
    test("PMAP on an empty tensor can fill by index tuple", () => {
        const result = evalRiX("{:2x3:} |>> (v, idx) -> idx[1] * 10 + idx[2]");
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3],
            flat: [11, 12, 13, 21, 22, 23],
        });
    });

    test("PFILTER on a tensor returns value/index tuples", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m |>? (v, idx) -> idx[2] == 2");
        expect(unbox(result)).toEqual([
            [2, [1, 2]],
            [5, [2, 2]],
        ]);
    });

    test("PREDUCE on a tensor receives index tuples", () => {
        const result = evalRiX("m := {:2x3: 1, 2, 3; 4, 5, 6}; m |:> 0 >: (acc, v, idx) -> acc + idx[1]");
        expect(unbox(result)).toBe(9);
    });

    test("zero-sized tensor mapping preserves the shape", () => {
        const result = evalRiX("{:0x3:} |>> (v, idx) -> 7");
        expect(shapedSnapshot(result)).toEqual({
            shape: [0, 3],
            flat: [],
        });
    });
});

describe("Shaped generation helper", () => {
    test(".Shaped.Generate builds Shaped storage from a shape tuple and index callback", () => {
        const result = evalRiX('.Shaped.Generate({: 2, 3 }, (idx) -> idx[1] * 10 + idx[2])');
        expect(shapedSnapshot(result)).toEqual({
            shape: [2, 3],
            flat: [11, 12, 13, 21, 22, 23],
        });
    });
});

describe("Shaped arithmetic and scalar domains", () => {
    test("identical shapes combine elementwise and scalars apply to every entry", () => {
        const result = evalRiX(`
            a := [1, 2; 3, 4];
            b := [10, 20; 30, 40];
            {: a + b, a * 2, 100 - a, a.ScalarDomain() }
        `);
        expect(shapedSnapshot(result.values[0])).toEqual({ shape: [2, 2], flat: [11, 22, 33, 44] });
        expect(shapedSnapshot(result.values[1])).toEqual({ shape: [2, 2], flat: [2, 4, 6, 8] });
        expect(shapedSnapshot(result.values[2])).toEqual({ shape: [2, 2], flat: [99, 98, 97, 96] });
        expect(result.values[3].value).toBe("Integer");
    });

    test("mismatched shapes and cross-domain scalars never broadcast or promote implicitly", () => {
        expect(() => evalRiX("{:2x2: 1, 2; 3, 4 } + {:2: 10, 20}"))
            .toThrow(/identical shapes; received 2x2 and 2/);
        expect(() => evalRiX("{:2: 1, 2 } + 1\/2"))
            .toThrow(/does not satisfy declared domain Integer/);
    });

    test("declared domains are inferred, exported, and enforced on mutation", () => {
        const result = evalRiX(`
            a := {:2: 1, 1/2};
            e := .TypeExport(a);
            b := .TypeImport(e);
            {: a.ScalarDomain(), b.ScalarDomain() }
        `);
        expect(result.values.map((value) => value.value)).toEqual(["Rational", "Rational"]);
        expect(() => evalRiX('a := {:2: 1, 2}; a.Set!(1, "bad")'))
            .toThrow(/does not satisfy declared domain Integer/);
    });

    test("a broader scalar domain can be declared explicitly and validates current entries", () => {
        const value = evalRiX("a := {:2: 1, 2}.WithScalarDomain(:Rational); [a.ScalarDomain(), a + 1/2]");
        expect(value.values[0].value).toBe("Rational");
        expect(shapedSnapshot(value.values[1]).flat).toEqual([1.5, 2.5]);
        expect(() => evalRiX('{:2: 1, 2}.WithScalarDomain(:String)')).toThrow("does not satisfy declared domain String");
    });
});

describe("Matrix semantics", () => {
    test("compact Matrix headers enable customary matrix multiplication and explicit Hadamard products", () => {
        const result = evalRiX(`
            a := {:2x2: /Matrix/ 1, 2; 3, 4};
            b := {:2x2: /matrix/ 2, 0; 1, 2};
            [a.__type, a * b, a.Hadamard(b), a ^ 2, a[1, ::], a[::, ::]];
        `);
        expect(result.values[0].value).toBe("Matrix");
        expect(shapedSnapshot(result.values[1]).flat).toEqual([4, 4, 10, 8]);
        expect(shapedSnapshot(result.values[2]).flat).toEqual([2, 0, 3, 8]);
        expect(shapedSnapshot(result.values[3]).flat).toEqual([7, 10, 15, 22]);
        expect(result.values[4]._ext.get("__type").value).toBe("Shaped");
        expect(result.values[5]._ext.get("__type").value).toBe("Matrix");
    });

    test("bare shaped literals do not acquire matrix multiplication implicitly", () => {
        expect(() => evalRiX("[1, 2; 3, 4] * [1, 0; 0, 1]")).not.toThrow();
        expect(shapedSnapshot(evalRiX("[1, 2; 3, 4] * [1, 0; 0, 1]")).flat).toEqual([1, 0, 0, 4]);
    });
});
