import { createMemoryAssetStore } from "./output-assets.js";
/**
 * Host services used by the portable evaluator.
 *
 * Browser hosts can provide already-loaded RiX sources and trusted JavaScript
 * modules without pulling Node's filesystem or module loader into the bundle.
 */

export const HOST_ADAPTER_ENV = "__host_adapter__";

function directoryURL(value) {
    const url = new URL(value);
    return url.href.endsWith("/") ? url : new URL(".", url);
}

function mapLookup(map, key, fallbackKey = null) {
    if (map instanceof Map) return map.get(key) ?? (fallbackKey === null ? undefined : map.get(fallbackKey));
    if (map && typeof map === "object") return map[key] ?? (fallbackKey === null ? undefined : map[fallbackKey]);
    return undefined;
}

/**
 * Create a browser-safe host backed by sources and modules the embedding host
 * has already loaded (for example with fetch, a file picker, or import()).
 */
export function createBrowserHostAdapter(options = {}) {
    const baseURL = options.baseURL || globalThis.location?.href || "rix:///";
    const sources = options.sources || new Map();
    const modules = options.modules || new Map();
    const assetStore = options.assetStore || createMemoryAssetStore(options.assets || new Map());

    const resolve = (requested, baseDir, extension = "") => {
        const target = extension && !requested.endsWith(extension) ? `${requested}${extension}` : requested;
        return new URL(target, directoryURL(baseDir || baseURL)).href;
    };

    return Object.freeze({
        kind: "browser",
        readAsset: (reference, limits) => assetStore.readAsset(reference, limits),
        cwd() {
            return directoryURL(baseURL).href;
        },
        resolveScriptPath(requested, { baseDir } = {}) {
            return resolve(String(requested), baseDir, ".rix");
        },
        resolveModulePath(requested, { baseDir } = {}) {
            return resolve(String(requested), baseDir);
        },
        dirname(resolvedPath) {
            return directoryURL(resolvedPath).href;
        },
        readTextSync(resolvedPath) {
            const source = typeof options.readTextSync === "function"
                ? options.readTextSync(resolvedPath)
                : mapLookup(sources, resolvedPath, new URL(resolvedPath).pathname);
            if (typeof source !== "string") {
                throw new Error(
                    `Browser host has no preloaded source for '${resolvedPath}'. ` +
                    "Load it with fetch or a file picker and pass it to createBrowserHostAdapter().",
                );
            }
            return source;
        },
        importModuleSync(resolvedPath) {
            const loaded = typeof options.importModuleSync === "function"
                ? options.importModuleSync(resolvedPath)
                : mapLookup(modules, resolvedPath, new URL(resolvedPath).pathname);
            if (loaded === undefined) {
                throw new Error(
                    `Browser host has no trusted preloaded module for '${resolvedPath}'. ` +
                    "Import it in the host and pass it to createBrowserHostAdapter().",
                );
            }
            return loaded;
        },
    });
}

let defaultHostAdapter = createBrowserHostAdapter();

export function getDefaultHostAdapter() {
    return defaultHostAdapter;
}

export function setDefaultHostAdapter(adapter) {
    if (!adapter || typeof adapter.resolveScriptPath !== "function") {
        throw new TypeError("RiX host adapter must implement resolveScriptPath()");
    }
    defaultHostAdapter = adapter;
    return adapter;
}

export function getHostAdapter(context) {
    return context?.getEnv?.(HOST_ADAPTER_ENV, null) || defaultHostAdapter;
}
