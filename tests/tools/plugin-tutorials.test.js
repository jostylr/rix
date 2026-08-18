import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { extractFences, runDocuments } from "../../documentation/scripts/check-examples.js";

const rixRoot = path.resolve(import.meta.dir, "../..");
const pluginsRoot = path.join(rixRoot, "plugins");

function pluginTutorials() {
    return readdirSync(pluginsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(pluginsRoot, entry.name, "tutorial.md"))
        .filter((file) => {
            try {
                return readFileSync(file, "utf8").includes("status: implemented");
            } catch {
                return false;
            }
        })
        .sort();
}

function supplementalPluginTutorials() {
    return readdirSync(pluginsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => readdirSync(path.join(pluginsRoot, entry.name))
            .filter((name) => name.endsWith("-tutorial.md"))
            .map((name) => path.join(pluginsRoot, entry.name, name)))
        .filter((file) => readFileSync(file, "utf8").includes("status: implemented"))
        .sort();
}

describe("implemented plugin tutorials", () => {
    test("every first-party plugin has a tutorial and every RiX cell parses", () => {
        const manifestDirectories = readdirSync(pluginsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .filter((entry) => readdirSync(path.join(pluginsRoot, entry.name))
                .some((name) => name.endsWith(".plugin.rix") || name.endsWith(".plugin.rix.js")));
        const tutorials = pluginTutorials();
        const documents = tutorials.map((file) => {
            const source = readFileSync(file, "utf8");
            const parseChecked = source.replace(/```rix\s*\n/g, "```{.rix parse=true}\n");
            return { file, source: parseChecked };
        });
        const expectedCells = documents.reduce(
            (count, document) => count + extractFences(document.source, document.file).length,
            0,
        );
        const results = runDocuments(documents);

        expect(tutorials).toHaveLength(manifestDirectories.length);
        expect(results).toHaveLength(expectedCells);
        expect(results.filter(({ status }) => status !== "pass")).toEqual([]);
    }, process.env.CI ? 120_000 : 30_000);

    test("supplemental implemented tutorials keep every RiX cell parseable", () => {
        const tutorials = supplementalPluginTutorials();
        const documents = tutorials.map((file) => {
            const source = readFileSync(file, "utf8");
            const parseChecked = source.replace(/```rix\s*\n/g, "```{.rix parse=true}\n");
            return { file, source: parseChecked };
        });
        const expectedCells = documents.reduce(
            (count, document) => count + extractFences(document.source, document.file).length,
            0,
        );
        const results = runDocuments(documents);

        expect(tutorials.length).toBeGreaterThanOrEqual(1);
        expect(results).toHaveLength(expectedCells);
        expect(results.filter(({ status }) => status !== "pass")).toEqual([]);
    }, process.env.CI ? 120_000 : 30_000);
});
