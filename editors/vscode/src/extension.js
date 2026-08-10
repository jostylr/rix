import * as vscode from "vscode";
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const selector = { language: "rix", scheme: "file" };

function asPosition(position) { return new vscode.Position(position.line, position.character); }
function asRange(range) { return new vscode.Range(asPosition(range.start), asPosition(range.end)); }
function asLocation(location) { return new vscode.Location(vscode.Uri.parse(location.uri), asRange(location.range)); }
function languageSettings() {
    const configuration = vscode.workspace.getConfiguration("rix");
    return {
        lint: { level: configuration.get("lint.level", "standard"), profiles: configuration.get("lint.profiles", ["default"]) },
        format: { profile: configuration.get("format.profile", "readable"), printWidth: configuration.get("format.printWidth", 100) },
    };
}

class RpcClient {
    constructor(context, output) {
        this.context = context;
        this.output = output;
        this.sequence = 1;
        this.pending = new Map();
        this.notifications = new Map();
        this.buffer = Buffer.alloc(0);
        this.process = null;
    }

    scriptPath() {
        const bundled = path.join(this.context.extensionPath, "dist", "rix-language-server.js");
        return existsSync(bundled)
            ? { command: process.execPath, args: [bundled], electron: true }
            : { command: process.execPath, args: [path.resolve(this.context.extensionPath, "../../bin/rix-language-server.js")], electron: false };
    }

    async start() {
        const launch = this.scriptPath();
        const env = { ...process.env };
        if (launch.electron) env.ELECTRON_RUN_AS_NODE = "1";
        this.process = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"], env });
        this.process.stdout.on("data", (chunk) => this.consume(chunk));
        this.process.stderr.on("data", (chunk) => this.output.appendLine(`[language server] ${String(chunk).trimEnd()}`));
        this.process.on("exit", (code) => {
            for (const { reject } of this.pending.values()) reject(new Error(`RiX language server exited (${code})`));
            this.pending.clear();
        });
        await this.request("initialize", {
            processId: process.pid,
            rootUri: vscode.workspace.workspaceFolders?.[0]?.uri.toString() || null,
            capabilities: { general: { positionEncodings: ["utf-16"] } },
            initializationOptions: languageSettings(),
        });
        this.notify("initialized", {});
    }

    write(message) {
        const body = Buffer.from(JSON.stringify(message), "utf8");
        this.process?.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
        this.process?.stdin.write(body);
    }

    request(method, params = {}) {
        const id = this.sequence++;
        this.write({ jsonrpc: "2.0", id, method, params });
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    notify(method, params = {}) { this.write({ jsonrpc: "2.0", method, params }); }
    on(method, callback) { this.notifications.set(method, callback); }

    consume(chunk) {
        this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
        while (true) {
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd < 0) return;
            const length = Number(this.buffer.subarray(0, headerEnd).toString("ascii").match(/Content-Length:\s*(\d+)/iu)?.[1]);
            const bodyStart = headerEnd + 4;
            if (!Number.isInteger(length) || this.buffer.length < bodyStart + length) return;
            const body = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
            this.buffer = this.buffer.subarray(bodyStart + length);
            let message;
            try { message = JSON.parse(body); } catch { continue; }
            if (Object.hasOwn(message, "id")) {
                const pending = this.pending.get(message.id);
                if (!pending) continue;
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result);
            } else if (message.method) this.notifications.get(message.method)?.(message.params);
        }
    }

    dispose() {
        try { this.notify("exit"); } catch { /* already closed */ }
        this.process?.kill();
    }
}

class WorkerClient {
    constructor(context, output, runtimeDiagnostics, passDecoration, failDecoration) {
        this.context = context;
        this.output = output;
        this.runtimeDiagnostics = runtimeDiagnostics;
        this.passDecoration = passDecoration;
        this.failDecoration = failDecoration;
        this.process = null;
        this.buffer = "";
        this.pending = new Map();
        this.counter = 1;
    }

