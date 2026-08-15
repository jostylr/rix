import { describe, expect, test } from "bun:test";
import {
    analyzeRix,
    applyRixLintFixes,
    explainRixScopes,
    lintDiagnosticsToSarif,
    lintRix,
    parseAndEvaluate,
} from "../../src/index.js";

function codes(source) {
    return lintRix(source).map(({ code }) => code);
}

describe("RiX static lint diagnostics", () => {
    test("distinguishes missing and spurious outer capture", () => {
        const missing = lintRix("x = 5; {; x; };");
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatchObject({ code: "RX1001", severity: "warning" });
        expect(missing[0].hint).toContain("@x");

        const spurious = lintRix("{; x = 5; @x; };");
        expect(spurious).toHaveLength(1);
        expect(spurious[0]).toMatchObject({ code: "RX1002", severity: "warning" });
        expect(spurious[0].hint).toContain("Remove '@'");

        expect(codes("F(x)->x+1; {; G=F; };" )).toContain("RX1001");
        expect(codes("F(x)->x+1; {; F(2); };" )).not.toContain("RX1001");
    });

    test("understands loop locals, body locals, and enclosing captures", () => {
        const source = `
            values = [1,2,3];
            total = 0;
            {@ index = 1; index <= @values.Len(); {;
                item = @values[index];
                @total += @item * @index;
            }; index += 1 };
        `;
        const diagnostics = lintRix(source);
        expect(diagnostics.filter(({ code }) => code === "RX1002").map(({ message }) => message))
            .toEqual(expect.arrayContaining([
                expect.stringContaining("@item"),
                expect.stringContaining("@index"),
            ]));
        expect(diagnostics.some(({ message }) => message.includes("@values"))).toBe(false);
        expect(diagnostics.some(({ message }) => message.includes("@total"))).toBe(false);
        expect(diagnostics.some(({ code }) => code === "RX1401")).toBe(false);
    });

    test("treats function closures as lexical and lazy blocks as capture boundaries", () => {
        expect(codes("Make=(a)->(x)->a*x; F=Make(2); F(3);")).not.toContain("RX1001");

        const missing = lintRix("F=()->{; value=7; 1 ?: {; value; } ?_ _; }; F();");
        expect(missing.find(({ code }) => code === "RX1001")?.message).toContain("value");

        const explicit = lintRix("F=()->{; value=7; 1 ?: {; @value; } ?_ _; }; F();");
        expect(explicit.map(({ code }) => code)).not.toContain("RX1002");
    });

    test("warns about numeric decisions and undecided fallthrough", () => {
        expect(codes("F = (value, subtract ?= 0) -> subtract ?: -value ?_ value;"))
            .toContain("RX1101");
        expect(codes("x := 0.5?; x < 0.55 ?: :below ?_ :above;"))
            .toContain("RX1102");
        expect(codes("x := 0.5?; x < 0.55 ?: :below ?_ :above ?? :refine;"))
            .not.toContain("RX1102");
    });

    test("recognizes statically known immutable update targets", () => {
        const diagnostics = lintRix("x := .ImmutableValue({= n=1 }); x ~= {= n=2 };");
        expect(diagnostics.find(({ code }) => code === "RX1201")?.message).toContain("appears immutable");

        const polynomial = lintRix("p := `x^2`.P(); p ~= `x`.P();");
        expect(polynomial.some(({ code }) => code === "RX1201")).toBe(true);
    });

    test("reports shadowing and capture-dense lazy branches", () => {
        expect(codes("x=1; 1 ?: {; x=2; x; } ?_ _;" )).toContain("RX1302");
        const source = "a=1;b=2;c=3;d=4; 1 ?: {; @a+@b+@c+@d+@a; } ?_ _;";
        expect(lintRix(source).map(({ code }) => code)).not.toContain("RX2001");
        expect(lintRix(source, { profile: "all", level: "thorough" }).find(({ code }) => code === "RX2001"))
            .toMatchObject({ severity: "info" });
    });

    test("corrected translation patterns stay clean", () => {
        const source = `
            WeightedSum = values -> {;
                total := 0;
                {@ index = 1; index <= @values.Len(); {;
                    item = @values[index];
                    @total += item * index;
                }; index += 1 };
                total;
            };
        `;
        expect(lintRix(source).filter(({ severity }) => severity !== "info")).toEqual([]);
    });

    test("explains identifier ownership for editor and CLI consumers", () => {
        const scopes = explainRixScopes("value=1; {; local=2; value+local; @local; };");
        expect(scopes.find(({ name, status }) => name === "value" && status === "capture-required"))
            .toMatchObject({ owner: "root", recommendation: "@value" });
        expect(scopes.find(({ name, status }) => name === "local" && status === "current"))
            .toMatchObject({ owner: "block", access: "bare" });
        expect(scopes.find(({ name, status }) => name === "local" && status === "spurious-outer"))
            .toMatchObject({ recommendation: "local" });
    });

    test("supports progressive levels and domain profiles", () => {
        const alias = "items=[1]; shared=items;";
        expect(codes(alias)).toContain("RX1202");
        expect(lintRix(alias, { level: "essential" }).map(({ code }) => code)).not.toContain("RX1202");

        const reactive = "$$source:=1; $$derived:=source+1;";
        expect(lintRix(reactive).map(({ code }) => code)).not.toContain("RX1601");
        expect(lintRix(reactive, { profile: "reactive" }).map(({ code }) => code)).toContain("RX1601");
    });

    test("finds control-flow, syntax, reactive, and math hazards", () => {
        const all = (source) => lintRix(source, { profile: "all", level: "pedantic" }).map(({ code }) => code);
        expect(all("{@ i=0; i<3; 1; _ };")).toContain("RX1401");
        expect(all("{@ i=0; i<3; {; i+=1; }; i+=1 };")).toContain("RX1402");
        expect(all("F(n)->n==0 ?: 1 ?_ n*F(n-1);")).toContain("RX1501");
        expect(all("f=(x)->x; f(2); values=[1]; values[0];")).toEqual(expect.arrayContaining(["RX1701", "RX1702"]));
        expect(all("F(d)->1/d;")).toContain("RX1804");
        expect(all("$$a:=$b; $$b:=$a;")).toContain("RX1604");
        expect(all("$$items:=[1]; $items.Push!(2);")).toContain("RX1603");
        expect(all("$$items:=[1]; $items.Push!(2); $$items.Touch();")).not.toContain("RX1603");
    });

    test("detects path initialization, aliasing, ignored values, and explicit-capture mistakes", () => {
        const all = (source) => lintRix(source, { profile: "all", level: "pedantic" });
        expect(all("condition ?: (chosen=1) ?_ _;").map(({ code }) => code)).toContain("RX1303");
        expect(all("items=[1]; shared=items;").map(({ code }) => code)).toContain("RX1202");
        expect(all("items=[1]; items.Push(2); 0;").map(({ code }) => code)).toContain("RX1203");
        expect(all("{; @missing; };").map(({ code }) => code)).toContain("RX1003");
    });

    test("suppresses named rules with reasons and reports suppressed diagnostics", () => {
        const source = "x=1;\n## rix-lint-disable-next-line RX1001 -- intentional teaching example\n{; x; };\n";
        const analysis = analyzeRix(source, { level: "pedantic", profile: "all" });
        expect(analysis.diagnostics.map(({ code }) => code)).not.toContain("RX1001");
        expect(analysis.suppressedDiagnostics.map(({ code }) => code)).toContain("RX1001");
    });

    test("safe fixes require an explicit edit option and SARIF retains rule locations", () => {
        const source = "x=1; {; x; };";
        const diagnostics = lintRix(source);
        expect(() => applyRixLintFixes(source, diagnostics)).toThrow("explicit option");
        const fixed = applyRixLintFixes(source, diagnostics, { edit: true });
        expect(fixed).toMatchObject({ source: "x=1; {; @x; };", applied: 1 });
        expect(lintRix(fixed.source)).toEqual([]);

        const camelSource = "repeatStart=_; 1 ?: {; repeatStart ~= 2; } ?_ _;";
        const camelDiagnostics = lintRix(camelSource);
        const camelFixed = applyRixLintFixes(camelSource, camelDiagnostics, { edit: true });
        expect(camelFixed.source).toContain("@repeatStart ~= 2");
        expect(() => parseAndEvaluate(camelFixed.source)).not.toThrow();

        const sarif = lintDiagnosticsToSarif(diagnostics);
        expect(sarif).toMatchObject({ version: "2.1.0" });
        expect(sarif.runs[0].results[0]).toMatchObject({ ruleId: "RX1001", level: "warning" });
    });

    test("checks RiX plugin metadata and registrations under the plugin profile", () => {
        const source = `.Host.RegisterValue("wrongMount", {= }, "demo", ["Other"]);`;
        const diagnostics = lintRix(source, {
            ast: [],
            profile: "plugin",
            level: "thorough",
            pluginMetadata: {
                id: "demo", kind: "rix", mount: "demo", aliases: [], exports: ["Missing"],
                groups: ["Demo"], permissions: ["files"], provides: [], schemas: [], requires: [],
            },
        });
        expect(diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["RX1902", "RX1903", "RX1906", "RX1907", "RX1910"]));
    });

    test("does not count a plugin header declaration as an implemented export", () => {
        const source = `/**
id: demo
description: Demonstration plugin.
kind: rix
mount: demo
exports: [Missing]
**/
.Host.RegisterValue("demo", {= }, "demo", []);`;
        const diagnostics = lintRix(source, {
            profile: "plugin",
            level: "thorough",
            pluginMetadata: {
                id: "demo", kind: "rix", mount: "demo", aliases: [], exports: ["Missing"],
                groups: [], permissions: [], provides: ["rix.demo@1"], schemas: [], requires: [],
            },
        });
        expect(diagnostics.map(({ code }) => code)).toContain("RX1902");
    });

    test("recognizes implemented plugin exports that end in punctuation", () => {
        const source = `.Host.RegisterValue("demo", {= }, "demo", []); demo._proto["Transform!"]=(self,value)->value;`;
        const diagnostics = lintRix(source, {
            ast: [],
            profile: "plugin",
            level: "thorough",
            pluginMetadata: {
                id: "demo", kind: "rix", mount: "demo", aliases: [], exports: ["Transform!"],
                groups: [], permissions: [], provides: ["rix.demo@1"], schemas: [], requires: [],
            },
        });
        expect(diagnostics.map(({ code }) => code)).not.toContain("RX1902");
    });

    test("accepts one explicit request argument for receiver refinement", () => {
        const all = (source) => lintRix(source, { profile: "all", level: "pedantic" }).map(({ code }) => code);
        expect(all("RefineWithin=(real, request)->real.Refine(request);")).not.toContain("RX1806");
        expect(all("RefineWithoutBudget=(real)->real.Refine();")).toContain("RX1806");
    });
});

describe("RiX actionable runtime diagnostics", () => {
    test("suggests capture direction and records the selected branch", () => {
        expect(() => parseAndEvaluate("x = 5; 1 ?: {; x; } ?_ _;"))
            .toThrow(/RX1001[\s\S]*while evaluating '\?:' branch/);
        expect(() => parseAndEvaluate("{; x = 5; @x; };"))
            .toThrow(/RX1002: 'x' belongs to the current scope/);
    });

    test("records loop phase and iteration on a lazy failure", () => {
        expect(() => parseAndEvaluate("{@ i=0; i<1; missing; i+=1 };"))
            .toThrow(/while evaluating loop body, iteration 1/);
    });

    test("explains immutable identity-preserving updates", () => {
        expect(() => parseAndEvaluate("x := .ImmutableValue({= n=1 }); x ~= {= n=2 };"))
            .toThrow(/RX1201: '~=' preserves cell identity/);
    });
});
