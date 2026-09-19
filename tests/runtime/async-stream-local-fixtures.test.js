import { expect, test } from "bun:test";
import { mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { consumeAsyncStreamSequential, closeAsyncStream, pullRawAsyncStream } from "../../src/runtime/async-stream.js";
import { createHttpAsyncStream, createFileAsyncStream, createWebSocketAsyncStream } from "../../src/runtime/async-stream-adapters.js";
import { createNodeStreamHostServices } from "../../src/runtime/async-stream-adapters-node.js";

const root = fileURLToPath(new URL("../../../tmp/", import.meta.url));
const collect = (stream) => consumeAsyncStreamSequential(stream, { kind: "collect", bound: null }, {});
const text = (result) => result.values.map((value) => value.value).join("");

test("local file stream enforces real roots and closes early with byte-bounded reads", async () => {
    const directory = path.join(root, `r3-files-${process.pid}`);
    const allowed = path.join(directory, "allowed");
    await mkdir(allowed, { recursive: true });
    try {
        const inside = path.join(allowed, "inside.txt"), outside = path.join(directory, "outside.txt"), link = path.join(allowed, "link.txt");
        await writeFile(inside, "one\nλ two\n"); await writeFile(outside, "outside"); await symlink(outside, link);
        const services = createNodeStreamHostServices({ roots: [allowed], permissions: ["FILES"] });
        expect(text(await collect(createFileAsyncStream(inside, { services, maxChunkBytes: 3 })))).toBe("one\nλ two\n");
        expect(() => createFileAsyncStream(outside, { services })).toThrow("denied");
        expect(() => createFileAsyncStream(link, { services })).toThrow("denied");
        const stream = createFileAsyncStream(inside, { services, maxChunkBytes: 3 });
        expect((await pullRawAsyncStream(stream)).value.value).toBe("one");
        await closeAsyncStream(stream); expect(stream._stream.root.closeCount).toBe(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("loopback HTTP and WebSocket services retain message order and reject redirects", async () => {
    let sockets = 0;
    const server = Bun.serve({
        hostname: "127.0.0.1", port: 0,
        fetch(request, server) {
            const route = new URL(request.url).pathname;
            if (route === "/events" && server.upgrade(request)) return;
            if (route === "/redirect") return new Response(null, { status: 302, headers: { Location: "http://not-contacted.invalid/" } });
            return new Response("fixture λ\n", { headers: { "content-type": "text/plain" } });
        },
        websocket: { open(socket) { sockets++; socket.send("one"); socket.send("two"); socket.close(); }, close() { sockets--; }, message() {} },
    });
    try {
        const http = `http://127.0.0.1:${server.port}`, ws = `ws://127.0.0.1:${server.port}`;
        const services = createNodeStreamHostServices({ origins: [http, ws], permissions: ["NET"], createWebSocket: (url) => new WebSocket(url) });
        expect(text(await collect(createHttpAsyncStream(`${http}/data`, { services })))).toBe("fixture λ\n");
        expect((await collect(createWebSocketAsyncStream(`${ws}/events`, { services }))).values.map((value) => value.value)).toEqual(["one", "two"]);
        await expect(collect(createHttpAsyncStream(`${http}/redirect`, { services }))).rejects.toThrow();
        expect(sockets).toBe(0);
    } finally { server.stop(true); }
});
