import { describe, expect, test } from "bun:test";
import { Context, createDefaultSystemContext, complete } from "../../src/index.js";

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
        expect(completions(".SI").candidates.map((entry) => entry.insertText)).toContain(".SIN");
        expect(completions("@_SI").candidates.map((entry) => entry.insertText)).toContain("@_SIN");
    });

    test("inspects metadata and built-in methods without evaluating source", () => {
        const context = new Context();
        context.set("values", { type: "sequence", values: [], _ext: new Map([["label", { type: "string", value: "data" }]]) });
        const result = completions("values.", context);
        expect(result.candidates.map((entry) => entry.insertText)).toContain("label");
        expect(result.candidates.some((entry) => entry.kind === "method")).toBe(true);
    });

    test("offers bindings after an expression operator", () => {
        const context = new Context();
        context.set("alpha", 42);
        expect(completions("1 + al", context).candidates.map((entry) => entry.insertText)).toContain("alpha");
    });
});
