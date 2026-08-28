import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "../..");
const cli = path.join(rixRoot, "bin/rix.js");
const problemDirectory = path.join(rixRoot, "examples/problems");

describe("mathematical and computer-science problem probes", () => {
    test("every problem executes and passes its inline invariants", () => {
        const files = readdirSync(problemDirectory)
            .filter((name) => name.endsWith(".rix"))
            .sort();
        const failures = [];

        for (const name of files) {
            const filename = path.join(problemDirectory, name);
            const execution = spawnSync(
                "bun",
                [cli, "--no-config", filename],
                { cwd: rixRoot, encoding: "utf8" },
            );
            if (execution.status !== 0) {
                failures.push({
                    name,
                    execution: (execution.stderr || execution.stdout).trim(),
                });
            }
        }

        expect(files.length).toBe(8);
        expect(failures).toEqual([]);
    }, 30_000);
});
