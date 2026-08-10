import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

    test("progressive levels reveal standard diagnostics after essential ones", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "alias.rix");
        writeFileSync(sourcePath, "items=[1]; shared=items;\n");
        const essential = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", "--level=essential", sourcePath,
        ], { encoding: "utf8" });
        const standard = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", "--level=standard", sourcePath,
        ], { encoding: "utf8" });
        expect(essential.stdout).not.toContain("RX1202");
        expect(standard.stdout).toContain("RX1202");
    });

    test("source edits require and honor the explicit --fix flag", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "fix.rix");
        writeFileSync(sourcePath, "x=1; {; x; };\n");
        const advisory = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), "lint", sourcePath], { encoding: "utf8" });
        expect(advisory.stdout).toContain("RX1001");
        expect(readFileSync(sourcePath, "utf8")).toBe("x=1; {; x; };\n");

        const fixed = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), "lint", "--fix", sourcePath], { encoding: "utf8" });
        expect(fixed.status).toBe(0);
        expect(fixed.stdout).toContain("applied 1 safe fix");
        expect(readFileSync(sourcePath, "utf8")).toBe("x=1; {; @x; };\n");
    });

    test("emits SARIF and supports explicit diagnostic baselines", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "sarif.rix");
        const baselinePath = path.join(directory, "lint-baseline.json");
        const coveragePath = path.join(directory, "coverage.json");
        writeFileSync(sourcePath, "x=1; {; x; };\n");
        const sarif = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", "--sarif", sourcePath,
        ], { encoding: "utf8" });
        expect(JSON.parse(sarif.stdout)).toMatchObject({ version: "2.1.0" });

        const write = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", `--write-baseline=${baselinePath}`, sourcePath,
        ], { encoding: "utf8" });
        expect(write.status).toBe(0);
        const baseline = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", `--baseline=${baselinePath}`, sourcePath,
        ], { encoding: "utf8" });
        expect(baseline.stdout).toContain("no diagnostics");

        writeFileSync(coveragePath, JSON.stringify({ files: { [sourcePath]: { executedLines: [1] } } }));
        const covered = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"), "lint", "--json", `--coverage=${coveragePath}`, sourcePath,
        ], { encoding: "utf8" });
        expect(JSON.parse(covered.stdout)[0]).toMatchObject({ coverage: "observed" });
    });
});
