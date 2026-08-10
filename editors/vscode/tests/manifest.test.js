import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const json = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));

describe("RiX VS Code extension manifest", () => {
    test("registers the language, static grammars, commands, and restricted execution settings", () => {
        const manifest = json("package.json");
        expect(manifest.contributes.languages[0]).toMatchObject({ id: "rix", extensions: [".rix"] });
        expect(manifest.contributes.grammars.map(({ scopeName }) => scopeName)).toEqual([
            "source.rix", "markdown.rix.codeblock",
        ]);
        expect(manifest.contributes.commands.map(({ command }) => command)).toEqual(expect.arrayContaining([
            "rix.runFile", "rix.runSelection", "rix.checkFile", "rix.showAst", "rix.explainScope",
        ]));
        expect(manifest.contributes.configuration.properties["rix.execution.timeoutMs"].restricted).toBe(true);
        expect(manifest.capabilities.untrustedWorkspaces.supported).toBe("limited");
    });

    test("TextMate grammar recognizes checks, reactive names, system functions, and brace sigils", () => {
        const grammar = json("syntaxes/rix.tmLanguage.json");
        const serialized = JSON.stringify(grammar);
        for (const source of ["##@", "##:", "##!", "@_"]) expect(serialized).toContain(source);
        expect(grammar.repository.reactive.patterns[0].match).toContain("\\$\\$");
        expect(grammar.repository.containers.patterns[0].match).toContain("\\{");
    });

    test("provides selected formatter and inline-check defaults", () => {
        const properties = json("package.json").contributes.configuration.properties;
        expect(properties["rix.format.profile"].default).toBe("readable");
        expect(properties["rix.checks.inline.enabled"].default).toBe(true);
        expect(properties["rix.checks.inline.showInTestExplorer"].default).toBe(true);
        expect(json("schemas/rix.schema.json")).toEqual(json("../../schemas/rix.schema.json"));
    });
});
