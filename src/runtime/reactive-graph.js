/**
 * Transactional dependency graph for live RiX values.
 *
 * Nodes are either externally-set sources or deferred computations. Reads
 * during an evaluation epoch record dependency edges. Source changes mark
 * transitive dependents dirty, recompute them once, and commit atomically.
 */

import { Integer } from "@ratmath/core";

let nextGraphId = 1;
export const REACTIVE_READ_ENV = "__reactive_read__";

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function text(value) {
    return value?.type === "string" ? value.value : typeof value === "string" ? value : null;
}

function nodeName(value, label = "Reactive node name", preserveCase = false) {
    const requested = text(value);
    const name = preserveCase ? requested : requested?.toLowerCase();
    const identifierPattern = preserveCase
        ? /^[A-Za-z_][A-Za-z0-9_]*$/u
        : /^[a-z_][a-z0-9_]*$/u;
    if (!name || !identifierPattern.test(name)) {
        throw new Error(`${label} must be a RiX identifier string`);
    }
    return name;
}

function graphMethods() {
    return new Map([
        ["SOURCE", method("Source", ([target, name, value]) => target.addSource(name, value))],
        ["DERIVE", method("Derive", ([target, name, formula]) => target.addComputed(name, formula))],
        ["GET", method("Get", ([target, name]) => target.get(name))],
        ["NODE", method("Node", ([target, name]) => target.node(name))],
        ["RECALCULATE", method("Recalculate", ([target]) => target.recalculate())],
        ["_mutable", new Integer(1n)],
    ]);
}

function nodeMethods() {
    return new Map([
        ["GET", method("Get", ([target]) => target.get())],
        ["PEEK", method("Peek", ([target]) => target.peek())],
        ["SET", method("Set", ([target, value]) => target.set(value))],
        ["GETFORMULA", method("GetFormula", ([target]) => target.formula)],
        ["SETFORMULA", method("SetFormula", ([target, formula]) => target.setFormula(formula))],
        ["LIVE", method("Live", ([target]) => target.live())],
        ["_mutable", new Integer(1n)],
    ]);
}

function publicLive(node) {
    return Object.freeze({
        kind: node.kind,
        name: node.name,
        state: node.state,
        dependencies: Object.freeze([...node.dependencies]),
        dependents: Object.freeze([...node.dependents]),
        epoch: node.graph.epoch,
    });
}

export function isReactiveGraph(value) {
    return Boolean(value && value.type === "reactive_graph" && typeof value.get === "function");
}

export function isReactiveNode(value) {
    return Boolean(value && value.type === "reactive_node" && isReactiveGraph(value.graph));
}

