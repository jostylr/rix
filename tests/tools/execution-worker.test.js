import { describe, expect, test } from "bun:test";
import { createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { createExecutionSession, RIX_EXECUTION_PROTOCOL } from "../../src/tools/execution/worker.js";
import { createStandardSystemContext, STANDARD_CAPABILITY_NAMES } from "../../src/tools/execution/standard-policy.js";
import { PluginCatalog } from "../../src/runtime/plugin-catalog.js";

describe("RiX editor execution worker", () => {
    test("emits ordered source-linked success events", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({ command: "run", requestId: "pass", uri: "file:///pass.rix", version: 3, source: "x:=3; x ##@ > 0;" });
        expect(events.map(({ kind }) => kind)).toEqual(["run-start", "check", "result", "run-end"]);
        expect(events.every(({ protocol, requestId }, index) => protocol === RIX_EXECUTION_PROTOCOL && requestId === "pass" && events[index].sequence === index)).toBe(true);
        expect(events[1]).toMatchObject({ payload: { status: "passed", checkKind: "predicate" } });
        expect(events.at(-1)).toMatchObject({ payload: { state: "passed", checks: { passed: 1 } } });
    });

    test("distinguishes failed inline checks from runtime diagnostics", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({ command: "run", requestId: "fail", uri: "file:///fail.rix", version: 1, source: "x:=0; x ##@ > 0;" });
        expect(events.find(({ kind }) => kind === "check")).toMatchObject({ payload: { status: "failed" } });
        expect(events.find(({ kind }) => kind === "diagnostic")).toMatchObject({ payload: { code: "RXR1000" } });
        expect(events.at(-1).payload.state).toBe("failed");
    });

    test("attributes a runtime check failure to the failing source check", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({
            command: "run",
            requestId: "second-check",
            uri: "file:///checks.rix",
            source: "1 ##@ == 1;\n2 ##@ == 3;",
        });

        const failed = events.find(({ kind }) => kind === "check");
        expect(failed.payload.id).toBe("predicate:2:2");
        expect(failed.range).toEqual({ start: 12, end: 23 });
    });

    test("session mode retains bindings while isolated mode starts clean", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({ requestId: "one", uri: "file:///session.rix", source: "value:=2;", mode: "session" });
        await session.run({ requestId: "two", uri: "file:///session.rix", source: "value+1;", mode: "session" });
        expect(events.find(({ requestId, kind }) => requestId === "two" && kind === "result")?.payload.text).toBe("3");
        await session.run({ requestId: "three", uri: "file:///session.rix", source: "value+1;", mode: "isolated" });
        expect(events.find(({ requestId, kind }) => requestId === "three" && kind === "run-end")?.payload.state).toBe("failed");
    });

    test("comments that resemble async syntax cannot change evaluation semantics", async () => {
        const sessionEvents = [];
        const session = createExecutionSession({ emit: (event) => sessionEvents.push(event) });
        await session.run({
            command: "run",
            requestId: "comment-parity",
            uri: "file:///comment-parity.rix",
            source: "/* {$ */ F := x -> x ?| 7; F()",
        });

        expect(sessionEvents.find(({ kind }) => kind === "result")?.payload.text).toBe("7");
        expect(sessionEvents.at(-1)?.payload.state).toBe("passed");
    });

    test("enforces deterministic evaluation step budgets", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({
            command: "run",
            requestId: "limited",
            uri: "file:///limited.rix",
            source: "{@::@ i=0; 1; i; i+=1 };",
            maxSteps: 50,
        });

        expect(events.find(({ kind }) => kind === "diagnostic")?.payload.message)
            .toContain("50-step limit");
        expect(events.at(-1)).toMatchObject({ kind: "run-end", payload: { state: "failed" } });
    });

    test("cooperatively cancels an active evaluation request", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        const running = session.run({
            command: "run",
            requestId: "cancel-me",
            uri: "file:///cancel.rix",
            source: "{@::@ i=0; 1; i; i+=1 };",
        });
        await Promise.resolve();
        expect(session.cancel("cancel-me")).toBe(true);
        await running;

        expect(events.at(-1)).toMatchObject({ kind: "run-end", payload: { state: "cancelled" } });
        expect(session.activeRequestId).toBeNull();
    });

    test("standard profile is explicit and denies host, I/O, and dynamic loading roots", () => {
        const standard = createStandardSystemContext(createDefaultSystemContext);
        expect(standard.getAllEntries()).toHaveLength(STANDARD_CAPABILITY_NAMES.length);
        for (const name of [
            "NET", "FILES", "BACKGROUND", "ImportJS", "JSCall", "Plugin", "Core", "Host",
            "Render", "Renderer", "Out", "TraitRegister", "TypeRegister", "TypeInstall",
            "CapabilityRegister",
        ]) {
            expect(standard.has(name)).toBe(false);
        }
        expect(standard.has("Add")).toBe(true);
        expect(standard.has("Exact")).toBe(true);
    });

    test("preloads only host-approved source-header plugins and still withholds dynamic loading", async () => {
        const events = [];
        const session = createExecutionSession({ emit: (event) => events.push(event) });
        await session.run({
            command: "run", requestId: "approved-plugin", uri: "file:///plugin.rix",
            plugins: ["linalg"],
            source: `/**
plugins: [linalg]
**/
.linalg.Determinant([1,2;3,4]) ##@ == -2;`,
        });
        expect(events.at(-1)).toMatchObject({ kind: "run-end", payload: { state: "passed" } });
        expect(events[0].payload.plugins.loaded).toEqual(["poly", "linalg"]);

        await session.run({
            command: "run", requestId: "dynamic-load", uri: "file:///dynamic.rix",
            plugins: ["linalg"], source: `.Plugin.Load("geometry");`,
        });
        expect(events.find(({ requestId, kind }) => requestId === "dynamic-load" && kind === "diagnostic")?.payload.message)
            .toMatch(/Plugin|capability/i);
        expect(events.findLast(({ requestId, kind }) => requestId === "dynamic-load" && kind === "run-end")?.payload.state)
            .toBe("failed");

        await session.run({
            command: "run", requestId: "approved-host-plugin", uri: "file:///data.rix",
            plugins: ["data"],
            source: `/**\nplugins: [data]\n**/\n.data.Rows(.data.Relation(["x"],[[1]])).Len() ##@ == 1;`,
        });
        expect(events.findLast(({ requestId, kind }) => requestId === "approved-host-plugin" && kind === "run-end")?.payload.state)
            .toBe("passed");
    });

    test("rejects unapproved headers and permission-bearing plugin manifests before evaluation", async () => {
        const events = [];
        const session = createExecutionSession({
            emit: (event) => events.push(event),
            createPluginCatalog() {
                const catalog = new PluginCatalog();
                catalog.addMetadata({
                    id: "unsafe-editor", description: "permission test", kind: "host", mount: "unsafeEditor",
                    exports: [], groups: [], permissions: ["net"], provides: [], schemas: [],
                }, { kind: "host" });
                return catalog;
            },
        });
        await session.run({
            command: "run", requestId: "header-denied", uri: "file:///denied.rix",
            source: `/**\nplugins: [linalg]\n**/\n1;`,
        });
        expect(events.find(({ requestId, kind }) => requestId === "header-denied" && kind === "diagnostic")?.payload.message)
            .toMatch(/host did not approve/i);

        await session.run({
            command: "run", requestId: "permission-denied", uri: "file:///unsafe.rix",
            plugins: ["unsafe-editor"], source: "1;",
        });
        expect(events.find(({ requestId, kind }) => requestId === "permission-denied" && kind === "diagnostic")?.payload.message)
            .toMatch(/forbidden permissions.*net/i);
    });
});

test("worker preserves Shaped storage and explicit Matrix arithmetic", async () => {
    const events = [];
    const session = createExecutionSession({ emit: (event) => events.push(event) });
    await session.run({ requestId: "shaped-migration", uri: "file:///shaped.rix", source: `
        shaped := .Shaped.Generate({: 2, 2 }, idx -> idx[1] + idx[2]);
        matrix := shaped ~!: :Matrix;
        [shaped ? :Shaped, matrix.__type, (matrix * matrix)[1, 1]];
    ` });
    expect(events.find(({ kind }) => kind === "result")?.payload.text).toBe('[1, Matrix, 13]');
    expect(events.at(-1)?.payload.state).toBe("passed");
});
