/**
 * Plugin discovery and activation.
 *
 * Catalog discovery reads only the leading doc-comment header in files named
 * `*.plugin.rix` or `*.plugin.rix.js`; it never evaluates a discovered file.
 * RiX entries can be evaluated synchronously by a host supplied loader. JS
 * entries require a host-supplied installer because importing an ES module is
 * asynchronous and, more importantly, is a host trust decision.
 */

import {
    extractOperatorDeclarationsFromSource,
    mergeOperatorDefinitions,
} from "../parser/custom-operators.js";
import { registerPluginNamespace } from "./plugin-imports.js";

const CUSTOM_OPERATOR_ENV_KEY = "__custom_operator_definitions__";

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

export function readSourceHeader(source, filename = "script") {
    const emptyHeader = { plugins: [], operatorFiles: [] };
    const body = String(source).replace(/^\uFEFF/, "");
    const opening = body.match(/^\s*\/(\*+)/);
    if (!opening || opening[1].length < 2) return emptyHeader;
    const stars = opening[1].length;
    const header = new RegExp(`^\\s*\\/\\*{${stars}}([\\s\\S]*?)\\*{${stars}}\\/`);
    const match = body.match(header);
    if (!match || !/^\s*\*?\s*(?:plugins|operator-files)\s*:/im.test(match[1])) return emptyHeader;
    const metadata = parsePluginYaml(match[1], `${filename} header`);
    for (const key of ["plugins", "operator-files"]) {
        if (metadata[key] !== undefined && !Array.isArray(metadata[key])) {
            throw new Error(`${filename}: ${key} must be an inline YAML array or a YAML list`);
        }
    }
    return {
        plugins: metadata.plugins || [],
        operatorFiles: metadata["operator-files"] || [],
    };
}

function validateMetadata(metadata, sourcePath, kind) {
    if (metadata.ignore !== undefined && typeof metadata.ignore !== "boolean") {
        throw new Error(`${sourcePath}: ignore must be true or false`);
    }
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
    for (const key of ["aliases", "exports", "groups", "permissions", "operator-files", "requires", "optional", "provides", "schemas", "targets"]) {
        if (metadata[key] !== undefined && !Array.isArray(metadata[key])) {
            throw new Error(`${sourcePath}: ${key} must be an inline YAML array or a YAML list`);
        }
    }
    const aliases = metadata.aliases || [];
    for (const alias of aliases) {
        if (typeof alias !== "string" || !/^[a-z][A-Za-z0-9_]*$/.test(alias)) {
            throw new Error(`${sourcePath}: plugin aliases must be camelCase host capability names`);
        }
    }
    if (new Set(aliases.map((alias) => alias.toLowerCase())).size !== aliases.length) {
        throw new Error(`${sourcePath}: plugin aliases must be unique`);
    }
    if (metadata.mount && aliases.some((alias) => alias.toLowerCase() === metadata.mount.toLowerCase())) {
        throw new Error(`${sourcePath}: plugin aliases must not repeat the canonical mount`);
    }
    return {
        ...metadata,
        id: metadata.id.trim(),
        description: metadata.description.trim(),
        kind,
        mount: metadata.mount || null,
        aliases,
        exports: metadata.exports || [],
        groups: metadata.groups || [],
        permissions: metadata.permissions || [],
        requires: metadata.requires || [],
        optional: metadata.optional || [],
        provides: metadata.provides || [],
        schemas: metadata.schemas || [],
        targets: metadata.targets || [],
        snapshot: metadata.snapshot === true,
        deterministic: metadata.deterministic === true,
        operatorFiles: metadata["operator-files"] || metadata.operatorFiles || [],
        operatorDefinitions: metadata.operatorDefinitions || [],
        defaultEnabled: metadata.defaultEnabled === true,
        ignore: metadata.ignore === true,
        sourcePath,
    };
}

function mountedOperatorDefinitions(definitions, metadata, mount) {
    return (definitions || []).map((definition) => {
        if (definition.target?.kind !== "plugin-method" || definition.target.pluginId !== metadata.id) {
            return definition;
        }
        return {
            ...definition,
            target: { ...definition.target, mount },
        };
    });
}

