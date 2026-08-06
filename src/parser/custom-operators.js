import { tokenize } from "./tokenizer.js";

const BUILTIN_PRECEDENCE_BANDS = Object.freeze({
  assignment: 10,
  pipe: 20,
  arrow: 25,
  logical_or: 30,
  logical_and: 40,
  condition: 45,
  equality: 50,
  comparison: 60,
  interval: 70,
  conversion: 75,
  additive: 80,
  multiplicative: 90,
  power: 100,
  calculus: 115,
  postfix: 120,
  property: 130,
});

const BAND_ALIASES = Object.freeze({
  addition: "additive",
  multiplication: "multiplicative",
  exponentiation: "power",
  exponential: "power",
  logicalor: "logical_or",
  logicaland: "logical_and",
});

const FIXITIES = new Set(["infix", "prefix", "postfix"]);
const ASSOCIATIVITIES = new Set(["left", "right", "none"]);
const RELATIONS = new Set(["above", "below"]);
const OPERATOR_TOKEN = /^:<([^<>:\s]+)>:$/u;
const WORD_TOKEN = /^:([\p{L}_][\p{L}\p{N}_-]*)$/u;
const TARGET_TOKEN = /^(?:[\p{L}_][\p{L}\p{N}_]*|\.[\p{L}_][\p{L}\p{N}_]*\.[\p{L}_][\p{L}\p{N}_]*)$/u;

function normalizedBand(name) {
  const normalized = String(name).toLowerCase().replace(/-/g, "_");
  return BAND_ALIASES[normalized] || normalized;
}

function relativePrecedence(band, relation) {
  const value = BUILTIN_PRECEDENCE_BANDS[band];
  if (value === undefined) throw new Error(`Unknown precedence band ':${band}'`);
  // Juxtaposition, implicit application, and unary signs occupy internal Pratt
  // levels even though they are not public declaration bands.
  const boundaries = Array.from(new Set([
    ...Object.values(BUILTIN_PRECEDENCE_BANDS),
    95,
    97,
    99,
  ])).sort((left, right) => left - right);
  const index = boundaries.indexOf(value);
  if (relation === "above") {
    const next = boundaries[index + 1];
    if (next === undefined) throw new Error(`Cannot place an operator above ':${band}'`);
    return (value + next) / 2;
  }

  const previous = boundaries[index - 1];
  if (previous === undefined) throw new Error(`Cannot place an operator below ':${band}'`);
  return (previous + value) / 2;
}

function declarationError(label, line, message) {
  throw new Error(`${label}:${line}: ${message}`);
}

function normalizedIdentifier(name) {
  const firstLetter = Array.from(String(name)).find((character) => /\p{L}/u.test(character));
  if (!firstLetter) return name;
  return firstLetter === firstLetter.toUpperCase()
    ? String(name).toUpperCase()
    : String(name).toLowerCase();
}

function parseTarget(rawTarget, owner, label, line) {
  if (!TARGET_TOKEN.test(rawTarget)) {
    declarationError(label, line, `Invalid operator target '${rawTarget}'`);
  }

  if (rawTarget.startsWith(".")) {
    const [, mount, method] = rawTarget.split(".");
    return {
      kind: "system-method",
      mount: normalizedIdentifier(mount),
      method: normalizedIdentifier(method),
    };
  }

  if (owner?.pluginId) {
    return {
      kind: "plugin-method",
      pluginId: owner.pluginId,
      mount: owner.mount || null,
      method: normalizedIdentifier(rawTarget),
    };
  }

  return { kind: "function", name: normalizedIdentifier(rawTarget) };
}

