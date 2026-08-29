import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Rational, RationalInterval } from "@ratmath/core";
import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";
import { loadFloatPlugin } from "../../plugins/float/node-installer.js";
import { NodePluginCatalog } from "../../src/runtime/plugin-catalog-node.js";
import { createNodeHostAdapter } from "../../src/runtime/host-adapter-node.js";
import { setDefaultHostAdapter } from "../../src/runtime/host-adapter.js";

setDefaultHostAdapter(createNodeHostAdapter());

const approximatePluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/float");

function entry(map, key) {
    const lower = String(key).toLowerCase();
    for (const [candidate, value] of map.entries) {
        if (String(candidate).toLowerCase() === lower) return value;
    }
    return undefined;
}

function diagnosticNames(classification) {
    return entry(classification, "diagnostics").values.map((value) => value.value);
}

describe("approximate math plugin", () => {
    test("real-valued math functions are absent from the default system", () => {
        const systemContext = createDefaultSystemContext();
        for (const name of [
            "Sqrt", "Sin", "Cos", "Tan", "Asin", "Acos", "Atan", "Atan2",
            "Exp", "Log", "Ln", "Log2", "Log10",
        ]) {
            expect(systemContext.has(name)).toBe(false);
        }
        expect(() => parseAndEvaluate(".Sqrt(2)"))
            .toThrow("Unknown system capability: SQRT");
        expect(() => parseAndEvaluate(".Sin(1)"))
            .toThrow("Unknown system capability: SIN");
        expect(() => parseAndEvaluate(".Log(1)"))
            .toThrow("Unknown system capability: LOG");
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
        expect(parseAndEvaluate(".float.Sqrt(2).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(Math.sqrt(2)) });
        expect(parseAndEvaluate(".float.Float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(parseAndEvaluate(".float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(parseAndEvaluate("(1/3).Float().Value()", { systemContext, registry }))
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

    test("mixed exact and Float arithmetic and ordering require explicit conversion", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);

        expect(() => parseAndEvaluate("2/3 + .float(3/4)", { systemContext, registry }))
            .toThrow();
        expect(() => parseAndEvaluate(".Min(2/3, .float(3/4))", { systemContext, registry }))
            .toThrow();
        expect(parseAndEvaluate(".Min(.float(2/3), .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(2 / 3) });
        expect(parseAndEvaluate("(.float(2/3) + .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(2 / 3 + 3 / 4) });
        expect(parseAndEvaluate(".Max(.float(2/3), .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(3 / 4) });
    });

    test("Phase 2 supports explicit binary32/binary64 rounding and adjacent values", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);
        const options = { systemContext, registry };

        expect(parseAndEvaluate(".float.Binary32(1/10).Format()", options).value).toBe("binary32");
        expect(parseAndEvaluate(".float.Binary64(1/10).Format()", options).value).toBe("binary64");
        expect(parseAndEvaluate(".float.Binary32(1).NextUp().Value()", options).value)
            .toBe("1.0000001192092896");
        expect(parseAndEvaluate(".float.Binary64(1).NextUp().Value()", options).value)
            .toBe("1.0000000000000002");
        expect(parseAndEvaluate(".float.Binary32(0).NextDown().Value()", options).value)
            .toBe("-1.401298464324817e-45");
        expect(parseAndEvaluate(".float.Binary64(0).NextDown().Value()", options).value).toBe("-5e-324");
        expect(parseAndEvaluate(".float.Binary32(1).NextAfter(2).Value()", options).value)
            .toBe("1.0000001192092896");
        expect(parseAndEvaluate(".float.Binary64(1).Binary32().Format()", options).value).toBe("binary32");

        expect(parseAndEvaluate("(.float.Binary32(16777216) + .float.Binary32(1)).Value()", options).value)
            .toBe("16777216");
        expect(parseAndEvaluate("(.float.Binary64(16777216) + .float.Binary64(1)).Value()", options).value)
            .toBe("16777217");
        expect(() => parseAndEvaluate(".float.Binary32(1) + .float.Binary64(1)", options))
            .toThrow("Mixed binary32/binary64 Float arithmetic");

        const enclosure = parseAndEvaluate(".float.Interval(.float.Binary32(1/10))", options);
        expect(enclosure.low.equals(enclosure.high)).toBe(true);
        expect(enclosure.low.equals(new Rational(13421773n, 134217728n))).toBe(true);
        expect(enclosure.low.toNumber()).toBe(Math.fround(1 / 10));

        const sample = parseAndEvaluate(".float.Binary32(1/10).Sample({= maxWork=5 })", options);
        expect(entry(sample, "status").value).toBe("approximate");
        expect(entry(sample, "certified")).toBeNull();
        expect(entry(sample, "interval").low.equals(enclosure.low)).toBe(true);
        expect(entry(entry(sample, "source"), "format").value).toBe("binary32");

        const restored = parseAndEvaluate(
            ".TypeImport(.TypeExport(.float.Binary32(1/10))).Classify()",
            options,
        );
        expect(entry(restored, "format").value).toBe("binary32");
        expect(entry(restored, "class").value).toBe("normal");
    });

    test("Phase 2 reports exceptional IEEE values as structured diagnostics", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);
        const options = { systemContext, registry };

        const overflow = parseAndEvaluate(".float.Binary32(10^100).Classify()", options);
        expect(entry(overflow, "class").value).toBe("infinity");
        expect(diagnosticNames(overflow)).toEqual(["overflow", "infinity"]);

        const underflow = parseAndEvaluate(".float.Binary32(1/(10^100)).Classify()", options);
        expect(entry(underflow, "class").value).toBe("zero");
        expect(diagnosticNames(underflow)).toEqual(["underflowToZero"]);

        const signedZero = parseAndEvaluate(".float.Binary32(-1/(10^100)).Classify()", options);
        expect(entry(signedZero, "class").value).toBe("zero");
        expect(entry(signedZero, "sign").value).toBe("negative");
        expect(entry(signedZero, "negativeZero").value).toBe(1n);
        expect(diagnosticNames(signedZero)).toEqual(["underflowToZero", "negativeZero"]);

        const infinity = parseAndEvaluate("(.float.Binary32(1) / .float.Binary32(0)).Classify()", options);
        expect(entry(infinity, "class").value).toBe("infinity");
        expect(diagnosticNames(infinity)).toEqual(["divisionByZero", "infinity"]);

        const nan = parseAndEvaluate("(.float.Binary64(0) / .float.Binary64(0)).Classify()", options);
        expect(entry(nan, "class").value).toBe("nan");
        expect(entry(nan, "sign").value).toBe("unordered");
        expect(diagnosticNames(nan)).toEqual(["invalidOperation", "nan"]);
        expect(parseAndEvaluate(
            "(.float.Binary64(0) / .float.Binary64(0)).NextAfter(1).Classify()[:class]",
            options,
        ).value).toBe("nan");
        expect(() => parseAndEvaluate(".float.Interval(.float.Binary32(10^100))", options))
            .toThrow("Float Interval requires a finite stored value");

        const nonfiniteSample = parseAndEvaluate(
            "(.float.Binary32(1) / .float.Binary32(0)).Sample({= maxWork=5 })",
            options,
        );
        expect(entry(nonfiniteSample, "status").value).toBe("unknown");
        expect(entry(nonfiniteSample, "certified")).toBeNull();
        expect(entry(nonfiniteSample, "diagnostics").values.map((value) => value.value))
            .toEqual(["storedValueNonFinite", "noFiniteRationalInterval", "divisionByZero", "infinity"]);

        const restoredOverflow = parseAndEvaluate(
            ".TypeImport(.TypeExport(.float.Binary32(10^100))).Classify()",
            options,
        );
        expect(diagnosticNames(restoredOverflow)).toEqual(["overflow", "infinity"]);
        expect(() => parseAndEvaluate('.float("not a number")', options)).toThrow("Cannot convert value to Float");
    });

    test("Phase 3 reductions are policy-driven, reproducible, and expose approximate error estimates", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);
        const options = { systemContext, registry };

        const sequential = parseAndEvaluate(
            ".float.Sum([1,1/100000000,-1],{= policy=:sequential,format=:binary64 })",
            options,
        );
        const repeated = parseAndEvaluate(
            ".float.Sum([1,1/100000000,-1],{= policy=:sequential,format=:binary64 })",
            options,
        );
        const compensated = parseAndEvaluate(
            ".float.Sum([1,1/100000000,-1],{= policy=:compensated,format=:binary64 })",
            options,
        );
        expect(entry(sequential, "schema").value).toBe("rix.float.algorithm-result@1");
        expect(entry(sequential, "value").value).toBe(entry(repeated, "value").value);
        expect(entry(sequential, "value").value).not.toBe(entry(compensated, "value").value);
        const estimate = entry(sequential, "errorEstimate");
        expect(entry(estimate, "schema").value).toBe("rix.float.error-estimate@1");
        expect(entry(estimate, "absolute").value).toBeGreaterThan(0);
        expect(entry(estimate, "certified")).toBeNull();

        const dot = parseAndEvaluate(
            ".float.Dot([1,2,3],[4,5,6],{= policy=:pairwise,format=:binary32 })",
            options,
        );
        expect(entry(dot, "value").value).toBe(32);
        expect(entry(dot, "format").value).toBe("binary32");
        expect(() => parseAndEvaluate('.float.Sum([1,2],{= policy=:unknown })', options))
            .toThrow("Unknown reproducible Float policy");
        expect(() => parseAndEvaluate(".float.Dot([1,2],[3])", options))
            .toThrow("equal length");
    });

    test("Phase 3 complex Float arithmetic remains a distinct approximate schema", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadFloatPlugin(systemContext, registry);
        const options = { systemContext, registry };
        const result = parseAndEvaluate(`
            z := .float.Complex(1,2,:binary32);
            w := .float.Complex(3,4,:binary32);
            {:
                .float.ComplexMul(z,w),
                .float.ComplexConjugate(z),
                .float.ComplexAbs(z)
            };
        `, options);
        const [product, conjugate, magnitude] = result.values;
        expect(entry(product, "schema").value).toBe("rix.float.complex@1");
        expect(entry(product, "real").value).toBe(-5);
        expect(entry(product, "imaginary").value).toBe(10);
        expect(entry(product, "status").value).toBe("approximate");
        expect(entry(conjugate, "imaginary").value).toBe(-2);
        expect(magnitude.format).toBe("binary32");
        expect(magnitude.value).toBe(Math.fround(Math.hypot(1, 2)));
        expect(() => parseAndEvaluate(
            ".float.ComplexAdd(.float.Complex(1,2,:binary32),.float.Complex(1,2,:binary64))",
            options,
        )).toThrow("same Float format");
    });

    test("Phase 3 algorithms use the browser-safe bundled installer", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("float");
            .float.Dot([1,2,3],[4,5,6],{= format=:binary32 });
        `);
        expect(entry(result, "schema").value).toBe("rix.float.algorithm-result@1");
        expect(entry(result, "value").value).toBe(32);
        expect(entry(result, "errorEstimate").entries.get("certified")).toBeNull();
    });
});
