/** Compare interpreted RiX, compiled RiX, and an efficient native JS FizzBuzz. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Integer } from "@ratmath/core";
import {
    Context, createDefaultRegistry, createDefaultSystemContext,
    evaluate, formatValue, lower, parse, parseAndEvaluate, tokenize,
} from "../src/index.js";
import { compileFile } from "../bin/rix-to-js-experiment.js";

const quick = process.argv.includes("--quick");
const count = quick ? 100 : 1000;
const rounds = quick ? 3 : 9;
const warmups = quick ? 1 : 3;
const names = ["ternary", "named-multifunction", "anonymous-multifunction", "case-block"];

function expectedValues(length) {
    return Array.from({ length }, (_, index) => {
        const n = index + 1;
        return n % 15 === 0 ? "FizzBuzz" : n % 3 === 0 ? "Fizz" : n % 5 === 0 ? "Buzz" : n;
    });
}

function nativeFizzBuzz(length) {
    const values = new Array(length);
    for (let n = 1; n <= length; n += 1) {
        let value = n;
        if (n % 15 === 0) value = "FizzBuzz";
        else if (n % 3 === 0) value = "Fizz";
        else if (n % 5 === 0) value = "Buzz";
        values[n - 1] = value;
    }
    return values;
}

const expected = expectedValues(count);
const expectedDisplay = `[${expected.join(", ")}]`;

async function prepareProgram(name, { trustedCompiled }) {
    const file = resolve(import.meta.dir, "fizzbuzz-sources", `${name}.rix`);
    const source = readFileSync(file, "utf8");
    if (trustedCompiled) {
        // Only an explicitly trusted caller may import the sibling JS module.
        // --check ensures the artifact was generated from the current RiX source.
        const compiledFile = compileFile(file, { check: true });
        const compiled = await import(pathToFileURL(compiledFile).href);
        return { name, mode: "trusted .rix.js", repetitions: quick ? 5 : 30,
            run: () => compiled.run(count), samples: [] };
    }
    // Untrusted source stays on the ordinary parser/evaluator path.
    const context = new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext();
    parseAndEvaluate(source, { context, registry, systemContext });
    const [node] = lower(parse(tokenize(`Run(${count});`)));
    return { name, mode: "interpreted .rix", repetitions: 1,
        run: () => evaluate(node, context, registry, systemContext), samples: [] };
}

const programs = [];
for (const name of names) {
    programs.push(await prepareProgram(name, { trustedCompiled: false }));
    programs.push(await prepareProgram(name, { trustedCompiled: true }));
}
programs.push({ name: "native loop", mode: "native JavaScript", repetitions: quick ? 50 : 300,
    run: () => nativeFizzBuzz(count), samples: [] });

function verify(program, result) {
    if (program.mode === "native JavaScript") assert.deepEqual(result, expected);
    else assert.equal(formatValue(result), expectedDisplay, `${program.name} ${program.mode}`);
}

for (const program of programs) {
    verify(program, program.run());
    for (const sample of [0, 1, 15, 30]) {
        if (program.mode !== "trusted .rix.js") continue;
        const file = resolve(import.meta.dir, "fizzbuzz-sources", `${program.name}.rix.js`);
        const compiled = await import(pathToFileURL(file).href);
        assert.equal(formatValue(compiled.run(new Integer(sample))), `[${expectedValues(sample).join(", ")}]`);
    }
    for (let warmup = 0; warmup < warmups; warmup += 1) program.run();
}

for (let round = 0; round < rounds; round += 1) {
    for (let offset = 0; offset < programs.length; offset += 1) {
        const program = programs[(round + offset) % programs.length];
        // Keep every result observable so a JIT cannot discard earlier runs.
        const results = new Array(program.repetitions);
        const started = performance.now();
        for (let repetition = 0; repetition < program.repetitions; repetition += 1) {
            results[repetition] = program.run();
        }
        program.samples.push((performance.now() - started) / program.repetitions);
        for (const result of results) verify(program, result);
    }
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

console.log(`FizzBuzz AOT experiment: ${count} values, ${rounds} rounds, ${warmups} warmups`);
console.log("Parsing, compilation, module import, and setup are excluded from timed batches.");
console.log("RiX paths return exact Integer/string/sequence values; native JS returns an array of Number/string values.");
console.log("Only trusted mode imports generated JS; every batch result is checked outside the timed section.");
console.log("| form | interpreted ms | compiled ms | native JS ms | AOT speedup | compiled / native |");
console.log("|---|---:|---:|---:|---:|---:|");
const native = median(programs.at(-1).samples);
for (let index = 0; index < programs.length - 1; index += 2) {
    const interpreted = median(programs[index].samples);
    const compiled = median(programs[index + 1].samples);
    console.log(`| ${programs[index].name} | ${interpreted.toFixed(5)} | ${compiled.toFixed(5)} | ${native.toFixed(5)} | ${(interpreted / compiled).toFixed(1)}× | ${(compiled / native).toFixed(1)}× |`);
}
