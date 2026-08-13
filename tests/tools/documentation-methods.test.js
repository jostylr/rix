import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Integer, Rational, RationalInterval } from "@ratmath/core";

import { getBuiltinProto } from "../../src/runtime/methods.js";
import { createShaped } from "../../src/runtime/shaped.js";

const rixRoot = resolve(import.meta.dir, "../..");

const documentedReceivers = [
  ["Integer", "eval/objects/integer.md", new Integer(1n)],
  ["Rational", "eval/objects/rational.md", new Rational(1n, 2n)],
  ["RationalInterval", "eval/objects/rational-interval.md", new RationalInterval(new Rational(0n), new Rational(1n))],
  ["Array", "eval/objects/array.md", { type: "sequence", values: [] }],
  ["LazySequence", "eval/objects/lazy-sequence.md", { type: "lazy_sequence" }],
  ["AsyncStream", "eval/objects/async-stream.md", { type: "async_stream" }],
  ["Iterator", "eval/objects/iterator.md", { type: "iterator" }],
  ["Map", "eval/objects/map.md", { type: "map", entries: new Map() }],
  ["Set", "eval/objects/set.md", { type: "set", values: [] }],
  ["String", "eval/objects/string.md", { type: "string", value: "" }],
  ["Tuple", "eval/objects/tuple.md", { type: "tuple", values: [] }],
  ["Shaped", "eval/objects/shaped.md", createShaped([1], [null])],
  ["Deferred", "eval/objects/deferred.md", { fn: "DEFER", args: [] }],
  ["Structural values", "eval/objects/structural-values.md", { type: "structural_form" }],
  ["Exact generator", "eval/objects/exact-cartesian.md", { type: "exact_generator" }],
  ["Exact expression", "eval/objects/exact-cartesian.md", { type: "exact_expression" }],
  ["Cayley", "eval/objects/cayley.md", { type: "cayley" }],
];

function methodKeys(sample) {
  const proto = getBuiltinProto(sample);
  expect(proto?.entries).toBeInstanceOf(Map);
  return [...new Set([...proto.entries.keys()].map((name) => String(name).toUpperCase()))];
}

test("every built-in receiver method appears on its dedicated object page and in the overview", async () => {
  const overview = (await Bun.file(resolve(rixRoot, "documentation/eval/methods-guide.md")).text()).toUpperCase();

  for (const [receiver, source, sample] of documentedReceivers) {
    const page = (await Bun.file(resolve(rixRoot, "documentation", source)).text()).toUpperCase();
    expect(overview, `${receiver} overview link`).toContain(`./OBJECTS/${source.split("/").at(-1)}`.toUpperCase());

    for (const name of methodKeys(sample)) {
      const spelling = name === "CHECKTRAITS" ? ".CHECKTRAITS(" : `.${name}(`;
      expect(page, `${receiver}.${name}`).toContain(spelling);
      expect(overview, `${receiver}.${name} overview`).toContain(name);
    }
  }
});
