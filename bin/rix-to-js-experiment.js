#!/usr/bin/env bun
/** Compile the supported RiX subset to a trusted sibling .rix.js module. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { compileRixToJavaScript } from "../src/compile/to-javascript.js";

export function compileFile(sourcePath, { check = false } = {}) {
    const input = resolve(sourcePath);
    if (!input.endsWith(".rix")) throw new Error("Input must be a .rix file");
    const output = `${input}.js`;
    const runtime = resolve(import.meta.dir, "../src/compile/js-runtime.js");
    let runtimeImport = relative(dirname(output), runtime).split(sep).join("/");
    if (!runtimeImport.startsWith(".")) runtimeImport = `./${runtimeImport}`;
    const generated = compileRixToJavaScript(readFileSync(input, "utf8"), {
        sourceName: relative(dirname(output), input),
        runtimeImport,
    });
    if (check) {
        if (readFileSync(output, "utf8") !== generated) throw new Error(`${output} is stale; regenerate it`);
    } else {
        writeFileSync(output, generated);
    }
    return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const check = args.includes("--check");
    const inputs = args.filter((arg) => arg !== "--check");
    if (inputs.length === 0) {
        console.error("Usage: bun bin/rix-to-js-experiment.js [--check] <file.rix> [...file.rix]");
        process.exitCode = 1;
    } else {
        for (const input of inputs) console.log(compileFile(input, { check }));
    }
}
