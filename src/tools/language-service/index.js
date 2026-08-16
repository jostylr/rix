import { analyzeRix, RIX_LINT_RULES } from "../../eval/lint.js";
import { parse, RixParseError } from "../../parser/parser.js";
import { tokenize } from "../../parser/tokenizer.js";
import { formatRix, checkRixFormat } from "./formatter.js";
import {
    lineStarts,
    nodeRange,
    offsetToPosition,
    offsetsToLspRange,
    positionToOffset,
    tokenRange,
} from "./positions.js";

export { formatRix, checkRixFormat } from "./formatter.js";
export {
    lineStarts,
    nodeRange,
    offsetToPosition,
    offsetsToLspRange,
    positionToOffset,
    tokenRange,
} from "./positions.js";

export const RIX_LANGUAGE_SERVICE_VERSION = 1;

export const RIX_SEMANTIC_TOKEN_TYPES = Object.freeze([
    "namespace", "type", "class", "enum", "interface", "struct", "typeParameter",
    "parameter", "variable", "property", "enumMember", "event", "function", "method",
    "macro", "keyword", "modifier", "comment", "string", "number", "regexp", "operator",
]);
export const RIX_SEMANTIC_TOKEN_MODIFIERS = Object.freeze([
    "declaration", "definition", "readonly", "static", "deprecated", "abstract",
    "async", "modification", "documentation", "defaultLibrary",
]);

const ASSIGNMENTS = new Set(["=", ":=", "~=", "::=", "~~="]);
const CHECK_MARKERS = new Map([
    ["##@", "predicate"],
    ["##:", "structural"],
]);
const BRACE_HELP = Object.freeze({
    "{=": "Map container",
    "{?": "Case/conditional container",
    "{;": "Lexical code block and capture boundary",
    "{|": "Set container",
    "{:": "Tuple or shaped container",
    "{@": "Loop container",
    "{!": "Mutation container",
    "{#": "Symbolic constraint container",
    "{$": "Async scope",
    "{$$": "Concurrent async scope",
});

const STATIC_SYSTEM_CATALOG = Object.freeze([
    ["ABS", "Absolute value"], ["ALL", "Require every item to match"], ["ANY", "Find a matching item"],
    ["ARRAY", "Create an array"], ["DEBUG", "Emit a debug diagnostic"], ["DUMP", "Emit a formatted value"],
    ["ERROR", "Abort with an error diagnostic"], ["FILTER", "Filter a collection"], ["FLOAT", "Convert to a floating value"],
    ["FORMULASHEET", "Create a reactive formula sheet"], ["INFO", "Emit an information diagnostic"],
    ["LEN", "Return collection length"], ["LOG", "Emit a log diagnostic"], ["MAP", "Create or transform a map"],
    ["OUT", "Declare a host-mediated output artifact"], ["REDUCE", "Reduce a collection"],
    ["SIMPLIFY", "Simplify a symbolic value"], ["STOP", "Stop evaluation intentionally"],
    ["TEST", "Define or run a test group"], ["TESTERROR", "Test an expected error"],
    ["TESTSTOP", "Test an expected stop"], ["TRACE", "Emit a structured trace diagnostic"],
    ["TYPEOF", "Return the runtime kind of a value"], ["WARN", "Emit a warning diagnostic"],
].map(([name, documentation]) => ({ name, kind: "function", documentation, source: "rix-core" })));

function walkAst(node, callback, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    callback(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === "pos" || key === "original" || key === "systemInfo") continue;
        if (Array.isArray(value)) for (const child of value) walkAst(child, callback, seen);
        else walkAst(value, callback, seen);
    }
}

function valueToken(token) {
    return token && token.type !== "End" && !(token.type === "String" && token.kind === "comment");
}

function usefulTokens(source) {
    return tokenize(source).filter(valueToken);
}

function identifierName(token) {
    return token?.value == null ? null : String(token.value);
}

function isIdentifier(token) {
    return token?.type === "Identifier" || token?.type === "OuterIdentifier";
}

