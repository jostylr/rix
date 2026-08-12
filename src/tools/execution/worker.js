import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluateAsync } from "../../eval/evaluator.js";
import { formatValue } from "../../eval/format.js";
import { Context } from "../../runtime/context.js";
import { getDiagnostics } from "../../runtime/diagnostics.js";
import { analyzeRixDocument } from "../language-service/index.js";
import { createStandardSystemContext } from "./standard-policy.js";

export const RIX_EXECUTION_PROTOCOL = "rix.execution/1";

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
        active = requestId;
        const analysis = analyzeRixDocument(request.source || "", { uri: request.uri, version: request.version });
        emit("run-start", {
            mode: request.mode === "session" ? "session" : "isolated",
            profile: "standard",
            checks: analysis.checks.length,
        });

        if (analysis.diagnostics.some(({ severity }) => severity === "error")) {
            for (const diagnostic of analysis.diagnostics) emit("diagnostic", diagnostic, diagnostic.range);
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: 0, skipped: analysis.checks.length } });
            active = null;
            return;
        }

        const mode = request.mode === "session" ? "session" : "isolated";
        const sessionId = request.sessionId || "default";
        let state = mode === "session" ? contexts.get(sessionId) : null;
        if (!state) {
            state = {
                context: new Context(),
                registry: createDefaultRegistry(),
                systemContext: createStandardSystemContext(createDefaultSystemContext),
                diagnosticOffset: 0,
            };
            if (mode === "session") contexts.set(sessionId, state);
        }

        try {
            const result = await parseAndEvaluateAsync(request.source, {
                ...state,
                file: request.filePath || request.uri || "<editor>",
            });
            const runtimeEvents = getDiagnostics(state.context).events;
            for (const event of runtimeEvents.slice(state.diagnosticOffset)) emit("log", eventMap(event));
            state.diagnosticOffset = runtimeEvents.length;
            for (const check of analysis.checks) emit("check", {
                id: check.id, checkKind: check.checkKind, status: "passed", label: check.label,
            }, check.range);
            emit("result", { text: formatValue(result), value: safeValue(result) });
            emit("run-end", { state: "passed", checks: { total: analysis.checks.length, passed: analysis.checks.length, failed: 0, skipped: 0 } });
        } catch (error) {
            const check = runtimeCheckForError(analysis.checks, error);
            if (check) emit("check", {
                id: check.id, checkKind: check.checkKind, status: "failed", label: check.label, message: error.message,
            }, check.range);
            emit("diagnostic", { severity: "error", code: "RXR1000", message: error?.message || String(error) }, check?.range || null);
            emit("run-end", { state: "failed", checks: { total: analysis.checks.length, passed: 0, failed: check ? 1 : 0, skipped: Math.max(0, analysis.checks.length - (check ? 1 : 0)) } });
        } finally {
            active = null;
        }
    };

    return {
        run,
        restart(sessionId = "default") { contexts.delete(sessionId); },
        get activeRequestId() { return active; },
    };
}

export function startExecutionWorker(input = process.stdin, output = process.stdout) {
    const session = createExecutionSession({ emit(event) { output.write(`${JSON.stringify(event)}\n`); } });
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
                else if (request.command === "run") void session.run(request);
            } catch (error) {
                output.write(`${JSON.stringify({ protocol: RIX_EXECUTION_PROTOCOL, kind: "worker-error", payload: { message: error.message } })}\n`);
            }
        }
    });
    return session;
}
