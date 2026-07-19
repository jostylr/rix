/**
 * Plugin discovery and activation.
 *
 * Catalog discovery reads only the leading doc-comment header in files named
 * `*.plugin.rix` or `*.plugin.rix.js`; it never evaluates a discovered file.
 * RiX entries can be evaluated synchronously by a host supplied loader. JS
 * entries require a host-supplied installer because importing an ES module is
 * asynchronous and, more importantly, is a host trust decision.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const RIX_PLUGIN_SUFFIX = ".plugin.rix";
const JS_PLUGIN_SUFFIX = ".plugin.rix.js";

function pluginKind(filename) {
    if (filename.endsWith(JS_PLUGIN_SUFFIX)) return "host";
    if (filename.endsWith(RIX_PLUGIN_SUFFIX)) return "rix";
    return null;
}

function parseScalar(source) {
    const value = source.trim();
    if (!value) return "";
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
        const content = value.slice(1, -1).trim();
        return content ? content.split(",").map((item) => parseScalar(item)) : [];
    }
    return value;
}

/**
 * A deliberately small YAML reader for the metadata header. It accepts scalar
 * values, inline arrays, and indented string lists—the forms suitable for a
 * stable machine-readable plugin manifest. Complex YAML features are rejected
 * instead of being interpreted differently by different RiX hosts.
 */
export function parsePluginYaml(source, label = "plugin header") {
    const metadata = {};
    const lines = String(source).replace(/\r/g, "").split("\n");
    let pendingList = null;
    for (const rawLine of lines) {
        const withoutDocStar = rawLine.replace(/^\s*\* ?/, "");
        if (!withoutDocStar.trim() || withoutDocStar.trimStart().startsWith("#")) continue;
        const list = withoutDocStar.match(/^\s+-\s+(.+)$/);
        if (list) {
            if (!pendingList) throw new Error(`${label}: list item has no key`);
            metadata[pendingList].push(parseScalar(list[1]));
            continue;
        }
        const match = withoutDocStar.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
        if (!match) throw new Error(`${label}: unsupported YAML line '${rawLine.trim()}'`);
        const [, key, rawValue] = match;
        if (Object.hasOwn(metadata, key)) throw new Error(`${label}: duplicate key '${key}'`);
        if (rawValue === "") {
            metadata[key] = [];
            pendingList = key;
        } else {
            metadata[key] = parseScalar(rawValue);
            pendingList = null;
        }
    }
    return metadata;
}

export function readPluginHeader(source, filename = "plugin") {
    const body = String(source).replace(/^\uFEFF/, "");
    const opening = body.match(/^\s*\/(\*+)/);
    if (!opening || opening[1].length < 2) {
        throw new Error(`${filename}: a plugin file must begin with a /** YAML header **/ comment`);
    }
    const stars = opening[1].length;
    const header = new RegExp(`^\\s*\\/\\*{${stars}}([\\s\\S]*?)\\*{${stars}}\\/`);
    const match = body.match(header);
    if (!match) throw new Error(`${filename}: plugin header is missing its matching ${"*".repeat(stars)}/ delimiter`);
    return parsePluginYaml(match[1], `${filename} header`);
}

function validateMetadata(metadata, sourcePath, kind) {
    if (typeof metadata.id !== "string" || !metadata.id.trim()) {
        throw new Error(`${sourcePath}: plugin header requires a non-empty id`);
    }
    if (typeof metadata.description !== "string" || !metadata.description.trim()) {
        throw new Error(`${sourcePath}: plugin header requires a short description`);
    }
    if (metadata.kind && metadata.kind !== kind) {
        throw new Error(`${sourcePath}: header kind '${metadata.kind}' does not match ${kind} filename`);
    }
    if (metadata.mount !== undefined && (typeof metadata.mount !== "string" || !/^[a-z][A-Za-z0-9_]*$/.test(metadata.mount))) {
        throw new Error(`${sourcePath}: mount must be a camelCase host capability name`);
    }
    for (const key of ["exports", "groups", "permissions"]) {
        if (metadata[key] !== undefined && !Array.isArray(metadata[key])) {
            throw new Error(`${sourcePath}: ${key} must be an inline YAML array or a YAML list`);
        }
    }
    return {
        ...metadata,
        id: metadata.id.trim(),
        description: metadata.description.trim(),
        kind,
        mount: metadata.mount || null,
        exports: metadata.exports || [],
        groups: metadata.groups || [],
        permissions: metadata.permissions || [],
        defaultEnabled: metadata.defaultEnabled === true,
        sourcePath,
    };
}

function rixString(value) {
    return { type: "string", value: String(value) };
}

function descriptorValue(metadata) {
    const entries = new Map();
    const extension = new Map();
    for (const name of metadata.exports) {
        const displayName = String(name);
        const method = {
            type: "method_builtin",
            name: displayName,
            impl() {
                throw new Error(`Plugin '${metadata.id}' is available but not loaded`);
            },
        };
        entries.set(displayName, method);
        extension.set(displayName.toUpperCase(), method);
    }
    return { type: "map", entries, _ext: extension };
}

function optionMap(value) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) return {};
    const result = {};
    for (const [key, item] of value.entries) {
        result[String(key)] = item?.type === "string" ? item.value : item;
    }
    return result;
}

