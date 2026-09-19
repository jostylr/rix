#!/usr/bin/env bun
/** Optional real-browser acceptance check. Set RIX_PLAYWRIGHT_MODULE when external. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const artifacts = path.join(root, "tmp", "graphic-accessibility-browser");
await mkdir(artifacts, { recursive: true });
const entry = path.join(artifacts, "fixture.js");
await Bun.write(entry, `
import { coordinateScene } from "../../tests/fixtures/graphic-coordinate-scenes.js";
import { renderOutputHtml } from "../../src/runtime/output.js";
import { mountOutputWidgets } from "../../src/tools/output-widgets.js";
import { graphicPointFromClient } from "../../src/tools/graphic-view.js";
import { createCanvasPlan, paintCanvasPlan } from "../../plugins/render-canvas/canvas-plan.js";
const scene = coordinateScene();
window.graphicPointFromClient = graphicPointFromClient;
for (const host of ["web", "notebook"]) {
    const container = document.getElementById(host);
    container.innerHTML = renderOutputHtml(scene, String);
    mountOutputWidgets(container, scene, { format: String, observe(callback) {
        window[host + "Refresh"] = () => callback(coordinateScene()); return () => {};
    } });
}
const canvas = document.getElementById("canvas");
const plan = createCanvasPlan(scene, String, { precision: 3, pixelRatio: 30 });
paintCanvasPlan(canvas.getContext("2d"), plan);
document.getElementById("canvas-text").textContent = plan.accessibility.text;
window.fixtureReady = true;
`);
const build = await Bun.build({ entrypoints: [entry], outdir: artifacts, naming: "bundle.js", target: "browser" });
if (!build.success) throw new AggregateError(build.logs, "Browser fixture build failed");
const css = await readFile(path.join(root, "styles/output-widgets.css"), "utf8");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Graphic accessibility acceptance fixture</title><style>${css}
body { overflow-wrap: anywhere; margin: 1rem; font: 16px system-ui; color: #182332; background: #fff; } main { max-width: 70rem; margin: auto; } .rix-output-svg { width: 100%; height: 260px; } section { margin-block: 2rem; } canvas { border: 1px solid #ccc; max-width:100%; } pre { white-space:pre-wrap; overflow-wrap:anywhere; }</style><main><h1>Coordinate disclosure and keyboard navigation</h1><p>Huge rationals, narrow and reversed intervals, coincident labels and explicit clipping.</p><section><h2>Web shared output mount</h2><div id="web"></div></section><section><h2>Notebook shared output mount</h2><div id="notebook"></div></section><section><h2>Canvas with retained exact text</h2><canvas id="canvas" width="360" height="240" aria-describedby="canvas-text"></canvas><details><summary>Canvas coordinate alternative</summary><pre id="canvas-text"></pre></details></section></main><script type="module" src="/bundle.js"></script></html>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    return new URL(request.url).pathname === "/bundle.js"
        ? new Response(Bun.file(path.join(artifacts, "bundle.js")), { headers: { "Content-Type": "text/javascript" } })
        : new Response(html, { headers: { "Content-Type": "text/html" } });
} });
let browser;
try {
    const { chromium } = await import(process.env.RIX_PLAYWRIGHT_MODULE || "playwright");
    browser = await chromium.launch({ headless: true, ...(process.env.RIX_CHROME_EXECUTABLE ? { executablePath: process.env.RIX_CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.port}`);
    await page.waitForFunction(() => window.fixtureReady);
    for (const host of ["web", "notebook"]) {
        const container = page.locator(`#${host}`);
        const svg = container.locator("svg.rix-output-svg");
        const inverted = await svg.evaluate((element) => {
            const point = element.createSVGPoint(); point.x = 2.5; point.y = 4.1;
            const client = point.matrixTransform(element.getScreenCTM());
            return window.graphicPointFromClient(element.getBoundingClientRect(), element.viewBox.baseVal, client);
        });
        assert.ok(Math.abs(inverted[0] - 2.5) < 1e-10 && Math.abs(inverted[1] - 4.1) < 1e-10, "Pointer inversion must agree with Chromium's actual SVG transform");
        await svg.focus();
        await page.keyboard.press("]");
        assert.equal(await container.locator(".rix-output-semantic-selected").getAttribute("data-rix-semantic-id"), "huge-rational");
        await page.keyboard.press("]");
        assert.equal(await container.locator(".rix-output-semantic-selected").getAttribute("data-rix-semantic-id"), "narrow-interval");
        for (let i = 0; i < 16; i += 1) await page.keyboard.press("+");
        assert.equal(await container.locator(".rix-output-graphic").getAttribute("data-rix-graphic-zoom"), "64");
        await page.keyboard.press("Home");
        const textSummary = container.locator('[data-rix-graphic-detail="text"] > summary');
        await textSummary.focus(); await page.keyboard.press("Enter");
        const summary = container.locator('[data-rix-graphic-detail="coordinates"] > summary');
        await summary.focus(); await page.keyboard.press("Enter");
        await page.evaluate((name) => window[name + "Refresh"](), host);
        assert.equal(await summary.evaluate((element) => element === document.activeElement), true);
        assert.equal(await container.locator('[data-rix-graphic-detail="coordinates"]').evaluate((element) => element.open), true);
        assert.equal(await container.locator('[data-rix-graphics-text-object="narrow-interval"]').getAttribute("aria-current"), "");
        assert.match(await container.innerText(), /5:4/);
        assert.match(await container.innerText(), /reversed/);
        assert.match(await svg.locator("desc").textContent(), /Exact geometry uses outward enclosure/);
        const mark = container.locator('svg [data-rix-semantic-id="reversed-interval"]');
        await mark.focus();
        await page.evaluate((name) => window[name + "Refresh"](), host);
        assert.equal(await mark.evaluate((element) => element === document.activeElement), true, "Stable semantic focus must survive a rerender");
    }
    assert.match(await page.locator("#canvas-text").textContent(), /not a certified outward enclosure/);
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await page.locator("h1").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, "desktop.png") });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.evaluate(() => { document.body.style.zoom = "2"; });
    await page.evaluate(() => window.scrollTo(0, document.getElementById("web").getBoundingClientRect().top + scrollY));
    await page.screenshot({ path: path.join(artifacts, "narrow-zoom.png") });
    const layout = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll("main *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 12).map((element) => [element.tagName, element.className, element.getBoundingClientRect().right]) }));
    assert.equal(layout.actual <= layout.width + 1, true, `200% zoom at narrow width must not cause page-wide overflow: ${JSON.stringify(layout)}`);
    assert.deepEqual(errors, []);
    await Bun.write(path.join(artifacts, "accessibility.txt"), await page.locator("main").ariaSnapshot());
    console.log(`Graphic browser acceptance passed: Web/Notebook shared mounts, keyboard selection, 64× view zoom, reactive focus, reduced motion, 360px layout at 200% zoom, SVG/Canvas exact alternatives. Artifacts: ${artifacts}`);
} finally {
    await browser?.close();
    server.stop(true);
}