    launch() {
        const bundled = path.join(this.context.extensionPath, "dist", "rix-worker.js");
        if (existsSync(bundled)) return { command: process.execPath, args: [bundled], electron: true };
        return { command: "bun", args: [path.resolve(this.context.extensionPath, "../../bin/rix-worker.js")], electron: false };
    }

    ensure() {
        if (this.process && !this.process.killed) return;
        const launch = this.launch();
        const env = { ...process.env };
        if (launch.electron) env.ELECTRON_RUN_AS_NODE = "1";
        this.process = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"], env });
        this.process.stdout.setEncoding("utf8");
        this.process.stdout.on("data", (chunk) => this.consume(chunk));
        this.process.stderr.on("data", (chunk) => this.output.appendLine(`[worker] ${String(chunk).trimEnd()}`));
        this.process.on("exit", (code) => {
            for (const pending of this.pending.values()) pending.reject(new Error(`RiX worker exited (${code})`));
            this.pending.clear();
            this.process = null;
        });
    }

    consume(chunk) {
        this.buffer += chunk;
        while (this.buffer.includes("\n")) {
            const newline = this.buffer.indexOf("\n");
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            let event;
            try { event = JSON.parse(line); } catch { continue; }
            const pending = this.pending.get(event.requestId);
            if (!pending) continue;
            pending.events.push(event);
            this.present(event, pending.document);
            if (event.kind === "run-end") {
                clearTimeout(pending.timeout);
                this.pending.delete(event.requestId);
                pending.resolve(pending.events);
            }
        }
    }

    present(event, document) {
        if (event.kind === "result") this.output.appendLine(`${document.uri.fsPath}: ${event.payload.text}`);
        else if (event.kind === "diagnostic") {
            this.output.appendLine(`${document.uri.fsPath}: ${event.payload.message}`);
            const range = event.range ? new vscode.Range(document.positionAt(event.range.start), document.positionAt(event.range.end)) : new vscode.Range(0, 0, 0, 1);
            const diagnostic = new vscode.Diagnostic(range, event.payload.message, vscode.DiagnosticSeverity.Error);
            diagnostic.code = event.payload.code;
            diagnostic.source = "rix-runtime";
            this.runtimeDiagnostics.set(document.uri, [diagnostic]);
        }
    }

    async run(document, source, options = {}) {
        if (!vscode.workspace.isTrusted) throw new Error("RiX execution is disabled in untrusted workspaces.");
        this.ensure();
        this.runtimeDiagnostics.delete(document.uri);
        const requestId = `vscode-${Date.now()}-${this.counter++}`;
        const timeoutMs = vscode.workspace.getConfiguration("rix", document.uri).get("execution.timeoutMs", 10000);
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.process?.kill();
                reject(new Error(`RiX execution exceeded ${timeoutMs} ms; the worker was restarted.`));
            }, timeoutMs);
            this.pending.set(requestId, { resolve, reject, events: [], document, timeout });
        });
        this.process.stdin.write(`${JSON.stringify({
            command: "run", requestId, uri: document.uri.toString(), version: document.version,
            filePath: document.uri.scheme === "file" ? document.uri.fsPath : null,
            source,
            mode: options.mode || vscode.workspace.getConfiguration("rix", document.uri).get("execution.mode", "isolated"),
            sessionId: options.sessionId || "default",
        })}\n`);
        const events = await promise;
        this.decorate(document, events);
        return events;
    }

    decorate(document, events) {
        if (!vscode.workspace.getConfiguration("rix", document.uri).get("checks.inline.decorations", true)) return;
        const editor = vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === document.uri.toString());
        if (!editor) return;
        const passed = [];
        const failed = [];
        for (const event of events.filter(({ kind }) => kind === "check" && event.range)) {
            const range = new vscode.Range(document.positionAt(event.range.start), document.positionAt(event.range.end));
            (event.payload.status === "passed" ? passed : failed).push(range);
        }
        editor.setDecorations(this.passDecoration, passed);
        editor.setDecorations(this.failDecoration, failed);
    }

    restart() {
        this.ensure();
        this.process.stdin.write(`${JSON.stringify({ command: "restart", sessionId: "default" })}\n`);
    }

    dispose() { this.process?.kill(); }
}

