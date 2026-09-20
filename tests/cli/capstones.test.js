import { test, expect } from "bun:test";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Context, parseAndEvaluate, formatValue, renderOutputHtml } from "../../src/index.js";
import { cancellationCapstone } from "../../examples/capstones/async-cancellation.mjs";

const root = path.resolve(import.meta.dir, "../..");
const source = (name) => readFileSync(path.join(root, "examples", name), "utf8");
const evaluate = (name) => parseAndEvaluate(source(name), { context: new Context() });

test("certified capstone preserves approximation and bounded failure in static output", () => {
  const html = renderOutputHtml(evaluate("capstones/certified-exploration.rix"), formatValue);
  for (const text of ["budgetExhausted", "complete", "approximate", "validated", "partial", "not a distinct-root count"])
    expect(html).toContain(text);
}, 15_000);

test("tensor capstone resolves labeled coordinates before presentation", () => {
  const html = renderOutputHtml(evaluate("rixcel/sheet-views.rix"), formatValue);
  expect(html).toContain("Forecast by region and measure");
  expect(html).toContain("South forecast cost: 11");
  expect(html).toContain("Column 2 by depth");
});

test("RiXCel capstone roundtrips formulas and keeps foreign CSV formulas inert", () => {
  const restored = renderOutputHtml(evaluate("rixcel/persistence.rix"), formatValue);
  expect(restored).toContain("Restored RiXCel document");
  const values = parseAndEvaluate(source("rixcel/persistence.rix") + "; [restored[1,1],restored[1,2],restored[2,1],restored[2,2]]", { context: new Context() });
  expect(values.values.map(String)).toEqual(["10", "20", "3", "23"]);
  const csv = renderOutputHtml(evaluate("rixcel/delimited.rix"), formatValue);
  expect(csv).toContain("=SUM(A1:A2)");
  expect(csv).toContain("Imported CSV values");
});

test("host capstone cancels both safe branches and cleans each exactly once", async () => {
  const result = await cancellationCapstone();
  expect(result.status).toBe("cancelled");
  expect(result.cleaned.toSorted()).toEqual([1, 2]);
  expect(result.staticResult).toBe("1/2");
});

test("exact-number capstone exports rounded views beside exact source", () => {
  mkdirSync(path.join(root, "tmp"), { recursive: true });
  const out = mkdtempSync(path.join(root, "tmp", "capstone-numbers-"));
  try {
    const run = spawnSync("bun", ["bin/rix.js", "--no-config", `--out=${out}`, "examples/renderers/numeric-presentation.rix"], {
      cwd: root, encoding: "utf8", timeout: 30_000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(path.join(out, "numbers.html"), "utf8")).toContain("0.333");
    const saved = readFileSync(path.join(out, "numbers-source.txt"), "utf8");
    expect(JSON.parse(saved).nodes.some((node) => node.tag === 'rational' && node.data[0] === '1' && node.data[1] === '3')).toBe(true);
  } finally { rmSync(out, { recursive: true, force: true }); }
}, 35_000);
