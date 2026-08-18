#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "..");
const profile = process.argv[2];

const documentationTests = new Set([
    "tests/tools/documentation-examples.test.js",
    "tests/tools/documentation-methods.test.js",
    "tests/tools/documentation-navigation.test.js",
    "tests/tools/plugin-tutorials.test.js",
]);

function collectTests(directory, result = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) collectTests(filename, result);
        else if (entry.isFile() && /[._](?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
            result.push(path.relative(rixRoot, filename));
        }
    }
    return result;
}

const allTests = ["tests", "editors", "examples"]
    .flatMap((directory) => collectTests(path.join(rixRoot, directory)))
    .sort();

for (const filename of documentationTests) {
    if (!allTests.includes(filename)) throw new Error(`Missing documentation test: ${filename}`);
}

const selectedTests = profile === "ci"
    ? allTests.filter((filename) => !documentationTests.has(filename))
    : profile === "docs"
        ? allTests.filter((filename) => documentationTests.has(filename))
        : null;

if (!selectedTests) {
    console.error("Usage: bun scripts/run-test-profile.js <ci|docs>");
    process.exit(2);
}

console.log(`Running ${selectedTests.length} ${profile} test file(s).`);
const child = Bun.spawn([
    process.execPath,
    "test",
    "--timeout",
    "60000",
    ...selectedTests,
], {
    cwd: rixRoot,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
});

process.exit(await child.exited);
