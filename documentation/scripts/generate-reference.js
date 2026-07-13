#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRegistry, createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { runtimeDefaults } from "../../src/runtime/runtime-config.js";
import { getBuiltinProto } from "../../src/runtime/methods.js";
import { createTensor } from "../../src/runtime/tensor.js";
import { traitRegistry, typeRegistry } from "../../src/runtime/type-system.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../reference/system-reference.md");

function escapeCell(value) {
  let text = String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
  if (!text.includes("`")) {
    text = text.replaceAll("*", "\\*").replaceAll("_", "\\_");
  }
  return text;
}

function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, rule, ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)].join("\n");
}

function groupsFor(name) {
  return Object.entries(runtimeDefaults.capabilityGroups)
    .filter(([, names]) => names.includes(name))
    .map(([group]) => group)
    .join(", ");
}

function methodNames(sample) {
  const proto = getBuiltinProto(sample);
  if (!proto?.entries) return [];
  return [...proto.entries.keys()]
    .filter((name) => name !== "CHECKTRAITS" && name !== "CheckTraits")
    .sort((a, b) => a.localeCompare(b));
}

const registry = createDefaultRegistry();
const system = createDefaultSystemContext();

const publicRows = system.getAllNames().map((name) => {
  const entry = system.get(name);
  return [
    `\`.${name}\``,
    entry.kind === "value" ? "value" : entry.lazy ? "lazy function" : "function",
    groupsFor(name) || "—",
    entry.doc || "—",
  ];
});

const internalRows = registry.list().map((name) => {
  const entry = registry.get(name);
  const flags = [entry.lazy ? "lazy" : "eager", entry.pure ? "pure" : "effectful/unspecified"];
  if (entry.systemMultifunction) flags.push("multifunction");
  return [`\`${name}\``, flags.join(", "), entry.doc || "—"];
});

const receiverSamples = [
  ["Array", { type: "sequence", values: [] }],
  ["Lazy sequence", { type: "lazy_sequence" }],
  ["Iterator", { type: "iterator" }],
  ["Map", { type: "map", entries: new Map() }],
  ["Set", { type: "set", values: [] }],
  ["String", { type: "string", value: "" }],
  ["Tuple", { type: "tuple", values: [] }],
  ["Tensor", createTensor([1], [null])],
  ["Deferred expression", { fn: "DEFER", args: [] }],
  ["Exact generator", { type: "exact_generator" }],
  ["Exact expression", { type: "exact_expression" }],
  ["Cayley value", { type: "cayley" }],
];

const methodRows = receiverSamples.map(([receiver, sample]) => [
  receiver,
  methodNames(sample).map((name) => `\`${name}\``).join(", ") || "—",
]);

const typeRows = typeRegistry.list().map((name) => {
  const entry = typeRegistry.get(name);
  return [
    `\`${name}\``,
    entry.nativeType || "—",
    (entry.aliases || []).map((alias) => `\`${alias}\``).join(", ") || "—",
    (entry.defaultTraits || []).map((trait) => `\`${trait}\``).join(", ") || "—",
  ];
});

const traitRows = traitRegistry.list().map((name) => {
  const entry = traitRegistry.get(name);
  return [
    `\`${name}\``,
    (entry.implies || []).map((trait) => `\`${trait}\``).join(", ") || "—",
    entry.description || "—",
  ];
});

const groupRows = Object.entries(runtimeDefaults.capabilityGroups).map(([name, members]) => [
  `\`${name}\``,
  members.map((member) => `\`${member}\``).join(", "),
]);

const output = `---
title: "Generated runtime catalog"
description: "Source-derived system capabilities, internal IR functions, methods, semantic types, traits, and sandbox groups."
toc-depth: 2
---

::: {.callout-note}
This page is generated from the current RiX implementation by \`documentation/scripts/generate-reference.js\`. Do not edit it by hand. Descriptions come from registry documentation strings; the narrative [syntax guide](../eval/syntax-guide.md) and [methods guide](../eval/methods-guide.md) provide signatures and examples.
:::

At this revision RiX exposes **${publicRows.length} named entries** on the default system context and registers **${internalRows.length} internal IR operations**. Aliases with different spelling are listed separately because they are separately addressable names.

## Public system context

These names are available through the leading-dot system object, such as \`.Len(value)\`. Uppercase names are also used by explicit system/operator forms where applicable.

${table(["Name", "Kind", "Capability groups", "Implementation description"], publicRows)}

## Built-in receiver methods

Method lookup is case-flexible at the language boundary. The table uses the registry keys and includes shared iterable methods. Read the [methods guide](../eval/methods-guide.md) for mutability rules, callback shapes, signatures, and examples.

${table(["Receiver", "Registered methods"], methodRows)}

Every built-in receiver also supports \`CheckTraits\` / \`CHECKTRAITS\`.

## Semantic types

${table(["Type", "Native type", "Aliases", "Default traits"], typeRows)}

## Semantic traits

${table(["Trait", "Implies", "Description"], traitRows)}

## Script capability groups

Imported scripts can add or withhold named groups. Permission-like names are interpreted separately from callable names by the host policy.

${table(["Group", "Members"], groupRows)}

Default script policy includes all functions and the \`IMPORTS\` permission. Recognized permission names are ${runtimeDefaults.scriptPermissionNames.map((name) => `\`${name}\``).join(", ")}. The default loop limit is ${runtimeDefaults.defaultLoopMax.toLocaleString()} iterations and the default constructor capture mode is \`${runtimeDefaults.defaultConstructorCaptureMode}\`.

## Internal IR registry

This is the evaluator dispatch surface, not a promise that every name should be called directly from RiX source. Syntax normally lowers to these functions.

${table(["IR function", "Dispatch", "Implementation description"], internalRows)}
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
console.log(`Generated ${outputPath}`);
