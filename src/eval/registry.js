import { TYPE_INSTALL_FUNCTIONS } from "../runtime/type-system.js";

/**
 * System Function Registry
 *
 * Maps IR function names to their implementations.
 * Each entry: { impl: Function, lazy: boolean, pure: boolean, doc: string }
 *
 * "Lazy" functions receive raw IR nodes (unevaluated) as arguments.
 * The evaluator checks this flag before deciding whether to pre-evaluate args.
 */

export class Registry {
    constructor() {
        this.functions = new Map();
        this._overrides = new Map(); // saved originals when overridden
        this.multifunctionNames = new Set(TYPE_INSTALL_FUNCTIONS);
    }

    /**
     * Register a system function.
     * @param {string} name - IR function name (e.g. "ADD", "ASSIGN")
     * @param {Function} impl - Implementation: (args, context, evaluate) => value
     * @param {Object} options
     * @param {boolean} [options.lazy=false] - If true, args are passed as raw IR nodes
     * @param {boolean} [options.pure=false] - If true, function has no side effects
     * @param {string} [options.doc=""] - Documentation string
     */
    register(name, impl, options = {}) {
        const entry = {
            impl,
            lazy: options.lazy || false,
            pure: options.pure || false,
            doc: options.doc || "",
        };
        if (this.multifunctionNames.has(name) && !entry.lazy) {
            this.functions.set(name, this._createSystemMultifunction(name, entry));
            return;
        }
        this.functions.set(name, entry);
    }

    _createSystemMultifunction(name, fallback) {
        return {
            ...fallback,
            systemMultifunction: true,
            variants: [{
                name: "NativeFallback",
                impl: fallback.impl,
                prep: null,
                nativeFallback: true,
                targetFunction: name,
                installOrder: Number.POSITIVE_INFINITY,
            }],
            impl: (args, context, evaluate) => this._callSystemMultifunction(name, args, context, evaluate),
        };
    }

    _prepareVariant(variant, args, context, evaluate) {
        if (typeof variant.prepare === "function") {
            const prepared = variant.prepare(args, context, evaluate);
            if (!prepared) return null;
            if (prepared === true) return { args };
            if (Array.isArray(prepared)) return { args: prepared };
            if (!Array.isArray(prepared.args)) {
                throw new Error(`System variant '${variant.name}' prepare() must return false, an argument array, or { args }`);
            }
            return prepared;
        }
        if (variant.prep) {
            let ok = false;
            try {
                ok = Boolean(variant.prep(args, context, evaluate));
            } catch {
                ok = false;
            }
            if (!ok) return null;
        }
        return { args };
    }

    _invokeSystemMultifunction(name, args, context, evaluate) {
        const func = this.functions.get(name);
        if (!func?.systemMultifunction) {
            throw new Error(`${name} is not a system multifunction`);
        }
        const candidates = [];
        for (const variant of func.variants) {
            let prepared;
            try {
                prepared = this._prepareVariant(variant, args, context, evaluate);
            } catch (error) {
                // Preparation is a dispatch probe. A non-applicable coercion
                // should allow a later variant or the native fallback to run.
                if (!variant.prep && !variant.prepare) throw error;
                continue;
            }
            if (!prepared) continue;

            candidates.push({ variant, prepared });
        }

        // Existing variants retain their installation order. New plugin
        // variants may declare a priority to make cross-plugin precedence
        // explicit instead of depending on load order.
        const prioritized = candidates.filter(({ variant }) => Number.isFinite(variant.priority));
        let selected = candidates[0] || null;
        if (prioritized.length > 0) {
            const priority = Math.max(...prioritized.map(({ variant }) => variant.priority));
            const winners = prioritized.filter(({ variant }) => variant.priority === priority);
            if (winners.length > 1) {
                throw new Error(`Ambiguous ${name} variants at priority ${priority}: ${winners.map(({ variant }) => variant.name).join(", ")}`);
            }
            selected = winners[0];
        }
        if (!selected) return { value: null, args, variant: null };

        const { variant, prepared } = selected;
        const tc = context?.getEnv?.("__trace_context__");
        if (tc?.active && context?.getEnv?.("traceSystemVariants", false)) {
            tc.log.push({
                event: "system_variant_selected",
                fn: name,
                variantName: variant.name,
                installedByType: variant.installedByType ?? null,
                depth: tc.currentDepth ?? 0,
            });
        }
        return {
            value: variant.impl(prepared.args, context, evaluate),
            args: prepared.args,
            variant,
        };
    }

