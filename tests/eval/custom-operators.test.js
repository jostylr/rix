import { describe, expect, test } from "bun:test";
import { Fraction, Integer } from "@ratmath/core";
import {
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";
import { NodePluginCatalog } from "../../src/runtime/plugin-catalog-node.js";
import { spawnSync } from "node:child_process";
import path from "node:path";

const header = (declaration, body) => `##OPS##\n${declaration}\n##OPS##\n${body}`;

describe("custom operator evaluation", () => {
    test("dispatches to an ordinary RiX function", () => {
        const result = parseAndEvaluate(header(
            ":none :additive Mediant :<o+>: :infix",
            "Mediant(a, b) -> a + b; 20 :<o+>: 22",
        ));
        expect(result).toBeInstanceOf(Integer);
        expect(result.value).toBe(42n);
    });

    test("dispatches to a method on a plugin/system object", () => {
        const method = (name, impl) => ({
            type: "method_builtin",
            name,
            impl,
        });
        const fractions = {
            type: "map",
            entries: new Map(),
            _ext: new Map([
                ["MAKE", method("Make", ([, numerator, denominator]) =>
                    new Fraction(numerator.value, denominator.value))],
                ["MEDIANT", method("Mediant", ([, left, right]) => {
                    if (!(left instanceof Fraction) || !(right instanceof Fraction)) {
                        throw new Error("Mediant expects Fraction operands");
                    }
                    return new Fraction(
                        left.numerator + right.numerator,
                        left.denominator + right.denominator,
                    );
                })],
            ]),
        };
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHostValue("fractions", fractions, {
            doc: "Formal unreduced fractions",
            groups: ["Exact"],
        });
        systemContext.freeze();

        const result = parseAndEvaluate(header(
            ":none .fractions.Mediant :<o+>: :additive :infix",
            ".fractions.Make(1, 2) :<o+>: .fractions.Make(1, 3)",
        ), {
            context: new Context(),
            registry: createDefaultRegistry(),
            systemContext,
        });
        expect(result).toBeInstanceOf(Fraction);
        expect(result.numerator).toBe(2n);
        expect(result.denominator).toBe(5n);
    });

    test("a preloaded plugin contributes OPS declarations from its operator file", () => {
        const catalog = new NodePluginCatalog({
            roots: [path.resolve("tests/fixtures/operator-plugins")],
        }).scan();
        catalog.registerInstaller("fraction-ops", ({ systemContext }) => {
            const method = (name, impl) => ({ type: "method_builtin", name, impl });
            const value = {
                type: "map",
                entries: new Map(),
                _ext: new Map([
                    ["MAKE", method("Make", ([, numerator, denominator]) =>
                        new Fraction(numerator.value, denominator.value))],
                    ["MEDIANT", method("Mediant", ([, left, right]) => new Fraction(
                        left.numerator + right.numerator,
                        left.denominator + right.denominator,
                    ))],
                ]),
            };
            systemContext.registerHostValue("fractions", value, {
                doc: "Formal unreduced fractions",
                groups: ["Exact"],
            });
        });

        const context = new Context();
        const registry = createDefaultRegistry();
        const systemContext = createDefaultSystemContext({ pluginCatalog: catalog });
        parseAndEvaluate("", { context, registry, systemContext });
        catalog.load("fraction-ops", { context, registry, systemContext });

        const result = parseAndEvaluate(
            ".fractions.Make(1, 2) :<o+>: .fractions.Make(2, 3)",
            { context, registry, systemContext },
        );
        expect(result).toBeInstanceOf(Fraction);
        expect(result.numerator).toBe(3n);
        expect(result.denominator).toBe(5n);
    });

    test("the CLI loads an operator file named by a script YAML header", () => {
        const sourcePath = path.resolve("tests/fixtures/custom-operators/source-header.rix");
        const result = spawnSync("bun", [path.resolve("bin/rix.js"), sourcePath], {
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout.trim()).toBe("42");
    });
});
