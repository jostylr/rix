import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../eval/evaluator.js";
import { formatValue } from "../../eval/format.js";
import { Context } from "../../runtime/context.js";
import { getDiagnostics } from "../../runtime/diagnostics.js";
import { analyzeRixDocument } from "../language-service/index.js";
import { createStandardSystemContext } from "./standard-policy.js";
import { runtimeDefaults } from "../../runtime/runtime-config.js";
import { PluginCatalog, readSourceHeader } from "../../runtime/plugin-catalog.js";
import { installBundledPlugins } from "../../../plugins/bundled.js";

export const RIX_EXECUTION_PROTOCOL = "rix.execution/1";

function stringList(value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error(`${label} must be an array of non-empty plugin identifiers`);
    }
    return [...new Set(value.map((item) => item.trim()))];
}

function pluginClosure(catalog, requested) {
    const resolved = [];
    const visiting = new Set();
    const visit = (id) => {
        if (resolved.includes(id)) return;
        if (visiting.has(id)) throw new Error(`Plugin dependency cycle detected at '${id}'`);
        const metadata = catalog.info(id);
        if (!metadata) throw new Error(`Unknown editor plugin '${id}'`);
        if (metadata.permissions.length) {
            throw new Error(`Editor plugin '${id}' requests forbidden permissions: ${metadata.permissions.join(", ")}`);
        }
        visiting.add(id);
        for (const requirement of metadata.requires) {
            const exact = catalog.info(requirement);
            const providers = exact
                ? [exact]
                : catalog.list().filter((candidate) => candidate.provides.includes(requirement));
            if (providers.length !== 1) {
                throw new Error(providers.length === 0
                    ? `Editor plugin '${id}' requires unavailable service '${requirement}'`
                    : `Editor plugin '${id}' requirement '${requirement}' has multiple providers`);
            }
            visit(providers[0].id);
        }
        visiting.delete(id);
        resolved.push(id);
    };
    for (const id of requested) visit(id);
    return resolved;
}

function resolveEditorPlugins(request, catalog, allowedPlugins) {
    const approved = stringList(request.plugins, "Host-approved plugins");
    const requested = readSourceHeader(request.source || "", request.filePath || request.uri || "<editor>")
        .plugins.map(String);
    const approvedSet = new Set(approved);
    const missingApproval = requested.find((id) => !approvedSet.has(id));
    if (missingApproval) {
        throw new Error(`Source requests editor plugin '${missingApproval}', but the host did not approve it`);
    }
    if (allowedPlugins !== null) {
        const disallowed = approved.find((id) => !allowedPlugins.has(id));
        if (disallowed) throw new Error(`Editor host policy does not allow plugin '${disallowed}'`);
    }
    const closure = pluginClosure(catalog, approved);
    const names = closure.flatMap((id) => {
        const metadata = catalog.info(id);
        return [metadata.mount, ...metadata.aliases].filter(Boolean);
    });
    return { approved, requested, closure, names };
}

function safeValue(value, depth = 0, seen = new Set()) {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value ?? null;
    if (typeof value === "bigint") return value.toString();
    if (depth >= 3 || typeof value !== "object" || seen.has(value)) return { type: value?.type || typeof value };
    seen.add(value);
    if (value.type === "string") return value.value;
    if (Object.hasOwn(value, "value") && ["string", "number", "bigint", "boolean"].includes(typeof value.value)) {
        return { type: value.type || value.constructor?.name || "value", value: String(value.value) };
    }
    if (Array.isArray(value.values)) return { type: value.type || "sequence", values: value.values.slice(0, 50).map((item) => safeValue(item, depth + 1, seen)) };
    if (value.entries instanceof Map) {
        return { type: value.type || "map", entries: Object.fromEntries([...value.entries].slice(0, 50).map(([key, item]) => [String(key), safeValue(item, depth + 1, seen)])) };
    }
    return { type: value.type || value.constructor?.name || "object" };
}

function eventMap(event) {
    return event?.entries instanceof Map
        ? Object.fromEntries([...event.entries].map(([key, value]) => [key, safeValue(value)]))
        : safeValue(event);
}

