/** Node/Bun packaging for offline generated pages. No browser host grants are added. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderOutputHtml } from "./output.js";
import { prepareLivePublication, createLivePublicationConfig, relocateLivePublicationAssets } from "./live-publication.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const LIVE_PUBLICATION_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
export function livePublicationBrowserShims() {
    return { name: "rix-live-browser-node-shims", setup(build) {
        build.onResolve({ filter: /^node:(fs|path|module)$/ }, ({ path: name }) => ({ path: name, namespace: "rix-live-node-shim" }));
        build.onLoad({ filter: /.*/, namespace: "rix-live-node-shim" }, ({ path: name }) => ({ loader: "js", contents: name === "node:path"
            ? 'const path = { isAbsolute: () => false, resolve: (...parts) => parts.at(-1) || "", dirname: () => "" }; export default path;'
            : name === "node:module" ? 'export const createRequire = () => { throw new Error("Node modules unavailable in a browser publication"); };'
                : 'const unavailable = () => { throw new Error("Filesystem unavailable in a browser publication"); }; export const existsSync = unavailable, readdirSync = unavailable, readFileSync = unavailable, statSync = unavailable; export default new Proxy({}, { get: unavailable });' }));
    } };
}
export async function buildLiveRuntimeAssets() {
    const directory = path.join(root, "bin/generated/live-runtime");
    try {
        return new Map(await Promise.all(["rix-page.js", "rix-page.css"].map(async (name) =>
            [name, await readFile(path.join(directory, name), "utf8")])));
    } catch (error) {
        throw new Error("Missing prebuilt live publication assets; source checkouts must run bun run build:package", { cause: error });
    }
}
export async function buildLivePublication({ value, source, sourcePath, plugins = [], title = "RiX publication", format = String, assetPrefix = "assets", runtimeAssets = null, limits = {}, assetPaths = {} }) {
    if (typeof assetPrefix !== "string" || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(assetPrefix)) throw new Error("Live publication asset prefix must be a safe relative directory");
    const { snapshot, descriptor, diagnostics } = prepareLivePublication(value, limits);
    const config = { ...createLivePublicationConfig({ source, sourcePath, plugins, descriptor }), assetPaths };
    const runtimeFiles = runtimeAssets || await buildLiveRuntimeAssets();
    if ([...runtimeFiles.keys()].some((name) => !["rix-page.js", "rix-page.css"].includes(name))) throw new Error("Unexpected live publication runtime asset name");
    const assets = new Map([...runtimeFiles].map(([name, data]) => [`${assetPrefix}/${name}`, data]));
    assets.set(`${assetPrefix}/rix-page-config.js`, `globalThis.__RIX_PAGE__=${JSON.stringify(config).replaceAll("<", "\\u003c")};\n`);
    const body = renderOutputHtml(relocateLivePublicationAssets(snapshot, assetPaths), format);
    const notices = diagnostics.map((entry) => `<p>${escape(entry.message)}</p>`).join("");
    const content = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(LIVE_PUBLICATION_CSP)}"><title>${escape(title)}</title><link rel="stylesheet" href="${assetPrefix}/rix-page.css"></head><body><main id="rix-app" data-rix-static-snapshot="true">${body}</main><aside id="rix-publication-status" role="status">${notices}</aside><script src="${assetPrefix}/rix-page-config.js" defer></script><script src="${assetPrefix}/rix-page.js" defer></script></body></html>\n`;
    return { content, assets, diagnostics, descriptor };
}
