#!/usr/bin/env bun
/** Offline/CSP and incremental-widget acceptance with a locally installed browser. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from "../src/index.js";
import { buildLivePublication, buildLiveRuntimeAssets } from "../src/runtime/live-publication-node.js";

const root = path.resolve(import.meta.dir, "..");
const artifacts = path.join(root, "tmp/live-publication-browser");
await mkdir(artifacts, { recursive: true });
const source = `.Plugin.Load("document"); $$radius := 3; $$point := [20,20];
$$view := .Fragment([
 .Paragraph("Exact live publication"),
 .ControlPanel([.Controls.Slider($$radius, 1:8, 1, "Radius")]),
 .Graphics.Graphic([120,80], [
   .Graphics.Circle([60,40], $radius, {= id="retained-circle", fill="#0c7b7f" }),
   .Graphics.Text([10,12], "Exact radius", {= id="retained-label", size=7 }),
   .Graphics.DragPoint($$point, 3, {= id="editable-point" }, "Move the point")
 ])
]); $view`;
const value = parseAndEvaluate(source, { context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
const runtimeAssets = await buildLiveRuntimeAssets();
for (const [name, script] of [["working", source], ["failure", ".ThisDoesNotExist()"]]) {
    const built = await buildLivePublication({ value, source: script, sourcePath: "/private/project/publication.rix", plugins: ["document"], runtimeAssets, format: formatValue, assetPrefix: `assets/${name}` });
    await Bun.write(path.join(artifacts, `${name}.html`), built.content);
    for (const [relative, bytes] of built.assets) { await mkdir(path.dirname(path.join(artifacts, relative)), { recursive: true }); await Bun.write(path.join(artifacts, relative), bytes); }
}
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = path.resolve(artifacts, `.${pathname}`);
    if (!file.startsWith(`${artifacts}/`) || !(await Bun.file(file).exists())) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file));
} });
let browser;
try {
    const { chromium } = await import(process.env.RIX_PLAYWRIGHT_MODULE || "playwright");
    browser = await chromium.launch({ headless: true, ...(process.env.RIX_CHROME_EXECUTABLE ? { executablePath: process.env.RIX_CHROME_EXECUTABLE } : {}) });
    const base = `http://127.0.0.1:${server.port}`;
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJs.newPage(); await staticPage.goto(`${base}/working.html`);
    const initial = await staticPage.locator("#rix-app").innerText();
    assert.match(initial, /Exact live publication/);
    assert.equal(await staticPage.locator('[data-rix-semantic-id="retained-circle"]').getAttribute("r"), "3");
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [], blocked = [], requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (/Content Security Policy|violates.*directive/i.test(message.text())) blocked.push(message.text()); });
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${base}/working.html`);
    await page.waitForFunction(() => document.querySelector("#rix-app").dataset.rixLiveReady === "true").catch(async (error) => {
        throw new Error(`Live startup failed: ${await page.locator("#rix-publication-status").textContent()}; page errors: ${errors.join("; ")}`, { cause: error });
    });
    const mark = page.locator('[data-rix-semantic-id="retained-circle"]');
    assert.equal(await mark.getAttribute("r"), "3");
    await mark.evaluate((element) => { window.retainedCircle = element; });
    const svg = page.locator("svg.rix-output-svg");
    await svg.focus(); await page.keyboard.press("]");
    assert.equal(await page.locator(".rix-output-semantic-selected").getAttribute("data-rix-semantic-id"), "retained-circle");
    const slider = page.locator("[data-rix-control-input][type=range]");
    for (const expected of [4, 5, 6]) {
        await slider.focus(); await page.keyboard.press("ArrowRight");
        await page.waitForFunction((radius) => document.querySelector('[data-rix-semantic-id="retained-circle"]').getAttribute("r") === String(radius), expected);
        assert.equal(await mark.evaluate((element) => element === window.retainedCircle), true, "Passive SVG mark identity must survive updates");
        assert.equal(await page.locator("#rix-app").getAttribute("data-rix-svg-update"), "incremental-svg");
        assert.equal(await page.locator(".rix-output-semantic-selected").getAttribute("data-rix-semantic-id"), "retained-circle");
        assert.equal(await slider.evaluate((element) => element === document.activeElement), true);
    }
    const handle = page.locator("[data-rix-drag-target]");
    await handle.focus(); await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("[data-rix-drag-target]").getAttribute("cx") === "21");
    assert.equal(await handle.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("[data-rix-drag-target]").getAttribute("cx") === "22");
    assert.equal(await mark.getAttribute("r"), "6");
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    assert.ok(requests.every((url) => url.startsWith(base)), "Publication must request only its local packaged assets");
    await page.screenshot({ path: path.join(artifacts, "live.png") });
    await page.goto(`${base}/failure.html`);
    await page.waitForFunction(() => document.querySelector("#rix-publication-status").textContent.includes("static result remains available"));
    assert.equal(await page.locator("#rix-app").innerText(), initial, "Startup failure must preserve the complete no-JavaScript result");
    assert.equal(await page.locator('[data-rix-semantic-id="retained-circle"]').getAttribute("r"), "3");
    const offline = await context.newPage();
    await offline.goto(`file://${path.join(artifacts, "working.html")}`);
    await offline.waitForFunction(() => document.querySelector("#rix-app").dataset.rixLiveReady === "true");
    assert.equal(await offline.locator('[data-rix-semantic-id="retained-circle"]').getAttribute("r"), "3");
    console.log(`Live publication browser acceptance passed: complete no-JS result, CSP/local assets, file:// offline startup, retained SVG node identity and selection, repeated control/drag updates without stale listeners, static fallback after startup failure. Artifacts: ${artifacts}`);
} finally { await browser?.close(); server.stop(true); }
