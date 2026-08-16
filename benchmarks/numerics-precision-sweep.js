import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../src/index.js";

const allWidths = ["1/1000", "1/1000000", "1/10^12", "1/10^24"];
const quick = process.argv.includes("--quick");
const widths = quick ? allWidths.slice(0, 2) : allWidths;
const repetitions = quick ? 1 : 3;

const cases = [
    { name: "Exp(1)", expression: ".numerics.Exp(1)", maxWork: 20000 },
    { name: "Gamma(1/2)", expression: ".numerics.Gamma(1/2)", maxWork: 30000 },
    { name: "Y(2,1)", expression: ".bessel.Y(2,1)", maxWork: 100000 },
    { name: "NormalCDF(1)", expression: ".stats.NormalCDF(1)", maxWork: 50000 },
    {
        name: "NormalQuantile(.975)",
        expression: ".stats.NormalQuantile(975/1000)",
        maxWork: 100000,
    },
];

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
}

function integerDigits(value) {
    const magnitude = value < 0n ? -value : value;
    return magnitude.toString().length;
}

function rationalDigits(value) {
    const rational = typeof value.toRational === "function" ? value.toRational() : value;
    return Math.max(integerDigits(rational.numerator), integerDigits(rational.denominator));
}

function endpointDigits(interval) {
    return Math.max(rationalDigits(interval.low), rationalDigits(interval.high));
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

const options = runtime();
parseAndEvaluate(`
    .Plugin.Load("numerics");
    .Plugin.Load("bessel");
    .Plugin.Load("stats");
`, options);

console.log("Warm runtime: plugins are loaded once; each timed sample still parses its RiX expression.");
console.log(`Samples per cell: ${repetitions}. Times are medians.`);
console.log("| function | request | status | achieved width | calls | iterations | endpoint digits | median ms |");
console.log("|---|---:|---|---:|---:|---:|---:|---:|");

for (const testCase of cases) {
    for (const width of widths) {
        const source = `.numerics.Refine(${testCase.expression}, {=
            absoluteWidth=${width}, maxWork=${testCase.maxWork}
        })`;
        parseAndEvaluate(source, options);
        const times = [];
        let result;
        for (let repetition = 0; repetition < repetitions; repetition += 1) {
            const started = performance.now();
            result = parseAndEvaluate(source, options);
            times.push(performance.now() - started);
        }
        const work = entry(result, "work");
        console.log(
            `| ${testCase.name} | ${width} | ${entry(result, "status").value}`
            + ` | ${approximateWidth(entry(result, "achievedWidth"))}`
            + ` | ${entry(work, "calls").value}`
            + ` | ${entry(work, "iterations")?.value ?? "-"}`
            + ` | ${endpointDigits(entry(result, "interval"))}`
            + ` | ${median(times).toFixed(1)} |`,
        );
    }
}
