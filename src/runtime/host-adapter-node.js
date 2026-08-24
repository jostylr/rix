import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRix = createRequire("/rix-runtime/host-adapter-node.js");

/** Node/Bun filesystem and CommonJS module services for the RiX evaluator. */
export function createNodeHostAdapter(options = {}) {
    const cwd = options.cwd || (() => process.cwd());
    return Object.freeze({
        kind: "node",
        cwd,
        resolveScriptPath(requested, { baseDir } = {}) {
            const target = String(requested).endsWith(".rix") ? String(requested) : `${requested}.rix`;
            return path.resolve(baseDir || cwd(), target);
        },
        resolveModulePath(requested, { baseDir } = {}) {
            const target = String(requested);
            return path.isAbsolute(target) ? target : path.resolve(baseDir || cwd(), target);
        },
        dirname(resolvedPath) {
            return path.dirname(resolvedPath);
        },
        readTextSync(resolvedPath) {
            return readFileSync(resolvedPath, "utf8");
        },
        importModuleSync(resolvedPath) {
            return requireFromRix(resolvedPath);
        },
    });
}
