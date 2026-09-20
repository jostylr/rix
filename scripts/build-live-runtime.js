import { livePublicationBrowserShims } from "../src/runtime/live-publication-node.js";
/** Build once for publication; installed Node/Bun users only read these assets. */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "bin/generated/live-runtime");
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function inputHash() {
    const inputs = [];
    async function visit(directory) {
        for (const entry of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
            const name = `${directory}/${entry.name}`;
            if (name === "bin/generated") continue;
            if (entry.isDirectory()) await visit(name);
            else if (/\.(js|rix|css)$/.test(name)) inputs.push([name, digest(await readFile(path.join(root, name)))]);
        }
    }
    for (const directory of ["src", "plugins", "bin", "styles"]) await visit(directory);
    inputs.push(["scripts/build-live-runtime.js", digest(await readFile(fileURLToPath(import.meta.url)))]);
    return digest(JSON.stringify(inputs));
}
export async function buildLiveRuntimeAssets() {
    if (!globalThis.Bun?.build) throw new Error("Live publication runtime bundling requires Bun");
    // Core numeric dispatch still checks constructor names; do not rename classes.
    const build = await Bun.build({ entrypoints: [path.join(root, "bin/web-page.js")], target: "browser", format: "iife", naming: "rix-page.js",
        sourcemap: "none", plugins: [livePublicationBrowserShims()] });
    if (!build.success) throw new Error(build.logs.map(String).join("\n"));
    const js = await build.outputs[0].text();
    const css = `${await readFile(path.join(root, "styles/output-widgets.css"), "utf8")}\n${await readFile(path.join(root, "bin/web-page.css"), "utf8")}`;
    return new Map([["rix-page.js", js], ["rix-page.css", css]]);
}

const sourceHash = await inputHash();
if (process.argv.includes("--check")) {
    const manifest = JSON.parse(await readFile(path.join(destination, "manifest.json"), "utf8"));
    if (manifest.sourceHash !== sourceHash) throw new Error("Live runtime sources changed; run bun run build:package");
    for (const [name, expected] of Object.entries(manifest.files)) {
        if (digest(await readFile(path.join(destination, name))) !== expected) throw new Error(`Stale live runtime asset: ${name}`);
    }
    console.log("Verified prebuilt live publication assets.");
} else {
    const assets = await buildLiveRuntimeAssets();
    await mkdir(destination, { recursive: true });
    for (const [name, content] of assets) await writeFile(path.join(destination, name), content);
    await writeFile(path.join(destination, "manifest.json"), JSON.stringify({ sourceHash, files: Object.fromEntries([...assets].map(([name, content]) => [name, digest(content)])) }, null, 2) + "\n");
    console.log("Built portable live publication assets.");
}
