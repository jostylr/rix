import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Integer } from "@ratmath/core";
import { compileFile } from "../../bin/rix-to-js.js";
import { compileProgramToJavaScript } from "../../src/compile/program-to-javascript.js";
import { Context, createDefaultRegistry, formatValue, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";

const directory = mkdtempSync(resolve(import.meta.dir, "../../tmp/rix-to-js-"));
let nextFile = 0;
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function compileModule(source, options = {}) {
    const file = resolve(directory, `case-${nextFile++}.rix.js`);
    writeFileSync(file, compileProgramToJavaScript(source, { sourceName: "test.rix", ...options }));
    return import(pathToFileURL(file).href);
}

describe("general RiX-to-JavaScript compiler", () => {
    test("compiles statements and calls inside user functions", async () => {
        const source = "x := 3; Double(n) -> n*2; Double(x)+1;";
        const compiled = await compileModule(source);
        const context = new Context();
        expect(formatValue(compiled.run({ context }))).toBe(formatValue(parseAndEvaluate(source)));
        expect(compiled.fastPathAvailable).toBe(false);
        expect(compiled.compiledOperationCount).toBeGreaterThan(0);
        expect(formatValue(parseAndEvaluate("Double(4);", { context }))).toBe("8");
        expect(formatValue(await compiled.runAsync())).toBe(formatValue(parseAndEvaluate(source)));
    });

    test("keeps lazy multifunction and case semantics while compiling their child operations", async () => {
        for (const name of ["ternary", "named-multifunction", "anonymous-multifunction", "case-block"]) {
            const fixture = readFileSync(resolve(import.meta.dir, "../../benchmarks/fizzbuzz-sources", `${name}.rix`), "utf8");
            const source = `${fixture}\nRun(30);`;
            const compiled = await compileModule(source);
            expect(compiled.fastPathAvailable).toBe(true);
            const fastResult = compiled.run();
            expect(formatValue(fastResult)).toBe(formatValue(parseAndEvaluate(source)));
            if (name === "ternary") expect(fastResult.values[2]).not.toBe(fastResult.values[5]);
            expect(formatValue(compiled.run({ context: new Context() }))).toBe(formatValue(parseAndEvaluate(source)));
            expect(compiled.compiledOperationCount).toBeGreaterThan(0);
        }
    });

    test("fast scalar literals are fresh RiX values across calls", async () => {
        const strings = await compileModule('Run(n) -> "hi"; Run(1);');
        expect(strings.fastPathAvailable).toBe(true);
        expect(strings.run()).not.toBe(strings.run());
        const integers = await compileModule("Run(n) -> 1; Run(2);");
        expect(integers.fastPathAvailable).toBe(true);
        expect(integers.run()).not.toBe(integers.run());
    });

    test("fast-path precondition failures retry through RiX semantics", async () => {
        const source = "Run(n) -> n % 0; Run(1);";
        const compiled = await compileModule(source);
        expect(compiled.fastPathAvailable).toBe(true);
        expect(() => compiled.run()).toThrow();
        expect(() => compiled.run()).toThrow(/mod|zero|positive/i);
    });

    test("returned functions use the regular RiX representation", async () => {
        const source = "F(n) -> n; Run(n) -> F; Run(1);";
        const compiled = await compileModule(source);
        expect(compiled.fastPathAvailable).toBe(true);
        expect(compiled.run().type).toBe("function");
        expect(formatValue(compiled.run())).toBe(formatValue(parseAndEvaluate(source)));
    });

    test("custom parser configuration disables the direct path", async () => {
        const compiled = await compileModule("Run(n) -> n; Run(1);", { operatorDefinitions: [] });
        expect(compiled.fastPathAvailable).toBe(false);
        expect(formatValue(compiled.run())).toBe("1");
    });

    test("uses the runtime registry, including a changed operator implementation", async () => {
        const source = "1+2;";
        const compiled = await compileModule(source);
        const registry = createDefaultRegistry();
        registry.register("ADD", () => new Integer(17));
        expect(formatValue(compiled.run({ registry }))).toBe(formatValue(parseAndEvaluate(source, { registry })));
        registry.register("ADD", ([left], _context, evaluate) => evaluate(left), { lazy: true });
        expect(formatValue(compiled.run({ registry }))).toBe(formatValue(parseAndEvaluate(source, { registry })));
    });

    test("retains step limits and source-location errors", async () => {
        const limited = await compileModule("1+2+3;");
        expect(() => limited.run({ maxSteps: 1 })).toThrow(/step|budget|limit/i);
        const broken = await compileModule("missing+1;");
        expect(() => broken.run()).toThrow(/Undefined variable: missing.*test\.rix:line 1, column 1/);
    });

    test("runs async constructs from pre-lowered source", async () => {
        const source = "{$:2$ [1+2,2+3] }";
        const compiled = await compileModule(source);
        expect(formatValue(await compiled.runAsync())).toBe(formatValue(await parseAndEvaluateAsync(source)));
    });

    test("resolves script imports relative to the generated sibling", async () => {
        const input = resolve(directory, "caller.rix");
        writeFileSync(resolve(directory, "constant.rix"), "40+2;");
        writeFileSync(input, '<"constant">;');
        const compiled = await import(pathToFileURL(compileFile(input)).href);
        expect(formatValue(compiled.run())).toBe("42");
        const context = new Context();
        context.setEnv("scriptBaseDir", directory);
        expect(formatValue(parseAndEvaluate('<"constant">;', { file: input, context }))).toBe("42");
    });

    test("emits a content-bound sibling and detects stale output", async () => {
        const file = resolve(directory, "sample.rix");
        const source = "Square(n) -> n*n; Square(5);";
        writeFileSync(file, source);
        const output = compileFile(file);
        expect(compileFile(file, { check: true })).toBe(output);
        const compiled = await import(pathToFileURL(output).href);
        expect(compiled.sourceHash).toBe(createHash("sha256").update(source).digest("hex"));
        expect(formatValue(compiled.run())).toBe("25");
        const executed = spawnSync(process.execPath, [output], { encoding: "utf8" });
        expect(executed.status).toBe(0);
        expect(executed.stdout.trim()).toBe("25");
        writeFileSync(file, `${source}\n1;`);
        expect(() => compileFile(file, { check: true })).toThrow(/stale/);
    });

    test("requires reinterpretation when parser policy changes at runtime", async () => {
        const compiled = await compileModule("1+2;");
        expect(() => compiled.run({ sourceLimits: { maxTokens: 1 } })).toThrow(/interpret this source/);
    });
});
