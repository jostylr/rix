import { describe, expect, test } from "bun:test";
import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";
import { lower } from "../../src/eval/lower.js";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";

describe("absolute-value syntax", () => {
    test("|x| lowers to the internal ABS operation", () => {
        const [node] = lower(parse(tokenize("|-7|")));
        expect(node.fn).toBe("ABS");
        expect(node.args[0].fn).toBe("LITERAL");
    });

    test("absolute-value syntax and .Abs share the core ABS operation", () => {
        expect(parseAndEvaluate("|-7|", {
            registry: createDefaultRegistry(),
            systemContext: createDefaultSystemContext(),
        }).value).toBe(7n);
        expect(parseAndEvaluate(".Abs(-7)", {
            registry: createDefaultRegistry(),
            systemContext: createDefaultSystemContext(),
        }).value).toBe(7n);
        expect(() => parseAndEvaluate("|7 + 3"))
            .toThrow("Expected '|' to close absolute-value expression");
    });
});
