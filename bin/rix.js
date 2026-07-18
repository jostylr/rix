#!/usr/bin/env bun
/**
 * RiX Runner & REPL
 * 
 * Usage:
 *   bun bin/rix.js <input.rix>      # Run a script
 *   bun bin/rix.js --with-floats    # Start REPL with Float example loaded
 *   bun bin/rix.js                  # Start REPL
 */

import { existsSync, readFileSync } from "fs";
import { readdirSync, statSync } from "fs";
import path from "path";
import { createInterface, emitKeypressEvents } from "readline";
import { fileURLToPath } from "url";
import {
    tokenize,
    parse,
    lower,
    evaluate,
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    getDiagnostics,
    isRixAbort,
    complete,
} from "../src/index.js";
import { formatValue as formatResult } from "../src/eval/format.js";
import { loadApproxMathPlugin } from "../examples/approx-math/approx-math-plugin.js";

// Known REPL meta-commands (lowercase, intercepted before the evaluator)
const REPL_COMMANDS = new Set(["help", "exit", "load", "vars", "fns", "reset", "ast", "tokens"]);

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(TOOL_DIR, "../examples");

function resolvePackageStartup(nameOrPath) {
    const spec = String(nameOrPath ?? "").trim();
    if (!spec) return null;
    const pathLike = spec.includes("/") || spec.includes("\\") || spec.startsWith(".");
    const candidates = pathLike
        ? [
            path.isAbsolute(spec) ? spec : path.resolve(process.cwd(), spec),
            path.resolve(process.cwd(), spec, "startup.rix"),
            path.resolve(process.cwd(), spec, `${path.basename(spec)}.rix`),
            path.resolve(process.cwd(), spec, `${path.basename(spec)}.js.rix`),
        ]
        : [
            path.resolve(EXAMPLES_DIR, spec, "startup.rix"),
            path.resolve(EXAMPLES_DIR, spec, `${spec}.rix`),
            path.resolve(EXAMPLES_DIR, spec, `${spec}.js.rix`),
            path.resolve(process.cwd(), "rix-packages", spec, "startup.rix"),
            path.resolve(process.cwd(), "rix-packages", spec, `${spec}.rix`),
            path.resolve(process.cwd(), "rix-packages", spec, `${spec}.js.rix`),
        ];
    return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function loadRixPackage(nameOrPath, context, registry, systemContext) {
    const startupPath = resolvePackageStartup(nameOrPath);
    if (!startupPath) return false;
    const previous = new Map();
    for (const key of ["__current_file__", "scriptBaseDir", "jsImportBaseDir", "__system_context__", "allowCapabilityRegister"]) {
        previous.set(key, {
            has: context.env?.has(key) === true,
            value: context.getEnv(key, undefined),
        });
    }
    const startupDir = path.dirname(startupPath);
    context.setEnv("__registry__", registry);
    context.setEnv("__system_context__", systemContext);
    context.setEnv("allowCapabilityRegister", true);
    context.setEnv("__current_file__", startupPath);
    context.setEnv("scriptBaseDir", startupDir);
    context.setEnv("jsImportBaseDir", startupDir);
    try {
        parseAndEvaluate(readFileSync(startupPath, "utf-8"), { context, registry, systemContext });
    } finally {
        for (const [key, entry] of previous) {
            if (entry.has) context.setEnv(key, entry.value);
            else context.env?.delete(key);
        }
    }
    console.log(`Loaded ${nameOrPath}.`);
    return true;
}

function handleCommand(fullCmd, context, registry, systemContext) {
    const trimmed = fullCmd.trim();
    if (!trimmed.startsWith(".")) return;

    // Command name is the first word after the dot
    const cmdMatch = trimmed.slice(1).match(/^[a-zA-Z]+/);
    if (!cmdMatch) return;
    const cmd = cmdMatch[0];
    const rest = trimmed.slice(1 + cmd.length).trim();

    // Balanced-delimiter parser for arguments (handles nested [] and quotes)
    const args = [];
    let current = rest;
    while (current) {
        if (current.startsWith("[") || current.startsWith("(")) {
            const startChar = current[0];
            const endChar = startChar === "[" ? "]" : ")";
            let depth = 0;
            let i = 0;
            for (; i < current.length; i++) {
                if (current[i] === startChar) depth++;
                else if (current[i] === endChar) {
                    depth--;
                    if (depth === 0) break;
                }
            }
            if (i < current.length) {
                args.push(current.slice(1, i));
                current = current.slice(i + 1).trim();
            } else {
                args.push(current.slice(1));
                current = "";
            }
        } else if (current.startsWith('"') || current.startsWith("'")) {
            const quote = current[0];
            let i = 1;
            for (; i < current.length; i++) {
                if (current[i] === quote && current[i - 1] !== "\\") break;
            }
            if (i < current.length) {
                args.push(current.slice(1, i));
                current = current.slice(i + 1).trim();
            } else {
                args.push(current.slice(1));
                current = "";
            }
        } else {
            const spaceIndex = current.indexOf(" ");
            if (spaceIndex === -1) {
                args.push(current);
                current = "";
            } else {
                args.push(current.slice(0, spaceIndex));
                current = current.slice(spaceIndex + 1).trim();
            }
        }
    }

    if (cmd === "help") {
        console.log(`Available commands:
  .help           Show this help message
  .exit           Exit the REPL (Ctl+C)
  .load[pkg]      Load a package (e.g. .load[floats])
  .vars           Show defined variables
  .fns            Show available system functions
  .reset          Reset variables and context
  .ast[expr]      Show AST of RiX expression
  .tokens[expr]   Show tokens of RiX expression
  
  Multiline input: Shift+Up or Shift+Right expands the current draft into multiline capture
                   Shift+Down or Shift+Left runs it
                   Use semicolons to end statements, newlines do not do that in multiline
                   Cmd/Ctrl+Enter is not distinguishable from Enter in most terminals
                   Alt: In single line, end a line with '\\' to make multiline, repeat to stay in multline
  Esc: One clears current line, Double esc clears multiline box
`);
    } else if (cmd === "exit") {
        console.log("Bye!");
        process.exit(0);
    } else if (cmd === "load") {
        if (!loadRixPackage(args[0], context, registry, systemContext)) {
            console.log(`Unknown package: ${args[0] ?? ""}`);
        }
    } else if (cmd === "vars") {
        console.log("Variables:", context.getAllNames());
    } else if (cmd === "fns") {
        console.log("System Functions:", systemContext.getAllNames());
    } else if (cmd === "reset") {
        context.clear();
        console.log("Environment reset.");
    } else if (cmd === "ast") {
        try {
            const tks = tokenize(args[0] || "");
            const ast = parse(tks);
            console.dir(ast, { depth: null });
        } catch (e) {
            console.error("Parse Error:", e.message);
        }
    } else if (cmd === "tokens") {
        try {
            const tks = tokenize(args[0] || "");
            console.dir(tks);
        } catch (e) {
            console.error("Tokenize Error:", e.message);
        }
    } else {
        console.log("Unknown command:", cmd);
    }
}

// --- Test Runner ---

function discoverTestFiles(baseDir, filters) {
    const results = [];
    function walk(dir) {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".git") continue;
                walk(fullPath);
            } else if (entry.name.endsWith(".test.rix")) {
                results.push(fullPath);
            }
        }
    }
    walk(baseDir);

    if (filters.length === 0) return results;

    return results.filter(filePath => {
        const normalized = filePath.toLowerCase();
        return filters.some(f => normalized.includes(f.toLowerCase()));
    });
}