    _callSystemMultifunction(name, args, context, evaluate) {
        return this._invokeSystemMultifunction(name, args, context, evaluate).value;
    }

    /**
     * Invoke a system multifunction and retain its normalized operands.
     * Generic reducers (Min/Max) use this to return the promoted winner while
     * ordinary evaluator calls continue to receive only the value.
     */
    invokeWithVariant(name, args, context, evaluate) {
        return this._invokeSystemMultifunction(name, args, context, evaluate);
    }

    /**
     * Add an overload to a typed system operation.
     *
     * `prep(args)` is the legacy boolean applicability probe. `prepare(args,
     * context, evaluate)` may instead return normalized arguments as either an
     * array or `{ args }`; this lets a plugin promote operands before its
     * variant runs. A numeric `priority` opts into deterministic precedence:
     * the highest explicit priority wins and an equal top priority is an error.
     */
    installVariant(name, variant) {
        let func = this.functions.get(name);
        if (!func) {
            throw new Error(`Unknown system function for type installation: ${name}`);
        }
        if (!func.systemMultifunction) {
            func = this._createSystemMultifunction(name, func);
            this.functions.set(name, func);
        }
        if (func.variants.some((existing) => existing.name === variant.name && !existing.nativeFallback)) {
            throw new Error(`Duplicate system multifunction variant '${variant.name}' for ${name}`);
        }
        const fallbackIndex = func.variants.findIndex((existing) => existing.nativeFallback);
        const insertAt = fallbackIndex === -1 ? func.variants.length : fallbackIndex;
        func.variants.splice(insertAt, 0, {
            ...variant,
            nativeFallback: false,
            targetFunction: name,
        });
    }

    /**
     * Register multiple functions from an object { NAME: { impl, lazy?, pure?, doc? } }
     */
    registerAll(defs) {
        for (const [name, def] of Object.entries(defs)) {
            if (typeof def === "function") {
                this.register(name, def);
            } else {
                this.register(name, def.impl, def);
            }
        }
    }

    /**
     * Get a function definition by name.
     * @returns {{ impl, lazy, pure, doc } | undefined}
     */
    get(name) {
        return this.functions.get(name);
    }

    /**
     * Check if a function is registered.
     */
    has(name) {
        return this.functions.has(name);
    }

    /**
     * Call a system function by name.
     * @param {string} name
     * @param {Array} args - Evaluated args (or raw IR if lazy)
     * @param {Context} context
     * @param {Function} evaluate - The evaluate function (for lazy functions that need to evaluate sub-expressions)
     * @returns {*} The result
     */
    call(name, args, context, evaluate) {
        const func = this.functions.get(name);
        if (!func) {
            throw new Error(`Unknown system function: ${name}`);
        }
        return func.impl(args, context, evaluate);
    }

    /**
     * Override a function implementation (saves original for restore).
     */
    override(name, newImpl) {
        const original = this.functions.get(name);
        if (original && !this._overrides.has(name)) {
            this._overrides.set(name, original);
        }
        this.functions.set(name, {
            ...(original || {}),
            impl: newImpl,
        });
    }

    /**
     * Restore a previously overridden function.
     */
    restore(name) {
        const original = this._overrides.get(name);
        if (original) {
            this.functions.set(name, original);
            this._overrides.delete(name);
        }
    }

    /**
     * List all registered function names.
     */
    list() {
        return Array.from(this.functions.keys()).sort();
    }

    /**
     * List all registered function names (alias for list).
     */
    getAllNames() {
        return this.list();
    }
}
