import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintRix, readPluginHeader } from "../../src/index.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins");

function rixPluginFiles(directory, result = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) rixPluginFiles(filename, result);
        else if (entry.isFile() && entry.name.endsWith(".plugin.rix")) result.push(filename);
    }
    return result.sort();
}

describe("bundled RiX plugin lint", () => {
    test("keeps the default standard profile actionable and clean", () => {
        const diagnostics = rixPluginFiles(pluginRoot).flatMap((file) => {
            const source = readFileSync(file, "utf8");
            return lintRix(source, {
                file,
                level: "standard",
                profile: "plugin",
                pluginMetadata: readPluginHeader(source, file),
            });
        });

        expect(diagnostics).toEqual([]);
    });
});
