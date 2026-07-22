import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context } from "../../src/runtime/context.js";
import { createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";
import { installRegisteredTypes, typeRegistry } from "../../src/runtime/type-system.js";

const EXAMPLE_DIR = path.dirname(fileURLToPath(import.meta.url));
const STARTUP_PATH = path.join(EXAMPLE_DIR, "floats.js.rix");

export function loadFloatPluginStartup(registry, systemContext = createDefaultSystemContext()) {
    if (typeRegistry.has("Float")) {
        if (registry) installRegisteredTypes(registry, ["Float"], {
            skipMissing: true,
            skipExisting: true,
        });
        return registry;
    }

    const context = new Context();
    context.setEnv("__registry__", registry);
    context.setEnv("__system_context__", systemContext);
    context.setEnv("jsImportBaseDir", EXAMPLE_DIR);
    parseAndEvaluate(fs.readFileSync(STARTUP_PATH, "utf8"), {
        context,
        registry,
        systemContext,
    });
    return registry;
}

/** @deprecated Use loadFloatPluginStartup. */
export const loadFloatExampleStartup = loadFloatPluginStartup;