export function parseOperatorDeclarationLine(source, options = {}) {
  const label = options.label || "OPS";
  const line = options.line || 1;
  const fields = String(source).trim().split(/\s+/).filter(Boolean);
  let symbol = null;
  let target = null;
  let fixity = null;
  let associativity = null;
  let relation = null;
  let band = null;

  for (const field of fields) {
    const operatorMatch = field.match(OPERATOR_TOKEN);
    if (operatorMatch) {
      if (symbol !== null) declarationError(label, line, "Operator declaration has more than one :<...>: symbol");
      symbol = operatorMatch[1];
      continue;
    }

    const wordMatch = field.match(WORD_TOKEN);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      if (FIXITIES.has(word)) {
        if (fixity !== null) declarationError(label, line, "Operator declaration has more than one fixity");
        fixity = word;
      } else if (ASSOCIATIVITIES.has(word)) {
        if (associativity !== null) declarationError(label, line, "Operator declaration has more than one associativity");
        associativity = word;
      } else if (RELATIONS.has(word)) {
        if (relation !== null) declarationError(label, line, "Operator declaration has more than one precedence relation");
        relation = word;
      } else {
        const candidate = normalizedBand(word);
        if (!Object.hasOwn(BUILTIN_PRECEDENCE_BANDS, candidate)) {
          declarationError(label, line, `Unknown operator modifier '${field}'`);
        }
        if (band !== null) declarationError(label, line, "Operator declaration has more than one precedence band");
        band = candidate;
      }
      continue;
    }

    if (target !== null) declarationError(label, line, `Unexpected operator declaration field '${field}'`);
    target = field;
  }

  if (symbol === null) declarationError(label, line, "Operator declaration requires one :<...>: symbol");
  if (target === null) declarationError(label, line, "Operator declaration requires one function or method target");
  if (fixity === null) declarationError(label, line, "Operator declaration requires a fixity such as :infix");
  if (fixity !== "infix") declarationError(label, line, `Custom ${fixity} operators are not implemented yet`);
  if (band === null) declarationError(label, line, "Operator declaration requires a named precedence band");
  if (associativity === null) declarationError(label, line, "Operator declaration requires :left, :right, or :none");

  const precedence = relation
    ? relativePrecedence(band, relation)
    : BUILTIN_PRECEDENCE_BANDS[band];
  return Object.freeze({
    symbol,
    spelling: `:<${symbol}>:`,
    target: Object.freeze(parseTarget(target, options.owner, label, line)),
    fixity,
    associativity,
    precedence,
    precedenceBand: band,
    precedenceRelation: relation,
    source: label,
    line,
  });
}

function isOpsComment(token) {
  return token?.type === "String"
    && token.kind === "comment"
    && /^\s*##ops##/i.test(token.original || "");
}

export function extractOperatorDeclarations(tokens, options = {}) {
  const definitions = new Map();
  let reachedCode = false;

  for (const token of tokens || []) {
    if (token.type === "End") break;
    if (token.type !== "String" || token.kind !== "comment") {
      reachedCode = true;
      continue;
    }
    if (!isOpsComment(token)) continue;
    if (reachedCode) {
      throw new Error(`${options.label || "source"}: ##OPS## blocks must appear before executable code`);
    }

    const bodyStart = token.pos?.[1] || 0;
    const firstLine = options.source
      ? options.source.slice(0, bodyStart).split("\n").length
      : 1;
    const lines = String(token.value || "").replace(/\r/g, "").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index].trim();
      if (!text) continue;
      const definition = parseOperatorDeclarationLine(text, {
        owner: options.owner,
        label: options.label || "OPS",
        line: firstLine + index,
      });
      if (definitions.has(definition.symbol)) {
        declarationError(options.label || "OPS", firstLine + index, `Duplicate operator '${definition.spelling}'`);
      }
      definitions.set(definition.symbol, definition);
    }
  }

  return definitions;
}

export function extractOperatorDeclarationsFromSource(source, options = {}) {
  return extractOperatorDeclarations(tokenize(source), {
    ...options,
    source,
  });
}

export function mergeOperatorDefinitions(...collections) {
  const merged = new Map();
  for (const collection of collections) {
    if (!collection) continue;
    const entries = collection instanceof Map ? collection : collection.map
      ? collection.map((definition) => [definition.symbol, definition])
      : Object.entries(collection);
    for (const [symbol, definition] of entries) {
      if (merged.has(symbol)) {
        const previous = merged.get(symbol);
        if (JSON.stringify(previous) !== JSON.stringify(definition)) {
          throw new Error(`Conflicting definitions for custom operator ':<${symbol}>:'`);
        }
        continue;
      }
      merged.set(symbol, definition);
    }
  }
  return merged;
}

export { BUILTIN_PRECEDENCE_BANDS };
