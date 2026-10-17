import { describe, expect, test } from "bun:test";
import { createOperatorMetadataCache } from "../../src/runtime/plugin-operator-cache.js";
import { PluginCatalog } from "../../src/runtime/plugin-catalog.js";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/index-node.js";

const source = "##OPS##\n:<plus>: Plus :infix :additive :left\n##OPS##\n1;";
const options = { label: "alpha.rix", owner: { pluginId: "alpha", mount: "alpha" } };
const metadata = { id: "alpha", description: "Cache fixture", kind: "rix", mount: "alpha" };
const catalogEntry = (value = metadata, text = source) => new PluginCatalog().addMetadata(value, {
    kind: "rix", source: text, sourcePath: "alpha.rix",
});

describe("plugin operator metadata cache", () => {
    test("reuses parsing while preserving fresh arrays and frozen record identities", () => {
        const cache = createOperatorMetadataCache();
        const first = cache.get(source, options);
        const second = cache.get(source, options);
        expect(second).toEqual(first);
        expect(second).not.toBe(first);
        expect(second[0]).not.toBe(first[0]);
        expect(second[0].target).not.toBe(first[0].target);
        expect(Object.isFrozen(first)).toBe(false);
        for (const entry of [first[0], second[0]]) {
            expect(Object.isFrozen(entry)).toBe(true);
            expect(Object.isFrozen(entry.target)).toBe(true);
            expect(() => { entry.target.method = "MUTATED"; }).toThrow();
        }
        first[0] = { target: { method: "MUTATED" } };
        second.push({ symbol: "extra" });
        expect(cache.get(source, options)).toHaveLength(1);
        expect(cache.get(source, options)[0].target.method).toBe("PLUS");
        expect(cache.stats()).toMatchObject({ parses: 1, misses: 1, hits: 3, entries: 1 });
    });

    test("keys source, label, plugin identity and mount independently", () => {
        const cache = createOperatorMetadataCache();
        const first = cache.get(source, options);
        const changedSource = cache.get(source.replace("Plus", "Other"), options);
        const changedLabel = cache.get(source, { ...options, label: "other.rix" });
        const changedOwner = cache.get(source, { ...options, owner: { ...options.owner, pluginId: "beta" } });
        const changedMount = cache.get(source, { ...options, owner: { ...options.owner, mount: "other" } });
        expect(first[0].target.method).toBe("PLUS");
        expect(changedSource[0].target.method).toBe("OTHER");
        expect(changedLabel[0].source).toBe("other.rix");
        expect(changedOwner[0].target.pluginId).toBe("beta");
        expect(changedMount[0].target.mount).toBe("other");
        expect(cache.stats()).toMatchObject({ parses: 5, misses: 5, entries: 5 });
    });

    test("does not cache parser failures or stale diagnostics", () => {
        const cache = createOperatorMetadataCache();
        const broken = "##OPS##\n:<oops>: nope\n##OPS##";
        for (const label of ["first.rix", "first.rix", "second.rix"]) {
            expect(() => cache.get(broken, { ...options, label })).toThrow(label);
        }
        expect(cache.stats()).toMatchObject({ entries: 0, errors: 3, parses: 3 });
    });

    test("retains LRU order under the entry limit", () => {
        const cache = createOperatorMetadataCache({ maxEntries: 2 });
        const a = "1;", b = "2;", c = "3;";
        cache.get(a, options); cache.get(b, options); cache.get(a, options);
        cache.get(c, options); cache.get(a, options); cache.get(b, options);
        expect(cache.stats()).toMatchObject({ entries: 2, parses: 4, hits: 2, evictions: 2 });
    });

    test("bounds retained payload and bypasses oversized entries", () => {
        const tiny = createOperatorMetadataCache({ maxBytes: 1 });
        tiny.get(source, options); tiny.get(source, options);
        expect(tiny.stats()).toMatchObject({ entries: 0, estimatedBytes: 0, bypasses: 2, parses: 2 });
        const bounded = createOperatorMetadataCache({ maxEntries: 10, maxBytes: 300 });
        for (let index = 0; index < 20; index++) bounded.get(`${index};`, options);
        expect(bounded.stats().estimatedBytes).toBeLessThanOrEqual(300);
        expect(bounded.stats().entries).toBeLessThanOrEqual(10);
        expect(bounded.stats().evictions).toBeGreaterThan(0);
    });

    test("does not coerce unusual owners into shared cache keys", () => {
        const cache = createOperatorMetadataCache();
        const unusual = { ...options, owner: { pluginId: null, mount: null } };
        expect(cache.get(source, unusual)[0].target).toEqual({ kind: "function", name: "PLUS" });
        cache.get(source, unusual);
        expect(cache.stats()).toMatchObject({ entries: 0, bypasses: 2, parses: 2 });
        for (const config of [{ maxEntries: 0 }, { maxBytes: -1 }, { maxBytes: Infinity }]) {
            expect(() => createOperatorMetadataCache(config)).toThrow("Positive cache limits");
        }
        cache.get(source, options); cache.clear();
        expect(cache.stats()).toMatchObject({ entries: 0, estimatedBytes: 0, parses: 0, bypasses: 0 });
    });

    test("catalogs retain fresh mutable containers and current metadata validation", () => {
        const first = catalogEntry();
        first.operatorDefinitions[0] = { target: { method: "MUTATED" } };
        const second = catalogEntry({ ...metadata, permissions: ["read"] });
        expect(second.operatorDefinitions[0].target.method).toBe("PLUS");
        expect(second.operatorDefinitions).not.toBe(first.operatorDefinitions);
        expect(second.permissions).toEqual(["read"]);
        expect(() => catalogEntry({ ...metadata, aliases: "bad" })).toThrow("array");
        const supplied = [];
        expect(catalogEntry({ ...metadata, operatorDefinitions: supplied }).operatorDefinitions).toBe(supplied);
        expect(catalogEntry(metadata, "1;").operatorDefinitions).toEqual([]);
        expect(new PluginCatalog().addMetadata({ ignore: true }, { kind: "rix", source })).toBeNull();
    });

    test("still rejects duplicate IDs and mount collisions after cache hits", () => {
        const catalog = new PluginCatalog();
        const add = value => catalog.addMetadata(value, { source, sourcePath: "alpha.rix" });
        add(metadata);
        expect(() => add(metadata)).toThrow("Duplicate plugin id");
        expect(() => add({ ...metadata, id: "beta" })).toThrow("conflicts");
    });

    test("fresh sessions never share loaded state or namespaces", () => {
        const make = () => ({ context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
        const first = make(), second = make();
        expect(first.systemContext._pluginCatalog).not.toBe(second.systemContext._pluginCatalog);
        const result = parseAndEvaluate('.Plugin.Load("poly"); P := .poly([1,2,3]); P(2);', first);
        expect(result.toString()).toBe("11");
        expect(first.systemContext._pluginCatalog.loaded.has("poly")).toBe(true);
        expect(second.systemContext._pluginCatalog.loaded.has("poly")).toBe(false);
        expect(parseAndEvaluate("2+3", second).toString()).toBe("5");
        const custom = new PluginCatalog();
        custom.addMetadata({ id: "poly", description: "Host override", mount: "customPoly" }, { kind: "host" });
        const system = createDefaultSystemContext({ pluginCatalog: custom });
        expect(system._pluginCatalog.info("poly").mount).toBe("customPoly");
    });
});
