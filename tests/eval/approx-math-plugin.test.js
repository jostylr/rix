import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Rational, RationalInterval } from "@ratmath/core";
import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";
import { loadFloatPlugin } from "../../plugins/float/node-installer.js";
import { NodePluginCatalog } from "../../src/runtime/plugin-catalog-node.js";

const approximatePluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/float");

describe("approximate math plugin", () => {
    test("transcendental functions are absent from the default system", () => {
        expect(() => parseAndEvaluate(".Sin(1)"))
            .toThrow("Unknown system capability: SIN");
    });

    test("the Float plugin is cataloged and loaded under the float ID", () => {
        const catalog = new NodePluginCatalog({ roots: [approximatePluginRoot] }).scan();
    catalog.registerInstaller("float", ({ systemContext, registry }) => loadFloatPlugin(systemContext, registry));
        const systemContext = createDefaultSystemContext({ pluginCatalog: catalog });
        const registry = createDefaultRegistry();

        expect(catalog.info("float")).toMatchObject({ id: "float", mount: "float", kind: "host" });
        expect(parseAndEvaluate('.Plugin.Load("float"); .float(1/3).Value()', { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
    });

    test("plugin installs Float conversion and PascalCase methods below .float", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);

        expect(parseAndEvaluate(".float.Sin(1).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(Math.sin(1)) });
        expect(parseAndEvaluate(".float.Float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(parseAndEvaluate(".float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(() => parseAndEvaluate(".float.sin(1)", { systemContext, registry }))
            .toThrow("Unknown system member 'float.sin'");
    });

    test("Float interval and decimal rounding methods return exact numeric values", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);

        const enclosure = parseAndEvaluate(".float.Interval(.float(1/3))", { systemContext, registry });
        expect(enclosure).toBeInstanceOf(RationalInterval);
        expect(enclosure.low).toBeInstanceOf(Rational);
        expect(enclosure.low.equals(enclosure.high)).toBe(true);

        expect(parseAndEvaluate(".float.Round(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("6/5");
        expect(parseAndEvaluate(".float.Floor(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("6/5");
        expect(parseAndEvaluate(".float.Ceiling(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("13/10");
    });

    test("generic Min and Max promote mixed exact and Float values through the plugin comparison variant", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);

        expect(parseAndEvaluate(".Min(2/3, .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(2 / 3) });
        expect(parseAndEvaluate(".Max(2/3, .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(3 / 4) });
    });
});
