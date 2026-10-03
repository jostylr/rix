#!/usr/bin/env node
/** Build trusted .rix.js siblings from RiX source files. */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProgramToJavaScript } from "../src/compile/program-to-javascript.js";

export function compileFile(sourcePath, { check = false } = {}) {
    const input = resolve(sourcePath);
    if (!input.endsWith(".rix")) throw new Error("Input must be a .rix file");
    const output = `${input}.js`;
    const generated = compileProgramToJavaScript(readFileSync(input, "utf8"), {
        sourceName: basename(input),
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
    if (!inputs.length) {
        console.error("Usage: rix-to-js [--check] <file.rix> [...file.rix]");
        process.exitCode = 1;
    } else {
        for (const input of inputs) console.log(compileFile(input, { check }));
    }
}
