#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createDefaultRegistry,
  createDefaultSystemContext,
  parseAndEvaluate,
} from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { Context } from "../../src/runtime/context.js";

/**
 * Documentation fences are opt-in, except that a fence containing an explicit
 * ##@ assertion or standalone ## output marker is runnable automatically.
 * Most RiX fences describe syntax, show an incomplete fragment, or document
 * an expected error.
 *
 * Supported fence attributes:
 *   {.rix exec=true id=name session=chapter output=true}
 *   {.rix parse=true}
 *   expect-error="text"
 *
 * RiX-level documentation conventions:
 *   ##SETUP## ... ##SETUP## hidden setup, executed but not displayed
 *   expression ##@ == val  assertion applied to that expression's value
 *   ##                     display the most recent result
 *   ### ...                ordinary unchecked comment
 */

function parseFenceInfo(info) {
  let text = info.trim();
  if (text.startsWith("{") && text.endsWith("}")) text = text.slice(1, -1).trim();

  const attrs = {};
  const classes = [];
  const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  for (const raw of text.match(re) || []) {
    if (raw.startsWith(".")) {
      classes.push(raw.slice(1));
      continue;
    }
    const equals = raw.indexOf("=");
    if (equals === -1) {
      if (raw) attrs.language = raw;
      continue;
    }
    const key = raw.slice(0, equals);
    let value = raw.slice(equals + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    attrs[key] = value;
  }

  if (text.startsWith("rix") && !text.startsWith("rix=")) {
    classes.push("rix");
    attrs.language = "rix";
  }
  if (classes.includes("rix")) attrs.language = "rix";
  return { attrs, classes };
}

function boolAttr(value) {
  return value === true || value === "true" || value === "yes" || value === "1";
}

function sourceKey(file, line, source, id) {
  if (id) return id;
  return createHash("sha256").update(`${file}:${line}\n${source}`).digest("hex");
}

export function extractFences(source, file = "<memory>") {
  const lines = source.split("\n");
  const fences = [];
  let open = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opening = line.match(/^\s*```(.*)$/);
    if (!open && opening) {
      open = { info: opening[1], startLine: index + 1, body: [] };
      continue;
    }
    if (open && /^\s*```\s*$/.test(line)) {
      const parsed = parseFenceInfo(open.info);
      if (parsed.attrs.language === "rix") {
        const body = open.body.join("\n");
        const id = parsed.attrs.id || null;
        fences.push({
          file,
          line: open.startLine,
          source: body,
          info: open.info,
          attrs: parsed.attrs,
          id,
          key: sourceKey(file, open.startLine, body, id),
        });
      }
      open = null;
      continue;
    }
    if (open) open.body.push(line);
  }
  return fences;
}

function splitHiddenSetup(source) {
  const setup = [];
  let visible = source.replace(/##SETUP##([\s\S]*?)##SETUP##/gi, (_match, body) => {
    setup.push(body);
    return "";
  });
  // Keep the old delimiter working while documentation migrates to the
  // explicit SETUP tag.
  visible = visible.replace(/\/\*{3}([\s\S]*?)\*{3}\//g, (_match, body) => {
    setup.push(body);
    return "";
  });
  return { setup: setup.join("\n"), visible };
}

function isBlank(value) {
  return value.trim().length === 0;
}

function evaluateSource(source, runtime) {
  return parseAndEvaluate(source, {
    context: runtime.context,
    registry: runtime.registry,
    systemContext: runtime.systemContext,
    file: runtime.file,
  });
}

function parseSource(source) {
  return parse(tokenize(source));
}

function displayValue(value) {
  return formatValue(value).trim();
}

function evaluateAssertion(expression, value, runtime) {
  if (isBlank(expression)) throw new Error("empty ##@ assertion");
  const actualName = "__rix_doc_actual";
  runtime.context.push({ [actualName]: value }, { readThrough: true });
  try {
    // ##@ is documentation metadata, so make `##@ == 8` into a normal RiX
    // expression without adding ##@ to the language grammar. The temporary
    // binding also lets assertions use pipelines such as `##@ |> isSorted`.
    return evaluateSource(`${actualName} ${expression.trim()}`, runtime);
  } finally {
    runtime.context.pop();
  }
}

