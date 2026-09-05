#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { collectTests, rixRoot } from "./run-test-profile.js";

const requestedPlugin = process.argv[2];
const extraArgs = process.argv.slice(3);
const pluginsRoot = path.join(rixRoot, "plugins");
const pluginDescriptors = readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
        const directory = entry.name;
        const metadataFile = readdirSync(path.join(pluginsRoot, directory))
            .find((filename) => filename.includes(".plugin.rix"));
        const source = metadataFile
            ? readFileSync(path.join(pluginsRoot, directory, metadataFile), "utf8")
            : "";
        const id = source.match(/^id:\s*([^\s]+)/m)?.[1] || directory;
        const mount = source.match(/^mount:\s*([^\s]+)/m)?.[1] || id;
        return { directory, id, mount, aliases: new Set([directory, id, mount]) };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
const plugin = pluginDescriptors.find(({ aliases }) => aliases.has(requestedPlugin));

if (!requestedPlugin || !plugin) {
    console.error(requestedPlugin
        ? `Unknown plugin '${requestedPlugin}'.`
        : "Usage: bun run test:plugin <plugin-name> [bun test flags]");
    const pluginIds = pluginDescriptors.map(({ id }) => id);
    const suggestions = requestedPlugin
        ? pluginIds.filter((name) => name.includes(requestedPlugin) || requestedPlugin.includes(name))
        : pluginIds;
    console.error(`Available plugins: ${(suggestions.length ? suggestions : pluginIds).join(", ")}`);
    process.exit(2);
}

const candidateTests = collectTests(path.join(rixRoot, "tests"));
const pluginPath = `plugins/${plugin.directory}/`;
const loadForms = [`.Plugin.Load("${plugin.id}")`, `.Plugin.Load('${plugin.id}')`];
const selected = candidateTests.filter((filename) => {
    if (filename === "tests/tools/plugin-tutorials.test.js") return false;
    const basename = path.basename(filename).toLowerCase();
    if ([...plugin.aliases].some((alias) => basename.includes(alias.toLowerCase()))) return true;
    const source = readFileSync(path.join(rixRoot, filename), "utf8");
    return source.includes(pluginPath) || loadForms.some((form) => source.includes(form));
});

selected.push("tests/tools/plugin-tutorials.test.js");
selected.sort();

console.log(`Testing plugin '${plugin.id}' (${plugin.directory}) with ${selected.length} focused test file(s):`);
for (const filename of selected) console.log(`  ${filename}`);

const child = Bun.spawn([
    process.execPath,
    "test",
    "--timeout",
    "120000",
    ...extraArgs,
    ...selected,
], {
    cwd: rixRoot,
    env: { ...process.env, RIX_PLUGIN_TEST: plugin.directory },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
});

process.exit(await child.exited);
