/**
 * Host-owned renderer discovery and target negotiation.
 *
 * Renderers consume portable RiX values. They do not evaluate expressions or
 * perform domain-specific refinement. A handler may delegate to another
 * registered target through request.render().
 */

import { Integer } from "@ratmath/core";

const stringValue = (value) => ({ type: "string", value: String(value) });
const sequenceValue = (values) => ({ type: "sequence", values });

function targetName(value, label = "Render target") {
    const result = value?.type === "string" ? value.value : value;
    if (typeof result !== "string" || !result.trim()) throw new Error(`${label} must be a non-empty string or colon-string`);
    return result.trim().toLowerCase().replace(/^\./, "");
}

function nativeOptions(value) {
    if (value === null || value === undefined) return {};
    if (value?.type !== "map" || !(value.entries instanceof Map)) {
        if (typeof value === "object" && !Array.isArray(value)) return value;
        throw new Error("Render options must be a map");
    }
    return Object.fromEntries(Array.from(value.entries, ([key, entry]) => [String(key), entry]));
}

function normalizeDiagnostic(value, fallbackCode = "renderer") {
    if (typeof value === "string") return Object.freeze({ level: "warning", code: fallbackCode, message: value });
    if (!value || typeof value !== "object") return Object.freeze({ level: "warning", code: fallbackCode, message: String(value) });
    return Object.freeze({
        level: value.level || "warning",
        code: value.code || fallbackCode,
        message: String(value.message || value.code || fallbackCode),
        ...(value.path ? { path: String(value.path) } : {}),
    });
}

function normalizeAsset(asset, index) {
    if (!asset || typeof asset !== "object") throw new Error(`Render asset ${index + 1} must be an object`);
    if (typeof asset.path !== "string" || !asset.path.trim()) throw new Error(`Render asset ${index + 1} requires a relative path`);
    if (typeof asset.content !== "string" && !(asset.content instanceof Uint8Array)) {
        throw new Error(`Render asset ${index + 1} content must be text or bytes`);
    }
    return Object.freeze({
        path: asset.path,
        mime: asset.mime || "application/octet-stream",
        content: asset.content,
    });
}

export function createRenderResult(fields) {
    if (!fields || typeof fields !== "object") throw new Error("Renderer must return a RenderResult object");
    if (typeof fields.content !== "string" && !(fields.content instanceof Uint8Array)) {
        throw new Error("RenderResult content must be text or Uint8Array bytes");
    }
    const target = targetName(fields.target, "RenderResult target");
    return Object.freeze({
        type: "render_result",
        target,
        mime: String(fields.mime || "application/octet-stream"),
        extension: String(fields.extension || target).replace(/^\./, "").toLowerCase(),
        content: fields.content,
        assets: Object.freeze((fields.assets || []).map(normalizeAsset)),
        diagnostics: Object.freeze((fields.diagnostics || []).map((item) => normalizeDiagnostic(item, `${target}.diagnostic`))),
        deterministic: fields.deterministic !== false,
        toolchain: fields.toolchain ? String(fields.toolchain) : null,
        metadata: Object.freeze({ ...(fields.metadata || {}) }),
    });
}

export function isRenderResult(value) {
    return Boolean(value && value.type === "render_result" && (typeof value.content === "string" || value.content instanceof Uint8Array));
}

export class UnsupportedRenderError extends Error {
    constructor(message, { code = "unsupported-input", target = null } = {}) {
        super(message);
        this.name = "UnsupportedRenderError";
        this.code = code;
        this.target = target;
    }
}

function inputKind(value) {
    if (value?.type === "output" && value.kind) return value.kind;
    if (value?.type === "map" && value.entries instanceof Map) {
        const portableType = value.entries.get("type")?.value ?? value.entries.get("type");
        const portableKind = value.entries.get("kind")?.value ?? value.entries.get("kind");
        if (portableType === "output" && typeof portableKind === "string") return portableKind;
    }
    if (value?.type) return value.type;
    return typeof value;
}

export class RendererRegistry {
    constructor() {
        this.renderers = new Map();
        this.aliases = new Map();
    }

