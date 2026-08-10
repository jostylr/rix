import { describe, expect, test } from "bun:test";
import { Fraction, Integer, Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("pure RiX Stern-Brocot plugin", () => {
    test("loads its Fraction dependency and describes an exact node", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            .sternBrocotDescribe(.frac(3, 5));
        `);
        expect(result.entries.get("schema").value).toBe("rix.stern-brocot.node@1");
        expect(String(result.entries.get("current"))).toBe("3/5");
        expect(String(result.entries.get("parent"))).toBe("2/3");
        expect(result.entries.get("depth")).toEqual(new Integer(4n));
        expect(result.entries.get("path").values.map((item) => item.value).join("")).toBe("RLRL");
        expect(result.entries.get("boundaries").values.map(String)).toEqual(["1/2", "2/3"]);
        expect(result.entries.get("mediant")).toBeInstanceOf(Fraction);
        expect(result.entries.get("rational")).toBeInstanceOf(Rational);
        expect(result.entries.get("continuedfraction").values.map(String)).toEqual(["0", "1", "1", "2"]);
    });

    test("describes the signed-tree root without constructing an indeterminate mediant", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            .sternBrocotDescribe(.frac(0, 1));
        `);
        expect(String(result.entries.get("current"))).toBe("0");
        expect(String(result.entries.get("mediant"))).toBe("0");
        expect(result.entries.get("boundaries").values.map(String)).toEqual(["-1/0", "1/0"]);
    });

    test("builds deterministic exact visible nodes and edges", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            .sternBrocotVisibleTree(.frac(1, 2), 2);
        `);
        expect(result.entries.get("schema").value).toBe("rix.stern-brocot.tree@1");
        const nodes = result.entries.get("nodes").values;
        expect(nodes.map((node) => String(node.entries.get("fraction")))).toEqual([
            "1/2", "1", "0", "1/3", "2/3", "1/4", "2/5", "3/5", "3/4",
        ]);
        expect(nodes.map((node) => node.entries.get("role").value)).toEqual([
            "current", "ancestor", "ancestor",
            "descendant", "descendant", "descendant", "descendant", "descendant", "descendant",
        ]);
        expect(result.entries.get("edges").values).toHaveLength(8);
    });

    test("evaluates a RiX callable at the exact rational value", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            .sternBrocotEvaluate(x -> x^2 - 1/2, .frac(3, 5));
        `);
        expect(String(result)).toBe("-7/50");
    });
});
