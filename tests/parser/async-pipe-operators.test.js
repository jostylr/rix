import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { lower } from "../../src/eval/lower.js";

describe("async pipe operator syntax", () => {
    test("tokenizer recognizes longer operators before ordinary pipe", () => {
        expect(tokenize("xs |>_ F |>! G |> H").map((token) => token.value)).toEqual([
            "xs", "|>_", "F", "|>!", "G", "|>", "H", null,
        ]);
    });

    test("parser keeps pipe associativity and creates distinct AST nodes", () => {
        const [node] = parse("xs |>! Recover |>_ Observe");
        expect(node.type).toBe("ForEachPipe");
        expect(node.left.type).toBe("ExpectedErrorPipe");
        expect(node.left.left.name).toBe("xs");
    });

    test("lowering emits explicit expected-error and terminal drain IR", () => {
        const [node] = lower(parse("xs |>! Recover |>_ Observe"));
        expect(node.fn).toBe("PFOREACH");
        expect(node.args[0].fn).toBe("PEXPECT");
        expect(node.args[0].args[0].fn).toBe("RETRIEVE");
    });
});
