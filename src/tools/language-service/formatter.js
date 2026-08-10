import { parse } from "../../parser/parser.js";
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

function isComment(token) {
    return token?.type === "String" && token.kind === "comment";
}

function isUnary(operator, previous) {
    return (operator === "+" || operator === "-" || operator === "!" || operator === "~")
        && (!previous || OPENERS.has(previous.value) || previous.value === ","
            || previous.value === ";" || SPACED_OPERATORS.has(previous.value)
            || PIPE_OPERATORS.has(previous.value));
}

function containerCommaCounts(tokens) {
    const counts = new Map();
    const stack = [];
    for (let index = 0; index < tokens.length; index++) {
        const value = tokens[index].value;
        if (OPENERS.has(value)) stack.push({ index, commas: 0 });
        else if (value === "," && stack.length) stack.at(-1).commas++;
        else if (CLOSERS.has(value) && stack.length) {
            const entry = stack.pop();
            counts.set(entry.index, entry.commas);
        }
    }
    return counts;
}

/**
 * Conservative, token-preserving RiX formatter.
 *
 * The readable profile implements formatter Candidate B. Compact implements
 * Candidate A. Source must parse before it is formatted; callers can therefore
 * safely leave incomplete regions untouched.
 */
export function formatRix(source, options = {}) {
    const input = String(source);
    parse(input, options.systemLookup, options.parseOptions || {});
    const tokens = tokenize(input).filter((token) => token.type !== "End");
    if (tokens.length === 0) return input;

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

        if (isComment(token)) {
            const raw = String(token.original || rawToken(input, token)).trim();
            if (!atLineStart) newline();
            write(raw);
            newline();
            previous = token;
            continue;
        }

        if (OPENERS.has(value)) {
            if (previous && (previous.type === "Identifier" || previous.type === "Number" || CLOSERS.has(previous.value))) {
                if (value !== "(" && value !== "[") space();
            }
            write(rawToken(input, token));
            const estimatedWide = lineLength + input.slice(token.pos[2], tokens.find((item, candidate) => candidate > index && CLOSERS.has(item.value))?.pos?.[1] || token.pos[2]).length > printWidth;
            const expanded = profile === "readable" && EXPANDABLE_OPENERS.has(value)
                && ((commaCounts.get(index) || 0) >= 2 || estimatedWide);
            stack.push({ value, expanded });
            if (expanded) newline();
            else if (value.startsWith("{") && next && !CLOSERS.has(next.value)) space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (CLOSERS.has(value)) {
            const group = stack.pop();
            if (group?.expanded) newline();
            else if (group?.value?.startsWith("{") && previous && !OPENERS.has(previous.value)) space();
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

        if (SPACED_OPERATORS.has(value) && !isUnary(value, previous)) {
            space();
            write(value);
            space();
            previous = token;
            previousWasUnary = false;
            continue;
        }

        if (TIGHT_OPERATORS.has(value) || isUnary(value, previous)) {
            previousWasUnary = isUnary(value, previous);
            write(value);
            previous = token;
            continue;
        }

        if (previous && !previousWasUnary && !atLineStart
            && !OPENERS.has(previous.value)
            && previous.value !== "."
            && previous.value !== "@"
            && previous.value !== "$$"
            && previous.value !== "$"
            && !TIGHT_OPERATORS.has(previous.value)) {
            space();
        }
        write(rawToken(input, token));
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
