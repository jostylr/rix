import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    parseAndEvaluateAsync,
    readSourceHeader,
} from "../../src/index.js";
import { NodePluginCatalog } from "../../src/runtime/plugin-catalog-node.js";
import { install as installArrayJsExample } from "../../examples/plugins/example-array-js/array-js.plugin.rix.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/plugins");
const examplePluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../examples/plugins");

function runtime(catalog) {
    return {
        catalog,
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext({ pluginCatalog: catalog }),
    };
}

function evaluate(code, options) {
    return parseAndEvaluate(code, options);
}

describe("plugin catalog", () => {
    test("script YAML headers request plugin and operator-file preloads", () => {
        expect(readSourceHeader(`/**
plugins: [fraction-ops, plot]
operator-files:
  - local.operators.rix
**/
1 + 1`, "example.rix")).toEqual({
            plugins: ["fraction-ops", "plot"],
            operatorFiles: ["local.operators.rix"],
        });
        expect(readSourceHeader("1 + 1", "plain.rix")).toEqual({
            plugins: [],
            operatorFiles: [],
        });
    });

    test("scans only correctly named files and reads their leading YAML comments without execution", () => {
        const catalog = new NodePluginCatalog({ roots: [fixtureRoot] }).scan();

        expect(catalog.list().map(({ id }) => id)).toEqual(["echo", "host-sample"]);
        expect(catalog.info("echo")).toMatchObject({ mount: "echo", kind: "rix", groups: ["Examples"] });
        expect(catalog.info("host-sample")).toMatchObject({ mount: "hostSample", kind: "host", exports: ["Value"] });
        expect(catalog.loaded.size).toBe(0);
    });

    test("does not expose a plugin whose manifest opts out of discovery", () => {
        const catalog = new NodePluginCatalog();
        expect(catalog.addMetadata({
            ignore: true,
        }, { sourcePath: "work-in-progress.plugin.rix", kind: "rix" })).toBeNull();
        expect(catalog.list()).toEqual([]);
        expect(catalog.info("work-in-progress")).toBeNull();
    });

    test("rejects plugin aliases that collide under RiX host-name normalization", () => {
        const catalog = new NodePluginCatalog();
        expect(() => catalog.addMetadata({
            id: "bad-aliases", description: "Invalid duplicate aliases.", kind: "host", mount: "badAliases",
            aliases: ["shortName", "shortname"], exports: [], groups: [], permissions: [],
        }, { kind: "host" })).toThrow("aliases must be unique");
        catalog.addMetadata({
            id: "first-alias", description: "Claims one alias.", kind: "host", mount: "firstAlias",
            aliases: ["sharedAlias"], exports: [], groups: [], permissions: [],
        }, { kind: "host" });
        expect(() => catalog.addMetadata({
            id: "second-alias", description: "Claims the same alias.", kind: "host", mount: "secondAlias",
            aliases: ["sharedalias"], exports: [], groups: [], permissions: [],
        }, { kind: "host" })).toThrow("conflicts with plugin 'first-alias'");
    });

    test("declares a disabled mount for static checking, then loads a RiX plugin only on demand", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());

        expect(options.systemContext.has("echo")).toBe(true);
        expect(() => evaluate(".echo(7)", options)).toThrow("available but not loaded");
        expect(evaluate('.Plugin.Info("echo").Get("mount")', options).value).toBe("echo");
        expect(evaluate('.Plugin.Load("echo"); .echo(7)', options).value).toBe(7n);
        expect(evaluate('.Plugin("echo").Get("loaded")', options).value).toBe(1n);
        expect(options.systemContext.getCapabilityGroups().Examples).toContain("echo");
    });

    test("selects plugin exports into the immediate lexical scope", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());

        expect(evaluate('.Plugin.Load("echo"); .echo[:Echo]; Echo(7)', options).value).toBe(7n);
        expect(evaluate("Echo(8)", options).value).toBe(8n);

        const localOptions = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());
        expect(evaluate('.Plugin.Load("echo"); {; .echo[:Echo]; Echo(9) }', localOptions).value).toBe(9n);
        expect(() => evaluate("Echo(10)", localOptions)).toThrow("Undefined identifier: ECHO");
    });

    test("plugin export selection is explicit, collision-safe, and atomic", () => {
        const unloaded = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());
        expect(() => evaluate(".echo[:Echo]", unloaded)).toThrow("available but not loaded");

        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());
        evaluate('.Plugin.Load("echo")', options);
        expect(() => evaluate(".echo[:Missing]", options)).toThrow("does not export 'Missing'");
        expect(() => evaluate(".echo[:Echo, :Echo]", options)).toThrow("duplicate export");
        expect(() => evaluate("Echo = x -> x + 1; .echo[:Echo]", options)).toThrow("already defines 'Echo'");
        expect(evaluate("Echo(2)", options).value).toBe(3n);
    });

    test("awaits pure RiX plugin activation and its dependencies during async evaluation", async () => {
        const context = new Context();
        const registry = createDefaultRegistry();
        const systemContext = createDefaultSystemContext();
        const options = { context, registry, systemContext };

        const fraction = await parseAndEvaluateAsync(`
            .Plugin.Load("fraction");
            .fraction(6, 8);
        `, options);
        expect(String(fraction)).toBe("6/8");

        const loaded = await parseAndEvaluateAsync(`
            .Plugin.Load("stern-brocot");
            [
                .Plugin.Info("fraction").Get("loaded"),
                .Plugin.Info("stern-brocot").Get("loaded")
            ];
        `, options);
        expect(loaded.values.map((value) => value.value)).toEqual([1n, 1n]);

        const selected = await parseAndEvaluateAsync(`
            .fraction[:Fraction];
            Fraction(6, 8)
        `, options);
        expect(String(selected)).toBe("6/8");
    });

    test("host plugins are listed but require an explicitly host-approved installer", () => {
        const catalog = new NodePluginCatalog({ roots: [fixtureRoot] }).scan();
        const options = runtime(catalog);

        expect(() => evaluate('.Plugin.Load("host-sample")', options)).toThrow("installer has not been approved");

        catalog.registerInstaller("host-sample", ({ systemContext }) => {
            systemContext.registerHost("hostSample", { impl: () => 42n }, { groups: ["Examples"] });
        });
        expect(evaluate('.Plugin.Load("host-sample"); .hostSample()', options)).toBe(42n);
    });

    test("publishes loaded state only after async activation and coalesces concurrent loads", async () => {
        const catalog = new NodePluginCatalog();
        catalog.addMetadata({
            id: "async-host", description: "Exercises delayed host activation.", kind: "host",
            mount: "asyncHost", exports: [], groups: [], permissions: [],
        }, { kind: "host" });

        let signalStarted;
        const started = new Promise((resolve) => { signalStarted = resolve; });
        let finishActivation;
        const activationGate = new Promise((resolve) => { finishActivation = resolve; });
        let installs = 0;
        catalog.registerInstaller("async-host", async ({ systemContext }) => {
            installs += 1;
            signalStarted();
            await activationGate;
            systemContext.registerHost("asyncHost", { impl: () => 42n });
        });
        const options = runtime(catalog);

        const evaluation = parseAndEvaluateAsync('.Plugin.Load("async-host"); .asyncHost()', options);
        await started;
        expect(catalog.loaded.has("async-host")).toBe(false);
        const duplicate = catalog.loadAsync("async-host", options);
        expect(installs).toBe(1);

        finishActivation();
        const [value] = await Promise.all([evaluation, duplicate]);
        expect(value).toBe(42n);
        expect(catalog.loaded.has("async-host")).toBe(true);
        expect(installs).toBe(1);
    });

    test("an activation can remount a host plugin under a distinct camelCase name", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());

        expect(evaluate('.Plugin.Load("echo", {= as = "echoAlt" }); .echoAlt(8)', options).value).toBe(8n);
        expect(options.systemContext.has("echo")).toBe(false);
        expect(options.systemContext.has("echoAlt")).toBe(true);
        expect(evaluate('.Plugin.Info("echo").Get("mount")', options).value).toBe("echoAlt");
        expect(evaluate('.echoAlt[:Echo]; Echo(9)', options).value).toBe(9n);
    });

    test("loads required services once and mounts manifest aliases on the same capability", () => {
        const catalog = new NodePluginCatalog();
        let providerLoads = 0;
        catalog.addMetadata({
            id: "support-provider", description: "Provides a shared support service.", kind: "host",
            mount: "supportProvider", aliases: ["support", "sup"], exports: [], groups: ["Examples"],
            permissions: [], provides: ["example.support@1"],
        }, { kind: "host" });
        catalog.addMetadata({
            id: "support-consumer", description: "Consumes the shared support service.", kind: "host",
            mount: "supportConsumer", exports: [], groups: ["Examples"], permissions: [],
            requires: ["example.support@1"],
        }, { kind: "host" });
        catalog.registerInstaller("support-provider", ({ systemContext }) => {
            providerLoads += 1;
            systemContext.registerHost("supportProvider", { impl: ([value]) => value });
        });
        catalog.registerInstaller("support-consumer", ({ systemContext }) => {
            systemContext.registerHost("supportConsumer", { impl: () => 1n });
        });
        const options = runtime(catalog);

        expect(evaluate('.Plugin.Load("support-consumer"); [.support(4), .sup(5), .supportProvider(6)]', options)
            .values.map(String)).toEqual(["4", "5", "6"]);
        expect(providerLoads).toBe(1);
        expect(options.systemContext.get("support").impl).toBe(options.systemContext.get("supportProvider").impl);
        expect(evaluate('.Plugin.Info("support-provider").Get("aliases").Len()', options).value).toBe(2n);
        evaluate('.Plugin.Load("support-provider")', options);
        expect(providerLoads).toBe(1);
    });

    test("an imported script needs the Plugins permission before it can activate a catalog entry", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());
        options.context.setEnv("scriptBaseDir", fixtureRoot);

        expect(() => evaluate('<"load-echo">', options)).toThrow(".Plugin.Load is not permitted");
        expect(evaluate('<"load-echo" /+Plugins/>', options).value).toBe(3n);
    });

    test("matched JavaScript and RiX example packages load through their respective plugin paths", () => {
        const catalog = new NodePluginCatalog({ roots: [
            path.join(examplePluginRoot, "example-array-js"),
            path.join(examplePluginRoot, "example-array-rix"),
        ] }).scan();
        catalog.registerInstaller("example-array-js", installArrayJsExample);
        const options = runtime(catalog);

        expect(evaluate('.Plugin.Load("example-array-js"); .arrayJs.Sum([2, 3, 5])', options).value).toBe(10n);
        expect(evaluate('.arrayJs.Describe([2, 3, 5])', options)).toEqual({ type: "string", value: "count 3; sum 10" });
        expect(evaluate('.arrayJs.Reverse([2, 3, 5])', options).values.map((value) => value.value)).toEqual([5n, 3n, 2n]);

        expect(evaluate('.arrayJs[:Sum, :Reverse]; Sum([2, 3, 5])', options).value).toBe(10n);
        expect(evaluate('Reverse([2, 3, 5])', options).values.map((value) => value.value)).toEqual([5n, 3n, 2n]);

        expect(evaluate('.Plugin.Load("example-array-rix"); .arrayRixSum([2, 3, 5])', options).value).toBe(10n);
        expect(evaluate('.arrayRixDescribe([2, 3, 5])', options)).toEqual({ type: "string", value: "count 3; sum 10" });
        expect(evaluate('.arrayRixReverse([2, 3, 5])', options).values.map((value) => value.value)).toEqual([5n, 3n, 2n]);
        expect(evaluate('.arrayRix[:ArrayRixSum]; ArrayRixSum([2, 3, 5])', options).value).toBe(10n);
    });
});
