#!/usr/bin/env bun
/**
 * rix-to-ir: CLI tool to convert RiX source to system function call text.
 *
 * Usage:
 *   bun bin/rix-to-ir.js <input.rix>              # default output
 *   bun bin/rix-to-ir.js --lang <input.rix>        # @_ prefixed output
 *   bun bin/rix-to-ir.js --pretty <input.rix>      # pretty-printed
 *   cat input.rix | bun bin/rix-to-ir.js -          # stdin
 *
 * Flags:
 *   --lang     Prefix function names with @_ (for use in RiX language context)
 *   --pretty   Pretty-print with indentation
 *   -          Read from stdin instead of file
 */

import { readFileSync } from "fs";
import { tokenize } from "../src/parser/tokenizer.js";
import { parse } from "../src/parser/parser.js";
import { lower } from "../src/eval/lower.js";
import { irListToText } from "../src/eval/ir-to-text.js";

// Default system lookup for the parser
function systemLookup(name) {
    const symbols = {
        SIN: { type: "function", arity: 1 },
        COS: { type: "function", arity: 1 },
        TAN: { type: "function", arity: 1 },
        LOG: { type: "function", arity: 1 },
        EXP: { type: "function", arity: 1 },
        SQRT: { type: "function", arity: 1 },
        ABS: { type: "function", arity: 1 },
        MAX: { type: "function", arity: -1 },
        MIN: { type: "function", arity: -1 },
        PI: { type: "constant" },
        E: { type: "constant" },
        AND: {
            type: "operator",
            precedence: 40,
            associativity: "left",
            operatorType: "infix",
        },
        OR: {
            type: "operator",
            precedence: 30,
            associativity: "left",
            operatorType: "infix",
        },
        NOT: { type: "operator", precedence: 110, operatorType: "prefix" },
        IF: { type: "identifier" },
        HELP: { type: "identifier" },
        LOAD: { type: "identifier" },
        UNLOAD: { type: "identifier" },
        CASE: { type: "identifier" },
        LOOP: { type: "identifier" },
        MAP: { type: "function", arity: 2 },
        FILTER: { type: "function", arity: 2 },
        REDUCE: { type: "function", arity: 3 },
        LEN: { type: "function", arity: 1 },
        FIRST: { type: "function", arity: 1 },
        LAST: { type: "function", arity: 1 },
        GETEL: { type: "function", arity: 2 },
        IRANGE: { type: "function", arity: -1 },
        ASSIGN: { type: "function", arity: 2 },
        GLOBAL: { type: "function", arity: 2 },
        MULTI: { type: "function", arity: -1 },
        UPPER: { type: "function", arity: 1 },
        LOWER: { type: "function", arity: 1 },
        SUBSTR: { type: "function", arity: -1 },
        CONCAT: { type: "function", arity: -1 },
        STRLEN: { type: "function", arity: 1 },
        EQ: { type: "function", arity: 2 },
        MOD: { type: "function", arity: 2 },
        SUM: { type: "function", arity: -1 },
        PROD: { type: "function", arity: -1 },
        CONVERT: { type: "function", arity: -1 },
        SOME: { type: "function", arity: 2 },
        ALL: { type: "function", arity: 2 },
    };
    return symbols[name] || { type: "identifier" };
}

/**
 * Convert RiX source code to system function call text.
 *
 * @param {string} source - RiX source code
 * @param {Object} options - { langPrefix: boolean, pretty: boolean, warn: boolean }
 * @returns {string} System function call text
 */
export function rixToIR(source, options = {}) {
    const ast = parse(source, systemLookup);
    const irNodes = lower(ast);

    // Check for common syntax pitfalls and emit warnings to stderr
    if (options.warn !== false) {
        checkCommonIssues(source, irNodes, options.warn);
    }

    return irListToText(irNodes, {
        langPrefix: options.langPrefix || false,
        pretty: options.pretty || false,
        source: source,
    });
}

/**
 * Check for common RiX syntax issues and print warnings to stderr.
 */
function checkCommonIssues(source, irNodes, verbose) {
    const warnings = [];

    // Check for snake_case identifiers (underscore is null token in RiX)
    const snakeCase = source.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g);
    if (snakeCase) {
        const unique = [...new Set(snakeCase)];
        warnings.push(`  snake_case identifiers not supported — use camelCase instead: ${unique.join(", ")}`);
    }

    // Count BINOP(_, ...) nodes (from snake_case)
    const binopCount = irNodes.filter(n => n && n.fn === "BINOP" && n.args?.[0] === "_").length;
    if (binopCount > 0) {
        warnings.push(`  ${binopCount} statement(s) parsed as BINOP("_", ...) — likely snake_case identifiers`);
    }

    if (warnings.length > 0) {
        console.error("# WARNINGS:");
        warnings.forEach(w => console.error(w));
        console.error("");
    }
}

// CLI entry point
function main() {
    const args = process.argv.slice(2);

    let langPrefix = false;
    let pretty = false;
    let noWarn = false;
    let inputFile = null;

    for (const arg of args) {
        if (arg === "--lang") {
            langPrefix = true;
        } else if (arg === "--pretty") {
            pretty = true;
        } else if (arg === "--no-warn") {
            noWarn = true;
        } else if (arg === "--help" || arg === "-h") {
            console.log(`Usage: rix-to-ir [--lang] [--pretty] [--no-warn] <input.rix | ->

Options:
  --lang      Prefix function names with @_ (for RiX language context)
  --pretty    Pretty-print with indentation
  --no-warn   Suppress syntax warnings
  -           Read from stdin

Common RiX syntax rules:
  - Use camelCase identifiers (snake_case breaks because _ is null token)
  - Use :-> for named function definitions: F(x) :-> x + 1
  - Use -> for lambdas: f = (x) -> x + 1
  - Semicolons OR newlines terminate statements
  - Comments start with ##, or ##tag##...##tag## for multi-line

Examples:
  bun bin/rix-to-ir.js example-script.rix
  bun bin/rix-to-ir.js --lang example-script.rix
  echo "x = 2 + 3" | bun bin/rix-to-ir.js -`);
            process.exit(0);
        } else {
            inputFile = arg;
        }
    }

    if (!inputFile) {
        console.error("Error: No input file specified. Use --help for usage.");
        process.exit(1);
    }

    let source;
    try {
        if (inputFile === "-") {
            source = readFileSync("/dev/stdin", "utf-8");
        } else {
            source = readFileSync(inputFile, "utf-8");
        }
    } catch (error) {
        console.error(`Error reading file: ${error.message}`);
        process.exit(1);
    }

    try {
        const output = rixToIR(source, { langPrefix, pretty, warn: !noWarn });
        if (output.trim()) {
            console.log(output);
        } else {
            console.error("# No IR output produced — check file for syntax errors");
            process.exit(1);
        }
    } catch (error) {
        // Show the error with source context if possible
        const lines = source.split("\n");
        console.error(`Error: ${error.message}`);
        if (error.pos !== undefined) {
            // Token position info
            const pos = error.pos;
            console.error(`  at position ${pos}`);
        }
        // Try to find the problematic line from error message
        const lineMatch = error.message.match(/line (\d+)/i);
        if (lineMatch) {
            const lineNum = parseInt(lineMatch[1]) - 1;
            if (lines[lineNum]) {
                console.error(`  line ${lineMatch[1]}: ${lines[lineNum]}`);
            }
        }
        process.exit(1);
    }
}

// Only run main if this is the entry point
if (import.meta.main) {
    main();
}

