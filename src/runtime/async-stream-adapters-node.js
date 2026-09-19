import { createReadStream, realpathSync } from "node:fs";
import path from "node:path";
import { createStreamHostServices } from "./async-stream-adapters.js";

/** Explicit opt-in factory. Neither Node's default adapter nor scripts call it.
 * Resolve file symlinks before checking roots. URL origins and FILES/NET grants
 * are independently required; HTTP redirects are disabled by the portable reader.
 */
export function createNodeStreamHostServices(options = {}) {
    const roots = (options.roots || []).map((root) => realpathSync(root));
    const origins = new Set((options.origins || []).map((origin) => new URL(origin).origin));
    const allowedFile = (reference) => {
        const resolved = realpathSync(reference);
        if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) throw new Error("File stream is outside the host's allowed roots");
        return resolved;
    };
    return createStreamHostServices({
        permissions: options.permissions || [], uiTargets: options.uiTargets,
        authorize({ kind, reference, context }) {
            let allowed;
            if (kind === "file") { try { allowedFile(reference); allowed = true; } catch { allowed = false; } }
            else allowed = origins.has(new URL(reference).origin);
            return allowed && (!options.authorize || options.authorize({ kind, reference, context }) === true);
        },
        fetch: options.fetch || globalThis.fetch,
        createWebSocket: options.createWebSocket,
        openFile: (reference, { signal, chunkBytes }) => createReadStream(allowedFile(reference), { signal, highWaterMark: chunkBytes }),
    });
}
