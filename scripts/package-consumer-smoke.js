#!/usr/bin/env bun

import {
    mkdirSync,
    mkdtempSync,
    rmSync,
} from "node:fs";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "..");
const workspaceCore = process.argv.includes("--workspace-core");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--workspace-core");
if (unknownArgs.length) throw new Error("Usage: bun scripts/package-consumer-smoke.js [--workspace-core]");
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
    const manifest = await Bun.file(path.join(rixRoot, "package.json")).json();
    const coreRange = manifest.dependencies?.["@ratmath/core"];
    if (!coreRange) throw new Error("RiX package manifest must declare @ratmath/core");
    if (!workspaceCore) run([
        "npm",
        "view",
        `@ratmath/core@${coreRange}`,
        "version",
        "--fetch-timeout=10000",
        "--fetch-retries=0",
        "--cache",
        cacheDirectory,
    ], rixRoot);

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

    let coreTarball;
    if (workspaceCore) {
        const coreRoot = path.resolve(rixRoot, "../packages/core");
        const coreManifest = await Bun.file(path.join(coreRoot, "package.json")).json();
        if (coreManifest.name !== "@ratmath/core") throw new Error("Expected sibling @ratmath/core package");
        const [coreReport] = JSON.parse(run([
            "npm", "pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory,
            "--cache", cacheDirectory,
        ], coreRoot));
        coreTarball = path.join(packDirectory, coreReport.filename);
    }

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
        "--fetch-timeout=10000",
        "--fetch-retries=0",
        "--cache",
        cacheDirectory,
        tarball,
        ...(coreTarball ? [coreTarball] : []),
    ], consumerDirectory);

    const probe = `
const core = await import("@ratmath/core");
const requiredCoreExports = [
    "CertifiedApproximation",
    "Relation",
    "parseCertifiedApproximation",
    "possibleRelations",
    "NumeralSystem",
];
const missingCoreExports = requiredCoreExports.filter((name) => !(name in core));
if (missingCoreExports.length > 0) {
    throw new Error(
        "Installed @ratmath/core is incompatible with RiX; missing exports: " +
        missingCoreExports.join(", "),
    );
}

const rix = await import("@ratmath/rix");
for (const entry of [
    "@ratmath/rix/parser",
    "@ratmath/rix/eval",
    "@ratmath/rix/runtime",
    "@ratmath/rix/codemirror",
    "@ratmath/rix/language-service",
    "@ratmath/rix/language-service/config-node",
]) {
    await import(entry);
}

const result = await rix.parseAndEvaluate("1 + 2");
if (rix.formatValue(result) !== "3") {
    throw new Error("Installed RiX failed the evaluation smoke test");
}
`;
    await Bun.write(path.join(consumerDirectory, "probe.mjs"), probe);
    for (const runtime of ["node", "bun"]) {
        run([runtime, "probe.mjs"], consumerDirectory);
        run([runtime, path.join(rixRoot, "scripts/check-portable-runtime.js"), path.join(consumerDirectory, "node_modules/@ratmath/rix")], consumerDirectory);
    }

    for (const command of ["rix", "rix-to-ir"]) {
        run([path.join(consumerDirectory, "node_modules", ".bin", command), "--help"], consumerDirectory);
    }

    console.log(`Installed and exercised ${packReport.filename} with ${workspaceCore ? "a staged workspace Core tarball (not a registry release check)" : "registry dependencies"}.`);
} finally {
    if (process.env.RIX_KEEP_PACKAGE_SMOKE !== "1") {
        rmSync(smokeRoot, { recursive: true, force: true });
    } else {
        console.log(`Kept package smoke directory: ${smokeRoot}`);
    }
}
