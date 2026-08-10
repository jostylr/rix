import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoot = path.join(rixRoot, "tmp");
const temporaryDirectories = [];

function fixture(source) {
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "editor-cli-"));
    temporaryDirectories.push(directory);
    const filename = path.join(directory, "sample.rix");
    writeFileSync(filename, source);
    return filename;
}

function cli(...args) {
    return spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), ...args], { encoding: "utf8" });
}

afterEach(() => {
    while (temporaryDirectories.length) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("agent-facing RiX editor CLI", () => {
    test("parse and symbols expose versioned JSON contracts", () => {
        const filename = fixture("value:=2; result:=value+1;\n");
        const parsed = cli("parse", "--json", filename);
        expect(parsed.status).toBe(0);
        expect(JSON.parse(parsed.stdout)).toMatchObject({ protocol: "rix.parse/1", diagnostics: [], ast: expect.any(Array) });
        const symbols = cli("symbols", "--json", filename);
        expect(JSON.parse(symbols.stdout)).toMatchObject({
            protocol: "rix.symbols/1",
            symbols: expect.arrayContaining([expect.objectContaining({ name: "value", kind: "variable" })]),
        });
    });

    test("format --check is non-mutating and reports drift", () => {
        const filename = fixture("value:=2;\n");
        const check = cli("format", "--check", "--json", filename);
        expect(check.status).toBe(1);
        expect(JSON.parse(check.stdout)).toMatchObject({ protocol: "rix.format/1", check: true });
        expect(readFileSync(filename, "utf8")).toBe("value:=2;\n");
        const write = cli("format", filename);
        expect(write.status).toBe(0);
        expect(readFileSync(filename, "utf8")).toBe("value := 2;\n");
        expect(cli("format", "--check", filename).status).toBe(0);
    });

    test("verify combines static diagnostics and structured execution events", () => {
        const filename = fixture("value:=2; value ##@ == 2;\n");
        const verified = cli("verify", "--json", filename);
        expect(verified.status).toBe(0);
        const report = JSON.parse(verified.stdout);
        expect(report).toMatchObject({ protocol: "rix.verify/1", summary: { state: "passed", checks: { passed: 1 } } });
        expect(report.events.map(({ kind }) => kind)).toEqual(["run-start", "check", "result", "run-end"]);
    });
});

