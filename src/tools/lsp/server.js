import {
    RIX_SEMANTIC_TOKEN_MODIFIERS,
    RIX_SEMANTIC_TOKEN_TYPES,
    analyzeRixDocument,
    astNodes,
    codeActionsForRange,
    completionAt,
    createRixDocumentStore,
    definitionsAt,
    formatRix,
    hoverAt,
    offsetsToLspRange,
    positionToOffset,
    referencesAt,
    renameAt,
} from "../language-service/index.js";

const COMPLETION_KIND = Object.freeze({
    function: 3, variable: 6, parameter: 6, reactive: 6, snippet: 15,
});
const SYMBOL_KIND = Object.freeze({ function: 12, variable: 13, parameter: 13, reactive: 13 });
const DIAGNOSTIC_SEVERITY = Object.freeze({ error: 1, warning: 2, info: 3, hint: 4 });

function lspRange(document, range) {
    return offsetsToLspRange(document.source, range);
}

function lspDiagnostic(document, diagnostic) {
    return {
        range: lspRange(document, diagnostic.range),
        severity: DIAGNOSTIC_SEVERITY[diagnostic.severity] || 3,
        code: diagnostic.code,
        source: diagnostic.source,
        message: diagnostic.hint ? `${diagnostic.message}\n${diagnostic.hint}` : diagnostic.message,
        data: { version: diagnostic.version, fixes: diagnostic.fixes },
    };
}

function semanticTokenData(document) {
    const tokens = document.semanticTokens
        .map((token) => ({ ...token, position: offsetsToLspRange(document.source, token.range).start }))
        .sort((left, right) => left.position.line - right.position.line || left.position.character - right.position.character);
    const data = [];
    let previousLine = 0;
    let previousCharacter = 0;
    for (const token of tokens) {
        const deltaLine = token.position.line - previousLine;
        const deltaStart = deltaLine === 0 ? token.position.character - previousCharacter : token.position.character;
        const type = RIX_SEMANTIC_TOKEN_TYPES.indexOf(token.type);
        const modifiers = token.modifiers.reduce((bits, modifier) => {
            const index = RIX_SEMANTIC_TOKEN_MODIFIERS.indexOf(modifier);
            return index < 0 ? bits : bits | (1 << index);
        }, 0);
        data.push(deltaLine, deltaStart, token.range.end - token.range.start, Math.max(0, type), modifiers);
        previousLine = token.position.line;
        previousCharacter = token.position.character;
    }
    return data;
}

