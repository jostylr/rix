/** Upper-bound probe: a RiX plugin kernel versus hand-translated exact JS. */
import assert from "node:assert/strict";
import { Integer } from "@ratmath/core";
import {
    Context, createDefaultRegistry, createDefaultSystemContext,
    evaluate, lower, parse, parseAndEvaluate,
} from "../src/index-node.js";

const context = new Context();
const registry = createDefaultRegistry();
const systemContext = createDefaultSystemContext();
const coefficients = Array.from({ length: 20 }, (_, index) => new Integer(index + 1));
parseAndEvaluate(`.Plugin.Load("poly"); coeff := [${coefficients.map((value) => value.value).join(",")}];`, {
    context, registry, systemContext,
});
const [call] = lower(parse("PolyEvaluateAscending(coeff, 2);"));
const point = new Integer(2);

function directStep(index, accumulator) {
    if (index.value < 1n) return accumulator;
    return directStep(
        new Integer(index.value - 1n),
        accumulator.multiply(point).add(coefficients[Number(index.value) - 1]),
    );
}

function direct() {
    return directStep(new Integer(coefficients.length), new Integer(0));
}

function interpreted() {
    return evaluate(call, context, registry, systemContext);
}

const expected = direct().value;
assert.equal(interpreted().value, expected);
for (let index = 0; index < 100; index += 1) { interpreted(); direct(); }

function measure(run, repetitions) {
    const results = [];
    const started = performance.now();
    for (let index = 0; index < repetitions; index += 1) results.push(run());
    const elapsed = performance.now() - started;
    for (const value of results) assert.equal(value.value, expected);
    return elapsed / repetitions;
}

const interpretedSamples = [];
const directSamples = [];
for (let round = 0; round < 7; round += 1) {
    interpretedSamples.push(measure(interpreted, 100));
    directSamples.push(measure(direct, 10_000));
}
const median = (samples) => [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
const interpretedMs = median(interpretedSamples);
const directMs = median(directSamples);
console.log("PolyEvaluateAscending, degree 19, exact Integer arithmetic");
console.log(`Interpreted plugin: ${interpretedMs.toFixed(6)} ms/call`);
console.log(`Hand-translated JS: ${directMs.toFixed(6)} ms/call`);
console.log(`Interpreter/direct ratio: ${(interpretedMs / directMs).toFixed(0)}x`);
console.log("The direct version is an opportunity bound, not generated compiler output or full RiX semantics.");