    register(definition) {
        if (!definition || typeof definition.render !== "function") throw new Error("Renderer definition requires render(request)");
        const target = targetName(definition.target);
        if (this.renderers.has(target)) throw new Error(`Renderer target '${target}' is already registered`);
        const aliases = new Set([
            target,
            definition.mime,
            definition.extension,
            ...(definition.aliases || []),
        ].filter(Boolean).map((item) => targetName(String(item))));
        for (const alias of aliases) {
            if (this.aliases.has(alias)) throw new Error(`Renderer alias '${alias}' is already registered`);
        }
        const entry = Object.freeze({
            target,
            mime: String(definition.mime || "application/octet-stream"),
            extension: String(definition.extension || target).replace(/^\./, "").toLowerCase(),
            aliases: Object.freeze([...aliases]),
            inputKinds: Object.freeze([...(definition.inputKinds || [])]),
            deterministic: definition.deterministic !== false,
            description: String(definition.description || `${target} renderer`),
            render: definition.render,
        });
        this.renderers.set(target, entry);
        for (const alias of aliases) this.aliases.set(alias, target);
        return entry;
    }

    unregister(targetValue) {
        const entry = this.info(targetValue);
        if (!entry) return false;
        this.renderers.delete(entry.target);
        for (const alias of entry.aliases) this.aliases.delete(alias);
        return true;
    }

    resolve(targetValue) {
        const requested = targetName(targetValue);
        return this.aliases.get(requested) || (this.renderers.has(requested) ? requested : null);
    }

    info(targetValue) {
        const resolved = this.resolve(targetValue);
        return resolved ? this.renderers.get(resolved) : null;
    }

    list() {
        return [...this.renderers.values()].sort((left, right) => left.target.localeCompare(right.target));
    }

    targetForPath(filename, { preserveAlias = false } = {}) {
        const lower = String(filename).toLowerCase();
        const aliases = [...this.aliases.keys()]
            .filter((alias) => !alias.includes("/") && lower.endsWith(`.${alias}`))
            .sort((left, right) => right.length - left.length);
        return aliases.length ? (preserveAlias ? aliases[0] : this.resolve(aliases[0])) : null;
    }

    render(value, targetValue, optionsValue = null, runtime = {}) {
        const requested = targetName(targetValue);
        const options = nativeOptions(optionsValue);
        const fallbacksValue = options.fallbacks ?? options.fallback ?? [];
        const fallbacks = Array.isArray(fallbacksValue)
            ? fallbacksValue
            : Array.isArray(fallbacksValue?.values)
                ? fallbacksValue.values
                : fallbacksValue ? [fallbacksValue] : [];
        const candidates = [requested, ...fallbacks.map((item) => targetName(item))];
        const failures = [];

        for (const candidate of candidates) {
            const entry = this.info(candidate);
            if (!entry) {
                failures.push({ level: "warning", code: "renderer-unavailable", message: `No renderer is registered for '${candidate}'` });
                continue;
            }
            if (entry.inputKinds.length && !entry.inputKinds.includes(inputKind(value))) {
                failures.push({
                    level: "warning",
                    code: "unsupported-input",
                    message: `Renderer '${entry.target}' does not accept ${inputKind(value)} values`,
                });
                continue;
            }
            try {
                const raw = entry.render(Object.freeze({
                    value,
                    options,
                    requestedTarget: requested,
                    target: entry.target,
                    registry: this,
                    format: runtime.format || ((item) => item?.type === "string" ? item.value : String(item ?? "")),
                    render: (nestedValue, nestedTarget, nestedOptions = {}) => this.render(
                        nestedValue,
                        nestedTarget,
                        { ...options, ...nestedOptions, fallback: [] },
                        runtime,
                    ),
                    runtime,
                }));
                const result = createRenderResult({
                    target: entry.target,
                    mime: entry.mime,
                    extension: entry.extension,
                    deterministic: entry.deterministic,
                    ...raw,
                    diagnostics: [...failures, ...(raw?.diagnostics || [])],
                });
                if (entry.target !== requested) {
                    return createRenderResult({
                        ...result,
                        diagnostics: [{
                            level: "warning",
                            code: "renderer-fallback",
                            message: `Rendered '${requested}' through fallback '${entry.target}'`,
                        }, ...result.diagnostics],
                    });
                }
                return result;
            } catch (error) {
                if (!(error instanceof UnsupportedRenderError)) throw error;
                failures.push({ level: "warning", code: error.code, message: error.message });
            }
        }
        const detail = failures.map(({ code, message }) => `[${code}] ${message}`).join("; ");
        throw new UnsupportedRenderError(`Cannot render ${inputKind(value)} as '${requested}'${detail ? `: ${detail}` : ""}`, {
            code: "render-negotiation-failed",
            target: requested,
        });
    }
}

