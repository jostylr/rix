import { describe, expect, test } from "bun:test";
import { createLspServer } from "../../src/tools/lsp/server.js";

function harness() {
    const messages = [];
    const transport = {
        notify(method, params) { messages.push({ method, params }); },
        respond(id, result, error) { messages.push({ id, result, error }); },
        exit(code) { messages.push({ exit: code }); },
    };
    return { messages, server: createLspServer(transport) };
}

async function request(harness_, id, method, params = {}) {
    await harness_.server.receive({ jsonrpc: "2.0", id, method, params });
    return harness_.messages.findLast((message) => message.id === id);
}

describe("RiX LSP adapter", () => {
    test("negotiates the first-release static capabilities", async () => {
        const instance = harness();
        const response = await request(instance, 1, "initialize");
        expect(response.result.serverInfo.name).toBe("RiX Language Server");
        expect(response.result.capabilities).toMatchObject({
            positionEncoding: "utf-16",
            hoverProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            documentFormattingProvider: true,
        });
    });

    test("publishes diagnostics and serves symbols, checks, and formatting", async () => {
        const instance = harness();
        await instance.server.receive({
            jsonrpc: "2.0",
            method: "textDocument/didOpen",
            params: { textDocument: { uri: "file:///sample.rix", version: 1, text: "x=1; {; x; };" } },
        });
        const published = instance.messages.find(({ method }) => method === "textDocument/publishDiagnostics");
        expect(published.params.diagnostics.map(({ code }) => code)).toContain("RX1001");

        const symbols = await request(instance, 2, "textDocument/documentSymbol", { textDocument: { uri: "file:///sample.rix" } });
        expect(symbols.result[0].name).toBe("x");

        const formatting = await request(instance, 3, "textDocument/formatting", {
            textDocument: { uri: "file:///sample.rix" }, options: { tabSize: 4, insertSpaces: true },
        });
        expect(formatting.result[0].newText).toContain("x = 1;");
    });

    test("rejects system renames through a structured JSON-RPC error", async () => {
        const instance = harness();
        await instance.server.receive({
            jsonrpc: "2.0", method: "textDocument/didOpen",
            params: { textDocument: { uri: "file:///system.rix", version: 1, text: "@_SIMPLIFY(1);" } },
        });
        const response = await request(instance, 4, "textDocument/rename", {
            textDocument: { uri: "file:///system.rix" }, position: { line: 0, character: 4 }, newName: "OTHER",
        });
        expect(response.error.message).toContain("cannot be renamed");
    });
});

