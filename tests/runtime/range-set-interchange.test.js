import { describe, expect, test } from "bun:test";
import { Integer, RationalIntervalSet } from "@ratmath/core";
import {
    exportByRegisteredTypeRuntime,
    importByRegisteredTypeRuntime,
} from "../../src/runtime/type-system.js";
import {
    RANGE_SET_INTERCHANGE_VERSION,
    RangeSetInterchangeVersionError,
    rangeSetMigrationPlan,
} from "../../src/runtime/range-set-interchange.js";

describe("RationalIntervalSet interchange lifecycle", () => {
    test("v1 has an exact no-op in-memory plan and never requests a rewrite", () => {
        expect(rangeSetMigrationPlan(1)).toEqual({
            type: "RationalIntervalSet",
            sourceVersion: 1,
            targetVersion: 1,
            migrated: false,
            steps: [],
            warnings: [],
            dropped: [],
            approximated: [],
            rewriteSource: false,
        });
        expect(RANGE_SET_INTERCHANGE_VERSION).toBe(1);
    });

    test("unknown future versions fail with structured information", () => {
        let error;
        try {
            rangeSetMigrationPlan(3);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(RangeSetInterchangeVersionError);
        expect(error).toMatchObject({
            code: "unsupportedFutureVersion",
            type: "RationalIntervalSet",
            encounteredVersion: 3,
            supportedVersions: [1],
        });
    });

    test("runtime import accepts and canonicalizes noncanonical v1 component order", () => {
        const original = new RationalIntervalSet([
            { low: -3, high: -2 },
            { low: 1, high: 2 },
        ]);
        const record = exportByRegisteredTypeRuntime(original);
        const components = record.entries.get("data").entries.get("components").values;
        components.reverse();
        const imported = importByRegisteredTypeRuntime(record);
        expect(imported.equals(original)).toBe(true);
        expect(imported.toString()).toBe("[-3,-2] U [1,2]");
    });

    test("runtime import exposes the same structured future-version error", () => {
        const record = exportByRegisteredTypeRuntime(RationalIntervalSet.point(0));
        record.entries.set("version", new Integer(3n));
        expect(() => importByRegisteredTypeRuntime(record)).toThrow(RangeSetInterchangeVersionError);
        try {
            importByRegisteredTypeRuntime(record);
        } catch (error) {
            expect(error.code).toBe("unsupportedFutureVersion");
        }
    });
});
