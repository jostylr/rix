import { describe, expect, test } from "bun:test";
import { createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { createExecutionSession, RIX_EXECUTION_PROTOCOL } from "../../src/tools/execution/worker.js";
import { createStandardSystemContext, STANDARD_CAPABILITY_NAMES } from "../../src/tools/execution/standard-policy.js";

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
});