function runtimeCheckForError(checks, error) {
    const checkKind = error?.message?.includes("##@")
        ? "predicate"
        : error?.message?.includes("##:") ? "type" : null;
    if (!checkKind) return null;
    const lineMatch = String(error?.rixLocation || error?.message || "")
        .match(/\bline\s+(\d+)\b/i);
    if (lineMatch) {
        const idPrefix = `${checkKind}:${lineMatch[1]}:`;
        const exact = checks.find((candidate) => candidate.id?.startsWith(idPrefix));
        if (exact) return exact;
    }
    return checks.find((candidate) => candidate.checkKind === checkKind) || null;
}

export function createExecutionSession(options = {}) {
    const contexts = new Map();
    let active = null;
    const emitRaw = options.emit || (() => {});
    const allowedPlugins = options.allowedPlugins === undefined
        ? null
        : new Set(stringList(options.allowedPlugins, "Editor allowedPlugins"));

    const run = async (request) => {
        const requestId = request.requestId || `run-${Date.now()}`;
        let sequence = 0;
        const emit = (kind, payload = {}, range = null) => emitRaw({
            protocol: RIX_EXECUTION_PROTOCOL,
            requestId,
            sequence: sequence++,
            kind,
            uri: request.uri || "untitled:rix",
            version: request.version ?? 0,
            range,
            time: Date.now(),
            payload,
        });
        const controller = new AbortController();
        const sessionId = request.sessionId || "default";
        active = { requestId, sessionId, controller };
        const analysis = analyzeRixDocument(request.source || "", { uri: request.uri, version: request.version });
        let catalog;
        let plugins;
        let pluginError = null;
        try {
            catalog = installBundledPlugins(options.createPluginCatalog?.() || new PluginCatalog());
            plugins = resolveEditorPlugins(request, catalog, allowedPlugins);
        } catch (error) {
            plugins = { approved: Array.isArray(request.plugins) ? request.plugins : [], requested: [], closure: [], names: [] };
            pluginError = error;
        }
        emit("run-start", {
            mode: request.mode === "session" ? "session" : "isolated",
            profile: "standard",
            plugins: { approved: plugins.approved, loaded: plugins.closure },
            checks: analysis.checks.length,
            limits: {
                maxSteps: Math.min(
                    request.maxSteps || runtimeDefaults.editorMaxEvaluationSteps,
                    runtimeDefaults.editorMaxEvaluationSteps,
                ),
                maxTimeMs: Math.min(
                    request.maxTimeMs || runtimeDefaults.editorMaxEvaluationTimeMs,
                    runtimeDefaults.editorMaxEvaluationTimeMs,
                ),
            },
        });

        if (pluginError) {
            emit("diagnostic", { severity: "error", code: "RXR1001", message: pluginError.message });
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: 0, skipped: analysis.checks.length } });
            if (active?.requestId === requestId) active = null;
            return;
        }

        if (analysis.diagnostics.some(({ severity }) => severity === "error")) {
            for (const diagnostic of analysis.diagnostics) emit("diagnostic", diagnostic, diagnostic.range);
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: 0, skipped: analysis.checks.length } });
            if (active?.requestId === requestId) active = null;
            return;
        }

        const mode = request.mode === "session" ? "session" : "isolated";
        const stateKey = `${sessionId}\0${plugins.closure.slice().sort().join(",")}`;
        let state = mode === "session" ? contexts.get(stateKey) : null;
        try {
            if (!state) {
                const context = new Context();
                const registry = createDefaultRegistry();
                const fullSystemContext = createDefaultSystemContext({ pluginCatalog: catalog });
                // Establish the host-owned loader before activating
                // approved plugins. The final restricted context omits `.Plugin`.
                const bootstrap = { context, registry, systemContext: fullSystemContext };
                parseAndEvaluate("", bootstrap);
                for (const id of plugins.approved) {
                    catalog.load(id, {
                        ...bootstrap,
                        loadRix: context.getEnv("__plugin_load_rix__"),
                    });
                }
                state = {
                    context,
                    registry,
                    systemContext: createStandardSystemContext(fullSystemContext, {
                        pluginIds: plugins.closure,
                        pluginNames: plugins.names,
                    }),
                    diagnosticOffset: 0,
                };
                if (mode === "session") contexts.set(stateKey, state);
            }
        } catch (error) {
            emit("diagnostic", { severity: "error", code: "RXR1001", message: error?.message || String(error) });
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: 0, skipped: analysis.checks.length } });
            if (active?.requestId === requestId) active = null;
            return;
        }

        try {
            const evaluationOptions = {
                ...state,
                file: request.filePath || request.uri || "<editor>",
                signal: controller.signal,
                maxSteps: Math.min(
                    request.maxSteps || runtimeDefaults.editorMaxEvaluationSteps,
                    runtimeDefaults.editorMaxEvaluationSteps,
                ),
                maxTimeMs: Math.min(
                    request.maxTimeMs || runtimeDefaults.editorMaxEvaluationTimeMs,
                    runtimeDefaults.editorMaxEvaluationTimeMs,
                ),
            };
            // Pure-RiX plugin callables currently use the synchronous lexical
            // closure runtime. Plugin-free editor runs retain cooperative async
            // cancellation; plugin runs retain the same deterministic step and
            // wall-time budgets through the synchronous evaluator.
            const result = plugins.closure.length
                ? parseAndEvaluate(request.source, evaluationOptions)
                : await parseAndEvaluateAsync(request.source, evaluationOptions);
            const runtimeEvents = getDiagnostics(state.context).events;
            for (const event of runtimeEvents.slice(state.diagnosticOffset)) emit("log", eventMap(event));
            state.diagnosticOffset = runtimeEvents.length;
            for (const check of analysis.checks) emit("check", {
                id: check.id, checkKind: check.checkKind, status: "passed", label: check.label,
            }, check.range);
            emit("result", { text: formatValue(result), value: safeValue(result) });
            emit("run-end", { state: "passed", checks: { total: analysis.checks.length, passed: analysis.checks.length, failed: 0, skipped: 0 } });
        } catch (error) {
            if (controller.signal.aborted) {
                emit("run-end", {
                    state: "cancelled",
                    checks: { total: analysis.checks.length, passed: 0, failed: 0, skipped: analysis.checks.length },
                });
                return;
            }
            const check = runtimeCheckForError(analysis.checks, error);
            if (check) emit("check", {
                id: check.id, checkKind: check.checkKind, status: "failed", label: check.label, message: error.message,
            }, check.range);
            emit("diagnostic", { severity: "error", code: "RXR1000", message: error?.message || String(error) }, check?.range || null);
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: check ? 1 : 0, skipped: Math.max(0, analysis.checks.length - (check ? 1 : 0)) } });
        } finally {
            if (active?.requestId === requestId) active = null;
        }
    };

    return {
        run,
        cancel(requestId = null) {
            if (!active || (requestId && active.requestId !== requestId)) return false;
            const reason = new Error("Evaluation cancelled by host");
            reason.code = "EVALUATION_CANCELLED";
            active.controller.abort(reason);
            return true;
        },
        restart(sessionId = "default") {
            if (active?.sessionId === sessionId) this.cancel(active.requestId);
            for (const key of contexts.keys()) {
                if (key.startsWith(`${sessionId}\0`)) contexts.delete(key);
            }
        },
        get activeRequestId() { return active?.requestId || null; },
    };
}

export function startExecutionWorker(input = process.stdin, output = process.stdout, options = {}) {
    const session = createExecutionSession({ ...options, emit(event) { output.write(`${JSON.stringify(event)}\n`); } });
    let buffer = "";
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
        buffer += chunk;
        while (buffer.includes("\n")) {
            const newline = buffer.indexOf("\n");
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            try {
                const request = JSON.parse(line);
                if (request.command === "restart") session.restart(request.sessionId);
                else if (request.command === "cancel") session.cancel(request.requestId);
                else if (request.command === "run") void session.run(request);
            } catch (error) {
                output.write(`${JSON.stringify({ protocol: RIX_EXECUTION_PROTOCOL, kind: "worker-error", payload: { message: error.message } })}\n`);
            }
        }
    });
    return session;
}