function diagnosticValue(diagnostic) {
    return {
        type: "map",
        entries: new Map([
            ["level", stringValue(diagnostic.level)],
            ["code", stringValue(diagnostic.code)],
            ["message", stringValue(diagnostic.message)],
            ...(diagnostic.path ? [["path", stringValue(diagnostic.path)]] : []),
        ]),
    };
}

function assetValue(asset) {
    const binary = asset.content instanceof Uint8Array;
    return {
        type: "map",
        entries: new Map([
            ["path", stringValue(asset.path)],
            ["mime", stringValue(asset.mime)],
            ["encoding", stringValue(binary ? "base64" : "utf8")],
            ["content", stringValue(binary ? bytesToBase64(asset.content) : asset.content)],
        ]),
    };
}

/** Convert a host RenderResult into an inspectable RiX map without losing bytes. */
export function renderResultValue(result) {
    if (!isRenderResult(result)) throw new Error("Expected a RenderResult");
    const binary = result.content instanceof Uint8Array;
    const value = {
        type: "map",
        entries: new Map([
            ["target", stringValue(result.target)],
            ["mime", stringValue(result.mime)],
            ["extension", stringValue(result.extension)],
            ["encoding", stringValue(binary ? "base64" : "utf8")],
            ["content", stringValue(binary ? bytesToBase64(result.content) : result.content)],
            ["assets", sequenceValue(result.assets.map(assetValue))],
            ["diagnostics", sequenceValue(result.diagnostics.map(diagnosticValue))],
            ["deterministic", result.deterministic ? new Integer(1n) : null],
            ["toolchain", result.toolchain ? stringValue(result.toolchain) : null],
        ]),
        _ext: new Map([["immutable", new Integer(1n)]]),
    };
    Object.defineProperty(value, "_renderResult", { value: result, enumerable: false });
    return Object.freeze(value);
}

function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    }
    if (typeof btoa === "function") return btoa(binary);
    throw new Error("This host cannot expose binary RenderResult content as base64");
}

function infoValue(entry) {
    if (!entry) return null;
    return {
        type: "map",
        entries: new Map([
            ["target", stringValue(entry.target)],
            ["mime", stringValue(entry.mime)],
            ["extension", stringValue(entry.extension)],
            ["description", stringValue(entry.description)],
            ["inputs", sequenceValue(entry.inputKinds.map(stringValue))],
            ["aliases", sequenceValue(entry.aliases.map(stringValue))],
            ["deterministic", entry.deterministic ? new Integer(1n) : null],
        ]),
    };
}

/** Core `.Renderer` discovery namespace. */
export function createRendererCollection(registry) {
    const list = () => sequenceValue(registry.list().map(({ target }) => stringValue(target)));
    const info = (target) => infoValue(registry.info(target));
    return {
        type: "map",
        entries: new Map([["List", list], ["Info", info]]),
        _ext: new Map([
            ["LIST", { type: "method_builtin", name: "List", impl: () => list() }],
            ["INFO", { type: "method_builtin", name: "Info", impl: (args) => info(args[1]) }],
            ["immutable", new Integer(1n)],
        ]),
    };
}

/** Convenience namespace installed by each target plugin, for `.svg.Render`. */
export function createRendererPluginCollection(registry, target) {
    const render = (args, runtime = {}) => {
        if (args.length < 1 || args.length > 2) throw new Error(`${target}.Render expects a value and optional options map`);
        return renderResultValue(registry.render(args[0], target, args[1] ?? null, runtime));
    };
    return {
        type: "map",
        entries: new Map([["Render", render]]),
        _ext: new Map([
            ["RENDER", { type: "method_builtin", name: "Render", impl: (args) => render(args.slice(1)) }],
            ["immutable", new Integer(1n)],
        ]),
    };
}