export function createLspServer(transport, options = {}) {
    const documents = createRixDocumentStore();
    let settings = { ...options };
    let shutdown = false;

    const notifyDiagnostics = (document) => transport.notify("textDocument/publishDiagnostics", {
        uri: document.uri,
        version: document.version,
        diagnostics: document.diagnostics.map((diagnostic) => lspDiagnostic(document, diagnostic)),
    });

    const documentFor = (params) => documents.get(params?.textDocument?.uri);
    const offsetFor = (document, params) => positionToOffset(document.source, params.position);

    const handlers = {
        initialize(params) {
            settings = { ...settings, ...(params.initializationOptions || {}) };
            return {
                serverInfo: { name: "RiX Language Server", version: "0.1.0" },
                capabilities: {
                    positionEncoding: "utf-16",
                    textDocumentSync: { openClose: true, change: 1, save: { includeText: false } },
                    completionProvider: { triggerCharacters: [".", "@", "$", "{"] },
                    hoverProvider: true,
                    definitionProvider: true,
                    referencesProvider: true,
                    renameProvider: { prepareProvider: false },
                    documentSymbolProvider: true,
                    codeActionProvider: { codeActionKinds: ["quickfix"] },
                    foldingRangeProvider: true,
                    documentFormattingProvider: true,
                    semanticTokensProvider: {
                        legend: { tokenTypes: RIX_SEMANTIC_TOKEN_TYPES, tokenModifiers: RIX_SEMANTIC_TOKEN_MODIFIERS },
                        full: true,
                    },
                },
            };
        },
        shutdown() { shutdown = true; return null; },
        "textDocument/completion"(params) {
            const document = documentFor(params);
            if (!document) return { isIncomplete: false, items: [] };
            const items = completionAt(document, offsetFor(document, params)).map((item) => ({
                label: item.label,
                kind: COMPLETION_KIND[item.kind] || 6,
                detail: item.detail,
                documentation: { kind: "markdown", value: item.documentation || "RiX symbol" },
                insertText: item.insertText,
                textEdit: { range: lspRange(document, item.range), newText: item.insertText },
            }));
            return { isIncomplete: false, items };
        },
        "textDocument/hover"(params) {
            const document = documentFor(params);
            const hover = document && hoverAt(document, offsetFor(document, params));
            return hover ? { range: lspRange(document, hover.range), contents: { kind: "markdown", value: hover.markdown } } : null;
        },
        "textDocument/documentSymbol"(params) {
            const document = documentFor(params);
            if (!document) return [];
            return document.symbols.map((symbol) => ({
                name: symbol.name,
                detail: symbol.detail,
                kind: SYMBOL_KIND[symbol.kind] || 13,
                range: lspRange(document, symbol.range),
                selectionRange: lspRange(document, symbol.selectionRange),
            }));
        },
        "textDocument/definition"(params) {
            const document = documentFor(params);
            if (!document) return [];
            return definitionsAt(document, offsetFor(document, params)).map((definition) => ({
                uri: document.uri,
                range: lspRange(document, definition.selectionRange),
            }));
        },
        "textDocument/references"(params) {
            const document = documentFor(params);
            if (!document) return [];
            return referencesAt(document, offsetFor(document, params), {
                includeDeclaration: params.context?.includeDeclaration !== false,
            }).map((reference) => ({ uri: document.uri, range: lspRange(document, reference.range) }));
        },
        "textDocument/rename"(params) {
            const document = documentFor(params);
            if (!document) return null;
            const edits = renameAt(document, offsetFor(document, params), params.newName)
                .map((edit) => ({ range: lspRange(document, edit.range), newText: edit.text }));
            return { changes: { [document.uri]: edits } };
        },
        "textDocument/codeAction"(params) {
            const document = documentFor(params);
            if (!document) return [];
            const start = positionToOffset(document.source, params.range.start);
            const end = positionToOffset(document.source, params.range.end);
            return codeActionsForRange(document, { start, end }).map((action) => ({
                title: action.title,
                kind: action.kind,
                diagnostics: (params.context?.diagnostics || []).filter((item) => action.diagnostics.includes(item.code)),
                edit: {
                    changes: {
                        [document.uri]: action.edits.map((edit) => ({ range: lspRange(document, edit.range), newText: edit.text })),
                    },
                },
            }));
        },
        "textDocument/foldingRange"(params) {
            const document = documentFor(params);
            if (!document) return [];
            return document.folds.map((fold) => {
                const range = lspRange(document, fold.range);
                return { startLine: range.start.line, startCharacter: range.start.character, endLine: range.end.line, endCharacter: range.end.character, kind: fold.kind };
            });
        },
        "textDocument/semanticTokens/full"(params) {
            const document = documentFor(params);
            return { data: document ? semanticTokenData(document) : [] };
        },
        "textDocument/formatting"(params) {
            const document = documentFor(params);
            if (!document || document.parseError) return [];
            const formatted = formatRix(document.source, {
                profile: settings.format?.profile || "readable",
                printWidth: settings.format?.printWidth || params.options?.printWidth,
                indentWidth: settings.format?.indentWidth || params.options?.tabSize,
            });
            if (formatted === document.source) return [];
            return [{
                range: { start: { line: 0, character: 0 }, end: offsetsToLspRange(document.source, { start: document.source.length, end: document.source.length }).end },
                newText: formatted,
            }];
        },
        "rix/explainScope"(params) {
            const document = documentFor(params);
            if (!document) return null;
            const offset = offsetFor(document, params);
            return document.scopes.filter((scope) => Math.abs((scope.offset || 0) - offset) < 2);
        },
        "rix/inspectAst"(params) {
            const document = documentFor(params);
            return document ? { uri: document.uri, version: document.version, ast: document.ast } : null;
        },
        "rix/astNodes"(params) {
            const document = documentFor(params);
            return document ? astNodes(document) : [];
        },
        "rix/catalog"(params) {
            const document = documentFor(params);
            return document?.catalog || [];
        },
        "rix/checks"(params) {
            const document = documentFor(params);
            return document?.checks || [];
        },
    };

    const notifications = {
        initialized() {},
        exit() { transport.exit(shutdown ? 0 : 1); },
        "textDocument/didOpen"(params) {
            const item = params.textDocument;
            notifyDiagnostics(documents.open(item.uri, item.version, item.text, settings));
        },
        "textDocument/didChange"(params) {
            const existing = documents.get(params.textDocument.uri);
            const text = params.contentChanges?.at(-1)?.text;
            if (existing && typeof text === "string") {
                notifyDiagnostics(documents.update(existing.uri, params.textDocument.version, text, settings));
            }
        },
        "textDocument/didClose"(params) {
            documents.close(params.textDocument.uri);
            transport.notify("textDocument/publishDiagnostics", { uri: params.textDocument.uri, diagnostics: [] });
        },
        "workspace/didChangeConfiguration"(params) {
            settings = { ...settings, ...(params.settings || {}) };
            for (const document of documents.all()) {
                notifyDiagnostics(documents.update(document.uri, document.version, document.source, settings));
            }
        },
    };

    return {
        async receive(message) {
            if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
            try {
                if (Object.hasOwn(message, "id")) {
                    const handler = handlers[message.method];
                    if (!handler) return transport.respond(message.id, null, { code: -32601, message: `Method not found: ${message.method}` });
                    transport.respond(message.id, await handler(message.params || {}));
                } else {
                    notifications[message.method]?.(message.params || {});
                }
            } catch (error) {
                if (Object.hasOwn(message, "id")) {
                    transport.respond(message.id, null, { code: -32603, message: error?.message || String(error) });
                }
            }
        },
        documents,
        analyze: analyzeRixDocument,
    };
}

export function createStdioTransport(input = process.stdin, output = process.stdout) {
    let buffer = Buffer.alloc(0);
    let receiver = null;
    const write = (message) => {
        const body = Buffer.from(JSON.stringify(message), "utf8");
        output.write(`Content-Length: ${body.length}\r\n\r\n`);
        output.write(body);
    };
    const transport = {
        onMessage(callback) { receiver = callback; },
        notify(method, params) { write({ jsonrpc: "2.0", method, params }); },
        respond(id, result, error = null) { write(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result }); },
        exit(code) { process.exitCode = code; },
    };
    input.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        while (true) {
            const headerEnd = buffer.indexOf("\r\n\r\n");
            if (headerEnd < 0) break;
            const header = buffer.subarray(0, headerEnd).toString("ascii");
            const length = Number(header.match(/Content-Length:\s*(\d+)/iu)?.[1]);
            if (!Number.isInteger(length) || length < 0) {
                buffer = Buffer.alloc(0);
                break;
            }
            const bodyStart = headerEnd + 4;
            if (buffer.length < bodyStart + length) break;
            const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
            buffer = buffer.subarray(bodyStart + length);
            try { receiver?.(JSON.parse(body)); } catch { /* invalid JSON is ignored */ }
        }
    });
    return transport;
}
