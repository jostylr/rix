/** Node-only filesystem discovery for PluginCatalog. Do not import this from browser bundles. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PluginCatalog, readPluginHeader } from "./plugin-catalog.js";

const RIX_PLUGIN_SUFFIX = ".plugin.rix";
const JS_PLUGIN_SUFFIX = ".plugin.rix.js";

function pluginKind(filename) {
    if (filename.endsWith(JS_PLUGIN_SUFFIX)) return "host";
    if (filename.endsWith(RIX_PLUGIN_SUFFIX)) return "rix";
    return null;
}

/** A PluginCatalog with synchronous Node filesystem discovery. */
export class NodePluginCatalog extends PluginCatalog {
    constructor({ roots = [], installers = {} } = {}) {
        super({ installers });
        this.roots = [...roots];
    }

    addRoot(root) {
        this.roots.push(root);
        return this;
    }

    scan() {
        for (const root of this.roots) this.scanRoot(root);
        return this;
    }

    scanRoot(root) {
        if (!existsSync(root)) return this;
        const visit = (directory) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                if (entry.name === ".git" || entry.name === "node_modules") continue;
                const fullPath = path.join(directory, entry.name);
                if (entry.isDirectory()) visit(fullPath);
                else if (entry.isFile() && pluginKind(entry.name)) this.addFile(fullPath);
            }
        };
        if (statSync(root).isDirectory()) visit(root);
        else if (statSync(root).isFile() && pluginKind(root)) this.addFile(root);
        return this;
    }

    addFile(sourcePath) {
        const kind = pluginKind(sourcePath);
        if (!kind) throw new Error(`${sourcePath}: not a RiX plugin filename`);
        const source = readFileSync(sourcePath, "utf8");
        return this.addMetadata(readPluginHeader(source, sourcePath), { sourcePath, source, kind });
    }
}