function registerLanguageProviders(context, client) {
    const td = (document) => ({ textDocument: { uri: document.uri.toString() } });
    const pos = (document, position) => ({ ...td(document), position });
    const disposables = [];

    disposables.push(vscode.languages.registerCompletionItemProvider(selector, {
        async provideCompletionItems(document, position) {
            const result = await client.request("textDocument/completion", pos(document, position));
            return result.items.map((item) => {
                const completion = new vscode.CompletionItem(item.label, item.kind);
                completion.detail = item.detail;
                completion.documentation = new vscode.MarkdownString(item.documentation?.value || "");
                completion.insertText = item.insertText;
                completion.range = asRange(item.textEdit.range);
                return completion;
            });
        },
    }, ".", "@", "$", "{"));

    disposables.push(vscode.languages.registerHoverProvider(selector, {
        async provideHover(document, position) {
            const hover = await client.request("textDocument/hover", pos(document, position));
            return hover && new vscode.Hover(new vscode.MarkdownString(hover.contents.value), asRange(hover.range));
        },
    }));

    disposables.push(vscode.languages.registerDefinitionProvider(selector, {
        async provideDefinition(document, position) {
            return (await client.request("textDocument/definition", pos(document, position))).map(asLocation);
        },
    }));

    disposables.push(vscode.languages.registerReferenceProvider(selector, {
        async provideReferences(document, position, options) {
            return (await client.request("textDocument/references", { ...pos(document, position), context: options })).map(asLocation);
        },
    }));

    disposables.push(vscode.languages.registerRenameProvider(selector, {
        async provideRenameEdits(document, position, newName) {
            const result = await client.request("textDocument/rename", { ...pos(document, position), newName });
            const edit = new vscode.WorkspaceEdit();
            for (const [uri, edits] of Object.entries(result.changes || {})) {
                for (const item of edits) edit.replace(vscode.Uri.parse(uri), asRange(item.range), item.newText);
            }
            return edit;
        },
    }));

    disposables.push(vscode.languages.registerDocumentSymbolProvider(selector, {
        async provideDocumentSymbols(document) {
            return (await client.request("textDocument/documentSymbol", td(document))).map((item) =>
                new vscode.SymbolInformation(item.name, item.kind, item.detail || "", new vscode.Location(document.uri, asRange(item.selectionRange))));
        },
    }));

    disposables.push(vscode.languages.registerCodeActionsProvider(selector, {
        async provideCodeActions(document, range, context_) {
            const actions = await client.request("textDocument/codeAction", {
                ...td(document), range, context: { diagnostics: context_.diagnostics.map((diagnostic) => ({ code: diagnostic.code, range: diagnostic.range })) },
            });
            return actions.map((item) => {
                const action = new vscode.CodeAction(item.title, vscode.CodeActionKind.QuickFix);
                const edit = new vscode.WorkspaceEdit();
                for (const [uri, edits] of Object.entries(item.edit?.changes || {})) {
                    for (const change of edits) edit.replace(vscode.Uri.parse(uri), asRange(change.range), change.newText);
                }
                action.edit = edit;
                action.diagnostics = context_.diagnostics.filter((diagnostic) => item.diagnostics.some((entry) => entry.code === diagnostic.code));
                return action;
            });
        },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));

    disposables.push(vscode.languages.registerFoldingRangeProvider(selector, {
        async provideFoldingRanges(document) {
            return (await client.request("textDocument/foldingRange", td(document))).map((item) =>
                new vscode.FoldingRange(item.startLine, item.endLine, item.kind === "comment" ? vscode.FoldingRangeKind.Comment : undefined));
        },
    }));

    disposables.push(vscode.languages.registerDocumentFormattingEditProvider(selector, {
        async provideDocumentFormattingEdits(document, options) {
            const edits = await client.request("textDocument/formatting", { ...td(document), options });
            return edits.map((edit) => vscode.TextEdit.replace(asRange(edit.range), edit.newText));
        },
    }));

    const legend = new vscode.SemanticTokensLegend([
        "namespace", "type", "class", "enum", "interface", "struct", "typeParameter", "parameter", "variable",
        "property", "enumMember", "event", "function", "method", "macro", "keyword", "modifier", "comment", "string",
        "number", "regexp", "operator",
    ], ["declaration", "definition", "readonly", "static", "deprecated", "abstract", "async", "modification", "documentation", "defaultLibrary"]);
    disposables.push(vscode.languages.registerDocumentSemanticTokensProvider(selector, {
        async provideDocumentSemanticTokens(document) {
            const result = await client.request("textDocument/semanticTokens/full", td(document));
            return new vscode.SemanticTokens(new Uint32Array(result.data));
        },
    }, legend));
    context.subscriptions.push(...disposables);
}

function setupTests(context, client, worker) {
    const controller = vscode.tests.createTestController("rixChecks", "RiX Checks");
    context.subscriptions.push(controller);
    const fileItems = new Map();
    const checkIds = new Map();

    const sync = async (document) => {
        if (document.languageId !== "rix" || !vscode.workspace.getConfiguration("rix", document.uri).get("checks.inline.showInTestExplorer", true)) return;
        const checks = await client.request("rix/checks", { textDocument: { uri: document.uri.toString() } });
        let file = fileItems.get(document.uri.toString());
        if (!file) {
            file = controller.createTestItem(document.uri.toString(), path.basename(document.uri.fsPath), document.uri);
            controller.items.add(file);
            fileItems.set(document.uri.toString(), file);
        }
        file.children.replace(checks.map((check) => {
            const item = controller.createTestItem(`${document.uri}:${check.id}`, check.label, document.uri);
            item.range = new vscode.Range(document.positionAt(check.range.start), document.positionAt(check.range.end));
            checkIds.set(item.id, check.id);
            return item;
        }));
    };

    const profile = controller.createRunProfile("Run RiX checks", vscode.TestRunProfileKind.Run, async (request) => {
        const run = controller.createTestRun(request);
        const uris = new Map();
        const collect = (item) => {
            if (item.uri) uris.set(item.uri.toString(), item.uri);
            item.children.forEach(collect);
        };
        if (request.include) request.include.forEach(collect);
        else controller.items.forEach(collect);
        for (const uri of uris.values()) {
            const document = await vscode.workspace.openTextDocument(uri);
            const file = fileItems.get(uri.toString());
            file?.children.forEach((item) => run.started(item));
            try {
                const events = await worker.run(document, document.getText(), { mode: "isolated" });
                const statuses = new Map(events.filter(({ kind }) => kind === "check").map((event) => [event.payload.id, event.payload.status]));
                file?.children.forEach((item) => {
                    const checkId = checkIds.get(item.id);
                    if (statuses.get(checkId) === "passed") run.passed(item);
                    else if (statuses.has(checkId)) run.failed(item, new vscode.TestMessage("RiX inline check failed"));
                    else run.skipped(item);
                });
            } catch (error) {
                file?.children.forEach((item) => run.errored(item, new vscode.TestMessage(error.message)));
            }
        }
        run.end();
    }, true);
    context.subscriptions.push(profile);
    return { sync };
}

export async function activate(context) {
    const output = vscode.window.createOutputChannel("RiX");
    const staticDiagnostics = vscode.languages.createDiagnosticCollection("rix");
    const runtimeDiagnostics = vscode.languages.createDiagnosticCollection("rix-runtime");
    const passDecoration = vscode.window.createTextEditorDecorationType({ isWholeLine: true, overviewRulerColor: new vscode.ThemeColor("testing.iconPassed"), overviewRulerLane: vscode.OverviewRulerLane.Left });
    const failDecoration = vscode.window.createTextEditorDecorationType({ isWholeLine: true, overviewRulerColor: new vscode.ThemeColor("testing.iconFailed"), overviewRulerLane: vscode.OverviewRulerLane.Left });
    context.subscriptions.push(output, staticDiagnostics, runtimeDiagnostics, passDecoration, failDecoration);

    const client = new RpcClient(context, output);
    await client.start();
    context.subscriptions.push({ dispose: () => client.dispose() });
    client.on("textDocument/publishDiagnostics", (params) => {
        const uri = vscode.Uri.parse(params.uri);
        staticDiagnostics.set(uri, params.diagnostics.map((item) => {
            const diagnostic = new vscode.Diagnostic(asRange(item.range), item.message, Math.max(0, item.severity - 1));
            diagnostic.code = item.code;
            diagnostic.source = item.source;
            return diagnostic;
        }));
    });
    registerLanguageProviders(context, client);

    const worker = new WorkerClient(context, output, runtimeDiagnostics, passDecoration, failDecoration);
    context.subscriptions.push({ dispose: () => worker.dispose() });
    const tests = setupTests(context, client, worker);
    const timers = new Map();
    const open = (document) => {
        if (document.languageId !== "rix") return;
        client.notify("textDocument/didOpen", { textDocument: { uri: document.uri.toString(), languageId: "rix", version: document.version, text: document.getText() } });
        setTimeout(() => tests.sync(document), 100);
    };
    const change = (event) => {
        if (event.document.languageId !== "rix") return;
        clearTimeout(timers.get(event.document.uri.toString()));
        timers.set(event.document.uri.toString(), setTimeout(() => {
            client.notify("textDocument/didChange", { textDocument: { uri: event.document.uri.toString(), version: event.document.version }, contentChanges: [{ text: event.document.getText() }] });
            setTimeout(() => tests.sync(event.document), 100);
        }, 150));
    };
    vscode.workspace.textDocuments.forEach(open);
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(open));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(change));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === "rix") client.notify("textDocument/didClose", { textDocument: { uri: document.uri.toString() } });
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("rix.lint") || event.affectsConfiguration("rix.format")) {
            client.notify("workspace/didChangeConfiguration", { settings: languageSettings() });
        }
    }));

    const activeRix = () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "rix") throw new Error("Open a RiX document first.");
        return editor;
    };
    const run = async (selection = false, checksOnly = false) => {
        try {
            const editor = activeRix();
            const source = selection && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : editor.document.getText();
            output.show(true);
            const events = await worker.run(editor.document, source, { mode: checksOnly ? "isolated" : undefined });
            const end = events.findLast(({ kind }) => kind === "run-end");
            if (end?.payload.state === "passed") vscode.window.setStatusBarMessage("RiX run passed", 2500);
        } catch (error) { void vscode.window.showErrorMessage(error.message); }
    };
    context.subscriptions.push(vscode.commands.registerCommand("rix.runFile", () => run(false, false)));
    context.subscriptions.push(vscode.commands.registerCommand("rix.runSelection", () => run(true, false)));
    context.subscriptions.push(vscode.commands.registerCommand("rix.checkFile", () => run(false, true)));
    context.subscriptions.push(vscode.commands.registerCommand("rix.restartSession", () => { worker.restart(); vscode.window.setStatusBarMessage("RiX session restarted", 2000); }));
    context.subscriptions.push(vscode.commands.registerCommand("rix.showOutput", () => output.show()));
    context.subscriptions.push(vscode.commands.registerCommand("rix.showAst", async () => {
        try {
            const editor = activeRix();
            const result = await client.request("rix/inspectAst", { textDocument: { uri: editor.document.uri.toString() } });
            output.appendLine(JSON.stringify(result, null, 2));
            output.show();
        } catch (error) { void vscode.window.showErrorMessage(error.message); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("rix.explainScope", async () => {
        try {
            const editor = activeRix();
            const result = await client.request("rix/explainScope", { textDocument: { uri: editor.document.uri.toString() }, position: editor.selection.active });
            output.appendLine(JSON.stringify(result, null, 2));
            output.show();
        } catch (error) { void vscode.window.showErrorMessage(error.message); }
    }));
}

export function deactivate() {}