export function createReactiveGraph(options = {}) {
    if (typeof options.evaluateFormula !== "function") {
        throw new Error("ReactiveGraph requires a deferred formula evaluator");
    }

    const id = options.id || `reactive-graph-${nextGraphId++}`;
    const nodes = new Map();
    const aliases = new Map();
    const channel = new Set();
    const normalizeName = (value, label) =>
        nodeName(value, label, options.preserveIdentifierCase === true);
    const reservedNames = new Set((options.reservedNames || []).map((name) => normalizeName(name)));
    let activeEpoch = null;
    let graph = null;

    function requireAvailableName(name) {
        if (reservedNames.has(name)) {
            throw new Error(`${options.reservedNameLabel || "Reactive node name is reserved"}: ${name}`);
        }
        if (nodes.has(name) || aliases.has(name)) throw new Error(`Reactive node already exists: ${name}`);
    }

    function canonicalName(name) {
        name = normalizeName(name);
        return aliases.get(name) ?? name;
    }

    function requireNode(name) {
        const node = nodes.get(canonicalName(name));
        if (!node) throw new Error(`Unknown reactive node: ${name}`);
        return node;
    }

    function rebuildDependents() {
        for (const node of nodes.values()) node.dependents = new Set();
        for (const node of nodes.values()) {
            for (const dependency of node.dependencies) {
                nodes.get(dependency)?.dependents.add(node.name);
            }
        }
    }

    function dirtyClosure(startNames) {
        const dirty = new Set(startNames);
        const queue = [...startNames];
        while (queue.length) {
            const name = queue.shift();
            for (const dependent of requireNode(name).dependents) {
                if (dirty.has(dependent)) continue;
                dirty.add(dependent);
                queue.push(dependent);
            }
        }
        return dirty;
    }

    function makeNode(name, kind, fields) {
        const nodeChannel = new Set();
        const node = {
            type: "reactive_node",
            graph,
            graphId: id,
            name,
            id: `${id}:${name}`,
            kind,
            formula: fields.formula ?? null,
            source: fields.source ?? null,
            value: fields.value ?? null,
            lastGoodValue: fields.value ?? null,
            state: kind === "source" ? "clean" : "dirty",
            dependencies: new Set(),
            dependents: new Set(),
            diagnostics: [],
            evaluator: fields.evaluator ?? null,
            get() {
                return graph.get(name);
            },
            peek() {
                return graph.peek(name);
            },
            set(value, metadata = null) {
                if (kind !== "source") throw new Error(`Reactive computed node ${name} cannot be set directly`);
                return graph.setSource(name, value, metadata);
            },
            setFormula(formula, metadata = null) {
                if (kind !== "computed") throw new Error(`Reactive source node ${name} has no formula`);
                return graph.setFormula(name, formula, metadata);
            },
            live() {
                return publicLive(node);
            },
            subscribe(listener) {
                if (typeof listener !== "function") throw new Error("Reactive node subscriber must be a function");
                nodeChannel.add(listener);
                return () => nodeChannel.delete(listener);
            },
            _publish(event) {
                for (const listener of [...nodeChannel]) listener(event);
            },
            _ext: nodeMethods(),
            toString() {
                if (
                    node.value
                    && ["function", "lambda", "multifunction"].includes(node.value.type)
                ) {
                    return `[Reactive function ${name}]`;
                }
                return `[Reactive ${kind} ${name}]`;
            },
        };
        return node;
    }

    function runEpoch({ dirty, sourceOverrides = new Map(), cause = null, evaluateAll = false } = {}) {
        if (activeEpoch) {
            throw new Error(options.nestedEpochError || "Reactive computations cannot start a nested graph epoch");
        }
        const requested = evaluateAll
            ? new Set(nodes.keys())
            : dirtyClosure(new Set(
                [...(dirty || []), ...sourceOverrides.keys()].map(canonicalName),
            ));
        const previousEpoch = graph.epoch;
        const stagedValues = new Map([...nodes].map(([name, node]) => [name, node.value]));
        for (const [name, value] of sourceOverrides) stagedValues.set(name, value);
        const states = new Map([...nodes].map(([name, node]) => [
            name,
            requested.has(name) && node.kind === "computed" ? "dirty" : "clean",
        ]));
        const dependencies = new Map([...nodes].map(([name, node]) => [
            name,
            requested.has(name) && node.kind === "computed"
                ? new Set()
                : new Set(node.dependencies),
        ]));
        const stack = [];
        let currentName = null;

        const epoch = {
            read(name) {
                name = canonicalName(name);
                const node = requireNode(name);
                if (currentName && currentName !== name) dependencies.get(currentName).add(name);
                if (node.kind === "source") return stagedValues.get(name);
                if (states.get(name) === "clean") return stagedValues.get(name);
                if (states.get(name) === "evaluating") {
                    const cycleStart = stack.indexOf(name);
                    const cycle = [...stack.slice(cycleStart), name]
                        .map((item) => options.labelForNode?.(item) ?? item);
                    throw new Error(`${options.cycleLabel || "Reactive cycle"}: ${cycle.join(" -> ")}`);
                }

                states.set(name, "evaluating");
                stack.push(name);
                const previousName = currentName;
                currentName = name;
                try {
                    const value = node.evaluator
                        ? node.evaluator(node.formula, graph)
                        : options.evaluateFormula(node.formula, graph);
                    stagedValues.set(name, value);
                    states.set(name, "clean");
                    return value;
                } finally {
                    currentName = previousName;
                    stack.pop();
                }
            },
            peek(name) {
                name = canonicalName(name);
                const previousName = currentName;
                currentName = null;
                try {
                    return this.read(name);
                } finally {
                    currentName = previousName;
                }
            },
        };

        activeEpoch = epoch;
        try {
            for (const name of requested) epoch.read(name);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            for (const [name, state] of states) {
                if (state !== "evaluating") continue;
                const node = nodes.get(name);
                node.state = "error";
                node.diagnostics = [message];
            }
            const event = Object.freeze({
                type: "reactive:error",
                graph,
                epoch: graph.epoch,
                cause,
                error,
            });
            for (const listener of [...channel]) listener(event);
            throw error;
        } finally {
            activeEpoch = null;
        }

        graph.epoch += 1;
        const changed = [];
        for (const name of requested) {
            const node = nodes.get(name);
            const previous = node.value;
            node.value = stagedValues.get(name);
            node.lastGoodValue = node.value;
            node.state = "clean";
            node.dependencies = node.kind === "computed" ? dependencies.get(name) : new Set();
            node.diagnostics = [];
            if (previous !== node.value) changed.push(name);
        }
        rebuildDependents();
        const event = Object.freeze({
            type: "reactive:commit",
            graph,
            previousEpoch,
            epoch: graph.epoch,
            changed: Object.freeze(changed),
            cause,
        });
        for (const name of changed) nodes.get(name)._publish(event);
        for (const listener of [...channel]) listener(event);
        return graph;
    }

    graph = {
        type: "reactive_graph",
        id,
        epoch: 0,
        _ext: graphMethods(),
        addSource(name, value) {
            name = normalizeName(name);
            requireAvailableName(name);
            const node = makeNode(name, "source", { value });
            nodes.set(name, node);
            return node;
        },
        addComputed(name, formula, metadata = null) {
            name = normalizeName(name);
            requireAvailableName(name);
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("ReactiveGraph.Derive requires deferred syntax @{ ... }");
            }
            const node = makeNode(name, "computed", {
                formula,
                source: metadata?.source ?? options.formulaSource?.(formula) ?? null,
                evaluator: metadata?.evaluator ?? null,
            });
            nodes.set(name, node);
            if (metadata?.initialize === false) return node;
            try {
                runEpoch({ dirty: new Set([name]), cause: { type: "reactive:add", name } });
            } catch (error) {
                nodes.delete(name);
                rebuildDependents();
                throw error;
            }
            return node;
        },
        get(name) {
            name = normalizeName(name);
            if (activeEpoch) return activeEpoch.read(name);
            const node = requireNode(name);
            if (node.state === "error") {
                throw new Error(node.diagnostics[0] || `Reactive node ${name} has an error`);
            }
            return node.value;
        },
        peek(name) {
            name = normalizeName(name);
            if (activeEpoch) return activeEpoch.peek(name);
            return requireNode(name).value;
        },
        node(name) {
            return requireNode(normalizeName(name));
        },
        bindings() {
            return new Map([
                ...nodes,
                ...[...aliases].map(([alias, canonical]) => [alias, nodes.get(canonical)]),
            ]);
        },
        addAlias(name, target) {
            name = normalizeName(name);
            requireAvailableName(name);
            const node = isReactiveNode(target) ? target : requireNode(target);
            if (node.graph !== graph) {
                throw new Error("Reactive aliases must refer to a node in the same ReactiveGraph");
            }
            aliases.set(name, node.name);
            return node;
        },
        define(definitions, cause = null) {
            if (!Array.isArray(definitions) || definitions.length === 0) return graph;
            const pendingNames = new Set();
            for (const definition of definitions) {
                const name = normalizeName(definition?.name);
                requireAvailableName(name);
                if (pendingNames.has(name)) throw new Error(`Reactive node already exists in definition batch: ${name}`);
                if (definition.kind !== "source" && definition.kind !== "computed") {
                    throw new Error(`Reactive definition ${name} must be a source or computed node`);
                }
                if (definition.kind === "computed" && (!definition.formula || definition.formula.fn !== "DEFER")) {
                    throw new Error(`Reactive computed definition ${name} requires deferred syntax @{ ... }`);
                }
                pendingNames.add(name);
            }

            const added = [];
            try {
                for (const definition of definitions) {
                    const name = normalizeName(definition.name);
                    const node = makeNode(name, definition.kind, definition.kind === "source"
                        ? { value: definition.value }
                        : {
                            formula: definition.formula,
                            source: definition.source ?? options.formulaSource?.(definition.formula) ?? null,
                            evaluator: definition.evaluator ?? null,
                        });
                    nodes.set(name, node);
                    added.push(name);
                }
                const computed = new Set(added.filter((name) => nodes.get(name).kind === "computed"));
                if (computed.size > 0) {
                    runEpoch({
                        dirty: computed,
                        cause: cause || { type: "reactive:define", names: Object.freeze([...added]) },
                    });
                }
                return graph;
            } catch (error) {
                for (const name of added) nodes.delete(name);
                rebuildDependents();
                throw error;
            }
        },
        applyBatch(changes, cause = null) {
            if (!Array.isArray(changes) || changes.length === 0) return graph;

            const declarations = [];
            const aliasChanges = [];
            const updates = new Map();
            const pendingNames = new Set();

            for (const change of changes) {
                const name = normalizeName(change?.name);
                if (change.kind === "computed") {
                    requireAvailableName(name);
                    if (pendingNames.has(name)) {
                        throw new Error(`Reactive node already exists in transaction: ${name}`);
                    }
                    if (!change.formula || change.formula.fn !== "DEFER") {
                        throw new Error(`Reactive declaration ${name} requires a deferred definition`);
                    }
                    pendingNames.add(name);
                    declarations.push({ ...change, name });
                    continue;
                }
                if (change.kind === "alias") {
                    requireAvailableName(name);
                    if (pendingNames.has(name)) {
                        throw new Error(`Reactive node already exists in transaction: ${name}`);
                    }
                    pendingNames.add(name);
                    aliasChanges.push({ name, target: normalizeName(change.target) });
                    continue;
                }
                if (change.kind === "update") {
                    const target = requireNode(name);
                    if (target.kind !== "computed") {
                        throw new Error(`Reactive node ${name} does not have a replaceable definition`);
                    }
                    if (!change.formula || change.formula.fn !== "DEFER") {
                        throw new Error(`Reactive update ${name} requires a deferred definition`);
                    }
                    updates.set(target.name, { ...change, name: target.name });
                    continue;
                }
                throw new Error(`Unknown reactive transaction change: ${change?.kind}`);
            }

            const futureNames = new Set([...nodes.keys(), ...declarations.map(({ name }) => name)]);
            const futureAliases = new Map(aliases);
            for (const { name, target } of aliasChanges) {
                const canonical = futureAliases.get(target) ?? target;
                if (!futureNames.has(canonical)) {
                    throw new Error(`Unknown reactive alias target: ${target}`);
                }
                futureAliases.set(name, canonical);
            }

            const addedNodes = [];
            const addedAliases = [];
            const previous = new Map();
            try {
                for (const definition of declarations) {
                    const node = makeNode(definition.name, "computed", {
                        formula: definition.formula,
                        source: definition.source ?? options.formulaSource?.(definition.formula) ?? null,
                        evaluator: definition.evaluator ?? null,
                    });
                    nodes.set(definition.name, node);
                    addedNodes.push(definition.name);
                }
                for (const { name } of aliasChanges) {
                    aliases.set(name, futureAliases.get(name));
                    addedAliases.push(name);
                }
                for (const [name, update] of updates) {
                    const node = nodes.get(name);
                    previous.set(name, {
                        formula: node.formula,
                        source: node.source,
                        evaluator: node.evaluator,
                        state: node.state,
                        diagnostics: [...node.diagnostics],
                        dependencies: new Set(node.dependencies),
                    });
                    node.formula = update.formula;
                    node.source = update.source ?? options.formulaSource?.(update.formula) ?? null;
                    node.evaluator = update.evaluator ?? node.evaluator;
                }

                const dirty = new Set([...addedNodes, ...updates.keys()]);
                if (dirty.size > 0) {
                    runEpoch({
                        dirty,
                        cause: cause || {
                            type: "reactive:batch",
                            names: Object.freeze([...pendingNames, ...updates.keys()]),
                        },
                    });
                }
                return graph;
            } catch (error) {
                for (const name of addedAliases) aliases.delete(name);
                for (const name of addedNodes) nodes.delete(name);
                for (const [name, snapshot] of previous) {
                    const node = nodes.get(name);
                    node.formula = snapshot.formula;
                    node.source = snapshot.source;
                    node.evaluator = snapshot.evaluator;
                    node.state = snapshot.state;
                    node.diagnostics = snapshot.diagnostics;
                    node.dependencies = snapshot.dependencies;
                }
                rebuildDependents();
                throw error;
            }
        },
        setSource(name, value, metadata = null) {
            name = canonicalName(name);
            const node = requireNode(name);
            if (node.kind !== "source") throw new Error(`Reactive node ${name} is not a source`);
            runEpoch({
                dirty: new Set([name]),
                sourceOverrides: new Map([[name, value]]),
                cause: { type: "reactive:set", name, metadata },
            });
            return value;
        },
        setFormula(name, formula, metadata = null) {
            name = canonicalName(name);
            const node = requireNode(name);
            if (node.kind !== "computed") throw new Error(`Reactive node ${name} is not computed`);
            if (activeEpoch) {
                throw new Error(options.formulaMutationError || "Reactive computations cannot change formulas during an epoch");
            }
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("Reactive computed formulas require deferred syntax @{ ... }");
            }
            const previousFormula = node.formula;
            const previousSource = node.source;
            node.formula = formula;
            node.source = metadata?.source ?? options.formulaSource?.(formula) ?? null;
            if (metadata?.evaluator) node.evaluator = metadata.evaluator;
            try {
                runEpoch({
                    dirty: new Set([name]),
                    cause: {
                        type: "reactive:formula",
                        name,
                        formula,
                        source: node.source,
                        previousFormula,
                        previousSource,
                        metadata,
                    },
                });
            } catch (error) {
                node.state = "error";
                throw error;
            }
            return node;
        },
        recalculate(cause = null) {
            return runEpoch({ evaluateAll: true, cause: cause || { type: "reactive:recalculate" } });
        },
        subscribe(listener) {
            if (typeof listener !== "function") throw new Error("ReactiveGraph subscriber must be a function");
            channel.add(listener);
            return () => channel.delete(listener);
        },
        toString() {
            return `[ReactiveGraph ${id} · ${nodes.size} nodes · epoch ${graph.epoch}]`;
        },
    };
    return graph;
}