function installOperatorDefinitions(context, definitions, metadata, mount) {
    if (!context?.getEnv || !context?.setEnv || !definitions?.length) return;
    const mountedDefinitions = mountedOperatorDefinitions(definitions, metadata, mount);
    const merged = mergeOperatorDefinitions(
        context.getEnv(CUSTOM_OPERATOR_ENV_KEY, new Map()),
        mountedDefinitions,
    );
    context.setEnv(CUSTOM_OPERATOR_ENV_KEY, merged);
    const runtime = context.getEnv("__script_runtime__", null);
    if (runtime) runtime.operatorDefinitions = merged;
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
    return registerPluginNamespace(
        { type: "map", entries, _ext: extension },
        {
            pluginId: metadata.id,
            mount: metadata.mount,
            exports: metadata.exports,
            loaded: false,
            namespaceAvailable: false,
        },
    );
}

function capabilityValue(systemContext, name) {
    const entry = name ? systemContext?.get?.(name) : null;
    if (!entry) return null;
    return Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry;
}

function registerLoadedNamespace(systemContext, metadata, mount) {
    const entry = mount ? systemContext?.get?.(mount) : null;
    const value = capabilityValue(systemContext, mount);
    if (!value) return;
    registerPluginNamespace(value, {
        pluginId: metadata.id,
        mount,
        exports: metadata.exports,
        loaded: true,
        namespaceAvailable: entry?.pluginDisabled !== true,
    });
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
    constructor({ installers = {} } = {}) {
        this.entries = new Map();
        this.installers = new Map(Object.entries(installers));
        this.loaded = new Map();
        this.loading = new Set();
        this.activations = new Map();
        this.activationDependencies = new Map();
    }

    registerInstaller(id, installer) {
        if (typeof installer !== "function") throw new Error(`Plugin installer '${id}' must be a function`);
        this.installers.set(String(id), installer);
        return this;
    }

    addMetadata(metadata, { sourcePath = `<plugin:${metadata?.id || "unknown"}>`, source = null, kind = metadata?.kind } = {}) {
        // Ignore is intentionally handled before normal manifest validation so
        // a work-in-progress file can opt out while its metadata is incomplete.
        if (metadata?.ignore === true) return null;
        const validatedKind = kind || metadata?.kind;
        if (validatedKind !== "rix" && validatedKind !== "host") {
            throw new Error(`${sourcePath}: plugin kind must be 'rix' or 'host'`);
        }
        let enrichedMetadata = metadata;
        if (
            validatedKind === "rix"
            && typeof source === "string"
            && !metadata.operatorDefinitions
        ) {
            const operatorDefinitions = Array.from(extractOperatorDeclarationsFromSource(source, {
                label: sourcePath,
                owner: { pluginId: metadata.id, mount: metadata.mount || null },
            }).values());
            enrichedMetadata = { ...metadata, operatorDefinitions };
        }
        const entry = validateMetadata(enrichedMetadata, sourcePath, validatedKind);
        if (entry.kind === "rix" && typeof source !== "string") {
            throw new Error(`${sourcePath}: RiX plugin metadata requires source supplied by its host scanner`);
        }
        const complete = { ...entry, source };
        if (this.entries.has(complete.id)) throw new Error(`Duplicate plugin id '${complete.id}'`);
        const claimed = new Set([complete.mount, ...complete.aliases].filter(Boolean).map((name) => name.toLowerCase()));
        for (const existing of this.entries.values()) {
            const collision = [existing.mount, ...existing.aliases]
                .filter(Boolean)
                .find((name) => claimed.has(name.toLowerCase()));
            if (collision) {
                throw new Error(`Plugin '${complete.id}' capability name '${collision}' conflicts with plugin '${existing.id}'`);
            }
        }
        this.entries.set(complete.id, complete);
        return complete;
    }

    list() {
        return Array.from(this.entries.values()).sort((left, right) => left.id.localeCompare(right.id));
    }

    info(id) {
        return this.entries.get(String(id)) || null;
    }

    declareInto(systemContext) {
        for (const metadata of this.list()) {
            for (const mount of [metadata.mount, ...metadata.aliases].filter(Boolean)) {
                if (systemContext.has(mount)) continue;
                const value = descriptorValue(metadata);
                systemContext.registerHostCallableValue(mount, value, {
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
                ["aliases", { type: "sequence", values: (loaded?.aliases || metadata.aliases).map(rixString) }],
                ["exports", { type: "sequence", values: metadata.exports.map(rixString) }],
                ["groups", { type: "sequence", values: metadata.groups.map(rixString) }],
                ["permissions", { type: "sequence", values: metadata.permissions.map(rixString) }],
                ["requires", { type: "sequence", values: metadata.requires.map(rixString) }],
                ["provides", { type: "sequence", values: metadata.provides.map(rixString) }],
                ["schemas", { type: "sequence", values: metadata.schemas.map(rixString) }],
                ["targets", { type: "sequence", values: metadata.targets.map(rixString) }],
                ["snapshot", metadata.snapshot ? { type: "integer", value: 1n } : null],
                ["deterministic", metadata.deterministic ? { type: "integer", value: 1n } : null],
                ["operators", { type: "sequence", values: metadata.operatorDefinitions.map((definition) => rixString(definition.spelling)) }],
                ["loaded", loaded ? { type: "integer", value: 1n } : null],
            ]),
        };
    }

    load(id, runtime = {}) {
        const metadata = this.info(id);
        if (!metadata) throw new Error(`Unknown plugin '${id}'`);
        if (this.loaded.has(metadata.id)) return this.infoValue(metadata);
        if (this.activations.has(metadata.id)) {
            throw new Error(`Plugin '${metadata.id}' is already loading asynchronously; use promise-aware RiX evaluation`);
        }
        if (this.loading.has(metadata.id)) {
            throw new Error(`Plugin dependency cycle detected while loading '${metadata.id}'`);
        }

        this.loading.add(metadata.id);
        try {
            for (const requirement of metadata.requires) {
                const exact = this.info(requirement);
                const providers = exact
                    ? [exact]
                    : this.list().filter((candidate) => candidate.provides.includes(requirement));
                if (providers.length === 0) {
                    throw new Error(`Plugin '${metadata.id}' requires unavailable service '${requirement}'`);
                }
                if (providers.length > 1) {
                    throw new Error(`Plugin '${metadata.id}' requirement '${requirement}' has multiple providers: ${providers.map(({ id: providerId }) => providerId).join(", ")}`);
                }
                // Activation options belong to the requested plugin. In
                // particular, a parent's `as` remount must not rename its
                // dependencies as they are pulled in.
                this.load(providers[0].id, { ...runtime, options: null });
            }

            const options = optionMap(runtime.options);
            if (options.as !== undefined && (typeof options.as !== "string" || !/^[a-z][A-Za-z0-9_]*$/.test(options.as))) {
                throw new Error(`Plugin '${metadata.id}' option as must be a camelCase host capability name`);
            }
            const mount = options.as || metadata.mount;
            const aliases = options.as === undefined ? metadata.aliases : [];

            const api = {
                metadata,
                options,
                context: runtime.context,
                registry: runtime.registry,
                systemContext: runtime.systemContext,
                rendererRegistry: runtime.rendererRegistry || runtime.systemContext?._rendererRegistry || null,
            };
            if (metadata.kind === "rix") {
                if (typeof runtime.loadRix !== "function") throw new Error(`No RiX plugin loader is available for '${metadata.id}'`);
                runtime.loadRix({
                    ...api,
                    source: metadata.source,
                    operatorDefinitions: mountedOperatorDefinitions(metadata.operatorDefinitions, metadata, mount),
                });
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
            for (const alias of aliases) {
                const existing = runtime.systemContext?.get(alias);
                if (existing && !(existing.pluginDisabled && existing.pluginId === metadata.id)) {
                    throw new Error(`Plugin '${metadata.id}' alias '${alias}' conflicts with an existing host capability`);
                }
                runtime.systemContext?.aliasHostCapability(alias, mount);
            }
            for (const name of [mount, ...aliases].filter(Boolean)) {
                if (metadata.groups.length) runtime.systemContext?.addCapabilityGroups(name, metadata.groups);
                if (runtime.visibleSystemContext && runtime.visibleSystemContext !== runtime.systemContext) {
                    runtime.visibleSystemContext.adoptHostCapability(runtime.systemContext, name);
                }
            }
            installOperatorDefinitions(runtime.context, metadata.operatorDefinitions, metadata, mount);
            registerLoadedNamespace(runtime.systemContext, metadata, mount);
            this.loaded.set(metadata.id, { metadata, mount, aliases });
            return this.infoValue(metadata);
        } finally {
            this.loading.delete(metadata.id);
        }
    }

    _activationPathExists(from, target, visited = new Set()) {
        if (from === target) return true;
        if (visited.has(from)) return false;
        visited.add(from);
        for (const dependency of this.activationDependencies.get(from) || []) {
            if (this._activationPathExists(dependency, target, visited)) return true;
        }
        return false;
    }

    _recordActivationDependency(pluginId, dependencyId) {
        if (pluginId === dependencyId || this._activationPathExists(dependencyId, pluginId)) {
            throw new Error(`Plugin dependency cycle detected while loading '${pluginId}'`);
        }
        let dependencies = this.activationDependencies.get(pluginId);
        if (!dependencies) {
            dependencies = new Set();
            this.activationDependencies.set(pluginId, dependencies);
        }
        dependencies.add(dependencyId);
    }

    _clearActivationDependencies(pluginId) {
        this.activationDependencies.delete(pluginId);
        for (const dependencies of this.activationDependencies.values()) dependencies.delete(pluginId);
    }

    /** Promise-aware activation used by asynchronous RiX evaluation. */
    async loadAsync(id, runtime = {}) {
        const metadata = this.info(id);
        if (!metadata) throw new Error(`Unknown plugin '${id}'`);
        if (this.loaded.has(metadata.id)) return this.infoValue(metadata);
        if (this.loading.has(metadata.id)) {
            throw new Error(`Plugin '${metadata.id}' is already loading synchronously`);
        }

        const existing = this.activations.get(metadata.id);
        if (existing) return existing;

        let activation;
        activation = Promise.resolve()
            .then(() => this._activateAsync(metadata, runtime))
            .finally(() => {
                if (this.activations.get(metadata.id) === activation) {
                    this.activations.delete(metadata.id);
                }
                this._clearActivationDependencies(metadata.id);
            });
        this.activations.set(metadata.id, activation);
        return activation;
    }

    async _activateAsync(metadata, runtime) {
        for (const requirement of metadata.requires) {
            const exact = this.info(requirement);
            const providers = exact
                ? [exact]
                : this.list().filter((candidate) => candidate.provides.includes(requirement));
            if (providers.length === 0) {
                throw new Error(`Plugin '${metadata.id}' requires unavailable service '${requirement}'`);
            }
            if (providers.length > 1) {
                throw new Error(`Plugin '${metadata.id}' requirement '${requirement}' has multiple providers: ${providers.map(({ id: providerId }) => providerId).join(", ")}`);
            }
            const provider = providers[0];
            this._recordActivationDependency(metadata.id, provider.id);
            // Activation options belong to the requested plugin. In
            // particular, a parent's `as` remount must not rename its
            // dependencies as they are pulled in.
            await this.loadAsync(provider.id, { ...runtime, options: null });
        }

        const options = optionMap(runtime.options);
        if (options.as !== undefined && (typeof options.as !== "string" || !/^[a-z][A-Za-z0-9_]*$/.test(options.as))) {
            throw new Error(`Plugin '${metadata.id}' option as must be a camelCase host capability name`);
        }
        const mount = options.as || metadata.mount;
        const aliases = options.as === undefined ? metadata.aliases : [];

        const api = {
            metadata,
            options,
            context: runtime.context,
            registry: runtime.registry,
            systemContext: runtime.systemContext,
            rendererRegistry: runtime.rendererRegistry || runtime.systemContext?._rendererRegistry || null,
        };
        if (metadata.kind === "rix") {
            if (typeof runtime.loadRix !== "function") throw new Error(`No RiX plugin loader is available for '${metadata.id}'`);
            await runtime.loadRix({
                ...api,
                source: metadata.source,
                operatorDefinitions: mountedOperatorDefinitions(metadata.operatorDefinitions, metadata, mount),
            });
        } else {
            const installer = this.installers.get(metadata.id);
            if (!installer) {
                throw new Error(`Plugin '${metadata.id}' is discoverable but its host installer has not been approved by this host`);
            }
            await installer(api);
        }
        if (metadata.mount && mount && mount !== metadata.mount) {
            runtime.systemContext?.renameHostCapability(metadata.mount, mount);
        }
        for (const alias of aliases) {
            const existing = runtime.systemContext?.get(alias);
            if (existing && !(existing.pluginDisabled && existing.pluginId === metadata.id)) {
                throw new Error(`Plugin '${metadata.id}' alias '${alias}' conflicts with an existing host capability`);
            }
            runtime.systemContext?.aliasHostCapability(alias, mount);
        }
        for (const name of [mount, ...aliases].filter(Boolean)) {
            if (metadata.groups.length) runtime.systemContext?.addCapabilityGroups(name, metadata.groups);
            if (runtime.visibleSystemContext && runtime.visibleSystemContext !== runtime.systemContext) {
                runtime.visibleSystemContext.adoptHostCapability(runtime.systemContext, name);
            }
        }
        installOperatorDefinitions(runtime.context, metadata.operatorDefinitions, metadata, mount);
        registerLoadedNamespace(runtime.systemContext, metadata, mount);
        this.loaded.set(metadata.id, { metadata, mount, aliases });
        return this.infoValue(metadata);
    }
}
