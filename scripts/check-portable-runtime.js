/** Real Node/Bun conformance checks, also runnable against an installed tarball. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : sourceRoot;
const temporaryRoot = path.join(sourceRoot, "tmp");
mkdirSync(temporaryRoot, { recursive: true });
const directory = mkdtempSync(path.join(temporaryRoot, "portable-runtime-"));
const load = (name) => import(pathToFileURL(path.join(root, name)).href);
function run(bin, args = [], input) {
    const result = spawnSync(process.execPath, [path.join(root, "bin", bin), ...args], {
        cwd: directory, encoding: "utf8", input, timeout: 30000, maxBuffer: 8_000_000,
        env: { ...process.env, RIX_CONFIG_DIR: path.join(directory, "config") },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
}
try {
    const rix = await load("src/index-node.js");
    assert.equal(rix.formatValue(rix.parseAndEvaluate("1/3+1/6")), "1/2");
    const session = { context: new rix.Context(), registry: rix.createDefaultRegistry(), systemContext: rix.createDefaultSystemContext() };
    assert.equal(session.systemContext._pluginCatalog.loaded.size, 0);
    rix.parseAndEvaluate('.Plugin.Load("plot"); x := 1/3', session);
    assert(session.systemContext._pluginCatalog.loaded.has("plot"));
    assert.equal(rix.formatValue(rix.parseAndEvaluate("x+1/6", session)), "1/2");
    assert.equal(rix.formatValue(await rix.parseAndEvaluateAsync("{$:2$ [1+1,2+2] }")), "[2, 4]");
    const { cancellationCapstone } = await load("examples/capstones/async-cancellation.mjs");
    assert.equal((await cancellationCapstone()).status, "cancelled");
    const filename = path.join(directory, "example.rix");
    writeFileSync(filename, '.Plugin.Info("float")');
    assert.match(run("rix.js", [filename]), /loaded=_/);
    assert.match(run("rix.js", ["--plugins=full", filename]), /loaded=\[object Object\]/);
    const inspect = '.Plugin.Info("float")\n.exit\n';
    assert.match(run("rix.js", [], inspect), /loaded=\[object Object\]/);
    assert.match(run("rix.js", ["--plugins=none"], inspect), /loaded=_/);
    assert.match(run("rix.js", ["--plugins=none", "--plugin=float"], inspect), /loaded=\[object Object\]/);
    writeFileSync(filename, "1/3+1/6");
    assert.match(run("rix-to-ir.js", [filename]), /ADD/);
    assert.match(run("rix.js", ["verify", "--json", filename]), /passed/);
    const worker = run("rix-worker.js", [], JSON.stringify({command:"run", requestId:"node", uri:"file:///example.rix", source:"1/3+1/6"}) + "\n");
    assert.match(worker, /run-end/);
    assert.match(worker, /passed/);
    assert.match(run("rix.js", ["--all-built-plugins", filename]), /1\/2/);
    const initialize = JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{capabilities:{}}});
    assert.match(run("rix-language-server.js", [], `Content-Length: ${Buffer.byteLength(initialize)}\r\n\r\n${initialize}`), /capabilities/);
    const capabilities = JSON.parse(run("rix.js", ["publish", "--capabilities"]));
    assert.equal(typeof capabilities.binaryTargets.pdf, "boolean");
    if (capabilities.binaryTargets.pdf && capabilities.binaryTargets.png) {
        const output = path.join(directory, "binary");
        run("rix.js", [`--out=${output}`, path.join(root, "examples/renderers/all-formats.rix")]);
        assert.equal(readFileSync(path.join(output, "report.pdf")).subarray(0, 5).toString("ascii"), "%PDF-");
        assert.deepEqual([...readFileSync(path.join(output, "diagram.png")).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        console.log("Optional PDF and PNG host renderers passed.");
    }
    writeFileSync(filename, '.Paragraph(["exact",1/3])');
    const profile = {schema:"rix.publication-build@1",out:"output",profiles:{preview:{plugins:["document"],targets:["html","latex"],live:true}},documents:[{id:"sample",source:"example.rix"}]};
    const config = path.join(directory, "build.json");
    writeFileSync(config, JSON.stringify(profile));
    const report = JSON.parse(run("rix.js", ["publish", config, "--json"]));
    assert(report.documents.every((document) => document.status === "built"));
    assert.match(readFileSync(path.join(directory, "output/sample/default/document.html"), "utf8"), /1\/3/);
    const { buildLiveRuntimeAssets } = await load("src/runtime/live-publication-node.js");
    const assets = await buildLiveRuntimeAssets();
    assert(assets.get("rix-page.js").length > 1000);
    console.log(`Portable runtime passed on ${process.versions.bun ? "Bun " + process.versions.bun : "Node " + process.versions.node}: modules, plugins, async/cancellation, CLI/REPL, editor tools, static/live publication.`);
} finally {
    rmSync(directory, { recursive: true, force: true });
}
