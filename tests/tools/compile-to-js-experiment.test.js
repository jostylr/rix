import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Integer } from "@ratmath/core";
import { compileFile } from "../../bin/rix-to-js-experiment.js";
import { compileRixToJavaScript } from "../../src/compile/to-javascript.js";
import { rixInvoke, rixModulo } from "../../src/compile/js-runtime.js";
import {
    Context, createDefaultRegistry, createDefaultSystemContext,
    formatValue, parseAndEvaluate,
} from "../../src/index.js";

const forms = ["ternary", "named-multifunction", "anonymous-multifunction", "case-block"];

describe("experimental RiX-to-JS compilation", () => {
    for (const name of forms) {
        test(`${name} matches the interpreter and its generated artifact is current`, async () => {
            const file = resolve(import.meta.dir, "../../benchmarks/fizzbuzz-sources", `${name}.rix`);
            const source = readFileSync(file, "utf8");
            const generated = compileFile(file, { check: true });
            const compiled = await import(pathToFileURL(generated).href);
            expect(compiled.sourceHash).toBe(createHash("sha256").update(source).digest("hex"));
            expect(compiled.rixExports.RUN.type).toBe("compiled_function");
            if (name.includes("multifunction") && name !== "anonymous-multifunction") {
                expect(compiled.rixExports.FIZZBUZZ.type).toBe("compiled_multifunction");
                expect(compiled.rixExports.FIZZBUZZ.variants).toHaveLength(4);
            }

            const context = new Context();
            const options = {
                context,
                registry: createDefaultRegistry(),
                systemContext: createDefaultSystemContext(),
            };
            parseAndEvaluate(source, options);
            for (const count of [0, 1, 15, 30, 100]) {
                const expected = parseAndEvaluate(`Run(${count});`, options);
                const actual = compiled.run(new Integer(count));
                expect(actual.type).toBe("sequence");
                expect(formatValue(actual)).toBe(formatValue(expected));
                if (count > 0) expect(actual.values[0]).toBeInstanceOf(Integer);
                if (count >= 3) expect(actual.values[2]).toEqual({ type: "string", value: "Fizz" });
            }
            if (compiled.rixExports.FIZZBUZZ) {
                for (const n of [-15, -5, -3, -1, 0, 1, 3, 5, 15]) {
                    const expected = parseAndEvaluate(`FizzBuzz(${n});`, options);
                    const actual = rixInvoke(compiled.rixExports.FIZZBUZZ, new Integer(n));
                    expect(formatValue(actual)).toBe(formatValue(expected));
                }
            }
        });
    }

    test("unsupported syntax fails compilation rather than changing behavior", () => {
        expect(() => compileRixToJavaScript("Run(count) -> count + 1;"))
            .toThrow(/does not support IR operation ADD/);
        expect(() => compileRixToJavaScript("x := 1; Run(count) -> count;"))
            .toThrow(/does not support top-level IR operation/);
        expect(() => compileRixToJavaScript("Run(count, step) -> count;"))
            .toThrow(/other than one positional parameter/);
        expect(() => compileRixToJavaScript("Run(count) -> Later(count); Later(count) -> count;"))
            .toThrow(/does not support/);
    });

    test("compiled integer modulo retains RiX floor-modulo semantics", () => {
        expect(rixModulo(new Integer(-1), new Integer(5)).value).toBe(4n);
        expect(() => rixModulo(new Integer(1), new Integer(-5))).toThrow(/positive/);
    });
});
