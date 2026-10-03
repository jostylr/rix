/** Compare interpretation with the trusted .rix.js experiment on identical source. */
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

function expectedDisplay(length) {
    const values = Array.from({ length }, (_, index) => {
        const n = index + 1;
        return n % 15 === 0 ? "FizzBuzz" : n % 3 === 0 ? "Fizz" : n % 5 === 0 ? "Buzz" : n;
    });
    return `[${values.join(", ")}]`;
}

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

for (const program of programs) {
    assert.equal(formatValue(program.run()), expectedDisplay(count), `${program.name} ${program.mode}`);
    for (const sample of [0, 1, 15, 30]) {
        if (program.mode !== "trusted .rix.js") continue;
        const file = resolve(import.meta.dir, "fizzbuzz-sources", `${program.name}.rix.js`);
        const compiled = await import(pathToFileURL(file).href);
        assert.equal(formatValue(compiled.run(new Integer(sample))), expectedDisplay(sample));
    }
    for (let warmup = 0; warmup < warmups; warmup += 1) program.run();
}

for (let round = 0; round < rounds; round += 1) {
    for (let offset = 0; offset < programs.length; offset += 1) {
        const program = programs[(round + offset) % programs.length];
        let result;
        const started = performance.now();
        for (let repetition = 0; repetition < program.repetitions; repetition += 1) result = program.run();
        program.samples.push((performance.now() - started) / program.repetitions);
        assert.equal(formatValue(result), expectedDisplay(count));
    }
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

console.log(`FizzBuzz AOT experiment: ${count} values, ${rounds} rounds, ${warmups} warmups`);
console.log("Parsing, compilation, module import, and setup are excluded from timed batches.");
console.log("Both paths return RiX Integer/string/sequence values; only trusted mode imports generated JS.");
console.log("| form | interpreted ms | compiled ms | speedup |");
console.log("|---|---:|---:|---:|");
for (let index = 0; index < programs.length; index += 2) {
    const interpreted = median(programs[index].samples);
    const compiled = median(programs[index + 1].samples);
    console.log(`| ${programs[index].name} | ${interpreted.toFixed(3)} | ${compiled.toFixed(3)} | ${(interpreted / compiled).toFixed(1)}× |`);
}
