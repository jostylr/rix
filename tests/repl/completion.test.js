import { describe, expect, test } from "bun:test";
import {
    Context,
    complete,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

function completions(source, context = new Context()) {
    return complete(source, source.length, { context, systemContext: createDefaultSystemContext() });
}

describe("REPL completion", () => {
    test("offers current bindings and REPL commands", () => {
        const context = new Context();
        context.set("alpha", 42);
        const result = completions("al", context);
        expect(result.candidates.map((entry) => entry.insertText)).toContain("alpha");
        expect(result.from).toBe(0);
    });

    test("completes system functions through dot and @_ syntax", () => {
        expect(completions(".SI").candidates.map((entry) => entry.insertText)).toContain(".SIMPLIFY");
        expect(completions("@_SI").candidates.map((entry) => entry.insertText)).toContain("@_SIMPLIFY");
    });

    test("inspects metadata and built-in methods without evaluating source", () => {
        const context = new Context();
        context.set("values", { type: "sequence", values: [], _ext: new Map([["label", { type: "string", value: "data" }]]) });
        const result = completions("values.", context);
        expect(result.candidates.map((entry) => entry.insertText)).toContain("label");
        expect(result.candidates.some((entry) => entry.kind === "method")).toBe(true);
        expect(result.candidates.find((entry) => entry.insertText === "LEN").detail).toContain(".Len()");
    });

    test("completes colon-string keys for a map bracket lookup", () => {
        const context = new Context();
        context.set("settings", { type: "map", entries: new Map([["beta", 2], ["build-mode", 3]]) });
        const result = completions("settings[:b", context);
        expect(result.from).toBe("settings[".length);
        expect(result.candidates.map((entry) => entry.insertText)).toEqual([":beta", '"build-mode"']);
    });

    test("offers bindings after an expression operator", () => {
        const context = new Context();
        context.set("alpha", 42);
        expect(completions("1 + al", context).candidates.map((entry) => entry.insertText)).toContain("alpha");
    });

    test("completes tracked values and raw reactive cell identities", () => {
        const context = new Context();
        parseAndEvaluate(`
            $$source1 := 2;
            $$Fun := x -> x * $source1;
            values := .FormulaSheet({:1x1: @{3}});
            ordinary := 3
        `, {
            context,
            registry: createDefaultRegistry(),
            systemContext: createDefaultSystemContext(),
        });
        const tracked = completions("$so", context);
        const identity = completions("$$so", context);
        expect(tracked.from).toBe(1);
        expect(identity.from).toBe(2);
        expect(tracked.candidates.map((entry) => entry.insertText)).toEqual(["source1"]);
        expect(identity.candidates[0].kind).toBe("reactive cell");
        expect(completions("$Fu", context).candidates.map((entry) => entry.insertText)).toEqual(["FUN"]);
        expect(completions("$Fu", context).candidates[0].kind).toBe("reactive function");
        expect(completions("$$Fu", context).candidates[0].kind).toBe("reactive function");
        expect(completions("$val", context).candidates[0].kind).toBe("reactive sheet");
        expect(completions("$val", context).candidates[0].detail).toContain("whole-sheet");
        expect(completions("$$val", context).candidates[0].kind).toBe("reactive sheet");
    });
});
