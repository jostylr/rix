import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

const explorationRoot = new URL("../../explorations/numerics/", import.meta.url);

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("browser-safe explanatory explorations", () => {
    for (const name of ["lipschitz-midpoint", "second-derivative-taylor"]) {
        test(`${name} explains the algorithm and evaluates to portable output`, () => {
            const markdown = readFileSync(new URL(`${name}.md`, explorationRoot), "utf8");
            const source = readFileSync(new URL(`${name}.rix`, explorationRoot), "utf8");
            expect(markdown).toContain("kind: explanatory-exploration");
            expect(markdown).toContain("## Further explorations");
            expect(markdown).toContain(`${name}.rix`);
            const result = parseAndEvaluate(source, runtime());
            expect(result).toMatchObject({ type: "output", kind: "fragment" });
            expect(result.children.some((child) => child?.kind === "table")).toBe(true);
            expect(result.children.some((child) => child?.kind === "figure")).toBe(true);
            expect(result.children.some((child) => child?.kind === "control_panel")).toBe(true);
        });
    }
});
