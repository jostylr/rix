import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Fraction, Integer, Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("pure RiX Stern-Brocot plugin", () => {
    test("generated Stern-Brocot page exports its Graphics with supported styles", () => {
        const source = readFileSync(new URL("../../examples/stern-brocot/stern-brocot-page.rix", import.meta.url), "utf8")
            .replace(/\/\*\*[\s\S]*?\*\*\//, '.Plugin.Load("stern-brocot"); .Plugin.Load("html");')
            .replace('.Out("index.html", $view)', '.Render($view, "html")');
        const result = parseAndEvaluate(source);
        expect(result.entries.get("content").value).toContain("<svg");
        expect(result.entries.get("content").value).toContain("FORMULA RESULT");
    });

    test("loads its Fraction dependency and describes an exact node", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            .sternBrocot.Describe(.frac(3, 5));
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

    test("keeps the direct callable exports alongside the mounted namespace", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            [
                .sternBrocot.Evaluate(x -> x^2, .frac(2, 3)),
                .sternBrocotEvaluate(x -> x^2, .frac(2, 3))
            ];
        `);
        expect(result.values.map(String)).toEqual(["4/9", "4/9"]);
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

    test("records every exact path step and presents a classroom Grid", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            path := .sternBrocot.Path(.frac(3,5));
            [path, .sternBrocot.Grid(.frac(3,5)), .sternBrocotPath(.frac(3,5))];
        `);
        const [path, grid, direct] = result.values;
        expect(path.entries.get("schema").value).toBe("rix.stern-brocot.path@1");
        expect(path.entries.get("directions").values.map((item) => item.value)).toEqual(["R", "L", "R", "L"]);
        expect(path.entries.get("steps").values.map((step) => String(step.entries.get("fraction"))))
            .toEqual(["0", "1", "1/2", "2/3", "3/5"]);
        expect(grid).toMatchObject({ type: "output", kind: "grid" });
        expect(grid.rows).toHaveLength(5);
        expect(direct.entries.get("target").toString()).toBe("3/5");
    });

    test("builds complete Farey sequences with exact neighbor evidence and views", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stern-brocot");
            sequence := .sternBrocot.Farey(5);
            [sequence, .sternBrocot.FareyView(5), .fareySequence(5), .fareyGrid(5)];
        `);
        const [sequence, view, direct, directGrid] = result.values;
        expect(sequence.entries.get("schema").value).toBe("rix.farey.sequence@1");
        expect(sequence.entries.get("values").values.map(String)).toEqual([
            "0", "1/5", "1/4", "1/3", "2/5", "1/2",
            "3/5", "2/3", "3/4", "4/5", "1",
        ]);
        expect(sequence.entries.get("adjacency").values.every((entry) =>
            String(entry.entries.get("determinant")) === "1")).toBe(true);
        expect(view).toMatchObject({ type: "output", kind: "grid" });
        expect(view.rows).toHaveLength(11);
        expect(direct.entries.get("values").values.map(String)).toEqual(
            sequence.entries.get("values").values.map(String),
        );
        expect(directGrid.rows).toHaveLength(11);
        expect(() => parseAndEvaluate('.Plugin.Load("stern-brocot"); .sternBrocot.Farey(0)'))
            .toThrow("positive Integer");
    });
});
