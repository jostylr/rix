import { describe, expect, test } from "bun:test";
import {
    createDefaultSystemContext,
    parseAndEvaluate,
    parseAndEvaluateAsync,
} from "../../src/eval/evaluator.js";
import { createBrowserHostAdapter } from "../../src/runtime/host-adapter.js";

describe("portable evaluator host adapter", () => {
    test("loads relative RiX imports from browser-provided sources", () => {
        const hostAdapter = createBrowserHostAdapter({
            baseURL: "https://example.test/notebook/main.rix",
            sources: new Map([
                ["https://example.test/notebook/lib/value.rix", "40 + 2"],
            ]),
        });

        const result = parseAndEvaluate('<"lib/value">', { hostAdapter });
        expect(result.value).toBe(42n);
    });

    test("uses only explicitly preloaded browser JavaScript modules", () => {
        const hostAdapter = createBrowserHostAdapter({
            baseURL: "https://example.test/notebook/main.rix",
            modules: new Map([
                ["https://example.test/notebook/math.js", { twice: (value) => value * 2 }],
            ]),
        });
        const systemContext = createDefaultSystemContext();

        expect(parseAndEvaluate('.JSCall("math.js", :twice, 21)', {
            hostAdapter,
            systemContext,
        })).toBe(42);
        expect(() => parseAndEvaluate('.ImportJS("missing.js")', {
            hostAdapter,
            systemContext,
        })).toThrow("no trusted preloaded module");
    });

    test("the portable public entry bundles for browsers without Node shims", async () => {
        const build = await Bun.build({
            entrypoints: [new URL("../../src/eval/index.js", import.meta.url).pathname],
            target: "browser",
            format: "esm",
        });

        expect(build.success, build.logs.map(String).join("\n")).toBe(true);
    });

    test("sync evaluation honors deterministic step limits", () => {
        expect(() => parseAndEvaluate("{@::@ i=0; 1; i; i+=1 };", { maxSteps: 50 }))
            .toThrow("50-step limit");
    });

    test("a live cancellation signal preserves ordinary async semantics", async () => {
        const controller = new AbortController();
        const result = await parseAndEvaluateAsync("F=(x)->x+1; [1,2,3] |>> F", {
            signal: controller.signal,
            maxSteps: 1000,
        });
        expect(result.values.map((value) => value.value)).toEqual([2n, 3n, 4n]);
    });
});