function runTestFile(filePath) {
    const context = new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext();

    context.setEnv("__current_file__", filePath);

    const source = readFileSync(filePath, "utf-8");
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const irNodes = lower(ast);

    for (const irNode of irNodes) {
        evaluate(irNode, context, registry, systemContext);
    }

    return getDiagnostics(context);
}

function formatTestSummary(label, summary) {
    const total = Number(summary.entries?.get("total")?.value ?? 0);
    const passed = Number(summary.entries?.get("passed")?.value ?? 0);
    const failed = Number(summary.entries?.get("failed")?.value ?? 0);
    const errored = Number(summary.entries?.get("errored")?.value ?? 0);
    const skipped = Number(summary.entries?.get("skipped")?.value ?? 0);
    const parts = [`${passed}/${total} passed`];
    if (failed > 0) parts.push(`${failed} failed`);
    if (errored > 0) parts.push(`${errored} errored`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return `  ${label}: ${parts.join(", ")}`;
}

function entryPassed(entry) {
    return entry?.entries?.get("passed") !== null && entry?.entries?.get("passed") !== undefined;
}

function entryError(entry) {
    return entry?.entries?.get("error")?.value ?? null;
}

function printFailureDetails(result) {
    const testKind = result.entries?.get("testKind")?.value;
    const mode = result.entries?.get("mode")?.value;
    const resultsVal = result.entries?.get("results");

    if (testKind === "error" || testKind === "stop") {
        // Abort test — show structured failure reason
        const summary = result.entries?.get("summary");
        const setupPassedVal = summary?.entries?.get("setupPassed");
        const exprOutcome = summary?.entries?.get("exprOutcome")?.value ?? "?";
        const expected = summary?.entries?.get("expected")?.value ?? testKind;

        if (setupPassedVal === null) {
            const setupOutcome = result.entries?.get("setup")?.entries?.get("outcome")?.value ?? "?";
            const setupError = result.entries?.get("setup")?.entries?.get("error")?.value;
            if (setupError) {
                console.log(`    setup aborted: ${setupOutcome} — ${setupError}`);
            } else {
                console.log(`    setup aborted: ${setupOutcome}`);
            }
        } else if (exprOutcome === "returned") {
            console.log(`    expression returned normally (expected ${expected} abort)`);
        } else {
            console.log(`    expected ${expected}, got ${exprOutcome}`);
        }
    } else if (mode === "isolated" && resultsVal?.entries) {
        // Map of key → entry
        for (const [key, entry] of resultsVal.entries) {
            if (!entryPassed(entry)) {
                const err = entryError(entry);
                if (err) {
                    console.log(`    ${key}: ERROR: ${err}`);
                } else {
                    console.log(`    ${key}: FAIL (returned null)`);
                }
            }
        }
    } else if (mode === "sequential" && resultsVal?.values) {
        // Array of entries
        for (const entry of resultsVal.values) {
            if (!entryPassed(entry)) {
                const idx = entry?.entries?.get("index")?.value ?? "?";
                const skipped = entry?.entries?.get("skipped") !== null && entry?.entries?.get("skipped") !== undefined;
                const err = entryError(entry);
                if (skipped) {
                    console.log(`    [${idx}]: skipped`);
                } else if (err) {
                    console.log(`    [${idx}]: ERROR: ${err}`);
                } else {
                    console.log(`    [${idx}]: FAIL (returned null)`);
                }
            }
        }
    }
}

function printTraceEvent(entryObj) {
    const entries = entryObj?.entries;
    if (!entries) return;
    
    const event = entries.get("event")?.value;
    const depthVal = entries.get("depth");
    const depth = depthVal ? Number(depthVal.value) : 0;
    const indent = "  ".repeat(depth);
    
    if (event === "enter") {
        const fn = entries.get("fn")?.value || "<lambda>";
        const argsSeq = entries.get("args");
        const argsStr = argsSeq?.values ? argsSeq.values.map(formatResult).join(", ") : "";
        console.log(`${indent}Entered ${fn}(${argsStr})`);
    } else if (event === "exit") {
        const fn = entries.get("fn")?.value || "<lambda>";
        const val = entries.get("value");
        console.log(`${indent}Exited ${fn} returning ${formatResult(val)}`);
    } else if (event === "write") {
        const v = entries.get("var")?.value || "?";
        const oldVal = entries.get("old");
        const newVal = entries.get("new");
        const oldStr = oldVal !== null && oldVal !== undefined ? formatResult(oldVal) : "undefined";
        console.log(`${indent}  ${v} = ${formatResult(newVal)} (was ${oldStr})`);
    }
}

function printTrace(traceEvent) {
    const data = traceEvent?.entries?.get("data");
    const label = traceEvent?.entries?.get("label")?.value || "unlabeled";
    if (!data || !data.entries) return;
    
    console.log(`\n--- Trace [${label}] ---`);
    const calls = data.entries.get("calls");
    if (calls && calls.values) {
        for (const call of calls.values) {
            printTraceEvent(call);
        }
    }
    const finalVal = data.entries.get("final");
    console.log(`--- End Trace [${label}] (Returned: ${formatResult(finalVal)}) ---\n`);
}

async function runTests(filters) {
    const baseDir = process.cwd();
    const testFiles = discoverTestFiles(baseDir, filters);

    if (testFiles.length === 0) {
        console.log("No test files found.");
        process.exit(1);
    }

    console.log(`Discovered ${testFiles.length} test file(s)\n`);

    let totalFiles = 0;
    let passedFiles = 0;
    let failedFiles = 0;

    for (const filePath of testFiles) {
        const relPath = path.relative(baseDir, filePath);
        totalFiles++;

        let diag;
        let fileError = null;
        try {
            diag = runTestFile(filePath);
        } catch (err) {
            if (isRixAbort(err)) {
                diag = null;
                fileError = err.event?.entries?.get("label")?.value ?? err.message;
            } else {
                diag = null;
                fileError = err.message;
            }
        }

        if (fileError) {
            console.log(`FAIL ${relPath}`);
            console.log(`  Runtime error: ${fileError}`);
            failedFiles++;
            continue;
        }

        const fileResults = diag.getFileResults(filePath);
        let filePassed = true;

        if (fileResults.size === 0) {
            console.log(`PASS ${relPath} (no tests)`);
            passedFiles++;
            continue;
        }

        for (const [label, result] of fileResults) {
            const passedEntry = result.entries?.get("passed");
            if (passedEntry === null) {
                filePassed = false;
            }
        }

        if (filePassed) {
            console.log(`PASS ${relPath}`);
            passedFiles++;
        } else {
            console.log(`FAIL ${relPath}`);
            failedFiles++;
        }

        // Print per-test summaries with failure details
        for (const [label, result] of fileResults) {
            const summary = result.entries?.get("summary");
            const passedEntry = result.entries?.get("passed");
            const testKind = result.entries?.get("testKind")?.value;
            const mode = testKind
                ? (testKind === "error" ? "TestError" : "TestStop")
                : (result.entries?.get("mode")?.value ?? "?");
            const prefix = passedEntry === null ? "  FAIL" : "  PASS";
            if (summary && !testKind) {
                console.log(formatTestSummary(`${prefix} [${mode}] "${label}"`, summary));
            } else {
                console.log(`${prefix} [${mode}] "${label}"`);
            }
            // Show per-test failure details
            if (passedEntry === null) {
                printFailureDetails(result);
            }
        }

        // Print diagnostic event counts
        const warns = diag.getEventsByKind("warn").length;
        const infos = diag.getEventsByKind("info").length;
        const debugs = diag.getEventsByKind("debug").length;
        const tracesList = diag.getEventsByKind("trace");
        const traces = tracesList.length;
        const counts = [];
        if (warns > 0) counts.push(`${warns} warn`);
        if (infos > 0) counts.push(`${infos} info`);
        if (debugs > 0) counts.push(`${debugs} debug`);
        if (traces > 0) counts.push(`${traces} trace`);
        if (counts.length > 0) {
            console.log(`  Diagnostics: ${counts.join(", ")}`);
        }
        for (const t of tracesList) {
            printTrace(t);
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`${totalFiles} file(s): ${passedFiles} passed, ${failedFiles} failed`);

    process.exit(failedFiles > 0 ? 1 : 0);
}

async function main() {
    const rawArgs = process.argv.slice(2);
    const withFloats = rawArgs.includes("--with-floats");
    const args = rawArgs.filter(arg => arg !== "--with-floats");
    const context = new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext();

    if (withFloats) {
        loadApproxMathPlugin(systemContext, registry);
    }

    if (args.length > 0 && args[0] === "test") {
        // Test runner mode
        const filters = args.slice(1);
        return runTests(filters);
    }

    if (args.length > 0) {
        // Run file
        const inputFile = args[0];
        if (inputFile === "--help" || inputFile === "-h") {
            console.log("Usage: bun rix [--with-floats] [file.rix] | bun rix test [filters...]");
            process.exit(0);
        }

        try {
            const source = readFileSync(inputFile, "utf-8");
            const result = parseAndEvaluate(source, { context, registry, systemContext });
            
            const diag = getDiagnostics(context);
            const tracesList = diag.getEventsByKind("trace");
            for (const t of tracesList) {
                printTrace(t);
            }
            
            if (result !== undefined) {
                console.log(formatResult(result, {
                    context,
                    evaluate: (node) => evaluate(node, context, registry, systemContext),
                }));
            }
        } catch (error) {
            if (isRixAbort(error)) {
                const label = error.event?.entries?.get("label")?.value ?? error.message;
                const kind = error.event?.entries?.get("kind")?.value ?? "error";
                console.error(`${kind.toUpperCase()}: ${label}`);
            } else {
                console.error(`Error: ${error.message}`);
            }
            process.exit(1);
        }
    } else {
        // REPL
        console.log("RiX REPL (Type .help for commands)");
        let buffer = "";
        let multilineMode = false;
        let lastEscapeAt = 0;
        let pendingModifiedArrow = null;
        let completionState = null;
        let rl;

        function clearCompletion() {
            completionState = null;
        }

        function completionForCurrentLine() {
            if (!rl) return null;
            const result = complete(rl.line, rl.cursor, {
                context,
                systemContext,
                formatValue: (value) => formatResult(value, { context, evaluate: null }),
            });
            if (!result.candidates.length) return null;
            return { draft: rl.line, cursor: rl.cursor, result, index: 0 };
        }

        function renderCompletion() {
            if (!completionState || !rl) return;
            const candidate = completionState.result.candidates[completionState.index];
            const typed = completionState.draft.slice(completionState.result.from, completionState.result.to);
            const suffix = candidate.insertText.toLowerCase().startsWith(typed.toLowerCase())
                ? candidate.insertText.slice(typed.length)
                : "";
            rl.line = completionState.draft;
            rl.cursor = completionState.cursor;
            rl._refreshLine?.();
            const after = completionState.draft.slice(completionState.cursor);
            const hint = candidate.detail ? `  ${candidate.detail}` : "";
            const visible = `${suffix}${after}${hint}`;
            if (visible) {
                rl.output.write(`\x1b[2m${suffix}\x1b[22m${after}\x1b[2m${hint}\x1b[22m\x1b[${visible.length}D`);
            }
        }

        function acceptCompletion() {
            if (!completionState || !rl) return false;
            const { draft, result, index } = completionState;
            const candidate = result.candidates[index];
            rl.line = `${draft.slice(0, result.from)}${candidate.insertText}${draft.slice(result.to)}`;
            rl.cursor = result.from + candidate.insertText.length;
            clearCompletion();
            rl._refreshLine?.();
            return true;
        }

        function handleModifiedArrow(name) {
            if (!rl || pendingModifiedArrow) return;
            const action = { name, draft: rl.line, cursor: rl.cursor };
            pendingModifiedArrow = action;
            if (name === "open") multilineMode = true;

            queueMicrotask(() => {
                if (pendingModifiedArrow !== action) return;
                pendingModifiedArrow = null;

                if (name === "open") {
                    rl.line = action.draft;
                    rl.cursor = action.cursor;
                    rl.setPrompt("... ");
                    rl.prompt(true);
                    rl._refreshLine?.();
                    return;
                }

                // The closing shortcut completes the buffer immediately. Retain any
                // unfinished draft as the final line, then reuse normal line
                // evaluation so diagnostics and prompt handling stay uniform.
                multilineMode = false;
                rl.line = "";
                rl.cursor = 0;
                if (action.draft) {
                    rl.history.unshift(action.draft);
                    if (rl.history.length > rl.historySize) rl.history.pop();
                }
                // readline normally prints this newline before its "line"
                // event. We emit the event ourselves for the shortcut, so
                // reproduce it before evaluation writes its result.
                rl.output.write("\n");
                rl.emit("line", action.draft);
            });
        }

        // Install this listener before readline's own history listener. After
        // readline handles the key, the queued update restores the draft so
        // the multiline shortcut never substitutes a history entry for what
        // the user typed.
        emitKeypressEvents(process.stdin);
        process.stdin.on("data", (chunk) => {
            // macOS Terminal may send raw xterm sequences without setting
            // key.shift in readline's keypress event.
            const text = String(chunk);
            if (text.includes("\x1b[1;2A") || text.includes("\x1b[1;2C")) {
                handleModifiedArrow("open");
            }
            if (text.includes("\x1b[1;2B") || text.includes("\x1b[1;2D")) {
                handleModifiedArrow("close");
            }
        });
        process.stdin.on("keypress", (_character, key) => {
            if (!rl || !key) return;
            if (completionState) {
                if (key.name === "up" || key.name === "down") {
                    const delta = key.name === "up" ? -1 : 1;
                    completionState.index = (completionState.index + delta + completionState.result.candidates.length) % completionState.result.candidates.length;
                    queueMicrotask(renderCompletion);
                    return;
                }
                if (key.name === "right") {
                    queueMicrotask(acceptCompletion);
                    return;
                }
                if (key.name === "tab") {
                    queueMicrotask(acceptCompletion);
                    return;
                }
                if (key.name === "left" || key.name === "escape") {
                    const { draft, cursor } = completionState;
                    clearCompletion();
                    queueMicrotask(() => {
                        rl.line = draft;
                        rl.cursor = cursor;
                        rl._refreshLine?.();
                    });
                    return;
                }
                clearCompletion();
            }
            if (key.name === "tab") {
                completionState = completionForCurrentLine();
                if (completionState) queueMicrotask(renderCompletion);
                return;
            }
            if (key.name === "escape") {
                // Terminals delay a bare Escape briefly while they determine
                // whether it begins an escape sequence, so allow a full second
                // for the second press to arrive.
                const doubleEscape = Date.now() - lastEscapeAt < 1000;
                lastEscapeAt = Date.now();
                queueMicrotask(() => {
                    if (doubleEscape) {
                        buffer = "";
                        multilineMode = false;
                        rl.setPrompt("rix> ");
                    }
                    rl.line = "";
                    rl.cursor = 0;
                    rl.prompt(true);
                    rl._refreshLine?.();
                });
                return;
            }

            lastEscapeAt = 0;
            if (!key.shift) return;
            if (key.name === "up" || key.name === "right") handleModifiedArrow("open");
            if (key.name === "down" || key.name === "left") handleModifiedArrow("close");
        });

        rl = createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: "rix> "
        });

        rl.on("SIGINT", () => {
            if (buffer.length > 0) {
                buffer = "";
                multilineMode = false;
                console.log("\n(cleared)");
                rl.setPrompt("rix> ");
                rl.prompt();
            } else {
                console.log("\nBye!");
                process.exit(0);
            }
        });

        rl.prompt();

        rl.on("line", (line) => {
            if (buffer === "" && !multilineMode && line.trim().startsWith(".")) {
                const m = line.trim().slice(1).match(/^([a-z]+)/);
                if (m && REPL_COMMANDS.has(m[1])) {
                    handleCommand(line.trim(), context, registry, systemContext);
                    rl.prompt();
                    return;
                }
                // Otherwise fall through — treat as RiX expression (e.g. .RandName())
            }

            if (line.endsWith("\\")) {
                buffer += line.slice(0, -1) + "\n";
                rl.setPrompt("... ");
                rl.prompt();
                return;
            }

            if (multilineMode) {
                buffer += line + "\n";
                rl.setPrompt("... ");
                rl.prompt();
                return;
            }

            buffer += line;
            if (buffer.trim() === "") {
                buffer = "";
                rl.setPrompt("rix> ");
                rl.prompt();
                return;
            }

            try {
                const result = parseAndEvaluate(buffer, { context, registry, systemContext });
                
                const diag = getDiagnostics(context);
                const tracesList = diag.getEventsByKind("trace");
                for (const t of tracesList) {
                    printTrace(t);
                }
                diag.events = diag.events.filter(e => e.entries?.get("kind")?.value !== "trace");

                if (result !== undefined) {
                    console.log(formatResult(result, {
                        context,
                        evaluate: (node) => evaluate(node, context, registry, systemContext),
                    }));
                }
            } catch (error) {
                // Special case: bare unbound user identifier at the REPL shows "undefined"
                if (error.message.startsWith("Undefined variable:")) {
                    try {
                        const toks = tokenize(buffer.trim()).filter(
                            t => t.type !== "End" && !(t.type === "String" && t.kind === "comment")
                        );
                        const isBareUserIdent = toks.length === 1 &&
                            toks[0].type === "Identifier" && toks[0].kind === "User";
                        if (isBareUserIdent) {
                            console.log("undefined");
                        } else {
                            console.error(`Error: ${error.message}`);
                        }
                    } catch (tokError) {
                        // If tokenization fails here (unlikely since it passed before evaluation,
                        // but possible if we're here for other reasons), just show the original error
                        console.error(`Error: ${error.message}`);
                    }
                } else {
                    console.error(`Error: ${error.message}`);
                }
            }

            buffer = "";
            rl.setPrompt("rix> ");
            rl.prompt();
        });

        rl.on("close", () => {
            console.log("\nBye!");
            process.exit(0);
        });
    }
}

main();
