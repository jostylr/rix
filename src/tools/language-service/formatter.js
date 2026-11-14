import { parse, scanIntervalRun } from "../../parser/parser.js";
import { tokenize } from "../../parser/tokenizer.js";

const PIPE_OPERATORS = new Set([
    "|>", "|>>", "|>?", "|><", "|<>", "|>:" , "|:>", "|>&&", "|>||",
    "|>_", "|>!", "|>/", "|>//", "|>/|", "|>#|", "|.", ".|",
]);
const SPACED_OPERATORS = new Set([
    "=", ":=", "~=", "::=", "~~=", "+=", "-=", "*=", "/=", "//=", "%=", "^=", "**=",
    "==", "===", "!=", "<", ">", "<=", ">=", "&&", "||", "AND", "OR",
    "+", "-", "*", "->", "=>", "^=>", "?:", "?_", "??", "?=", "?&", "!?",
    "##@", "##:", "##!", "##_", "##!>",
]);
const TIGHT_OPERATORS = new Set(["/", "//", "%", "^", "**", "..", ".", ":", "@", "'", "~"]);
const OPENERS = new Set(["(", "[", "{", "{=", "{?", "{;", "{|", "{:", "{@", "{!", "{#", "{$", "{$$"]);
const CLOSERS = new Set([")", "]", "}"]);
const EXPANDABLE_OPENERS = new Set(["{=", "{?", "{;", "{|", "{:", "{@", "{!", "{"]);

function rawToken(source, token) {
    return source.slice(token.pos[1], token.pos[2]);
}

function printableToken(source, token) {
    // String token spans begin after their opening delimiter, while `original`
    // retains the complete quote/backtick spelling (and any leading trivia).
    if (token.type === "String") return String(token.original || rawToken(source, token)).trimStart();
    return rawToken(source, token);
}

function isComment(token) {
    return token?.type === "String" && token.kind === "comment";
}

function isUnary(operator, previous) {
    return (operator === "+" || operator === "-" || operator === "!" || operator === "~")
        && (!previous || isOpener(previous) || previous.value === ","
            || previous.value === ";" || SPACED_OPERATORS.has(previous.value)
            || (TIGHT_OPERATORS.has(previous.value) && previous.value !== "'")
            || PIPE_OPERATORS.has(previous.value));
}

const OPERAND_TYPES = new Set(["Number", "ActiveBaseNumber", "Identifier", "OuterIdentifier", "PlaceHolder"]);