function processAssertions(source, runtime) {
  const lines = source.split("\n");
  const pending = [];
  const outputs = [];
  let lastValue;
  let assertionCount = 0;

  const flush = () => {
    const chunk = pending.join("\n");
    pending.length = 0;
    if (isBlank(chunk)) return undefined;
    lastValue = evaluateSource(chunk, runtime);
    return lastValue;
  };

  for (const line of lines) {
    const assertion = line.match(/^(.*?)\s+##@\s*(.*?)\s*$/)
      || line.match(/^\s*##@\s*(.*?)\s*$/);
    if (assertion) {
      const code = assertion.length === 2 ? "" : assertion[1];
      const expected = assertion.length === 2 ? assertion[1] : assertion[2];
      if (!isBlank(code)) pending.push(code);
      const value = flush();
      assertionCount += 1;
      const predicate = evaluateAssertion(expected, value, runtime);
      if (predicate === null || predicate === undefined) {
        throw new Error(`assertion ${JSON.stringify(expected.trim())} returned null for ${JSON.stringify(displayValue(value))}`);
      }
      continue;
    }

    if (/^\s*##\s*$/.test(line)) {
      const value = flush();
      outputs.push(displayValue(value === undefined ? lastValue : value));
      continue;
    }

    pending.push(line);
  }

  const value = flush();
  return { value: value === undefined ? lastValue : value, outputs, assertionCount };
}

function shouldRun(fence) {
  if (fence.attrs.exec !== undefined) return boolAttr(fence.attrs.exec);
  return boolAttr(fence.attrs.parse) || /##@|^\s*##\s*$/m.test(fence.source);
}

function createRuntime(file, sessionRuntime, session) {
  if (session && sessionRuntime.has(session)) return sessionRuntime.get(session);
  const runtime = {
    context: new Context(),
    registry: createDefaultRegistry(),
    systemContext: createDefaultSystemContext(),
    file,
  };
  if (session) sessionRuntime.set(session, runtime);
  return runtime;
}

export function runFence(fence, sessionRuntime = new Map()) {
  const attrs = fence.attrs;
  const { setup, visible } = splitHiddenSetup(fence.source);
  const runtime = createRuntime(fence.file, sessionRuntime, attrs.session);
  const result = {
    ...fence,
    visibleSource: visible,
    setupSource: setup,
    status: "pass",
    output: "",
    assertions: 0,
  };

  try {
    if (!isBlank(setup)) evaluateSource(setup, runtime);
    if (boolAttr(attrs.parse) && !boolAttr(attrs.exec)) {
      parseSource(visible);
      return result;
    }

    const processed = processAssertions(visible, runtime);
    result.assertions = processed.assertionCount;
    if (boolAttr(attrs.output) || processed.outputs.length > 0) {
      result.output = processed.outputs.length > 0
        ? processed.outputs.join("\n")
        : displayValue(processed.value);
    }

    if (attrs["expect-error"] !== undefined) {
      result.status = "fail";
      result.error = "expected an error, but evaluation completed";
    }
  } catch (error) {
    const message = String(error?.message || error);
    const expectedError = attrs["expect-error"];
    if (expectedError !== undefined && message.includes(expectedError)) {
      result.status = "pass";
      result.error = message;
    } else {
      result.status = "fail";
      result.error = message;
    }
  }
  return result;
}

export function runDocuments(documents) {
  const results = [];
  for (const document of documents) {
    const sessions = new Map();
    for (const fence of extractFences(document.source, document.file)) {
      if (!shouldRun(fence)) continue;
      results.push(runFence(fence, sessions));
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--write");
  const outputPath = outputIndex === -1 ? null : resolve(args[outputIndex + 1]);
  const paths = args.filter((arg, index) => arg !== "--write" && index !== outputIndex + 1);
  const files = paths.length > 0 ? paths : ["documentation", "development-instructions.md"];
  const documents = [];

  const collect = (path) => {
    const stat = statSync(path);
    if (stat.isFile() && (path.endsWith(".md") || path.endsWith(".qmd"))) {
      documents.push({ file: path, source: readFileSync(path, "utf8") });
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      collect(resolve(path, entry.name));
    }
  };
  // Directory walking is kept local to the CLI; tests use runDocuments().
  for (const path of files) collect(path);

  const results = runDocuments(documents);
  if (outputPath) writeFileSync(outputPath, JSON.stringify({ results }, null, 2));
  const failures = results.filter((result) => result.status === "fail");
  console.log(`Checked ${results.length} runnable RiX documentation block(s): ${results.length - failures.length} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`FAIL ${failure.file}:${failure.line}${failure.id ? ` [${failure.id}]` : ""}: ${failure.error}`);
  }
  process.exitCode = failures.length > 0 ? 1 : 0;
}

if (import.meta.main) main();