function matchingClose(tokens, openIndex, open = "(", close = ")") {
    let depth = 0;
    for (let index = openIndex; index < tokens.length; index++) {
        if (tokens[index].value === open) depth++;
        else if (tokens[index].value === close && --depth === 0) return index;
    }
    return -1;
}

function declarationKind(tokens, index) {
    const token = tokens[index];
    if (!isIdentifier(token)) return null;
    if (isPluginImportSelector(tokens, index)) return "function";
    if (tokens[index + 1]?.value === "(") {
        const close = matchingClose(tokens, index + 1);
        if (close > 0 && ["->", "=>", "^=>"].includes(tokens[close + 1]?.value)) return "function";
    }
    if (ASSIGNMENTS.has(tokens[index + 1]?.value)) {
        if (tokens[index - 1]?.value === "$$") return "reactive";
        return token.kind === "System" ? "function" : "variable";
    }
    return null;
}

function isPluginImportSelector(tokens, index) {
    if (tokens[index - 1]?.value !== ":") return false;
    for (let cursor = index - 2; cursor >= 0; cursor--) {
        if (tokens[cursor]?.value === "]") return false;
        if (tokens[cursor]?.value !== "[") continue;
        return tokens[cursor - 2]?.value === "." && tokens[cursor - 1]?.type === "Identifier";
    }
    return false;
}

function buildSymbolIndex(source, tokens) {
    const declarations = [];
    const occurrences = [];
    const declarationOffsets = new Set();

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!isIdentifier(token)) continue;
        const range = tokenRange(token);
        const kind = declarationKind(tokens, index);
        if (kind) {
            const pluginImport = isPluginImportSelector(tokens, index);
            const symbol = {
                name: identifierName(token),
                kind,
                range,
                selectionRange: range,
                detail: pluginImport
                    ? "lexically imported plugin function"
                    : kind === "reactive" ? "reactive cell" : `RiX ${kind}`,
            };
            declarations.push(symbol);
            declarationOffsets.add(range.start);

            if (kind === "function" && tokens[index + 1]?.value === "(") {
                const close = matchingClose(tokens, index + 1);
                for (let parameterIndex = index + 2; parameterIndex < close; parameterIndex++) {
                    const parameter = tokens[parameterIndex];
                    if (parameter?.type === "Identifier" && parameter.kind === "User") {
                        const parameterRange = tokenRange(parameter);
                        declarations.push({
                            name: identifierName(parameter),
                            kind: "parameter",
                            range: parameterRange,
                            selectionRange: parameterRange,
                            detail: `parameter of ${identifierName(token)}`,
                            containerName: identifierName(token),
                        });
                        declarationOffsets.add(parameterRange.start);
                    }
                }
            }
        }
    }

    const declarationByName = new Map();
    for (const declaration of declarations) {
        if (!declarationByName.has(declaration.name)) declarationByName.set(declaration.name, []);
        declarationByName.get(declaration.name).push(declaration);
    }

    for (const token of tokens) {
        if (!isIdentifier(token)) continue;
        const range = tokenRange(token);
        const name = identifierName(token);
        occurrences.push({
            name,
            range,
            declaration: declarationOffsets.has(range.start),
            outer: token.type === "OuterIdentifier",
            system: token.kind === "System" || token.kind === "SystemFunction",
            definitions: declarationByName.get(name) || [],
        });
    }
    return { declarations, occurrences, declarationByName };
}

function discoverChecks(source, tokens) {
    const checks = [];
    const starts = lineStarts(source);
    for (const token of tokens) {
        const checkKind = CHECK_MARKERS.get(token.value);
        if (!checkKind) continue;
        const marker = tokenRange(token);
        const position = offsetToPosition(source, marker.start, starts);
        const lineStart = starts[position.line];
        const nextLine = starts[position.line + 1] ?? source.length;
        const lineEnd = source.charCodeAt(nextLine - 1) === 10 ? nextLine - 1 : nextLine;
        checks.push({
            id: `${checkKind}:${position.line + 1}:${marker.start - lineStart}`,
            checkKind,
            label: `${checkKind} check at line ${position.line + 1}`,
            range: { start: lineStart, end: lineEnd },
            markerRange: marker,
            source: source.slice(lineStart, lineEnd).trim(),
        });
    }
    return checks;
}

