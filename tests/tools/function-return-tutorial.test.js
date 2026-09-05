import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runDocuments, runDocumentsAsync } from "../../documentation/scripts/check-examples.js";

test("function-return tutorial executes and asserts its examples in both evaluators", async () => {
    const file = new URL("../../documentation/eval/function-returns.md",import.meta.url).pathname;
    const source = readFileSync(file,"utf8");
    const sync = runDocuments([{file,source}]);
    const async = await runDocumentsAsync([{file,source:source.replaceAll(".rix exec=true", ".rix exec=true async=true")}]);
    for (const results of [sync,async]) {
        expect(results.length).toBe(7);
        expect(results.filter(result=>result.status!=="pass")).toEqual([]);
    }
},15000);
