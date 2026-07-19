import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { NodePluginCatalog } from "../../src/runtime/plugin-catalog-node.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/plugins");

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
    test("scans only correctly named files and reads their leading YAML comments without execution", () => {
        const catalog = new NodePluginCatalog({ roots: [fixtureRoot] }).scan();

        expect(catalog.list().map(({ id }) => id)).toEqual(["echo", "host-sample"]);
        expect(catalog.info("echo")).toMatchObject({ mount: "echo", kind: "rix", groups: ["Examples"] });
        expect(catalog.info("host-sample")).toMatchObject({ mount: "hostSample", kind: "host", exports: ["Value"] });
        expect(catalog.loaded.size).toBe(0);
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

    test("host plugins are listed but require an explicitly host-approved installer", () => {
        const catalog = new NodePluginCatalog({ roots: [fixtureRoot] }).scan();
        const options = runtime(catalog);

        expect(() => evaluate('.Plugin.Load("host-sample")', options)).toThrow("installer has not been approved");

        catalog.registerInstaller("host-sample", ({ systemContext }) => {
            systemContext.registerHost("hostSample", { impl: () => 42n }, { groups: ["Examples"] });
        });
        expect(evaluate('.Plugin.Load("host-sample"); .hostSample()', options)).toBe(42n);
    });

    test("an activation can remount a host plugin under a distinct camelCase name", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());

        expect(evaluate('.Plugin.Load("echo", {= as = "echoAlt" }); .echoAlt(8)', options).value).toBe(8n);
        expect(options.systemContext.has("echo")).toBe(false);
        expect(options.systemContext.has("echoAlt")).toBe(true);
        expect(evaluate('.Plugin.Info("echo").Get("mount")', options).value).toBe("echoAlt");
    });

    test("an imported script needs the Plugins permission before it can activate a catalog entry", () => {
        const options = runtime(new NodePluginCatalog({ roots: [fixtureRoot] }).scan());
        options.context.setEnv("scriptBaseDir", fixtureRoot);

        expect(() => evaluate('<"load-echo">', options)).toThrow(".Plugin.Load is not permitted");
        expect(evaluate('<"load-echo" /+Plugins/>', options).value).toBe(3n);
    });
});