function discoverDiagnosticTaps(source, tokens) {
    const taps = [];
    const starts = lineStarts(source);
    for (const token of tokens) {
        if (token.value !== "##!") continue;
        const marker = tokenRange(token);
        const position = offsetToPosition(source, marker.start, starts);
        const lineStart = starts[position.line];
        const nextLine = starts[position.line + 1] ?? source.length;
        const lineEnd = source.charCodeAt(nextLine - 1) === 10 ? nextLine - 1 : nextLine;
        taps.push({
            id: `diagnostic:${position.line + 1}:${marker.start - lineStart}`,
            kind: "diagnostic",
            label: `diagnostic tap at line ${position.line + 1}`,
            range: { start: lineStart, end: lineEnd },
            markerRange: marker,
            source: source.slice(lineStart, lineEnd).trim(),
        });
    }
    return taps;
}

function discoverFolds(source) {
    const tokens = tokenize(source).filter((token) => token.type !== "End");
    const stack = [];
    const folds = [];
    const starts = lineStarts(source);
    for (const token of tokens) {
        if (token.type === "String" && token.kind === "comment" && rawToken(source, token).startsWith("/*")) {
            const range = tokenRange(token);
            if (offsetToPosition(source, range.start, starts).line < offsetToPosition(source, range.end, starts).line) {
                folds.push({ range, kind: "comment" });
            }
            continue;
        }
        if (["(", "[", "{", "{=", "{?", "{;", "{|", "{:", "{@", "{!", "{#", "{$", "{$$"].includes(token.value)) {
            stack.push(token);
        } else if ([")", "]", "}"].includes(token.value) && stack.length) {
            const open = stack.pop();
            const range = { start: tokenRange(open).start, end: tokenRange(token).end };
            if (offsetToPosition(source, range.start, starts).line < offsetToPosition(source, range.end, starts).line) {
                folds.push({ range, kind: "region" });
            }
        }
    }
    return folds;
}

function rawToken(source, token) {
    return source.slice(token.pos[1], token.pos[2]);
}

function diagnosticRange(source, diagnostic, tokens) {
    const offset = Math.max(0, diagnostic.offset || 0);
    const fixEnd = diagnostic.fix?.end;
    if (Number.isInteger(fixEnd) && fixEnd > offset) return { start: offset, end: fixEnd };
    const token = tokens.find((candidate) => {
        const range = tokenRange(candidate);
        return range.start <= offset && range.end >= offset;
    });
    return token ? tokenRange(token) : { start: offset, end: Math.min(source.length, offset + 1) };
}

function normalizeParseDiagnostic(error, source, uri, version) {
    const parsedOffset = Number(String(error?.message || "").match(/position (\d+)/u)?.[1]);
    const start = Number.isInteger(error?.offset) ? error.offset
        : Number.isInteger(parsedOffset) ? parsedOffset : 0;
    const end = Number.isInteger(error?.endOffset) && error.endOffset > start
        ? error.endOffset : Math.min(source.length, start + 1);
    return {
        uri,
        version,
        range: { start, end },
        severity: "error",
        code: error?.code || "RXP1000",
        source: "rix-parser",
        message: error?.reason || error?.message || "RiX parse error",
        hint: null,
        related: [],
        fixes: [],
    };
}

function normalizeLintDiagnostic(diagnostic, source, uri, version, tokens) {
    const range = diagnosticRange(source, diagnostic, tokens);
    const fixes = diagnostic.fix?.safe === true ? [{
        title: diagnostic.fix.description || `Apply ${diagnostic.code} fix`,
        edits: [{
            range: { start: diagnostic.fix.start, end: diagnostic.fix.end },
            text: diagnostic.fix.replacement,
        }],
    }] : [];
    return {
        uri,
        version,
        range,
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: "rix-lint",
        message: diagnostic.message,
        hint: diagnostic.hint || null,
        related: [],
        fixes,
    };
}

