import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

describe("RiXCel delimited interchange", () => {
    test("imports CSV values, headers, quoted fields, and inert foreign formulas", () => {
        const sheet = parseAndEvaluate(`
            .RiXCelImportCsv("""name,value,note
alpha,3,"hello, world"
beta,4.5,=SUM(A1:A2)""", {= header=1, id="csv-demo" })
        `);
        expect(sheet.id).toBe("csv-demo");
        expect(sheet.shape).toEqual([2, 3]);
        expect(sheet.documentView.axisLabels).toEqual([null, ["name", "value", "note"]]);
        expect(formatValue(sheet.get([1, 2]))).toBe("3");
        expect(formatValue(sheet.get([2, 2]))).toBe("4..1/2");
        expect(sheet.get([1, 3]).value).toBe("hello, world");
        expect(sheet.get([2, 3]).value).toBe("=SUM(A1:A2)");
        expect(sheet.slot([2, 3]).view).toEqual({
            foreignFormula: "=SUM(A1:A2)",
            executable: false,
            format: "csv",
        });
    });

    test("exports computed rank-2 values to CSV and TSV", () => {
        const csv = parseAndEvaluate(`
            sheet := .FormulaSheet(
                {:2x2: @{1}, @{ "hello, world"}; @{3/2}, @{ grid[1,1] + 4 }},
                {= view={= axisLabels=[_, ["amount", "note"]] }}
            );
            .RiXCelExportCsv(sheet)
        `);
        expect(csv.value).toBe('amount,note\n1,"hello, world"\n1..1/2,5');

        const tsv = parseAndEvaluate(`
            sheet := .RiXCelImportTsv("""name\tvalue
alpha\t2
beta\t3""", {= header=1 });
            .RiXCelExportTsv(sheet)
        `);
        expect(tsv.value).toBe("name\tvalue\nalpha\t2\nbeta\t3");
    });

    test("rejects malformed rows and rank-N delimited export", () => {
        expect(() => parseAndEvaluate(`.RiXCelImportCsv("""a,b
1""")`)).toThrow("rows must have equal lengths");
        expect(() => parseAndEvaluate(`
            sheet := .FormulaSheet({:1x1x1: @{1}});
            .RiXCelExportCsv(sheet)
        `)).toThrow("requires a rank-2 FormulaSheet");
    });
});
