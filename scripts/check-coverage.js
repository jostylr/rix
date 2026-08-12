#!/usr/bin/env bun

import path from "node:path";

const rixRoot = path.resolve(import.meta.dir, "..");
const reportPath = path.join(rixRoot, "coverage", "lcov.info");
const report = await Bun.file(reportPath).text();
if (!report) throw new Error(`Missing LCOV report: ${reportPath}`);

function total(field) {
    return [...report.matchAll(new RegExp(`^${field}:(\\d+)$`, "gm"))]
        .reduce((sum, match) => sum + Number(match[1]), 0);
}

const metrics = [
    { label: "line", hit: total("LH"), found: total("LF"), minimum: 80 },
    { label: "function", hit: total("FNH"), found: total("FNF"), minimum: 80 },
];

let failed = false;
for (const metric of metrics) {
    const percent = metric.found === 0 ? 0 : (100 * metric.hit) / metric.found;
    console.log(`${metric.label} coverage: ${metric.hit}/${metric.found} (${percent.toFixed(2)}%; minimum ${metric.minimum}%)`);
    if (percent < metric.minimum) failed = true;
}

if (failed) process.exit(1);