function semanticTokenType(token, occurrence, declarations) {
    if (token.type === "Number") return ["number", []];
    if (token.type === "RegexLiteral") return ["regexp", []];
    if (token.type === "String") {
        if (token.kind === "comment") return ["comment", []];
        return ["string", []];
    }
    if (token.type === "CustomOperator" || token.type === "Symbol") return ["operator", []];
    if (!isIdentifier(token)) return null;
    const declaration = declarations.find((item) => item.range.start === tokenRange(token).start);
    const modifiers = declaration ? ["declaration"] : [];
    if (token.kind === "SystemFunction") return ["function", [...modifiers, "defaultLibrary"]];
    if (token.kind === "System") return [declaration?.kind === "function" ? "function" : "type", modifiers];
    if (declaration?.kind === "function") return ["function", modifiers];
    if (declaration?.kind === "parameter") return ["parameter", modifiers];
    if (occurrence?.outer) return ["variable", [...modifiers, "readonly"]];
    return ["variable", modifiers];
}

function buildSemanticTokens(tokens, index) {
    const byStart = new Map(index.occurrences.map((item) => [item.range.start, item]));
    const result = [];
    for (const token of tokens) {
        const range = tokenRange(token);
        const classified = semanticTokenType(token, byStart.get(range.start), index.declarations);
        if (!classified || range.end <= range.start) continue;
        result.push({ range, type: classified[0], modifiers: classified[1] });
    }
    return result;
}

function catalogEntries(symbols) {
    const local = symbols.declarations.map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        documentation: symbol.detail,
        source: "document",
        range: symbol.range,
    }));
    return [...local, ...STATIC_SYSTEM_CATALOG];
}

export function analyzeRixDocument(source, options = {}) {
    const text = String(source);
    const uri = options.uri || "untitled:rix";
    const version = Number.isInteger(options.version) ? options.version : 0;
    let tokens = [];
    let ast = null;
    let parseError = null;
    try {
        tokens = usefulTokens(text);
        ast = parse(text, options.systemLookup, {
            file: uri,
            operatorDefinitions: options.operatorDefinitions,
        });
    } catch (error) {
        parseError = error;
        try { tokens = usefulTokens(text); } catch { tokens = []; }
    }

    const symbols = buildSymbolIndex(text, tokens);
    const diagnostics = [];
    let scopes = [];
    if (parseError) {
        diagnostics.push(normalizeParseDiagnostic(parseError, text, uri, version));
    } else {
        const analysis = analyzeRix(text, {
            ast,
            file: uri,
            level: options.lint?.level || options.lintLevel || "standard",
            profiles: options.lint?.profiles || options.lintProfiles || "default",
            operatorDefinitions: options.operatorDefinitions,
        });
        diagnostics.push(...analysis.diagnostics.map((diagnostic) =>
            normalizeLintDiagnostic(diagnostic, text, uri, version, tokens)));
        scopes = analysis.scopes;
    }

    return {
        protocol: `rix.language-service/${RIX_LANGUAGE_SERVICE_VERSION}`,
        uri,
        version,
        source: text,
        ast,
        parseError,
        tokens,
        diagnostics,
        scopes,
        symbols: symbols.declarations,
        occurrences: symbols.occurrences,
        checks: discoverChecks(text, tokens),
        diagnosticTaps: discoverDiagnosticTaps(text, tokens),
        folds: discoverFolds(text),
        semanticTokens: buildSemanticTokens(tokens, symbols),
        catalog: catalogEntries(symbols),
    };
}

