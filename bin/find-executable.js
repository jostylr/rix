import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/** Locate optional renderer tools without invoking a shell or depending on Bun. */
export function findExecutable(command, env = process.env) {
    const windows = process.platform === "win32";
    const extensions = windows && !path.extname(command)
        ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
    for (const directory of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const candidate = path.resolve(directory, command + extension);
            try {
                if (!statSync(candidate).isFile()) continue;
                accessSync(candidate, windows ? constants.F_OK : constants.X_OK);
                return candidate;
            } catch { /* Try the next PATH entry. */ }
        }
    }
    return null;
}
