import { describe, expect, test } from "bun:test";

import {
    allTests,
    ciAdditionalTests,
    documentationTests,
    selectTests,
    shortTests,
    suiteOnlyTests,
} from "../../scripts/run-test-profile.js";

describe("RiX test profiles", () => {
    test("profiles are ordered from focused to comprehensive", () => {
        const all = allTests();
        const short = selectTests("short", all);
        const ci = selectTests("ci", all);
        const ten = selectTests("ten", all);
        const suite = selectTests("suite", all);

        expect(short.length).toBe(shortTests.size);
        expect(ci.length).toBe(new Set([...shortTests, ...ciAdditionalTests]).size);
        expect(ten.length).toBe(all.length - documentationTests.size - suiteOnlyTests.size);
        expect(suite).toEqual(all);
        expect(short.every((filename) => ci.includes(filename))).toBe(true);
        expect(ci.every((filename) => ten.includes(filename))).toBe(true);
    });

    test("documentation has an explicit, disjoint profile", () => {
        const all = allTests();
        const docs = selectTests("docs", all);
        const ten = selectTests("ten", all);

        expect(docs).toEqual([...documentationTests].sort());
        expect(docs.some((filename) => ten.includes(filename))).toBe(false);
        expect([...suiteOnlyTests].some((filename) => ten.includes(filename))).toBe(false);
    });

    test("unknown profiles fail closed", () => {
        expect(selectTests("quickish", allTests())).toBeNull();
    });
});
