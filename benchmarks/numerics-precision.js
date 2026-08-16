import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../src/index.js";
import {
    decimalToRixRational,
    numericsReferenceCases,
} from "./numerics-reference-corpus.js";

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function asRational(value) {
    return typeof value.toRational === "function" ? value.toRational() : value;
}

function approximateWidth(value) {
    if (typeof value.numerator !== "bigint" || typeof value.denominator !== "bigint") {
        return formatValue(value);
    }
    if (value.numerator === 0n) return "0";
    const logarithm = (integer) => {
        const digits = (integer < 0n ? -integer : integer).toString();
        const sample = digits.slice(0, 15);
        const head = Number(sample) / (10 ** (sample.length - 1));
        return digits.length - 1 + Math.log10(head);
    };
    const log10 = logarithm(value.numerator) - logarithm(value.denominator);
    const exponent = Math.floor(log10);
    return `${(10 ** (log10 - exponent)).toFixed(3)}e${exponent}`;
}

console.log("| function | request | status | achieved width | calls | time (ms) | reference overlap |");
console.log("|---|---:|---|---:|---:|---:|---|");

for (const testCase of numericsReferenceCases) {
    const options = runtime();
    parseAndEvaluate(`
        .Plugin.Load("numerics");
        .Plugin.Load("bessel");
        .Plugin.Load("stats");
    `, options);
    const source = `
        result = .numerics.Refine(${testCase.expression}, {=
            absoluteWidth=${testCase.width},
            maxWork=${testCase.maxWork}
        });
        result;
    `;
    const started = performance.now();
    const result = parseAndEvaluate(source, options);
    const milliseconds = performance.now() - started;
    const interval = entry(result, "interval");
    const lower = parseAndEvaluate(decimalToRixRational(testCase.lower), options);
    const upper = parseAndEvaluate(decimalToRixRational(testCase.upper), options);
    const containsReference = !interval.high.lessThan(asRational(lower))
        && !interval.low.greaterThan(asRational(upper));
    console.log(
        `| ${testCase.name} | ${testCase.width} | ${entry(result, "status").value}`
        + ` | ${approximateWidth(entry(result, "achievedWidth"))}`
        + ` | ${entry(entry(result, "work"), "calls").value}`
        + ` | ${milliseconds.toFixed(1)} | ${containsReference ? "yes" : "NO"} |`,
    );
}
