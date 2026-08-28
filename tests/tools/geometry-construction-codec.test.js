import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    createGeometryAuthoringProgram,
    decodeGeometryConstructionRecord,
    encodeGeometryConstructionSource,
    parseAndEvaluate,
    serializeGeometryConstructionRecord,
    validateGeometryConstructionRecord,
} from "../../src/index.js";

function session() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function field(value, key) {
    return value?.entries?.get(key) ?? value?.entries?.get(key.toLowerCase()) ?? value?.[key] ?? null;
}

describe("geometry construction source codec", () => {
    test("round-trips every retained public construction recipe exactly", () => {
        const state = session();
        const record = parseAndEvaluate(`
            .Plugin.Load("geometry");
            graph=.geometry.ConstructionGraph([]);
            graph=.geometry.AddPoint(graph,.geometry.Point(0,0),{= id=:a,snap=1/4 });
            graph=.geometry.AddPoint(graph,.geometry.Point(2,0),{= id=:b });
            graph=.geometry.AddPoint(graph,.geometry.Point(1,3),{= id=:p });
            graph=.geometry.AddLine(graph,:a,:b,{= id=:axis });
            graph=.geometry.AddCircle(graph,:a,:b,{= id=:circle });
            graph=.geometry.AddIntersection(graph,:axis,:circle,{= id=:crossing });
            graph=.geometry.AddMeasurement(graph,:a,:b,{= id=:distance });
            graph=.geometry.AddTransform(graph,:p,.geometry.Translate(1/3,2/5),{= id=:shifted });
            graph=.geometry.ConstrainedDrag(graph,:p,.geometry.Point(7/5,9/4),{= constraint=:axis,mode=:project });
            graphrecord=.geometry.ConstructionRecord(graph);
            graphrecord
        `, state);

        expect(validateGeometryConstructionRecord(record).valid).toBe(true);
        const encoded = encodeGeometryConstructionSource(record);
        expect(encoded.supported).toBe(true);
        expect(encoded.source).toContain(".geometry.Affine(");
        expect(encoded.source).toContain("snap=1/4");
        expect(encoded.source).toContain(".geometry.ConstrainedDrag(");

        const replay = session();
        const replayed = parseAndEvaluate(`.Plugin.Load("geometry");\n${encoded.source}\n.geometry.ConstructionRecord(graph)`, replay);
        const replayedPoint = field(field(replayed, "nodes").values[2], "value");
        expect(field(replayedPoint, "x").toString()).toBe("7/5");
        expect(field(replayedPoint, "y").toString()).toBe("0");
        expect(field(field(replayed, "nodes").values[7], "recipe")).not.toBeNull();
        expect(field(replayed, "replayRequires").values).toEqual([]);
        const replayedHistory = field(replayed, "history").values;
        expect(field(replayedHistory.at(-1), "operation").value).toBe("constrained_drag");
        expect(field(replayedHistory.at(-1), "constraint").value).toBe("axis");

        const imported = parseAndEvaluate(".geometry.ImportConstruction(graphrecord)", state);
        expect(imported).toBeDefined();
    });

    test("portable JSON validates and produces deterministic source", () => {
        const state = session();
        const record = parseAndEvaluate(`
            .Plugin.Load("geometry");
            graph=.geometry.AddPoint(.geometry.ConstructionGraph([]),.geometry.Point(1/3,2/7),{= id=:p });
            .geometry.ConstructionRecord(graph)
        `, state);
        const json = serializeGeometryConstructionRecord(record);
        const decoded = decodeGeometryConstructionRecord(json);
        expect(decoded.valid).toBe(true);
        const first = encodeGeometryConstructionSource(decoded.record);
        const second = encodeGeometryConstructionSource(decoded.record);
        expect(first).toEqual(second);
        expect(first.source).toContain("Point(1/3,2/7)");
    });

    test("round-trips exact algebraic-real point coordinates", () => {
        const state = session();
        const record = parseAndEvaluate(`
            .Plugin.Load("geometry");
            root=.ar.Root([-2,0,1],1:2,2);
            graph=.geometry.AddPoint(.geometry.ConstructionGraph([]),.geometry.Point(root,0),{= id=:rootpoint });
            .geometry.ConstructionRecord(graph)
        `, state);
        const encoded = encodeGeometryConstructionSource(record);
        expect(encoded.supported).toBe(true);
        expect(encoded.source).toContain(".ar.Root([-2,0,1],1:2,2)");
        const portable = decodeGeometryConstructionRecord(serializeGeometryConstructionRecord(record));
        const portableSource = encodeGeometryConstructionSource(portable.record);
        expect(portableSource.supported).toBe(true);
        expect(portableSource.source).toContain(".ar.Root([-2,0,1],1:2,2)");

        const replayed = parseAndEvaluate(`.Plugin.Load("geometry");\n${portableSource.source}\n.geometry.ConstructionRecord(graph)`, session());
        const x = field(field(field(replayed, "nodes").values[0], "value"), "x");
        expect(field(x, "schema").value).toBe("rix.algebraic-real@1");
        expect(field(x, "rootIndex").toString()).toBe("2");
    });

    test("preserves the redo stack for undone construction and movement events", () => {
        const state = session();
        const record = parseAndEvaluate(`
            .Plugin.Load("geometry");
            graph=.geometry.ConstructionGraph([]);
            graph=.geometry.AddPoint(graph,.geometry.Point(0,0),{= id=:a });
            graph=.geometry.AddPoint(graph,.geometry.Point(2,0),{= id=:b });
            graph=.geometry.AddLine(graph,:a,:b,{= id=:axis });
            graph=.geometry.ConstrainedDrag(graph,:a,.geometry.Point(1,1),{= constraint=:axis });
            graph=.geometry.Undo(graph);
            graph=.geometry.Undo(graph);
            .geometry.ConstructionRecord(graph)
        `, state);
        const encoded = encodeGeometryConstructionSource(record);
        expect(encoded.supported).toBe(true);
        expect(encoded.source.match(/\.geometry\.Undo\(/g)?.length).toBe(2);

        const replay = session();
        const replayed = parseAndEvaluate(`.Plugin.Load("geometry");\n${encoded.source}\n.geometry.ConstructionRecord(graph)`, replay);
        expect(field(replayed, "future").values.length).toBe(2);
        const redone = parseAndEvaluate("graph=.geometry.Redo(graph); graph=.geometry.Redo(graph); .geometry.ConstructionRecord(graph)", replay);
        expect(field(redone, "future").values.length).toBe(0);
        expect(field(field(redone, "nodes").values.at(-1), "id").value).toBe("axis");
        expect(field(field(field(redone, "nodes").values[0], "value"), "x").toString()).toBe("1");
        expect(field(field(redone, "history").values.at(-1), "operation").value).toBe("constrained_drag");
    });

    test("fails closed for incomplete derived recipes", () => {
        const record = {
            schema: "rix.geometry.construction-record@1",
            nodes: [
                { id: "a", free: true, dependsOn: [], kind: "point", value: { kind: "point", x: 0, y: 0 } },
                { id: "mystery", free: false, dependsOn: ["a"], kind: "custom", value: 2 },
            ],
        };
        const encoded = encodeGeometryConstructionSource(record);
        expect(encoded.supported).toBe(false);
        expect(encoded.unsupported[0].id).toBe("mystery");
    });

    test("namespaces independent authoring programs", () => {
        const first = createGeometryAuthoringProgram("firstseed := .geometry.ConstructionGraph([]);", {
            graphName: "firstseed",
            namesPrefix: "firstboard",
            actionPrefix: "first-board",
        });
        const second = createGeometryAuthoringProgram("secondseed := .geometry.ConstructionGraph([]);", {
            graphName: "secondseed",
            namesPrefix: "secondboard",
            actionPrefix: "second-board",
        });
        const state = session();
        const value = parseAndEvaluate(`.Plugin.Load("geometry");\n${first}\n${second}`, state);
        expect(field(value, "kind")).toBe("graphic");
        expect(first).toContain('id="first-board-point"');
        expect(second).toContain('id="second-board-point"');
    });
});
