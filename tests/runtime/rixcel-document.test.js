import { describe, expect, test } from "bun:test";
import {
    RIXCEL_FORMAT,
    RIXCEL_VERSION,
    appendRixCelEvent,
    clearRixCelDraft,
    createRixCelDocument,
    createSheet,
    exportRixCelDocument,
    formatValue,
    materializeRixCelDocument,
    parseAndEvaluate,
    parseRixCelDocument,
    setRixCelCursor,
    setRixCelDraft,
    stringifyRixCelDocument,
} from "../../src/index.js";

describe("RiXCel documents", () => {
    test("round-trips authoritative rank-N formula source through sparse history", () => {
        const result = parseAndEvaluate(`
            original := .FormulaSheet(
                {:2x1x2: @{2}; @{5} ;; @{20}; @{21}},
                {=
                    id="cube",
                    assignmentMode="~=",
                    view={=
                        title="Named cube",
                        axes=["region", "measure", "scenario"],
                        axisLabels=[["North", "South"], ["Value"], ["Actual", "Forecast"]],
                        viewAxes=[1, 2],
                        slice=[_, _, 2]
                    }
                }
            );
            original.SetSource(1, 1, 1, "10", ":=");
            original.SetSource(1, 1, 2, "grid[1,1,1] + 3", "~=");
            original.SetSource(2, 1, 1, "grid[1,1,2] * 4", "~=");
            original.SetSource(2, 1, 2, "grid[2,1,1] + 1", "~=");
            saved := .RiXCelExport(original);
            restored := .RiXCelImport(saved);
            {: saved, restored }
        `);
        const [saved, restored] = result.values;
        const document = JSON.parse(saved.value);

        expect(document.format).toBe(RIXCEL_FORMAT);
        expect(document.version).toBe(RIXCEL_VERSION);
        expect(document.id).toBe("cube");
        expect(document.shape).toEqual([2, 1, 2]);
        expect(document.defaultSlot).toEqual({ source: "_", assignmentMode: ":=", view: {} });
        expect(document.events).toHaveLength(4);
        expect(document.events[0]).toMatchObject({
            id: "cube:event:1",
            sequence: 1,
            type: "slot:set",
            index: [1, 1, 1],
            source: "10",
            assignmentMode: ":=",
            command: 'document.SetSource(1, 1, 1, "10", ":=")',
        });
        expect(document.cursor).toBe(4);
        expect(document).not.toHaveProperty("slots");

        expect(restored.id).toBe("cube");
        expect(restored.slot([1, 1, 2]).dependencies).toEqual(["1,1,1"]);
        expect(restored.slot([2, 1, 1]).dependencies).toEqual(["1,1,2"]);
        expect(formatValue(restored.get([2, 1, 2]))).toBe("53");
        const restoredSheet = createSheet([restored]);
        expect(restoredSheet.title).toBe("Named cube");
        expect(restoredSheet.rowHeaders).toEqual(["North · 1", "South · 2"]);
        expect(restoredSheet.hiddenAxes[0].selectedLabel).toBe("Forecast");
    });

    test("uses a sparse default and replays cursor-addressable executable events", () => {
        const large = createRixCelDocument({ id: "large-sparse", shape: [1000, 1000] });
        expect(large.events).toEqual([]);
        expect(stringifyRixCelDocument(large).length).toBeLessThan(500);

        let document = createRixCelDocument({ id: "sparse", shape: [3, 3] });

        document = appendRixCelEvent(document, {
            type: "slot:set",
            index: [1, 2],
            source: "40 + 2",
            assignmentMode: ":=",
            view: {},
        });
        document = appendRixCelEvent(document, {
            type: "slot:set",
            index: [1, 3],
            source: "grid[1,2] * 2",
            assignmentMode: "~=",
            view: {},
        });
        expect(document.events.map(({ command }) => command)).toEqual([
            'document.SetSource(1, 2, "40 + 2", ":=")',
            'document.SetSource(1, 3, "grid[1,2] * 2", "~=")',
        ]);

        const empty = createRixCelDocument({ id: "command", shape: [3, 3] });
        const emptyLiteral = `""${stringifyRixCelDocument(empty)}""`;
        const replayed = parseAndEvaluate(`
            document := .RiXCelImport(${emptyLiteral});
            ${document.events[0].command};
            document[1,2]
        `);
        expect(formatValue(replayed)).toBe("42");

        const undone = materializeRixCelDocument(setRixCelCursor(document, 1));
        expect(undone.slots[1].source).toBe("40 + 2");
        expect(undone.slots[2].source).toBe("_");
        expect(document.events).toHaveLength(2);
    });

    test("records cosmetic view changes in the same replay log", () => {
        let document = createRixCelDocument({ id: "labels", shape: [2, 2] });
        document = appendRixCelEvent(document, {
            type: "view:axis-label",
            axis: 2,
            coordinate: 1,
            label: "Revenue",
        });
        const materialized = materializeRixCelDocument(document);
        expect(materialized.view.axisLabels).toEqual([null, ["Revenue", null]]);
        expect(document.events[0].command)
            .toBe('document.SetAxisLabel(2, 1, "Revenue")');
    });

    test("keeps failed edit drafts without applying them", () => {
        let document = createRixCelDocument({ id: "draft", shape: [1, 1] });
        document = setRixCelDraft(document, {
            index: [1, 1],
            source: "1 +",
            assignmentMode: ":=",
            kind: "parse",
            message: "Expected expression",
        });
        expect(document.drafts[0]).toMatchObject({ source: "1 +", kind: "parse" });
        expect(materializeRixCelDocument(document).slots[0].source).toBe("_");
        expect(clearRixCelDraft(document, [1, 1]).drafts).toEqual([]);
    });

    test("migrates dense version 0 and version 1 documents", () => {
        const draft = {
            kind: "rixcel",
            version: 0,
            id: "legacy",
            shape: [1, 2],
            slots: [
                { index: [1, 1], code: "5", op: "::=", style: { emphasis: true } },
                { index: [1, 2], code: "grid[1,1] * 3" },
            ],
        };
        const migrated = parseRixCelDocument(draft);
        expect(migrated.version).toBe(2);
        expect(migrated.events).toHaveLength(2);
        expect(migrated.events[0]).toMatchObject({
            index: [1, 1], source: "5", assignmentMode: "::=", view: { emphasis: true },
        });
        const jsonLiteral = `""${JSON.stringify(draft)}""`;
        const restored = parseAndEvaluate(`.RiXCelImport(${jsonLiteral})`);
        expect(formatValue(restored.get([1, 2]))).toBe("15");
    });

    test("host APIs omit runtime caches and dense null slots", () => {
        const sheet = parseAndEvaluate(`
            .FormulaSheet({:1x3: @{ _ }, @{ 7 }, @{ grid[1,2] + 1 }}, {= id="host-api" })
        `);
        const document = exportRixCelDocument(sheet);
        const json = stringifyRixCelDocument(document, { space: 0 });

        expect(document.events).toHaveLength(2);
        expect(document.events[1].source).toBe("grid[1,2] + 1");
        expect(document.events[1]).not.toHaveProperty("value");
        expect(document.events[1]).not.toHaveProperty("dependencies");
        expect(document.events[1]).not.toHaveProperty("formula");
        expect(JSON.parse(json)).toEqual(document);
    });

    test("rejects malformed histories, commands, coordinates, and future documents", () => {
        const base = createRixCelDocument({ id: "bad", shape: [1, 2] });
        expect(() => parseRixCelDocument({
            ...base,
            events: [{ type: "slot:set", index: [1, 3], source: "1", assignmentMode: ":=" }],
        })).toThrow("from 1 through 2");
        expect(() => parseRixCelDocument({
            ...base,
            events: [{
                type: "slot:set",
                index: [1, 1],
                source: "1",
                assignmentMode: ":=",
                command: "do something else",
            }],
        })).toThrow("canonical RiX command");
        expect(() => parseRixCelDocument({ ...base, cursor: 1 })).toThrow("from 0 through 0");
        expect(() => parseRixCelDocument({ ...base, version: 3 }))
            .toThrow("Unsupported RiXCel document version 3");
        expect(() => parseRixCelDocument("{ definitely not JSON"))
            .toThrow("Invalid RiXCel JSON");
    });
});
