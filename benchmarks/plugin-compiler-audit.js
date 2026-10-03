/** Inventory first-party RiX plugins against the current JavaScript compiler. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "../src/parser/parser.js";
import { lower } from "../src/eval/lower.js";
import { compileProgramToJavaScript } from "../src/compile/program-to-javascript.js";

const root = resolve(import.meta.dir, "../plugins");
const operations = new Map();
const plugins = [];

function countOperations(value, counts, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) countOperations(item, counts, seen);
        return;
    }
    if (typeof value.fn === "string" && Array.isArray(value.args)) {
        counts.set(value.fn, (counts.get(value.fn) || 0) + 1);
    }
    for (const item of Object.values(value)) countOperations(item, counts, seen);
}

for (const directory of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const filename = readdirSync(resolve(root, directory.name)).find((entry) => entry.endsWith(".plugin.rix"));
    if (!filename) continue;
    const source = readFileSync(resolve(root, directory.name, filename), "utf8");
    const nodes = lower(parse(source));
    const counts = new Map();
    countOperations(nodes, counts);
    for (const [name, count] of counts) operations.set(name, (operations.get(name) || 0) + count);
    const generated = compileProgramToJavaScript(source, { sourceName: filename });
    plugins.push({
        id: directory.name,
        sourceBytes: Buffer.byteLength(source),
        generatedBytes: Buffer.byteLength(generated),
        irNodes: [...counts.values()].reduce((sum, count) => sum + count, 0),
        topLevelFunctions: nodes.filter((node) => node.fn === "FUNCDEF").length,
        fastPathAvailable: generated.includes("export const fastPathAvailable = true;"),
        operations: Object.fromEntries(counts),
    });
}

const total = (key) => plugins.reduce((sum, plugin) => sum + plugin[key], 0);
console.log(JSON.stringify({
    pluginCount: plugins.length,
    sourceBytes: total("sourceBytes"),
    generatedBytes: total("generatedBytes"),
    irNodes: total("irNodes"),
    topLevelFunctions: total("topLevelFunctions"),
    fastPathPlugins: plugins.filter((plugin) => plugin.fastPathAvailable).length,
    operations: Object.fromEntries([...operations].sort((left, right) => right[1] - left[1])),
    plugins,
}, null, 2));
