/** Compare the FizzBuzz forms in rix-web/tutorials/problem-fizzbuzz.md. */
import assert from "node:assert/strict";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    evaluate,
    formatValue,
    lower,
    parse,
    parseAndEvaluate,
    tokenize,
} from "../src/index.js";

const quick = process.argv.includes("--quick");
const count = quick ? 100 : 1000;
const rounds = quick ? 3 : 9;
const warmups = quick ? 1 : 3;
const generator = `[1 |+ 1 |; ${count}]`;

const readableJavaScript = (n) => {
    if (n % 15 === 0) return "FizzBuzz";
    if (n % 3 === 0) return "Fizz";
    if (n % 5 === 0) return "Buzz";
    return n;
};
const compactJavaScript = (n) => n % 15 ? n % 3 ? n % 5 ? n : "Buzz" : "Fizz" : "FizzBuzz";
const expected = Array.from({ length: count }, (_, i) => readableJavaScript(i + 1));
const expectedDisplay = `[${expected.join(", ")}]`;
assert.equal(expected[14], "FizzBuzz");
assert.equal(expected[4], "Buzz");

const rixForms = [
    {
        name: "ternary",
        setup: `FizzBuzz(n) ->
            n % 15 == 0 ?: "FizzBuzz" ?_
            n % 3 == 0 ?: "Fizz" ?_
            n % 5 == 0 ?: "Buzz" ?_ n;`,
        expression: `${generator} |>> FizzBuzz;`,
    },
    {
        name: "named multifunction",
        setup: `FizzBuzz(n) ?- [n % 15 == 0] /Both/ => "FizzBuzz";
            FizzBuzz(n) ?- [n % 3 == 0] /Three/ => "Fizz";
            FizzBuzz(n) ?- [n % 5 == 0] /Five/ => "Buzz";
            FizzBuzz(n) /Number/ => n;`,
        expression: `${generator} |>> FizzBuzz;`,
    },
    {
        name: "anonymous multifunction",
        setup: "",
        expression: `${generator} |>> {>
            (n) ?- [n % 15 == 0] -> "FizzBuzz",
            (n) ?- [n % 3 == 0] -> "Fizz",
            (n) ?- [n % 5 == 0] -> "Buzz",
            (n) -> n
        };`,
    },
    {
        name: "case block",
        setup: `FizzBuzz(n) -> {?
            n % 15 == 0 ? "FizzBuzz";
            n % 3 == 0 ? "Fizz";
            n % 5 == 0 ? "Buzz";
            n
        };`,
        expression: `${generator} |>> FizzBuzz;`,
    },
];

function createRixBenchmark(form) {
    const context = new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext();
    if (form.setup) parseAndEvaluate(form.setup, { context, registry, systemContext });
    const nodes = lower(parse(tokenize(form.expression)));
    assert.equal(nodes.length, 1, `${form.name} must have one timed expression`);
    return {
        name: form.name,
        language: "RiX",
        repetitions: 1,
        run: () => evaluate(nodes[0], context, registry, systemContext),
        verify: (value) => assert.equal(formatValue(value), expectedDisplay, form.name),
        samples: [],
    };
}

function createJavaScriptBenchmark(name, fn) {
    return {
        name,
        language: "JavaScript",
        // JS batches are much faster; repeat them inside each timed sample.
        repetitions: quick ? 10 : 100,
        run: () => Array.from({ length: count }, (_, i) => fn(i + 1)),
        verify: (value) => assert.deepEqual(value, expected, name),
        samples: [],
    };
}

const benchmarks = [
    ...rixForms.map(createRixBenchmark),
    createJavaScriptBenchmark("if/return", readableJavaScript),
    createJavaScriptBenchmark("nested ternary", compactJavaScript),
];

for (const benchmark of benchmarks) {
    benchmark.verify(benchmark.run());
    for (let warmup = 0; warmup < warmups; warmup += 1) benchmark.run();
}

// Rotate the order so a consistently first or last case has no fixed advantage.
for (let round = 0; round < rounds; round += 1) {
    for (let offset = 0; offset < benchmarks.length; offset += 1) {
        const benchmark = benchmarks[(round + offset) % benchmarks.length];
        let result;
        const started = performance.now();
        for (let repetition = 0; repetition < benchmark.repetitions; repetition += 1) {
            result = benchmark.run();
        }
        benchmark.samples.push((performance.now() - started) / benchmark.repetitions);
        benchmark.verify(result);
    }
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

console.log(`FizzBuzz batches: ${count} values, ${rounds} timed rounds, ${warmups} warmups`);
console.log("Setup and RiX parsing/lowering are excluded; the anonymous group is constructed by its timed expression.");
console.log("JavaScript uses Number; RiX uses exact integers and its evaluator. Compare within each language first.");
console.log("| language | form | median ms/batch | min–max ms/batch |");
console.log("|---|---|---:|---:|");
for (const benchmark of benchmarks) {
    const samples = benchmark.samples;
    console.log(`| ${benchmark.language} | ${benchmark.name} | ${median(samples).toFixed(3)} | ${Math.min(...samples).toFixed(3)}–${Math.max(...samples).toFixed(3)} |`);
}