const STRING_VALUE = "\u0000string";
const POSTFIX_CHECKS = new Set(["##@", "##:", "##!", "##_", "##!>"]);
const PREFIX_SIGILS = new Set(["@", "@@", "@@@", "$", "$$", "::", ":::"]);
const OPERATOR_CHARACTER = /[!?&|<>=+\-*\/%^~:.@#$]/u;

function isOpener(token) {
    const value = token?.value;
    return token?.type === "Symbol" && typeof value === "string"
        && (OPENERS.has(value) || value.startsWith("{") || value === "~[" || value === "~{");
}

function endsOperand(token) {
    return Boolean(token) && (OPERAND_TYPES.has(token.type) || token.value === STRING_VALUE || CLOSERS.has(token.value));
}

// Whitespace between two operands is meaningful: unspaced adjacency is a tight
// product (`1/2x` is `1/(2x)`), spaced adjacency is ordinary multiplication
// (`1/2 x`), `F(3)` is a call while `F (3)` multiplies, and `x [1]` is not an
// index. Between an operand and the next operand or bracket the source's choice
// (space or none) is kept.
function isAdjacency(previous, token) {
    return endsOperand(previous)
        && (OPERAND_TYPES.has(token.type) || token.value === STRING_VALUE || isOpener(token));
}

function containerCommaCounts(tokens) {
    const counts = new Map();
    const stack = [];
    for (let index = 0; index < tokens.length; index++) {
        const value = tokens[index].value;
        if (isOpener(tokens[index])) stack.push({ index, commas: 0 });
        else if (value === "," && stack.length) stack.at(-1).commas++;
        else if (CLOSERS.has(value) && stack.length) {
            const entry = stack.pop();
            counts.set(entry.index, entry.commas);
        }
    }
    return counts;
}

function readStatements(text, options) {
    const ast = parse(text, options.systemLookup, options.parseOptions || {});
    return Array.isArray(ast) ? ast : [ast];
}

// Source positions and spellings are not meaning; everything else is.
function meaning(node) {
    return JSON.stringify(node, (key, value) => (
        key === "pos" || key === "original" || key === "endsLineAt" || key === "unspacedIntervalOperands"
        || (key === "end" && typeof value === "number") ? undefined : value
    ));
}

function tryMeanings(text, options) {
    try {
        return readStatements(text, options).map(meaning);
    } catch {
        return null;
    }
}

function sameMeanings(left, right) {
    return Boolean(left && right && left.length === right.length && left.every((item, index) => item === right[index]));
}

/**
 * Conservative, token-preserving RiX formatter.
 *
 * The readable profile implements formatter Candidate B. Compact implements
 * Candidate A. Source must parse before it is formatted; callers can therefore
 * safely leave incomplete regions untouched.
 *
 * Formatting never changes what the source means. The result is parsed again
 * and compared with the original; when the whole layout differs, each
 * top-level statement is formatted on its own and any statement whose meaning
 * would change is kept exactly as written.
 */
export function formatRix(source, options = {}) {
    const input = String(source);
    const statements = readStatements(input, options);
    const expected = statements.map(meaning);
    const whole = layoutRix(input, statements, options);
    if (sameMeanings(expected, tryMeanings(whole, options))) return whole;

    const starts = statements.map((node) => node.pos?.[0]).filter(Number.isInteger);
    if (starts.length !== statements.length || starts.some((at, index) => index && at < starts[index - 1])) return input;
    const chunks = starts.map((start, index) => input.slice(index ? start : 0, starts[index + 1] ?? input.length));
    const raw = (chunk) => `${chunk.replace(/^[ \t]*\n/u, "").replace(/^\n+/u, "").trimEnd()}\n`;
    const pieces = chunks.map((chunk) => {
        if (!chunk.trim()) return raw(chunk);
        try {
            const own = readStatements(chunk, options);
            const formatted = layoutRix(chunk, own, options);
            return sameMeanings(own.map(meaning), tryMeanings(formatted, options)) ? formatted : raw(chunk);
        } catch {
            return raw(chunk);
        }
    });
    // A statement can read differently beside its neighbours; restore those.
    for (let attempt = 0; attempt < 3; attempt++) {
        const actual = tryMeanings(pieces.join(""), options);
        if (!actual || actual.length !== expected.length) break;
        const differing = expected.map((item, index) => item !== actual[index] ? index : -1).filter((index) => index >= 0);
        if (differing.length === 0) return pieces.join("");
        differing.forEach((index) => { pieces[index] = raw(chunks[index]); });
    }
    const joined = pieces.join("");
    return sameMeanings(expected, tryMeanings(joined, options)) ? joined : input;
}

function layoutRix(input, ast, options) {
    // Header punctuation has semantic roles (slot products, dual marks, and
    // closing slash), so preserve this parser-delimited region as one unit.
    const headers = new Map();
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (node.type === "SemanticHeader") headers.set(node.pos[1], node.pos[2]);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object") visit(value);
        }
    };
    visit(ast);
    // A quoted string is an operand even when its text spells an operator.
    const tokens = tokenize(input).filter((token) => token.type !== "End")
        .map((token) => token.type === "String" && !isComment(token) ? { ...token, value: STRING_VALUE } : token);
    if (tokens.length === 0) return input;

    // Spacing around an interval colon carries meaning (`1:2 + 3:4` adds two
    // intervals, `1:n+1` adds to an endpoint, `1: 2+3 :4` is a betweenness
    // test), so unspaced runs that hold an unspaced colon keep their spacing.
    const intervalRun = new Set();
    for (let index = 0; index < tokens.length; index++) {
        const run = scanIntervalRun(tokens, index);
        if (run) for (const member of run.tokens) intervalRun.add(member);
    }
    // String spans start after the opening quote, so their leading trivia is
    // read from the original spelling.
    const spacedBefore = (index) => index > 0 && index < tokens.length && (tokens[index].value === STRING_VALUE
        ? /^\s/u.test(String(tokens[index].original || ""))
        : tokens[index].pos[1] > tokens[index].pos[0]);
    const joinedInRun = (index) => intervalRun.has(index) && intervalRun.has(index - 1) && !spacedBefore(index);

    const profile = options.profile === "compact" ? "compact" : "readable";
    const indentWidth = Math.max(1, Math.min(8, Number(options.indentWidth) || 4));
    const printWidth = Math.max(40, Number(options.printWidth) || 100);
    const commaCounts = containerCommaCounts(tokens);
    const stack = [];
    let output = "";
    let lineLength = 0;
    let atLineStart = true;
    let previous = null;
    let previousWasUnary = false;
    let openCheck = false;

    const indent = () => " ".repeat(stack.length * indentWidth);
    const write = (text) => {
        if (!text) return;
        if (atLineStart) {
            const padding = indent();
            output += padding;
            lineLength = padding.length;
            atLineStart = false;
        }
        output += text;
        lineLength += text.length;
    };
    // Two operator spellings written together can read as one longer operator
    // (`! ?` is not `!?`), so keep the source's space between them.
    const keepApart = (index) => {
        if (atLineStart || output.endsWith(" ") || output.endsWith("\n") || !spacedBefore(index)) return;
        const text = printableToken(input, tokens[index]);
        if (OPERATOR_CHARACTER.test(output.at(-1)) && OPERATOR_CHARACTER.test(text[0] || "")) space();
    };
    const space = () => {
        if (!atLineStart && !output.endsWith(" ") && !output.endsWith("\n")) {
            output += " ";
            lineLength++;
        }
    };
    const newline = () => {
        output = output.replace(/[ \t]+$/u, "");
        if (!output.endsWith("\n")) output += "\n";
        lineLength = 0;
        atLineStart = true;
    };

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        const value = token.value;
        const next = tokens[index + 1] || null;

        // A postfix check (`##@`, `##:`, ...) ends its statement at the end of
        // the line, so a line break after one is kept.
        if (openCheck && stack.length === 0 && index > 0 && input.slice(tokens[index - 1].pos[2], token.pos[1]).includes("\n")) {
            newline();
            openCheck = false;
        }
        if (value === ";" && stack.length === 0) openCheck = false;
        if (POSTFIX_CHECKS.has(value) && stack.length === 0) openCheck = true;
        if (!isComment(token)) keepApart(index);
        const headerEnd = headers.get(token.pos[1]);
        if (headerEnd !== undefined) {
            space();
            write(input.slice(token.pos[1], headerEnd));
            while (tokens[index + 1]?.pos[1] < headerEnd) index++;
            space();
            previous = tokens[index];
            previousWasUnary = false;
            continue;
        }

        if (isComment(token)) {
            const raw = String(token.original || rawToken(input, token)).trim();
            if (!atLineStart) newline();
            write(raw);
            newline();
            previous = token;
            continue;
        }

        if (isOpener(token) && (value === "~[" || value === "~{")) {
            // Unit and exact-generator annotations keep their text: the unit
            // name is read verbatim, so `~[m*rad]` must not become `~[m * rad]`.
            let depth = 0;
            let end = index;
            for (; end < tokens.length; end++) {
                if (isOpener(tokens[end])) depth++;
                else if (CLOSERS.has(tokens[end].value) && --depth === 0) break;
            }
            if (end >= tokens.length) end = tokens.length - 1;
            if (isAdjacency(previous, token) && spacedBefore(index)) space();
            write(input.slice(token.pos[1], tokens[end].pos[2]));
            index = end;
            previous = tokens[end];
            previousWasUnary = false;
            continue;
        }

        if (isOpener(token)) {
            if (isAdjacency(previous, token)) {
                if (spacedBefore(index)) space();
            }
            write(rawToken(input, token));
            const estimatedWide = lineLength + input.slice(token.pos[2], tokens.find((item, candidate) => candidate > index && CLOSERS.has(item.value))?.pos?.[1] || token.pos[2]).length > printWidth;
            // The predicate of a postfix check ends at the line break, so it is
            // never spread over several lines.
            const expanded = profile === "readable" && !openCheck && EXPANDABLE_OPENERS.has(value)
                && ((commaCounts.get(index) || 0) >= 2 || estimatedWide);
            stack.push({ value, expanded });
            if (expanded) newline();
            else if (value.length > 1 && next) {
                // A sigil brace is followed by whitespace except in its fused
                // forms (`{#x}`, `{!@ i}`), which keep the source spelling.
                if (spacedBefore(index + 1)) space();
            } else if (value === "{" && next && !CLOSERS.has(next.value)) space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (CLOSERS.has(value)) {
            const group = stack.pop();
            if (group?.expanded) newline();
            else if (group?.value === "{#" && !spacedBefore(index)) { /* `{#x}` is one spelling */ }
            else if (group?.value?.startsWith("{") && previous && previous.value !== "{") space();
            write(value);
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (value === ",") {
            write(",");
            if (stack.at(-1)?.expanded) newline();
            else space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (value === ";") {
            write(";");
            if (stack.length === 0 || stack.at(-1)?.expanded || stack.at(-1)?.value === "{;") newline();
            else space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (PIPE_OPERATORS.has(value)) {
            newline();
            write(" ".repeat(indentWidth));
            write(value);
            space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (value === ":" && token.type === "Symbol" && !intervalRun.has(index)
            && (spacedBefore(index) || spacedBefore(index + 1))) {
            if (spacedBefore(index)) space();
            write(value);
            if (spacedBefore(index + 1)) space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        const tightInRun = joinedInRun(index) && joinedInRun(index + 1);
        if (TIGHT_OPERATORS.has(value) && value !== ":" && !intervalRun.has(index) && !isUnary(value, previous)
            && ((intervalRun.has(index - 1) && spacedBefore(index)) || (intervalRun.has(index + 1) && spacedBefore(index + 1)))) {
            space();
            write(value);
            space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (SPACED_OPERATORS.has(value) && !isUnary(value, previous) && !tightInRun) {
            space();
            write(value);
            space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (TIGHT_OPERATORS.has(value) || isUnary(value, previous) || (tightInRun && SPACED_OPERATORS.has(value))) {
            previousWasUnary = isUnary(value, previous);
            write(value);
            previous = token;
            continue;
        }

        if (PREFIX_SIGILS.has(previous?.value) && !atLineStart) {
            if (spacedBefore(index)) space();
            write(printableToken(input, token));
            previous = token;
            previousWasUnary = false;
            continue;
        }

        const attachedBacktick = token.type === "String" && token.kind === "backtick"
            && previous?.type === "Identifier";
        if (previous && !attachedBacktick && !previousWasUnary && !atLineStart
            && !joinedInRun(index)
            && !(isAdjacency(previous, token) && !spacedBefore(index))
            && !(PREFIX_SIGILS.has(previous.value) && !spacedBefore(index))
            && !isOpener(previous)
            && previous.value !== "."
            && !TIGHT_OPERATORS.has(previous.value)) {
            space();
        }
        write(printableToken(input, token));
        previous = token;
        previousWasUnary = false;
    }

    const formatted = output.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trimEnd();
    return `${formatted}\n`;
}

export function checkRixFormat(source, options = {}) {
    const formatted = formatRix(source, options);
    return { formatted, changed: formatted !== String(source) };
}
