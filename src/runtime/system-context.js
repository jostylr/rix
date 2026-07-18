/**
 * SystemContext — the user-visible capability root (`.`).
 *
 * A capability's first letter selects its owner namespace:
 *   PascalCase → core RiX capability, stored under an uppercase key
 *   camelCase  → host/plugin capability, stored under a lowercase key
 *
 * The registry keeps the spelling supplied at registration for display while
 * resolving source names through the normalised key. Capability groups are a
 * separate concern: a host capability may belong to any import/sandbox group.
 */

function firstLetterIsUppercase(name) {
    for (const character of String(name)) {
        if (/\p{L}/u.test(character)) return character === character.toUpperCase();
    }
    return false;
}

/** Normalise a RiX capability name using the language's first-letter rule. */
export function normalizeCapabilityName(name) {
    const source = String(name ?? "");
    if (!source) throw new Error("Capability name must be a non-empty string");
    return firstLetterIsUppercase(source) ? source.toUpperCase() : source.toLowerCase();
}

/** Return the owner namespace implied by a source capability name. */
export function capabilityNamespace(name) {
    return firstLetterIsUppercase(name) ? "core" : "host";
}

function stringValue(value) {
    return { type: "string", value: String(value) };
}

function rixString(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string`);
}

function rixStringList(value, label) {
    if (value === null || value === undefined) return [];
    const items = value?.values;
    if (!Array.isArray(items)) throw new Error(`${label} must be a sequence of strings`);
    return items.map((item) => rixString(item, label));
}

function namespaceEntry(context, namespace) {
    const title = namespace === "core" ? "Core" : "Host";
    const canRegister = (evaluationContext) => {
        const runtime = evaluationContext?.getEnv?.("__script_runtime__", null);
        const frame = runtime?.frameStack?.[runtime.frameStack.length - 1];
        if (namespace === "core") {
            // Core registration is bootstrap-only. An import never becomes
            // trusted merely because its host is trusted.
            return !frame && (evaluationContext?.getEnv?.("allowCoreRegister", false)
                || evaluationContext?.getEnv?.("allowCapabilityRegister", false));
        }
        return !frame || frame.permissions?.has("PLUGINS");
    };
    const registryContext = namespace === "host" ? context._hostContext : context;

    const value = {
        type: "system_namespace",
        namespace,
        _ext: new Map(),
    };

    value._ext.set("REGISTER", {
        type: "method_builtin",
        name: "Register",
        impl(args, evaluationContext, _evaluate, callWithConcreteArgs) {
            if (!canRegister(evaluationContext)) {
                throw new Error(`.${title}.Register is not permitted in this execution context`);
            }
            const name = rixString(args[1], `.${title}.Register name`);
            const callable = args[2];
            const doc = args[3]?.type === "string" ? args[3].value : "";
            const groups = rixStringList(args[4], `.${title}.Register groups`);
            const definition = {
                impl(callArgs, callContext, callEvaluate) {
                    return callWithConcreteArgs(callable, callArgs, callContext, callEvaluate);
                },
                doc,
            };
            const register = namespace === "core" ? registryContext.registerTrusted.bind(registryContext) : registryContext.registerHost.bind(registryContext);
            register(name, definition, { namespace, groups });
            // A plugin attached by an imported script is global to its host,
            // but it must also be visible in that script's already-derived
            // capability frame for the remainder of the script.
            if (namespace === "host" && registryContext !== context) {
                context.registerHost(name, definition, { namespace, groups });
            }
            return stringValue(name);
        },
    });

    value._ext.set("FIND", {
        type: "method_builtin",
        name: "Find",
        impl(args) {
            const name = rixString(args[1], `.${title}.Find name`);
            const entry = registryContext.get(name);
            if (!entry || entry.namespace !== namespace) return null;
            return {
                type: "map",
                entries: new Map([
                    ["name", stringValue(entry.displayName)],
                    ["kind", stringValue(entry.kind)],
                    ["namespace", stringValue(entry.namespace)],
                    ["groups", { type: "sequence", values: (entry.groups || []).map(stringValue) }],
                ]),
            };
        },
    });

    value._ext.set("LIST", {
        type: "method_builtin",
        name: "List",
        impl() {
            return {
                type: "sequence",
                values: registryContext.getAllEntries({ namespace }).map((entry) => stringValue(entry.displayName)),
            };
        },
    });

    return value;
}

export class SystemContext {
    /**
     * @param {Map<string, object>} capabilities
     * @param {boolean} frozen
     * @param {{groups?: Map<string, Iterable<string>>|object, hostContext?: SystemContext}} options
     */
    constructor(capabilities = new Map(), frozen = false, options = {}) {
        this._capabilities = new Map();
        this._groups = new Map();
        this._frozen = false;
        // Derived import contexts retain their host registry so permitted
        // plugins attach at host scope; ordinary copies get their own host.
        this._hostContext = options.hostContext || this;

        for (const [name, entry] of capabilities) {
            const normalised = normalizeCapabilityName(name);
            const inferredKind = entry?.kind || "function";
            this._capabilities.set(normalised, {
                ...entry,
                kind: inferredKind,
                namespace: entry?.namespace || capabilityNamespace(name),
                displayName: entry?.displayName || name,
                groups: [...(entry?.groups || [])],
            });
        }
        for (const [group, members] of Object.entries(options.groups || {})) {
            this.registerGroup(group, members);
        }
        this._frozen = frozen;
    }

    // --- Mutation (only allowed when unfrozen) ---

    _checkMutable() {
        if (this._frozen) throw new Error("System context is frozen and cannot be modified");
    }

    /** Register a callable capability while the host is constructing a context. */
    register(name, def, options = {}) {
        return this._register(name, def, options, false);
    }

    /** Register a trusted core capability during package/bootstrap startup. */
    registerTrusted(name, def, options = {}) {
        return this._register(name, def, { ...options, namespace: "core" }, true);
    }

    /** Register a host/plugin capability after explicit permission checking. */
    registerHost(name, def, options = {}) {
        return this._register(name, def, { ...options, namespace: "host" }, true);
    }

    /** Register a callable capability which also exposes a system-object value. */
    registerCallableValue(name, value, def, options = {}) {
        return this._registerCallableValue(name, value, def, options, false);
    }

    /** Register a host callable object after explicit host-side permission checks. */
    registerHostCallableValue(name, value, def, options = {}) {
        return this._registerCallableValue(name, value, def, { ...options, namespace: "host" }, true);
    }

    _registerCallableValue(name, value, def, options, bypassFrozen) {
        this._register(name, def, options, bypassFrozen);
        // A callable object intentionally has kind "function" for parser and
        // call dispatch, but retains a value for member access through SYS_GET.
        this._capabilities.get(normalizeCapabilityName(name)).value = value;
        return this;
    }

    _register(name, def, options, bypassFrozen) {
        if (!bypassFrozen) this._checkMutable();
        const normalised = normalizeCapabilityName(name);
        const namespace = options.namespace || capabilityNamespace(name);
        if (namespace !== capabilityNamespace(name)) {
            throw new Error(`Capability '${name}' does not use ${namespace === "core" ? "PascalCase" : "camelCase"} namespace spelling`);
        }
        const entry = {
            kind: "function",
            impl: typeof def === "function" ? def : def.impl,
            lazy: def?.lazy || false,
            pure: def?.pure || false,
            doc: options.doc ?? def?.doc ?? "",
            namespace,
            displayName: options.displayName || name,
            groups: [...new Set(options.groups || def?.groups || [])],
        };
        if (typeof entry.impl !== "function") {
            throw new Error(`Capability '${name}' requires an implementation function`);
        }
        this._capabilities.set(normalised, entry);
        this._addEntryToGroups(normalised, entry.groups);
        return this;
    }

    /** Register a non-callable RiX value or namespace. */
    registerValue(name, value, options = {}) {
        return this._registerValue(name, value, options, false);
    }

    /** Register a host/plugin value after explicit host-side permission checks. */
    registerHostValue(name, value, options = {}) {
        return this._registerValue(name, value, { ...options, namespace: "host" }, true);
    }

    _registerValue(name, value, options, bypassFrozen) {
        if (!bypassFrozen) this._checkMutable();
        const normalised = normalizeCapabilityName(name);
        const namespace = options.namespace || capabilityNamespace(name);
        if (namespace !== capabilityNamespace(name)) {
            throw new Error(`Capability '${name}' does not use ${namespace === "core" ? "PascalCase" : "camelCase"} namespace spelling`);
        }
        const entry = {
            kind: options.kind || "value",
            value,
            doc: options.doc || "",
            namespace,
            displayName: options.displayName || name,
            groups: [...new Set(options.groups || [])],
        };
        this._capabilities.set(normalised, entry);
        this._addEntryToGroups(normalised, entry.groups);
        return this;
    }

    /** Register a named import/sandbox group independently of ownership. */
    registerGroup(name, members = []) {
        this._checkMutable();
        const group = String(name);
        const normalisedMembers = new Set(Array.from(members, normalizeCapabilityName));
        this._groups.set(group, normalisedMembers);
        for (const member of normalisedMembers) {
            const entry = this._capabilities.get(member);
            if (entry && !entry.groups.includes(group)) entry.groups.push(group);
        }
        return this;
    }

    _addEntryToGroups(name, groups) {
        for (const group of groups || []) {
            if (!this._groups.has(group)) this._groups.set(group, new Set());
            this._groups.get(group).add(name);
        }
    }

    /**
     * Register multiple capabilities from an object map.
     */
    registerAll(defs) {
        for (const [name, def] of Object.entries(defs)) {
            this.register(name, def);
        }
    }

    /**
     * Remove a capability.
     */
    delete(name) {
        this._checkMutable();
        const normalised = normalizeCapabilityName(name);
        this._capabilities.delete(normalised);
        for (const members of this._groups.values()) members.delete(normalised);
    }

    /**
     * Freeze this context. After freezing, register/delete throw.
     */
    freeze() {
        this._frozen = true;
        return this;
    }

    // --- Reading ---

    /**
     * Get a capability definition by name.
     * @returns {{impl, lazy, pure, doc} | undefined}
     */
    get(name) {
        return this._capabilities.get(normalizeCapabilityName(name));
    }

    /**
     * Check if a capability exists.
     */
    has(name) {
        return this._capabilities.has(normalizeCapabilityName(name));
    }

    /**
     * Whether this context is frozen.
     */
    get frozen() {
        return this._frozen;
    }

    /**
     * Call a capability by name with pre-evaluated args.
     */
    call(name, args, context, evaluate) {
        const cap = this.get(name);
        if (!cap) throw new Error(`Unknown system capability: ${name}. Use .${name}() or check available capabilities.`);
        if (cap.kind !== "function") throw new Error(`System ${cap.kind} .${cap.displayName} is not a capability function`);
        return cap.impl(args, context, evaluate);
    }

    /**
     * Call a lazy capability by name (args are raw IR nodes).
     */
    callLazy(name, args, context, evaluate) {
        const cap = this.get(name);
        if (!cap) throw new Error(`Unknown system capability: ${name}.`);
        if (cap.kind !== "function") throw new Error(`System ${cap.kind} .${cap.displayName} is not a capability function`);
        return cap.impl(args, context, evaluate);
    }

    /**
     * Sorted list of all capability names.
     */
    getAllNames() {
        return Array.from(this._capabilities.keys()).sort();
    }

    /** Entries in source-display order, optionally restricted by owner namespace. */
    getAllEntries({ namespace } = {}) {
        return Array.from(this._capabilities.values())
            .filter((entry) => !namespace || entry.namespace === namespace)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    getAllDisplayNames(options = {}) {
        return this.getAllEntries(options).map((entry) => entry.displayName);
    }

    getCapabilityGroups() {
        return Object.fromEntries(Array.from(this._groups, ([name, members]) => [name, Array.from(members)]));
    }

    /** Install the two management namespaces once during trusted host setup. */
    installManagementNamespaces() {
        this._checkMutable();
        if (!this.has("Core")) {
            this.registerValue("Core", namespaceEntry(this, "core"), {
                kind: "namespace",
                doc: "Core capability registration and discovery",
            });
        }
        if (!this.has("Host")) {
            this.registerValue("Host", namespaceEntry(this, "host"), {
                kind: "namespace",
                doc: "Host/plugin capability registration and discovery",
            });
        }
        return this;
    }

    /**
     * Management namespace values close over their owning context. Rebuild
     * them for a derived context so .Core/.Host discovery and registration
     * cannot accidentally act on the source context.
     */
    _rebindManagementNamespaces() {
        for (const [name, namespace] of [["Core", "core"], ["Host", "host"]]) {
            const normalised = normalizeCapabilityName(name);
            const entry = this._capabilities.get(normalised);
            // Both manager roots are PascalCase core entries; the namespace
            // argument here identifies the registry they manage, not the
            // first-letter ownership of the manager entry itself.
            if (entry?.kind === "namespace") {
                this._capabilities.set(normalised, { ...entry, value: namespaceEntry(this, namespace) });
            }
        }
        return this;
    }

    _derivedContext(capabilities, frozen) {
        const available = new Set(Array.from(capabilities.keys(), normalizeCapabilityName));
        const groups = Object.fromEntries(
            Object.entries(this.getCapabilityGroups()).map(([group, members]) => [
                group,
                members.filter((name) => available.has(name)),
            ]),
        );
        const hostContext = this._hostContext === this ? undefined : this._hostContext;
        return new SystemContext(capabilities, frozen, { groups, hostContext })._rebindManagementNamespaces();
    }

    // --- Capability object operations (return new instances) ---

    /**
     * Return a shallow copy of this context, unfrozen.
     * This is what `.` returns when used as an expression.
     */
    copy() {
        return this._derivedContext(new Map(this._capabilities), false);
    }

    /**
     * Return a frozen copy with the named capabilities removed.
     * .Withhold("NET", "FILE") → restricted copy
     */
    withhold(...names) {
        const caps = new Map(this._capabilities);
        for (const name of names) {
            caps.delete(normalizeCapabilityName(name));
        }
        return this._derivedContext(caps, true);
    }

    /**
     * Return a frozen copy with an additional capability.
     * .With("Custom", myFn) → extended copy
     */
    with(name, def) {
        const result = this.copy();
        if (def?.kind === "function" && Object.prototype.hasOwnProperty.call(def || {}, "value")) {
            result.registerCallableValue(name, def.value, def, def);
        } else if (def?.kind === "value" || Object.prototype.hasOwnProperty.call(def || {}, "value")) {
            result.registerValue(name, def.value, def);
        } else {
            result.register(name, def, def);
        }
        result.freeze();
        return result;
    }

    /**
     * Convert to a RiX value representation for use in the evaluator.
     * type: "system_context" wraps the SystemContext instance.
     */
    toRixValue() {
        return { type: "system_context", context: this };
    }
}

/**
 * The operator-to-name map shared between the parser (@+) and SystemContext.
 * These are the operator aliases exposed as .ADD, .SUB, etc.
 */
export const OPERATOR_ALIASES = {
    "+":  "ADD",
    "-":  "SUB",
    "*":  "MUL",
    "/":  "DIV",
    "//": "INTDIV",
    "%":  "MOD",
    "^":  "POW",
    "**": "POWPROD",
    "=":  "EQ",
    "!=": "NEQ",
    "<":  "LT",
    ">":  "GT",
    "<=": "LTE",
    ">=": "GTE",
    "&&": "AND",
    "||": "OR",
    "!":  "NOT",
};