export function completionAt(analysis, offset) {
    const before = analysis.source.slice(0, offset);
    const match = before.match(/(?:@_)?[\p{L}_][\p{L}\p{N}_]*$/u);
    const query = match?.[0] || "";
    const bareQuery = query.replace(/^@_/u, "");
    const from = offset - query.length;
    const systemOnly = query.startsWith("@_");
    const seen = new Set();
    const items = [];
    for (const entry of analysis.catalog) {
        if (systemOnly && entry.source === "document") continue;
        const label = systemOnly ? `@_${entry.name}` : entry.name;
        if (!entry.name.toLowerCase().startsWith(bareQuery.toLowerCase()) || seen.has(label)) continue;
        seen.add(label);
        items.push({
            label,
            insertText: label,
            kind: entry.kind,
            detail: entry.source,
            documentation: entry.documentation,
            range: { start: from, end: offset },
        });
    }
    for (const [label, documentation] of Object.entries(BRACE_HELP)) {
        if (query && !label.startsWith(query)) continue;
        items.push({ label, insertText: `${label}  }`, kind: "snippet", detail: "RiX container", documentation, range: { start: from, end: offset } });
    }
    return items.sort((left, right) => left.label.localeCompare(right.label));
}

export function occurrenceAt(analysis, offset) {
    return analysis.occurrences.find(({ range }) => range.start <= offset && offset <= range.end) || null;
}

export function definitionsAt(analysis, offset) {
    return occurrenceAt(analysis, offset)?.definitions || [];
}

export function referencesAt(analysis, offset, options = {}) {
    const occurrence = occurrenceAt(analysis, offset);
    if (!occurrence) return [];
    return analysis.occurrences.filter((candidate) => candidate.name === occurrence.name
        && (options.includeDeclaration !== false || !candidate.declaration));
}

export function renameAt(analysis, offset, newName) {
    const occurrence = occurrenceAt(analysis, offset);
    if (!occurrence) throw new Error("No RiX identifier at the requested position.");
    if (occurrence.system) throw new Error("System capabilities cannot be renamed.");
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(newName)) throw new Error("The new name is not a valid RiX identifier.");
    return referencesAt(analysis, offset).map(({ range }) => ({ range, text: newName }));
}

export function hoverAt(analysis, offset) {
    const occurrence = occurrenceAt(analysis, offset);
    if (occurrence) {
        const definition = occurrence.definitions[0];
        const catalog = analysis.catalog.find((entry) => entry.name === occurrence.name);
        return {
            range: occurrence.range,
            markdown: `**${occurrence.name}** — ${definition?.detail || catalog?.documentation || (occurrence.system ? "RiX system capability" : "RiX binding")}`,
        };
    }
    const token = analysis.tokens.find((candidate) => {
        const range = tokenRange(candidate);
        return range.start <= offset && offset <= range.end;
    });
    const documentation = token && BRACE_HELP[token.value];
    return documentation ? { range: tokenRange(token), markdown: `**${token.value}** — ${documentation}` } : null;
}

export function codeActionsForRange(analysis, range) {
    return analysis.diagnostics.flatMap((diagnostic) => {
        if (diagnostic.range.end < range.start || diagnostic.range.start > range.end) return [];
        return diagnostic.fixes.map((fix) => ({
            title: fix.title,
            kind: "quickfix",
            diagnostics: [diagnostic.code],
            edits: fix.edits,
        }));
    });
}

export function createRixDocumentStore(options = {}) {
    const documents = new Map();
    return {
        open(uri, version, source, documentOptions = {}) {
            const analysis = analyzeRixDocument(source, { ...options, ...documentOptions, uri, version });
            documents.set(uri, analysis);
            return analysis;
        },
        update(uri, version, source, documentOptions = {}) {
            return this.open(uri, version, source, documentOptions);
        },
        close(uri) { documents.delete(uri); },
        get(uri) { return documents.get(uri) || null; },
        all() { return [...documents.values()]; },
    };
}

export function lintRuleCatalog() {
    return Object.entries(RIX_LINT_RULES).map(([code, rule]) => ({ code, ...rule }));
}

export function astNodes(analysis) {
    const nodes = [];
    walkAst(analysis.ast, (node) => nodes.push({ type: node.type, range: nodeRange(node) }));
    return nodes;
}
