import { describe, expect, test } from "bun:test";
import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "../..");

describe("standalone package", () => {
  test("uses released dependencies and Bun for the package worker", async () => {
    const manifest = await Bun.file(path.join(rixRoot, "package.json")).json();
    expect(manifest.dependencies["@ratmath/core"]).toBe("^0.3.0");
    expect(manifest.engines).toEqual({ bun: ">=1.2.0" });

    const worker = await Bun.file(path.join(rixRoot, "bin/rix-worker.js")).text();
    const languageServer = await Bun.file(path.join(rixRoot, "bin/rix-language-server.js")).text();
    expect(worker.startsWith("#!/usr/bin/env bun\n")).toBe(true);
    expect(languageServer.startsWith("#!/usr/bin/env node\n")).toBe(true);

    const core = await import("@ratmath/core");
    for (const required of [
      "CertifiedApproximation",
      "Relation",
      "parseCertifiedApproximation",
      "possibleRelations",
    ]) {
      expect(required in core, `@ratmath/core must export ${required}`).toBe(true);
    }

    const api = await import("rix");
    expect(typeof api.parse).toBe("function");
    expect(typeof api.parseAndEvaluate).toBe("function");
  });

  test("packs the complete runtime closure without development trees", () => {
    const result = Bun.spawnSync({
      cmd: ["npm", "pack", "--dry-run", "--json", "--ignore-scripts"],
      cwd: rixRoot,
      env: {
        ...process.env,
        npm_config_cache: path.join(rixRoot, "tmp", "npm-cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = result.stderr.toString();
    expect(result.exitCode, stderr).toBe(0);

    const [report] = JSON.parse(result.stdout.toString());
    const packed = new Set(report.files.map(({ path: file }) => file));
    for (const required of [
      "README.md",
      "package.json",
      "bin/rix.js",
      "bin/rix-language-server.js",
      "bin/rix-worker.js",
      "examples/plugins/example-array-js/array-js.plugin.rix.js",
      "plugins/bundled.js",
      "schemas/rix.schema.json",
      "src/index.js",
    ]) {
      expect(packed.has(required), required).toBe(true);
    }

    for (const developmentPrefix of ["documentation/", "docs/", "editors/", "tests/"]) {
      expect(
        [...packed].some((file) => file.startsWith(developmentPrefix)),
        developmentPrefix,
      ).toBe(false);
    }
    expect([...packed].some((file) => file.startsWith("examples/quadratic/out/")))
      .toBe(false);
    expect([...packed].some((file) => file.startsWith("examples/parser/")))
      .toBe(false);
  });
});
