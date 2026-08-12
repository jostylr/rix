#!/usr/bin/env bun

import {
    mkdirSync,
    mkdtempSync,
    rmSync,
} from "node:fs";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "..");
const tmpRoot = path.join(rixRoot, "tmp");
mkdirSync(tmpRoot, { recursive: true });

const smokeRoot = mkdtempSync(path.join(tmpRoot, "package-consumer-"));
const packDirectory = path.join(smokeRoot, "pack");
const consumerDirectory = path.join(smokeRoot, "consumer");
const cacheDirectory = path.join(smokeRoot, "npm-cache");
mkdirSync(packDirectory);
mkdirSync(consumerDirectory);

function run(command, cwd) {
    const result = Bun.spawnSync({
        cmd: command,
        cwd,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (result.exitCode !== 0) {
        const stdout = result.stdout.toString().trim();
        const stderr = result.stderr.toString().trim();
        throw new Error([
            `Command failed (${result.exitCode}): ${command.join(" ")}`,
            stdout,
            stderr,
        ].filter(Boolean).join("\n"));
    }
    return result.stdout.toString();
}

try {
    const packOutput = run([
        "npm",
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packDirectory,
        "--cache",
        cacheDirectory,
    ], rixRoot);
    const [packReport] = JSON.parse(packOutput);
    const tarball = path.join(packDirectory, packReport.filename);

    await Bun.write(path.join(consumerDirectory, "package.json"), `${JSON.stringify({
        name: "rix-package-consumer-smoke",
        private: true,
        type: "module",
    }, null, 2)}\n`);

    run([
        "npm",
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        cacheDirectory,
        tarball,
    ], consumerDirectory);

    const probe = `
const core = await import("@ratmath/core");
const requiredCoreExports = [
    "CertifiedApproximation",
    "Relation",
    "parseCertifiedApproximation",
    "possibleRelations",
];
const missingCoreExports = requiredCoreExports.filter((name) => !(name in core));
if (missingCoreExports.length > 0) {
    throw new Error(
        "Installed @ratmath/core is incompatible with RiX; missing exports: " +
        missingCoreExports.join(", "),
    );
}

const rix = await import("rix");
for (const entry of [
    "rix/parser",
    "rix/eval",
    "rix/runtime",
    "rix/codemirror",
    "rix/language-service",
    "rix/language-service/config-node",
]) {
    await import(entry);
}

const result = await rix.parseAndEvaluate("1 + 2");
if (rix.formatValue(result) !== "3") {
    throw new Error("Installed RiX failed the evaluation smoke test");
}
`;
    await Bun.write(path.join(consumerDirectory, "probe.mjs"), probe);
    run(["bun", "probe.mjs"], consumerDirectory);

    for (const command of ["rix", "rix-to-ir"]) {
        run([path.join(consumerDirectory, "node_modules", ".bin", command), "--help"], consumerDirectory);
    }

    console.log(`Installed and exercised ${packReport.filename} with registry dependencies.`);
} finally {
    if (process.env.RIX_KEEP_PACKAGE_SMOKE !== "1") {
        rmSync(smokeRoot, { recursive: true, force: true });
    } else {
        console.log(`Kept package smoke directory: ${smokeRoot}`);
    }
}
