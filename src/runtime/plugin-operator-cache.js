/**
  * Bounded, process-local cache for source-derived plugin operator declarations.
  * Live catalogs and capabilities are never retained here. Internal module only;
  * it is deliberately not re-exported from the public runtime API.
  */
import { extractOperatorDeclarationsFromSource } from "../parser/custom-operators.js";

function deepFreeze(value) {
    if (value && typeof value === "object") {
        for (const item of Object.values(value)) deepFreeze(item);
        Object.freeze(value);
    }
    return value;
}

export function createOperatorMetadataCache({ maxEntries = 128, maxBytes = 16 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("Positive cache limits required");
    const entries = new Map();
    let bytes = 0;
    const stats = { hits: 0, misses: 0, parses: 0, errors: 0, evictions: 0, bypasses: 0 };
    const parse = (source, options) => {
        stats.parses++;
        try { return Array.from(extractOperatorDeclarationsFromSource(source, options).values()); }
        catch (error) { stats.errors++; throw error; }
    };
    return {
        get(source, options) {
            const { label, owner } = options;
            // These are all parser inputs used by PluginCatalog, not host capabilities.
            // Bypass unusual invalid metadata rather than coercing it into a cache key.
            if (typeof source !== "string" || typeof label !== "string" ||
                    typeof owner?.pluginId !== "string" || !(owner.mount === null || typeof owner.mount === "string")) {
                stats.bypasses++; return parse(source, options);
            }
            // Parser configuration/version is fixed by this module instance. No AST,
            // loaded state, registry, mutable namespace or capability goes in the key.
            const key = JSON.stringify([source, label, owner.pluginId, owner.mount]);
            const existing = entries.get(key);
            if (existing) {
                stats.hits++; entries.delete(key); entries.set(key, existing);
                return structuredClone(existing.value).map(deepFreeze);
            }
            stats.misses++;
            const value = parse(source, options); // Failures never become cache entries.
            // Approximate retained UTF-16 payload, excluding engine/container overhead.
            const size = 2 * (key.length + JSON.stringify(value).length);
            if (size > maxBytes) { stats.bypasses++; return value; }
            while (entries.size >= maxEntries || bytes + size > maxBytes) {
                const oldest = entries.keys().next().value;
                bytes -= entries.get(oldest).size; entries.delete(oldest); stats.evictions++;
            }
            entries.set(key, { size, value: deepFreeze(structuredClone(value)) }); bytes += size;
            return value; // Caller owns the parser output; cache owns a separate copy.
        },
        stats: () => ({ ...stats, entries: entries.size, estimatedBytes: bytes, maxEntries, maxBytes }),
        clear() { entries.clear(); bytes = 0; for (const key of Object.keys(stats)) stats[key] = 0; },
    };
}
const cache = createOperatorMetadataCache();
export const cachedPluginOperatorDefinitions = (source, options) => cache.get(source, options);
