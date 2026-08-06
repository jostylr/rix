import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parseOperatorDeclarationLine } from "../../src/parser/custom-operators.js";

const header = (declaration, body) => `##OPS##\n${declaration}\n##OPS##\n${body}`;

describe("custom operators", () => {
    test("tokenizes the distinctive :<...>: envelope without disturbing :<:", () => {
        expect(tokenize("a :<o+>: b").find((token) => token.type === "CustomOperator")).toMatchObject({
            type: "CustomOperator",
            value: "o+",
            original: " :<o+>:",
        });
        expect(tokenize("a :<: b").find((token) => token.value === ":<:")).toBeTruthy();
    });

    test("declaration fields are unordered and uniquely classified", () => {
        const definition = parseOperatorDeclarationLine(
            ":none :<o+>: :additive Mediant :infix",
        );
        expect(definition).toMatchObject({
            symbol: "o+",
            fixity: "infix",
            associativity: "none",
            precedence: 80,
            target: { kind: "function", name: "MEDIANT" },
        });
    });

    test("custom additive precedence composes with built-in arithmetic", () => {
        const [comment, expression] = parse(header(
            ":<o+>: Mediant :infix :additive :left",
            "1 + 2 :<o+>: 3 * 4",
        ));
        expect(comment.type).toBe("Comment");
        expect(expression.type).toBe("CustomOperator");
        expect(expression.left.operator).toBe("+");
        expect(expression.right.operator).toBe("*");
    });

    test(":above and :below place an operator between built-in bands", () => {
        const above = parseOperatorDeclarationLine(
            ":<a>: A :left :above :additive :infix",
        );
        const below = parseOperatorDeclarationLine(
            ":multiplicative :below :infix B :<b>: :right",
        );
        expect(above.precedence).toBe(85);
        expect(below.precedence).toBe(85);
    });

    test("non-associative chains require parentheses", () => {
        const source = header(
            ":<o+>: Mediant :infix :additive :none",
            "1 :<o+>: 2 :<o+>: 3",
        );
        expect(() => parse(source)).toThrow("Non-associative custom operator chain requires parentheses");
        expect(() => parse(header(
            ":<o+>: Mediant :infix :additive :none",
            "(1 :<o+>: 2) :<o+>: 3",
        ))).not.toThrow();
    });

    test("undeclared operators and late OPS blocks fail clearly", () => {
        expect(() => parse("1 :<missing>: 2")).toThrow("is not declared");
        expect(() => parse("1; ##OPS##\n:<o+>: F :infix :additive :left\n##OPS##"))
            .toThrow("must appear before executable code");
    });
});
