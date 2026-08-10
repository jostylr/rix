import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
    findNearestRixConfig,
    resolveContainedOperatorFiles,
    resolveRixWorkspaceConfig,
    validateRixWorkspaceConfig,
} from "../../src/tools/language-service/config-node.js";

const root = path.resolve(import.meta.dir, "../fixtures/workspace-config");
const document = path.join(root, "nested", "sample.rix");

describe("rix.json workspace configuration", () => {
    test("uses the nearest config and composes only explicit extends", () => {
        expect(findNearestRixConfig(document, root)).toBe(path.join(root, "nested", "rix.json"));
        const resolved = resolveRixWorkspaceConfig(document, root);
        expect(resolved.config).toMatchObject({
            version: 1,
            lint: { level: "thorough", profiles: ["default", "math"] },
            format: { profile: "compact", printWidth: 88, indentWidth: 4 },
            execution: { mode: "isolated", timeoutMs: 5000 },
        });
    });

    test("resolves bounded descendant operator files without evaluating them", () => {
        const resolved = resolveRixWorkspaceConfig(document, root);
        expect(resolveContainedOperatorFiles(resolved, root)).toEqual([
            path.join(root, "operators", "sample.operators.rix"),
        ]);
    });

    test("rejects unknown and security-sensitive configuration keys", () => {
        expect(() => validateRixWorkspaceConfig({ version: 1, network: true })).toThrow("unknown key 'network'");
        expect(() => validateRixWorkspaceConfig({ version: 1, execution: { shell: true } })).toThrow("unknown key 'shell'");
        expect(() => validateRixWorkspaceConfig({ version: 2 })).toThrow("unsupported version");
    });
});

