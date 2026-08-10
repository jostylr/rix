import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoot = path.join(rixRoot, "tmp");
const temporaryDirectories = [];

function temporaryDirectory() {
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "lint-"));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    while (temporaryDirectories.length) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("rix lint CLI", () => {
    test("prints actionable diagnostics without failing by default", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "capture.rix");
        writeFileSync(sourcePath, "x=1; {; x; };\n");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), "lint", sourcePath], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("RX1001");
        expect(result.stdout).toContain("hint: Use '@x'");
    });

    test("strict mode fails on warnings and JSON remains machine readable", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "truth.rix");
        writeFileSync(sourcePath, "F=(x, flag ?= 0)->flag ?: x ?_ -x;\n");
        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", "--strict", "--json", sourcePath,
        ], { encoding: "utf8" });
        expect(result.status).toBe(1);
        expect(result.stderr).toBe("");
        const diagnostics = JSON.parse(result.stdout);
        expect(diagnostics[0]).toMatchObject({ code: "RX1101", severity: "warning" });
    });

    test("accepts stdin and reports a clean source", () => {
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), "lint", "-"], {
            encoding: "utf8",
            input: "x=1; x+1;\n",
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("no diagnostics");
    });

    test("explain-scope reports ownership on a selected source line", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "scope.rix");
        writeFileSync(sourcePath, "value=1;\n{; local=2; value+local; @local; };\n");
        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "explain-scope", `${sourcePath}:2`,
        ], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("value: capture-required; owner=root; use @value");
        expect(result.stdout).toContain("local: spurious-outer; owner=block; use local");
    });
});
