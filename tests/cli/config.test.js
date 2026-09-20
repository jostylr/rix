import { afterEach, describe, expect, test } from "bun:test";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PluginCatalog } from "../../src/runtime/plugin-catalog.js";
import {
    availablePluginGroups,
    ensureRixCliPreamble,
    readRixCliConfig,
    resolvePluginSelectors,
    resolveRixConfigDir,
    writeRixCliConfig,
} from "../../src/cli/config.js";

const rixRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoot = path.join(rixRoot, "tmp");
const temporaryDirectories = [];

function temporaryDirectory() {
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "cli-config-"));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    while (temporaryDirectories.length) {
        rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
    }
});

function catalog() {
    const result = new PluginCatalog();
    for (const metadata of [
        { id: "draw", groups: ["Draw"] },
        { id: "plot", groups: ["Plot"] },
        { id: "float", groups: ["ApproximateMath"] },
        { id: "svg", groups: ["Renderers"] },
        { id: "html", groups: ["Renderers"] },
    ]) {
        result.addMetadata({
            description: `${metadata.id} test plugin`,
            kind: "host",
            mount: metadata.id,
            exports: [],
            permissions: [],
            defaultEnabled: false,
            ...metadata,
        }, { kind: "host" });
    }
    return result;
}

describe("RiX CLI configuration", () => {
    test("uses an override, XDG location, or the portable user default", () => {
        expect(resolveRixConfigDir({ env: { RIX_CONFIG_DIR: "./chosen" }, home: "/users/test" }))
            .toBe(path.resolve("chosen"));
        expect(resolveRixConfigDir({ env: { XDG_CONFIG_HOME: "/xdg" }, home: "/users/test" }))
            .toBe(path.join("/xdg", "rix"));
        expect(resolveRixConfigDir({ env: {}, home: "/users/test" }))
            .toBe(path.join("/users/test", ".config", "rix"));
    });

    test("round-trips plugin selectors and creates an editable preamble", () => {
        const directory = temporaryDirectory();
        const configPath = writeRixCliConfig(directory, {
            plugins: ["full", "renderers"],
            numbers: { input: "b", display: ".[12],b,.." },
        });
        expect(readRixCliConfig(directory)).toEqual({
            version: 1,
            plugins: ["full", "renderers"],
            numbers: { input: "b", display: ".[12],b,.." },
        });
        expect(JSON.parse(readFileSync(configPath, "utf8")).version).toBe(1);

        const preamblePath = ensureRixCliPreamble(directory);
        expect(existsSync(preamblePath)).toBe(true);
        expect(readFileSync(preamblePath, "utf8")).toContain("operator-files: []");
    });

    test("resolves plugin IDs, dynamic groups, and the standard full set", () => {
        const plugins = catalog();
        expect(availablePluginGroups(plugins).get("renderers")).toEqual(["html", "svg"]);
        expect(resolvePluginSelectors(plugins, ["float", "renderers"]))
            .toEqual(["float", "html", "svg"]);
        expect(resolvePluginSelectors(plugins, ["full"], { standardIds: new Set(["draw", "float"]) }))
            .toEqual(["draw", "float"]);
        expect(() => resolvePluginSelectors(plugins, ["oracle"]))
            .toThrow("Unknown plugin or group 'oracle'");
    });

    test("rix setup persists group selectors and creates cli-preamble.rix", () => {
        const directory = temporaryDirectory();
        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"),
            "setup",
            "--plugins=renderers",
            `--config-dir=${directory}`,
        ], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(readRixCliConfig(directory).plugins).toEqual(["renderers"]);
        expect(existsSync(path.join(directory, "cli-preamble.rix"))).toBe(true);
        expect(result.stdout).toContain("Currently resolved: canvas, csv, gif, gltf, html, latex, markdown, pdf, png, quarto, svg, terminal-ascii, tikz");
    });

    test("the automatic preamble supplies functions and operators to later REPL submissions", () => {
        const directory = temporaryDirectory();
        writeRixCliConfig(directory, { plugins: [] });
        writeFileSync(path.join(directory, "personal.operators.rix"), `##OPS##
:<o+>: Mediant :infix :additive :none
##OPS##
`);
        writeFileSync(path.join(directory, "cli-preamble.rix"), `/**
operator-files: [personal.operators.rix]
**/
Mediant(a, b) -> a + b;
`);

        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"),
            `--config-dir=${directory}`,
        ], {
            encoding: "utf8",
            input: "20 :<o+>: 22\n.exit\n",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("42");
    });

    test("fresh REPL defaults to full; explicit sets replace defaults and saved selections", () => {
        const directory = temporaryDirectory();
        const inspect = '.Plugin.Info("float")\n.Plugin.Info("plot")\n.exit\n';
        function loaded(flags) {
            const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--config-dir=${directory}`, ...flags], {
                encoding: "utf8", input: inspect,
            });
            expect(result.status).toBe(0);
            expect(result.stderr).toBe("");
            return [...result.stdout.matchAll(/loaded=([^}]+) }/g)].map((match) => match[1].trim() !== "_");
        }
        expect(readRixCliConfig(directory).plugins).toEqual(["full"]);
        expect(loaded([])).toEqual([true, true]);
        expect(loaded(["--plugins=none"])).toEqual([false, false]);
        expect(loaded(["--plugins=float"])).toEqual([true, false]);
        expect(loaded(["--plugins=none", "--plugin=float"])).toEqual([true, false]);
        expect(loaded(["--plugin=float", "--plugins=none"])).toEqual([true, false]);
        writeRixCliConfig(directory, { plugins: ["plot"] });
        expect(loaded(["--plugin=float"])).toEqual([true, true]);
        expect(loaded(["--plugins=float"])).toEqual([true, false]);
        expect(loaded(["--plugins=none"])).toEqual([false, false]);
        writeRixCliConfig(directory, { plugins: [] });
        expect(loaded([])).toEqual([false, false]);
        expect(loaded(["--no-config"])).toEqual([true, true]);
        writeFileSync(path.join(directory, "cli-preamble.rix"), '/**\nplugins: [float]\n**/\n.Plugin.Load("plot");');
        expect(loaded(["--plugins=none"])).toEqual([true, true]);
        expect(loaded(["--no-config", "--plugins=none"])).toEqual([false, false]);
    }, 30000);

    test("none leaves explicit source loads available and scripts ignore REPL defaults", () => {
        const directory = temporaryDirectory();
        writeRixCliConfig(directory, { plugins: ["full"] });
        const source = path.join(directory, "inspect.rix");
        const run = (text, flags = []) => {
            writeFileSync(source, text);
            const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--config-dir=${directory}`, ...flags, source], { encoding: "utf8" });
            expect(result.status).toBe(0);
            expect(result.stderr).toBe("");
            return result.stdout;
        };
        expect(run('.Plugin.Info("float")')).toContain("loaded=_");
        expect(run('/**\nplugins: [float]\n**/\n.Plugin.Info("float")', ["--plugins=none"])).toContain("loaded=[object Object]");
        expect(run('.Plugin.Load("float"); .Plugin.Info("float")', ["--plugins=none"])).toContain("loaded=[object Object]");
    });

    test("the CLI file runner awaits async scopes", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "async.rix");
        writeFileSync(sourcePath, "{$:2$ [1 + 1, 2 + 2] };\n");
        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"),
            "--no-config",
            sourcePath,
        ], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("[2, 4]");
    });

    test("the CLI file runner selects async evaluation for drain pipes and Retry", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "async-pipes.rix");
        writeFileSync(sourcePath, `
.Stream([1,2,3]) |>_ ((value) -> value^2);
.Retry({= attempts=2, delay=1/100 }, @{ {: :error, :timeout, 7 } })
    |>! ((kind, value) -> value);
`);
        const result = spawnSync("bun", [
            path.join(rixRoot, "bin/rix.js"),
            "--no-config",
            sourcePath,
        ], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("7");
    });
});
