#!/usr/bin/env bun
import { createDefaultSystemContext } from "../src/eval/evaluator.js";
import {
    STANDARD_CAPABILITY_NAMES,
    STANDARD_DENIED_NAMES,
    STANDARD_PLUGIN_SNAPSHOT,
} from "../src/tools/execution/standard-policy.js";

const context = createDefaultSystemContext();
const denied = new Set(STANDARD_DENIED_NAMES.map((name) => name.toUpperCase()));
const generatedCapabilities = context.getAllEntries()
    .filter((entry) => entry.namespace === "core" && !denied.has(entry.displayName.toUpperCase()))
    .map((entry) => entry.displayName)
    .sort((left, right) => left.localeCompare(right));
const generatedPlugins = [];

const differs = JSON.stringify(generatedCapabilities) !== JSON.stringify([...STANDARD_CAPABILITY_NAMES].sort((left, right) => left.localeCompare(right)))
    || JSON.stringify(generatedPlugins) !== JSON.stringify([...STANDARD_PLUGIN_SNAPSHOT]);

if (process.argv.includes("--check")) {
    if (differs) {
        console.error("The editor standard capability/plugin snapshot is stale. Review and update standard-policy.js.");
        process.exitCode = 1;
    } else {
        console.log(`Editor standard policy matches ${generatedCapabilities.length} capabilities and ${generatedPlugins.length} plugins.`);
    }
} else {
    console.log(JSON.stringify({ capabilities: generatedCapabilities, plugins: generatedPlugins }, null, 2));
}

