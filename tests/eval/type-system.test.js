import { describe, test, expect } from "bun:test";
import { Integer, Rational, RationalInterval, RationalIntervalSet } from "@ratmath/core";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { evaluate, createDefaultRegistry, createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";
import {
    makeProto,
    exportByRegisteredTypeRuntime,
    importByRegisteredTypeRuntime,
    registerTrait,
    registerType,
    traitRegistry,
    typeRegistry,
    valueMethod,
    stringObj,
} from "../../src/runtime/type-system.js";
import { loadOracleExampleStartup } from "../../src/eval/startup/oracle-example.js";
import { loadFloatPluginStartup } from "../../plugins/float/float-loader.js";
import { loadFloatPlugin } from "../../plugins/float/node-installer.js";

const defaultSystemContext = createDefaultSystemContext();

function evalRiX(code, ctx = new Context(), registryOptions = {}) {
    const registry = createDefaultRegistry(registryOptions);
    const ir = lower(parse(tokenize(code), () => ({ type: "identifier" })));
    let result = null;
    for (const node of ir) {
        result = evaluate(node, ctx, registry, defaultSystemContext);
    }
    return { result, context: ctx, registry };
}

function asBool(value) {
    return value instanceof Integer && value.value === 1n;
}

describe("RiX type and trait registry", () => {
    test("registered trait entries are immutable and duplicate registration is rejected", () => {
        const entry = registerTrait({
            name: "testImmutableTrait",
            implies: [],
            proto: () => makeProto(),
            description: "test trait",
        });
        expect(entry.name).toBe("testImmutableTrait");
        expect(Object.isFrozen(entry)).toBe(true);
        expect(() => {
            entry.description = "changed";
        }).toThrow();
        expect(() => registerTrait({ name: "testImmutableTrait" })).toThrow(/Duplicate trait registration/);
    });

    test("registered type entries are immutable and duplicate registration is rejected", () => {
        const entry = registerType({
            name: "TestImmutableType",
            nativeType: "testImmutable",
            convert: (value) => value,
            proto: () => makeProto(),
        });
        expect(entry.name).toBe("TestImmutableType");
        expect(Object.isFrozen(entry)).toBe(true);
        expect(() => {
            entry.nativeType = "changed";
        }).toThrow();
        expect(() => registerType({ name: "TestImmutableType" })).toThrow(/Duplicate type registration/);
    });

    test("trait implication materializes implied traits", () => {
        const { result } = evalRiX(`
            x = {^ /::Rational/ 7};
            {: x ? :number, x ? :ring, x ? :field, x ? :rational };
        `);
        expect(result.values.map(asBool)).toEqual([true, true, true, true]);
    });

    test("Rational conversion supports soft, strict, and header forms", () => {
        expect(evalRiX("7 ~: :Rational").result).toBeInstanceOf(Rational);
        expect(evalRiX("7 ~!: :Rational").result).toBeInstanceOf(Rational);
        expect(evalRiX('"bad" ~: :Rational').result).toBeNull();
        expect(() => evalRiX('"bad" ~!: :Rational')).toThrow(/Cannot convert value to semantic type Rational/);

        const outfitted = evalRiX("x = {^ /::Rational/ 7}; {: x.__type, x ? :field }").result;
        expect(outfitted.values[0].value).toBe("Rational");
        expect(asBool(outfitted.values[1])).toBe(true);
    });

    test("type proto methods work through method lookup and explicit __proto access", () => {
        const result = evalRiX(`
            x = {^ /::Rational/ 7};
            {: x.Num(), x.__proto[:type].Num(x) };
        `).result;
        expect(result.values[0].value).toBe(7n);
        expect(result.values[1].value).toBe(7n);
    });

    test("later explicit trait proto wins over earlier trait proto", () => {
        registerTrait({
            name: "testProtoA",
            proto: () => makeProto([["Clash", valueMethod("Clash", () => stringObj("A"))]]),
        });
        registerTrait({
            name: "testProtoB",
            proto: () => makeProto([["Clash", valueMethod("Clash", () => stringObj("B"))]]),
        });

        const result = evalRiX("x = {^ /:testProtoA :testProtoB/ 7}; x.Clash();").result;
        expect(result.value).toBe("B");
    });

    test("system operators are multifunction-backed with native fallback and installed Rational variants", () => {
        const registry = createDefaultRegistry();
        const add = registry.get("ADD");
        expect(add.systemMultifunction).toBe(true);
        expect(add.variants.at(-1).name).toBe("NativeFallback");
        expect(add.variants.some((variant) => variant.name === "RatRat" && variant.installedByType === "Rational")).toBe(true);

        const result = evalRiX("r = 1/2 ~: :Rational; s = 1/3 ~: :Rational; r + s;").result;
        expect(result).toBeInstanceOf(Rational);
        expect(result.toString()).toBe("5/6");
    });

    test("POW and POWPROD are distinct system functions with shared native behavior", () => {
        const values = evalRiX("{: 2 ^ 3, 2 ** 3, @^, @** };").result.values;
        expect(values[0].value).toBe(8n);
        expect(values[1].value).toBe(8n);
        expect(values[2].name).toBe("POW");
        expect(values[3].name).toBe("POWPROD");
    });

    test("Rational and Shaped export/import round trip through system helpers", () => {
        const rational = evalRiX("r = 7 ~: :Rational; e = .TypeExport(r); r2 = .TypeImport(e); r == r2;").result;
        expect(asBool(rational)).toBe(true);

        const shaped = evalRiX("t = {:2x2: 1, 2; 3, 4}; e = .TypeExport(t); t2 = .TypeImport(e); {: t2.Shape(), t2.Flatten() };").result;
        expect(shaped.values[0].values.map((v) => Number(v.value))).toEqual([2, 2]);
        expect(shaped.values[1].shape).toEqual([4]);
        expect(shaped.values[1].data.map((v) => Number(v.value))).toEqual([1, 2, 3, 4]);
    });

    test("an unregistered semantic type is rejected", () => {
        expect(typeRegistry.has("DefinitelyMissingType")).toBe(false);
        expect(() => evalRiX("7 ~!: :DefinitelyMissingType")).toThrow(/Unknown semantic type: DefinitelyMissingType/);
    });

    test("example user startup can register a minimal distinct Oracle-like export/import", () => {
        const result = evalRiX(
            "o = 7 ~: :ExampleOracle; e = .TypeExport(o); o2 = .TypeImport(e); o2.Mid();",
            new Context(),
            { startupLoaders: [loadOracleExampleStartup] },
        ).result;
        expect(result.value).toBe(7n);
    });

    test("example Float startup registers a RiX interface backed by JavaScript", () => {
        expect(defaultSystemContext.has("FLOATLTE")).toBe(false);
        expect(defaultSystemContext.has("FloatLte")).toBe(false);
        expect(defaultSystemContext.has("IMPORTJS")).toBe(true);
        expect(defaultSystemContext.has("SIN")).toBe(false);

        const { result, registry } = evalRiX(
            "{; a = 1 ~: :Float; b = 2 ~: :Float; c = a + b * b; ex = .TypeExport(c); c2 = .TypeImport(ex); c2.Value() }",
            new Context(),
            { startupLoaders: [loadFloatPluginStartup] },
        );

        expect(result.value).toBe("5");
        expect(registry.get("ADD").variants.some((variant) => variant.name === "FloatFloat" && variant.installedByType === "Float")).toBe(true);
    });

    test("semantic display methods are used by formatter when host context is supplied", () => {
        const { result, context, registry } = evalRiX(
            "a = 1 ~: :Float; b = 2 ~: :Float; a + b;",
            new Context(),
            { startupLoaders: [loadFloatPluginStartup] },
        );
        expect(formatValue(result)).toBe("[object Object]");
        expect(formatValue(result, {
            context,
            evaluate: (node) => evaluate(node, context, registry, defaultSystemContext),
        })).toBe("3");
    });

    test("Float plugin requires explicit conversion for mixed arithmetic", () => {
        const context = new Context();
        const registry = createDefaultRegistry();
        const systemContext = createDefaultSystemContext();
        loadFloatPlugin(systemContext, registry);
        const ir = lower(parse(tokenize("{; a = .float.Float(0.5); {: .float(7) + .float.Sin(a), .float.Sin(a) + .float(7), .float(1/2) + a, a < .float(1), .float(1) > a } }"), () => ({ type: "identifier" })));
        let result = null;
        for (const node of ir) {
            result = evaluate(node, context, registry, systemContext);
        }
        expect(formatValue(result.values[0], {
            context,
            evaluate: (node) => evaluate(node, context, registry, systemContext),
        })).toBe(String(7 + Math.sin(0.5)));
        expect(formatValue(result.values[1], {
            context,
            evaluate: (node) => evaluate(node, context, registry, systemContext),
        })).toBe(String(7 + Math.sin(0.5)));
        expect(formatValue(result.values[2], {
            context,
            evaluate: (node) => evaluate(node, context, registry, systemContext),
        })).toBe("1");
        expect(asBool(result.values[3])).toBe(true);
        expect(asBool(result.values[4])).toBe(true);
        expect(() => parseAndEvaluate("1/2 + .float(1/2)", { context, registry, systemContext })).toThrow();
    });

    test("built-in registries expose the expected built-ins", () => {
        expect(typeRegistry.has("Rational")).toBe(true);
        expect(typeRegistry.has("rational")).toBe(true);
        expect(typeRegistry.has("Integer")).toBe(true);
        expect(typeRegistry.has("RationalInterval")).toBe(true);
        expect(typeRegistry.has("RationalIntervalSet")).toBe(true);
        expect(typeRegistry.has("Shaped")).toBe(true);
        expect(traitRegistry.has("field")).toBe(true);
        expect(traitRegistry.has("shapeAware")).toBe(true);
    });

    test("RationalIntervalSet has portable runtime interchange and exact methods", () => {
        const original = new RationalIntervalSet([
            { low: null, high: -1, lowClosed: false, highClosed: true },
            new RationalInterval(1, 2),
        ]);
        const exported = exportByRegisteredTypeRuntime(original);
        const imported = importByRegisteredTypeRuntime(exported);
        expect(imported).toBeInstanceOf(RationalIntervalSet);
        expect(imported.equals(original)).toBe(true);
        expect(formatValue(imported)).toBe("(-inf,-1] U [1,2]");

        const proto = typeRegistry.get("RationalIntervalSet").proto();
        const union = proto.entries.get("Union").impl([
            imported,
            new RationalIntervalSet({ low: -1, high: 1 }),
        ]);
        expect(union.toString()).toBe("(-inf,2]");
        expect(proto.entries.get("ContainsValue").impl([imported, 0])).toBeNull();
        expect(proto.entries.get("ContainsValue").impl([imported, 1])).toBeInstanceOf(Integer);
        expect(proto.entries.get("Components").impl([imported]).values).toHaveLength(2);

        const malformed = exportByRegisteredTypeRuntime(original);
        malformed.entries.get("data").entries.get("components").values[0]
            .entries.set("lowClosed", new Integer(0n));
        expect(() => importByRegisteredTypeRuntime(malformed)).toThrow("must be a RiX boolean");

        const chained = evalRiX(`
            a := (0:1) ~: :RangeSet;
            b := (2:3) ~: :RangeSet;
            a.Union(b).Hull().ToString();
        `).result;
        expect(chained.value).toBe("[0,3]");
    });

    test("semantic type and trait names are case-insensitive with canonical metadata", () => {
        expect(typeRegistry.get("rAtIoNaL")?.name).toBe("Rational");
        expect(traitRegistry.get("OrDeReD")?.name).toBe("ordered");

        const result = evalRiX(`
            x = {^ /::rAtIoNaL :OrDeReD/ 7};
            {: x.__type, x ? :RATIONAL, x ? :oRdErEd, .TypeKnown(:rAtIoNaL) }
        `).result;
        expect(result.values[0].value).toBe("Rational");
        expect(result.values.slice(1).map((value) => value?.value ?? null)).toEqual([1n, 1n, 1n]);
    });

    test("semantic registry rejects names and aliases that differ only by case", () => {
        const suffix = `${Date.now()}CaseFold`;
        registerType({ name: suffix, aliases: [`${suffix}Alias`], convert: (value) => value });
        expect(() => registerType({ name: suffix.toUpperCase(), convert: (value) => value }))
            .toThrow(/Duplicate type registration/);
        expect(() => registerType({
            name: `${suffix}Other`,
            aliases: [`${suffix}alias`.toLowerCase()],
            convert: (value) => value,
        })).toThrow(/Duplicate type alias/);
    });
});
