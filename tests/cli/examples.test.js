import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
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

        for (const name of files) {
            const result = spawnSync(
                "bun",
                [cli, "--no-config", path.join(evalDirectory, name)],
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

        expect(files.length).toBeGreaterThanOrEqual(14);
        expect(failures).toEqual([]);
    }, 30_000);
});