/** A host-owned catalog. Scanning never executes a plugin. */
export class PluginCatalog {
    constructor({ roots = [], installers = {} } = {}) {
        this.roots = [...roots];
        this.entries = new Map();
        this.installers = new Map(Object.entries(installers));
        this.loaded = new Map();
    }

    addRoot(root) {
        this.roots.push(root);
        return this;
    }

    registerInstaller(id, installer) {
        if (typeof installer !== "function") throw new Error(`Plugin installer '${id}' must be a function`);
        this.installers.set(String(id), installer);
        return this;
    }

    scan() {
        for (const root of this.roots) this.scanRoot(root);
        return this;
    }

    scanRoot(root) {
        if (!existsSync(root)) return this;
        const visit = (directory) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                if (entry.name === ".git" || entry.name === "node_modules") continue;
                const fullPath = path.join(directory, entry.name);
                if (entry.isDirectory()) visit(fullPath);
                else if (entry.isFile() && pluginKind(entry.name)) this.addFile(fullPath);
            }
        };
        if (statSync(root).isDirectory()) visit(root);
        else if (statSync(root).isFile() && pluginKind(root)) this.addFile(root);
        return this;
    }

    addFile(sourcePath) {
        const kind = pluginKind(sourcePath);
        if (!kind) throw new Error(`${sourcePath}: not a RiX plugin filename`);
        const metadata = validateMetadata(readPluginHeader(readFileSync(sourcePath, "utf8"), sourcePath), sourcePath, kind);
        if (this.entries.has(metadata.id)) throw new Error(`Duplicate plugin id '${metadata.id}'`);
        this.entries.set(metadata.id, metadata);
        return metadata;
    }

    list() {
        return Array.from(this.entries.values()).sort((left, right) => left.id.localeCompare(right.id));
    }

    info(id) {
        return this.entries.get(String(id)) || null;
    }

    declareInto(systemContext) {
        for (const metadata of this.list()) {
            if (!metadata.mount || systemContext.has(metadata.mount)) continue;
            const value = descriptorValue(metadata);
            systemContext.registerHostCallableValue(metadata.mount, value, {
                impl() {
                    throw new Error(`Plugin '${metadata.id}' is available but not loaded; call .Plugin.Load("${metadata.id}") first`);
                },
            }, {
                doc: metadata.description,
                groups: metadata.groups,
                pluginId: metadata.id,
                pluginDisabled: true,
            });
        }
    }

    catalogValue() {
        return {
            type: "map",
            entries: new Map(this.list().map((metadata) => [metadata.id, this.infoValue(metadata)])),
        };
    }

    infoValue(metadata) {
        if (!metadata) return null;
        const loaded = this.loaded.get(metadata.id);
        return {
            type: "map",
            entries: new Map([
                ["id", rixString(metadata.id)],
                ["description", rixString(metadata.description)],
                ["kind", rixString(metadata.kind)],
                ["mount", (loaded?.mount || metadata.mount) ? rixString(loaded?.mount || metadata.mount) : null],
                ["exports", { type: "sequence", values: metadata.exports.map(rixString) }],
                ["groups", { type: "sequence", values: metadata.groups.map(rixString) }],
                ["permissions", { type: "sequence", values: metadata.permissions.map(rixString) }],
                ["loaded", loaded ? { type: "integer", value: 1n } : null],
            ]),
        };
    }

    load(id, runtime = {}) {
        const metadata = this.info(id);
        if (!metadata) throw new Error(`Unknown plugin '${id}'`);
        if (this.loaded.has(metadata.id)) return this.infoValue(metadata);

        const options = optionMap(runtime.options);
        if (options.as !== undefined && (typeof options.as !== "string" || !/^[a-z][A-Za-z0-9_]*$/.test(options.as))) {
            throw new Error(`Plugin '${metadata.id}' option as must be a camelCase host capability name`);
        }
        const mount = options.as || metadata.mount;

        const api = {
            metadata,
            options,
            context: runtime.context,
            registry: runtime.registry,
            systemContext: runtime.systemContext,
        };
        if (metadata.kind === "rix") {
            if (typeof runtime.loadRix !== "function") throw new Error(`No RiX plugin loader is available for '${metadata.id}'`);
            runtime.loadRix({ ...api, source: readFileSync(metadata.sourcePath, "utf8") });
        } else {
            const installer = this.installers.get(metadata.id);
            if (!installer) {
                throw new Error(`Plugin '${metadata.id}' is discoverable but its host installer has not been approved by this host`);
            }
            installer(api);
        }
        if (metadata.mount && mount && mount !== metadata.mount) {
            runtime.systemContext?.renameHostCapability(metadata.mount, mount);
        }
        if (mount && metadata.groups.length) runtime.systemContext?.addCapabilityGroups(mount, metadata.groups);
        if (mount && runtime.visibleSystemContext && runtime.visibleSystemContext !== runtime.systemContext) {
            runtime.visibleSystemContext.adoptHostCapability(runtime.systemContext, mount);
        }
        this.loaded.set(metadata.id, { metadata, mount });
        return this.infoValue(metadata);
    }
}
