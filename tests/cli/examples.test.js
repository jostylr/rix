import { describe, expect, test } from "bun:test";
import { readdirSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "../..");
const cli = path.join(rixRoot, "bin/rix.js");
const evalDirectory = path.join(rixRoot, "examples/eval");

describe("shipped RiX examples", () => {
    test("every evaluator example runs through the public CLI", () => {
        const files = readdirSync(evalDirectory)
            .filter((name) => name.endsWith(".rix"))
            .sort();
        const failures = [];

        mkdirSync(path.join(rixRoot, "tmp"), { recursive: true });
        const output = mkdtempSync(path.join(rixRoot, "tmp", "cli-examples-"));
        try {
            for (const name of files) {
                const result = spawnSync(
                    "bun",
                    [cli, "--no-config", `--out=${output}`, path.join(evalDirectory, name)],
                    { cwd: rixRoot, encoding: "utf8" },
                );
                if (result.status !== 0) {
                    failures.push({
                        name,
                        status: result.status,
                        error: (result.stderr || result.stdout).trim(),
                    });
                }
            }

        } finally {
            rmSync(output, { recursive: true, force: true });
        }

        expect(files.length).toBeGreaterThanOrEqual(14);
        expect(failures).toEqual([]);
    }, 30_000);
});
