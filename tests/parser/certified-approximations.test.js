import { describe, expect, it } from "bun:test";
import { parse } from "../../src/parser/parser.js";
import { scanNumberLiteral, tokenize } from "../../src/parser/tokenizer.js";

describe("certified approximation tokenization", () => {
    it("uses longest valid numeric matches", () => {
        for (const spelling of [
            "23.456?",
            "23.456?789",
            "23.456?789[+-12]",
            "3.~7~15?",
            "3.~7~15?1~292",
            "0xA.B?C",
        ]) {
            expect(tokenize(spelling)[0].type).toBe("Number");
            expect(tokenize(spelling)[0].original).toBe(spelling);
            expect(scanNumberLiteral(spelling)?.original).toBe(spelling);
        }
    });

    it("does not steal spaced question, Ask, or compound operators", () => {
        expect(tokenize("23.456 ? 789").slice(0, 3).map((token) => token.value))
            .toEqual(["23.456", "?", "789"]);
        expect(parse("23.456?(1)")[0].type).toBe("Ask");
        expect(tokenize("23.456?_ 1").slice(0, 3).map((token) => token.value))
            .toEqual(["23.456", "?_", "1"]);
    });

    it("keeps question marks as data inside quoted custom-base streams", () => {
        expect(tokenize('0A"??"')[0].original).toBe('0A"??"');
    });

    it("parses standalone question only in value position", () => {
        expect(parse("?")[0].type).toBe("UndecidedLiteral");
        expect(parse("x ? y")[0].type).toBe("BinaryOperation");
        expect(parse("x ? y")[0].operator).toBe("?");
    });
});
