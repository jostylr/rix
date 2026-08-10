#!/usr/bin/env bun
/**
 * RiX Runner & REPL
 * 
 * Usage:
 *   bun bin/rix.js <input.rix>      # Run a script
 *   bun bin/rix.js --with-floats    # Start REPL with Float example loaded
 *   bun bin/rix.js                  # Start REPL
 */

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
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
    parseAndEvaluateAsync,
    drainBackgroundTasks,
    renderOutputHtml,
    getDiagnostics,
    isRixAbort,
    complete,
    readSourceHeader,
    readPluginHeader,
    extractOperatorDeclarationsFromSource,
    mergeOperatorDefinitions,
    lintRix,
    explainRixScopes,
    formatLintDiagnostic,
    applyRixLintFixes,
    lintDiagnosticsToSarif,
    RIX_LINT_RULES,
    analyzeRixDocument,
    formatRix,
} from "../src/index.js";
import { createExecutionSession } from "../src/tools/execution/worker.js";
import { NodePluginCatalog } from "../src/runtime/plugin-catalog-node.js";
import { formatValue as formatResult } from "../src/eval/format.js";
import { install as installFloatPlugin } from "../plugins/float/float.plugin.rix.js";
import { install as installArrayJsExample } from "../examples/plugins/example-array-js/array-js.plugin.rix.js";
import { install as installDrawPlugin } from "../plugins/draw/draw.plugin.rix.js";
import { install as installFracfunPlugin } from "../plugins/fracfun/fracfun.plugin.rix.js";
import { install as installPlotPlugin } from "../plugins/plot/plot.plugin.rix.js";
import { install as installScene3DPlugin } from "../plugins/scene3d/scene3d.plugin.rix.js";
import { install as installNdPlugin } from "../plugins/nd/nd.plugin.rix.js";
import { install as installGeometryPlugin } from "../plugins/geometry/geometry.plugin.rix.js";
import { install as installDataPlugin } from "../plugins/data/data.plugin.rix.js";
import { install as installDocumentPlugin } from "../plugins/document/document.plugin.rix.js";
import { install as installTerminalAsciiPlugin } from "../plugins/render-terminal-ascii/terminal-ascii.plugin.rix.js";
import { install as installSvgPlugin } from "../plugins/render-svg/svg.plugin.rix.js";
import { install as installCanvasPlugin } from "../plugins/render-canvas/canvas.plugin.rix.js";
import { install as installTikzPlugin } from "../plugins/render-tikz/tikz.plugin.rix.js";
import { install as installMarkdownPlugin } from "../plugins/render-markdown/markdown.plugin.rix.js";
import { install as installHtmlPlugin } from "../plugins/render-html/html.plugin.rix.js";
import { install as installQuartoPlugin } from "../plugins/render-quarto/quarto.plugin.rix.js";
import { install as installLatexPlugin } from "../plugins/render-latex/latex.plugin.rix.js";
import { install as installPngPlugin } from "../plugins/render-png/png.plugin.rix.js";
import { install as installPdfPlugin } from "../plugins/render-pdf/pdf.plugin.rix.js";
import { install as installGltfPlugin } from "../plugins/render-gltf/gltf.plugin.rix.js";
import { install as installCsvPlugin } from "../plugins/render-csv/csv.plugin.rix.js";
import { install as installGifPlugin } from "../plugins/render-gif/gif.plugin.rix.js";
import { compileLatex, encodeGifFrames, rasterizeSvg } from "./node-renderer-tools.js";
import {
    ensureRixCliPreamble,
    readRixCliConfig,
    resolvePluginSelectors,
    resolveRixConfigDir,
    writeRixCliConfig,
} from "../src/cli/config.js";

// Known REPL meta-commands (lowercase, intercepted before the evaluator)
const REPL_COMMANDS = new Set(["help", "exit", "load", "vars", "fns", "reset", "ast", "tokens"]);

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(TOOL_DIR, "../examples");
const FIRST_PARTY_PLUGINS_DIR = path.resolve(TOOL_DIR, "../plugins");
const EXAMPLE_PLUGINS_DIR = path.resolve(EXAMPLES_DIR, "plugins");
const WEB_PAGE_ENTRY = path.resolve(TOOL_DIR, "web-page.js");
const WEB_PAGE_STYLE = path.resolve(TOOL_DIR, "web-page.css");
const RENDERER_PLUGIN_IDS = ["svg", "canvas", "terminal-ascii", "tikz", "markdown", "html", "quarto", "latex", "png", "pdf", "gif", "gltf", "csv"];
const BUILT_PLUGIN_IDS = new Set(["exact-algebras", "algebra", "symbolic", "fracfun", "fraction", "ratfun", "poly", "draw", "plot", "scene3d", "nd", "complex-viz", "geometry", "data", "stats", "document", "float", ...RENDERER_PLUGIN_IDS, "example-array-js", "example-array-rix"]);
const STANDARD_PLUGIN_IDS = new Set(["exact-algebras", "algebra", "draw", "plot", "scene3d", "nd", "geometry", "data", "document", "float", ...RENDERER_PLUGIN_IDS]);

function sourceUsesAsyncEvaluation(source) {
    const tokens = tokenize(source);
    return tokens.some((token) => token.value === "{$" || token.value === "{$$"
        || token.value === "|>_" || token.value === "|>!")
        || /\.(?:ForEach|Reduce|Collect|First|Find|Count|Close|Retry)\s*\(/i.test(source);
}

function evaluateSource(source, options) {
    return sourceUsesAsyncEvaluation(source)
        ? parseAndEvaluateAsync(source, options)
        : Promise.resolve(parseAndEvaluate(source, options));
}

function usage() {
    return `Usage:
  bun rix [options] [file.rix]
  bun rix test [filters...]
  bun rix lint [--level=LEVEL] [--profile=PROFILE] [--strict] [--json|--sarif] file.rix [...]
  bun rix explain-scope [--json] file.rix:line[:column]
  bun rix parse --json file.rix
  bun rix symbols --json file.rix
  bun rix format [--check] [--profile=readable|compact] file.rix [...]
  bun rix verify --json file.rix

Options:
  --out=DIR              Write artifacts declared with .Out(path, value) into DIR
  --plugin=ID             Preload an approved plugin (repeatable)
  --plugins=a,b           Preload a comma-separated plugin list
  --all-plugins           Preload every discovered plugin with an approved installer
  --all-built-plugins     Preload every plugin shipped in this RiX repository
  --with-floats           Compatibility alias for --plugin=float
  --operator-file=FILE    Load custom operators before parsing (repeatable)
  --preamble=FILE         Run a RiX preamble before starting the REPL
  --no-preamble           Do not run the configured REPL preamble
  --no-config             Ignore persistent REPL plugin and preamble setup
  --config-dir=DIR        Override the RiX configuration directory
  --help, -h              Show this help

Persistent REPL setup:
  rix setup --plugins=full
  rix setup --plugins=plot,renderers

RiX scripts declare artifacts explicitly, for example:
  .Out("index.html", $view)`;
}

function editorToolUsage(command) {
    const usages = {
        parse: "rix parse --json file.rix",
        symbols: "rix symbols --json file.rix",
        format: "rix format [--check] [--profile=readable|compact] file.rix [...]",
        verify: "rix verify --json file.rix",
    };
    return `Usage: ${usages[command]}`;
}

async function runEditorTool(command, rawArgs) {
    if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
        console.log(editorToolUsage(command));
        return;
    }
    const json = rawArgs.includes("--json");
    const check = rawArgs.includes("--check");
    const profileArg = rawArgs.find((argument) => argument.startsWith("--profile="));
    const profile = profileArg?.slice("--profile=".length) || "readable";
    if (!["readable", "compact"].includes(profile)) throw new Error(`Unknown formatter profile '${profile}'`);
    const files = rawArgs.filter((argument) => !argument.startsWith("--"));
    if (files.length === 0 || ((command === "parse" || command === "symbols" || command === "verify") && files.length !== 1)) {
        throw new Error(editorToolUsage(command));
    }

    if (command === "format") {
        let changed = 0;
        const results = [];
        for (const filename of files) {
            const file = path.resolve(filename);
            const source = readFileSync(file, "utf8");
            const formatted = formatRix(source, { profile });
            const different = source !== formatted;
            if (different) changed++;
            if (different && !check) writeFileSync(file, formatted, "utf8");
            results.push({ file, changed: different });
        }
        if (json) console.log(JSON.stringify({ protocol: "rix.format/1", profile, check, files: results }, null, 2));
        else for (const result of results) console.log(`${result.changed ? check ? "would format" : "formatted" : "unchanged"} ${result.file}`);
        if (check && changed > 0) process.exitCode = 1;
        return;
    }

    const file = path.resolve(files[0]);
    const source = readFileSync(file, "utf8");
    const uri = new URL(`file://${file}`).href;
    const analysis = analyzeRixDocument(source, { uri, version: 0 });
    if (command === "parse") {
        const result = { protocol: "rix.parse/1", uri, diagnostics: analysis.diagnostics, ast: analysis.ast };
        console.log(JSON.stringify(result, null, json ? 2 : 2));
        if (analysis.parseError) process.exitCode = 1;
        return;
    }
    if (command === "symbols") {
        console.log(JSON.stringify({ protocol: "rix.symbols/1", uri, symbols: analysis.symbols }, null, 2));
        if (analysis.parseError) process.exitCode = 1;
        return;
    }

    const events = [];
    const session = createExecutionSession({ emit: (event) => events.push(event) });
    await session.run({ command: "run", requestId: "verify", uri, version: 0, filePath: file, source, mode: "isolated" });
    const summary = events.findLast(({ kind }) => kind === "run-end")?.payload || { state: "failed" };
    const result = { protocol: "rix.verify/1", uri, diagnostics: analysis.diagnostics, events, summary };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`RiX verify: ${summary.state}; ${summary.checks?.passed || 0}/${summary.checks?.total || 0} inline checks passed`);
    if (summary.state !== "passed" || analysis.diagnostics.some(({ severity }) => severity === "error")) process.exitCode = 1;
}

function lintUsage() {
    return `Usage:
  bun rix lint [options] file.rix [...]
  bun rix lint [options] -

Options:
  --level=LEVEL           essential, standard (default), thorough, or pedantic
  --profile=PROFILE       default, plugin, reactive, math, teaching, pedantic, or all
  --strict                Exit nonzero when warnings are found
  --json                  Emit diagnostics as JSON
  --sarif                 Emit SARIF 2.1.0 for code-scanning systems
  --fix                   Explicitly apply only fixes marked safe, then lint again
  --baseline=FILE         Hide diagnostics recorded in a JSON lint baseline
  --write-baseline=FILE   Explicitly write the current diagnostic baseline
  --coverage=FILE         Annotate diagnostics using executed-line JSON data
  --closed-plugin-set     Require plugin dependencies to be provided by the lint inputs
  --list-rules            List rule codes, levels, and profile groups
  --operator-file=FILE    Load custom operator declarations before parsing
  --help, -h              Show this help`;
}

function parseLintArgs(rawArgs) {
    let strict = false;
    let json = false;
    let sarif = false;
    let fix = false;
    let level = "standard";
    let profileSpecified = false;
    let closedPluginSet = false;
    let baseline = null;
    let writeBaseline = null;
    let coverage = null;
    let listRules = false;
    const profiles = [];
    const operatorFiles = [];
    const files = [];
    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (arg === "--strict") strict = true;
        else if (arg === "--json") json = true;
        else if (arg === "--sarif") sarif = true;
        else if (arg === "--fix") fix = true;
        else if (arg === "--closed-plugin-set") closedPluginSet = true;
        else if (arg === "--list-rules") listRules = true;
        else if (arg === "--level") {
            level = rawArgs[++index];
            if (!level) throw new Error("--level requires a value");
        } else if (arg.startsWith("--level=")) level = arg.slice("--level=".length);
        else if (arg === "--profile") {
            const value = rawArgs[++index];
            if (!value) throw new Error("--profile requires a value");
            profiles.push(...value.split(","));
            profileSpecified = true;
        } else if (arg.startsWith("--profile=")) {
            profiles.push(...arg.slice("--profile=".length).split(","));
            profileSpecified = true;
        } else if (arg === "--baseline") {
            baseline = rawArgs[++index];
            if (!baseline) throw new Error("--baseline requires a file");
        } else if (arg.startsWith("--baseline=")) baseline = arg.slice("--baseline=".length);
        else if (arg === "--write-baseline") {
            writeBaseline = rawArgs[++index];
            if (!writeBaseline) throw new Error("--write-baseline requires a file");
        } else if (arg.startsWith("--write-baseline=")) writeBaseline = arg.slice("--write-baseline=".length);
        else if (arg === "--coverage") {
            coverage = rawArgs[++index];
            if (!coverage) throw new Error("--coverage requires a file");
        } else if (arg.startsWith("--coverage=")) coverage = arg.slice("--coverage=".length);
        else if (arg === "--help" || arg === "-h") return { help: true };
        else if (arg === "--operator-file") {
            const filename = rawArgs[++index];
            if (!filename) throw new Error("--operator-file requires a file");
            operatorFiles.push(filename);
        } else if (arg.startsWith("--operator-file=")) {
            const filename = arg.slice("--operator-file=".length);
            if (!filename) throw new Error("--operator-file requires a file");
            operatorFiles.push(filename);
        } else if (arg.startsWith("--")) {
            throw new Error(`Unknown lint option: ${arg}`);
        } else files.push(arg);
    }
    if (json && sarif) throw new Error("Use only one of --json or --sarif");
    return {
        help: false, strict, json, sarif, fix, level, profiles, profileSpecified,
        closedPluginSet, baseline, writeBaseline, coverage, listRules, operatorFiles, files,
    };
}

function lintBaselineKey(diagnostic) {
    return `${diagnostic.code}|${path.resolve(diagnostic.file)}|${diagnostic.message}`;
}

function lintBaselineKeys(filename) {
    if (!filename) return new Set();
    const parsed = JSON.parse(readFileSync(filename, "utf8"));
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries)) throw new Error("Lint baseline must be an array or an object with an entries array");
    return new Set(entries.map((entry) => typeof entry === "string" ? entry : entry.key).filter(Boolean));
}

function readLintCoverage(filename) {
    if (!filename) return null;
    const parsed = JSON.parse(readFileSync(filename, "utf8"));
    const files = parsed.files || parsed;
    const result = new Map();
    for (const [file, value] of Object.entries(files)) {
        const lines = Array.isArray(value) ? value : value.executedLines || value.lines || [];
        result.set(path.resolve(file), new Set(lines.map(Number).filter(Number.isFinite)));
    }
    return result;
}

function runLint(rawArgs) {
    const options = parseLintArgs(rawArgs);
    if (options.help) {
        console.log(lintUsage());
        return;
    }
    if (options.listRules) {
        for (const [code, rule] of Object.entries(RIX_LINT_RULES)) {
            console.log(`${code} level=${rule.level} profiles=${rule.profiles.join(",")} ${rule.title}`);
        }
        return;
    }
    if (options.files.length === 0) throw new Error("rix lint requires at least one file, or '-' for stdin");
    if (options.files.filter((file) => file === "-").length > 1 || (options.files.includes("-") && options.files.length > 1)) {
        throw new Error("stdin '-' must be the only lint input");
    }
    if (options.fix && options.files.includes("-")) throw new Error("--fix requires named files; stdin is read-only");

    const operatorDefinitions = mergeOperatorDefinitions(...readOperatorFiles(options.operatorFiles, process.cwd()));
    let diagnostics = [];
    const pluginRecords = [];
    let fixesApplied = 0;
    for (const filename of options.files) {
        let source = filename === "-" ? readFileSync("/dev/stdin", "utf8") : readFileSync(filename, "utf8");
        const file = filename === "-" ? "<stdin>" : path.resolve(filename);
        try {
            const sourceHeader = readSourceHeader(source, file);
            const isPlugin = /\.plugin\.rix(?:\.js)?$/.test(file);
            const rawPluginMetadata = isPlugin ? readPluginHeader(source, file) : null;
            const pluginMetadata = rawPluginMetadata
                ? new NodePluginCatalog().addMetadata(rawPluginMetadata, {
                    sourcePath: file,
                    source,
                    kind: /\.plugin\.rix\.js$/.test(file) ? "host" : "rix",
                })
                : null;
            if (pluginMetadata) pluginRecords.push({ file, source, metadata: pluginMetadata });
            const fileOperatorDefinitions = filename === "-"
                ? operatorDefinitions
                : mergeOperatorDefinitions(
                    operatorDefinitions,
                    ...readOperatorFiles(sourceHeader.operatorFiles, path.dirname(file)),
                );
            const lintOptions = {
                file,
                level: options.level,
                profiles: options.profileSpecified ? options.profiles : (pluginMetadata ? ["plugin"] : ["default"]),
                operatorDefinitions: fileOperatorDefinitions,
                pluginMetadata,
                ...(/\.plugin\.rix\.js$/.test(file) ? { ast: [] } : {}),
            };
            let fileDiagnostics = lintRix(source, lintOptions);
            if (options.fix) {
                const fixed = applyRixLintFixes(source, fileDiagnostics, { edit: true });
                if (fixed.applied > 0) {
                    writeFileSync(file, fixed.source);
                    source = fixed.source;
                    fixesApplied += fixed.applied;
                    fileDiagnostics = lintRix(source, lintOptions);
                }
            }
            diagnostics.push(...fileDiagnostics);
        } catch (error) {
            const pluginHeaderFailure = /plugin (?:file|header)|plugin header|header requires|header kind|mount|aliases/i.test(error.message);
            diagnostics.push({
                code: pluginHeaderFailure ? "RX1901" : "RX0001",
                severity: "error",
                message: error.message,
                hint: pluginHeaderFailure
                    ? "Fix the plugin metadata contract before loading or publishing the plugin."
                    : "Fix the parse error before applying semantic lint rules.",
                file,
                line: 1,
                column: 1,
                offset: 0,
                level: 1,
            });
        }
    }

    const capabilityOwners = new Map();
    const methodOwners = new Map();
    const provided = new Set(pluginRecords.flatMap(({ metadata }) => metadata.provides || []));
    for (const record of pluginRecords) {
        for (const capability of [record.metadata.mount, ...(record.metadata.aliases || [])].filter(Boolean)) {
            const key = capability.toLowerCase();
            const prior = capabilityOwners.get(key);
            if (prior && prior.file !== record.file) {
                diagnostics.push({
                    code: "RX1905", severity: "error", level: 1,
                    message: `Plugin capability '${capability}' collides with '${prior.capability}' from ${prior.file}.`,
                    hint: "Choose a unique canonical mount/alias or remove the duplicate alias.",
                    file: record.file, line: 1, column: 1, offset: 0,
                });
            } else capabilityOwners.set(key, { file: record.file, capability });
        }
        for (const match of record.source.matchAll(/\.Host\.RegisterMethod\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)) {
            const key = `${match[1].toUpperCase()}:${match[2].toUpperCase()}`;
            const prior = methodOwners.get(key);
            if (prior && prior.file !== record.file) {
                diagnostics.push({
                    code: "RX1905", severity: "error", level: 1,
                    message: `Receiver method '${match[1]}.${match[2]}' collides with a registration from ${prior.file}.`,
                    hint: "Coordinate method ownership or give one extension a distinct method name.",
                    file: record.file, line: 1, column: 1, offset: match.index,
                });
            } else methodOwners.set(key, { file: record.file });
        }
        if (options.closedPluginSet) {
            for (const requirement of record.metadata.requires || []) {
                if (!provided.has(requirement)) {
                    diagnostics.push({
                        code: "RX1904", severity: "error", level: 1,
                        message: `Required capability '${requirement}' is not provided by the closed plugin input set.`,
                        hint: "Add the provider to the lint inputs or correct the requirement version.",
                        file: record.file, line: 1, column: 1, offset: 0,
                    });
                }
            }
        }
    }

    const coverage = readLintCoverage(options.coverage);
    if (coverage) {
        diagnostics = diagnostics.map((diagnostic) => {
            const executedLines = coverage.get(path.resolve(diagnostic.file));
            return {
                ...diagnostic,
                coverage: executedLines ? (executedLines.has(diagnostic.line) ? "observed" : "unobserved") : "unknown",
            };
        });
    }
    diagnostics.sort((left, right) => {
        if (coverage && left.coverage !== right.coverage) {
            const rank = { observed: 0, unknown: 1, unobserved: 2 };
            return rank[left.coverage] - rank[right.coverage];
        }
        return String(left.file).localeCompare(String(right.file)) || left.offset - right.offset || left.code.localeCompare(right.code);
    });
    if (options.writeBaseline) {
        const entries = diagnostics.map((diagnostic) => ({ key: lintBaselineKey(diagnostic), code: diagnostic.code, file: diagnostic.file, message: diagnostic.message }));
        writeFileSync(options.writeBaseline, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
    }
    const baseline = lintBaselineKeys(options.baseline);
    if (baseline.size > 0) diagnostics = diagnostics.filter((diagnostic) => !baseline.has(lintBaselineKey(diagnostic)));

    if (options.sarif) {
        console.log(JSON.stringify(lintDiagnosticsToSarif(diagnostics), null, 2));
    } else if (options.json) {
        console.log(JSON.stringify(diagnostics, null, 2));
    } else if (diagnostics.length === 0) {
        console.log(`RiX lint: no diagnostics in ${options.files.length} file(s)`);
    } else {
        for (const diagnostic of diagnostics) console.log(formatLintDiagnostic(diagnostic));
        const warnings = diagnostics.filter(({ severity }) => severity === "warning").length;
        const errors = diagnostics.filter(({ severity }) => severity === "error").length;
        const infos = diagnostics.filter(({ severity }) => severity === "info").length;
        console.log(`RiX lint: ${errors} error(s), ${warnings} warning(s), ${infos} info`);
    }
    if (fixesApplied > 0 && !options.json && !options.sarif) console.log(`RiX lint: applied ${fixesApplied} safe fix(es) with explicit --fix`);
    if (options.writeBaseline && !options.json && !options.sarif) console.log(`RiX lint: wrote baseline ${path.resolve(options.writeBaseline)}`);

    if (diagnostics.some(({ severity }) => severity === "error") || (options.strict && diagnostics.some(({ severity }) => severity === "warning"))) {
        process.exitCode = 1;
    }
}

function scopeUsage() {
    return `Usage:
  bun rix explain-scope [--json] file.rix:line[:column]

Shows the owner and required access form for identifiers on a source line.`;
}

function runExplainScope(rawArgs) {
    const json = rawArgs.includes("--json");
    const positional = rawArgs.filter((arg) => arg !== "--json");
    if (positional.includes("--help") || positional.includes("-h")) {
        console.log(scopeUsage());
        return;
    }
    if (positional.length !== 1) throw new Error("rix explain-scope requires file.rix:line[:column]");
    const match = positional[0].match(/^(.*):(\d+)(?::(\d+))?$/);
    if (!match || !match[1]) throw new Error("Scope target must be file.rix:line[:column]");
    const file = path.resolve(match[1]);
    const line = Number(match[2]);
    const column = match[3] ? Number(match[3]) : null;
    const source = readFileSync(file, "utf8");
    const sourceHeader = readSourceHeader(source, file);
    const operatorDefinitions = mergeOperatorDefinitions(
        ...readOperatorFiles(sourceHeader.operatorFiles, path.dirname(file)),
    );
    let entries = explainRixScopes(source, { file, operatorDefinitions }).filter((entry) => entry.line === line);
    if (column !== null && entries.length > 0) {
        const distance = Math.min(...entries.map((entry) => Math.abs(entry.column - column)));
        entries = entries.filter((entry) => Math.abs(entry.column - column) === distance);
    }
    if (json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    if (entries.length === 0) {
        console.log(`${file}:${line}${column === null ? "" : `:${column}`}: no identifiers`);
        return;
    }
    for (const entry of entries) {
        const owner = entry.owner ? `; owner=${entry.owner}` : "";
        const recommendation = entry.recommendation ? `; use ${entry.recommendation}` : "";
        console.log(`${entry.file}:${entry.line}:${entry.column} ${entry.name}: ${entry.status}${owner}${recommendation}`);
    }
}

function parseRunnerArgs(rawArgs) {
    const plugins = [];
    let outDir = null;
    let allPlugins = false;
    let allBuiltPlugins = false;
    let pluginsSpecified = false;
    let preamble = null;
    let noPreamble = false;
    let noConfig = false;
    let configDir = null;
    const operatorFiles = [];
    const positional = [];
    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (arg === "--with-floats") {
            plugins.push("float");
            pluginsSpecified = true;
        }
        else if (arg === "--all-plugins") allPlugins = true;
        else if (arg === "--all-built-plugins") allBuiltPlugins = true;
        else if (arg === "--plugin") {
            const id = rawArgs[++index];
            if (!id) throw new Error("--plugin requires a plugin id");
            plugins.push(id);
            pluginsSpecified = true;
        } else if (arg.startsWith("--plugin=")) {
            plugins.push(arg.slice("--plugin=".length));
            pluginsSpecified = true;
        } else if (arg.startsWith("--plugins=")) {
            plugins.push(...arg.slice("--plugins=".length).split(",").map((id) => id.trim()).filter(Boolean));
            pluginsSpecified = true;
        } else if (arg === "--operator-file") {
            const filename = rawArgs[++index];
            if (!filename) throw new Error("--operator-file requires a file");
            operatorFiles.push(filename);
        } else if (arg.startsWith("--operator-file=")) {
            const filename = arg.slice("--operator-file=".length);
            if (!filename) throw new Error("--operator-file requires a file");
            operatorFiles.push(filename);
        } else if (arg === "--preamble") {
            preamble = rawArgs[++index];
            if (!preamble) throw new Error("--preamble requires a file");
        } else if (arg.startsWith("--preamble=")) {
            preamble = arg.slice("--preamble=".length);
            if (!preamble) throw new Error("--preamble requires a file");
        } else if (arg === "--no-preamble") {
            noPreamble = true;
        } else if (arg === "--no-config") {
            noConfig = true;
        } else if (arg === "--config-dir") {
            configDir = rawArgs[++index];
            if (!configDir) throw new Error("--config-dir requires a directory");
        } else if (arg.startsWith("--config-dir=")) {
            configDir = arg.slice("--config-dir=".length);
            if (!configDir) throw new Error("--config-dir requires a directory");
        } else if (arg === "--out") {
            outDir = rawArgs[++index];
            if (!outDir) throw new Error("--out requires a directory");
        } else if (arg.startsWith("--out=")) {
            outDir = arg.slice("--out=".length);
            if (!outDir) throw new Error("--out requires a directory");
        } else positional.push(arg);
    }
    if (preamble && noPreamble) throw new Error("--preamble and --no-preamble cannot be used together");
    return {
        positional,
        plugins: [...new Set(plugins)],
        pluginsSpecified,
        allPlugins,
        allBuiltPlugins,
        outDir,
        operatorFiles,
        preamble,
        noPreamble,
        noConfig,
        configDir,
    };
}

function selectedPluginIds(pluginCatalog, { plugins, allPlugins, allBuiltPlugins }) {
    if (allPlugins) return pluginCatalog.list().map(({ id }) => id);
    if (allBuiltPlugins) return pluginCatalog.list().filter(({ id }) => BUILT_PLUGIN_IDS.has(id)).map(({ id }) => id);
    return resolvePluginSelectors(pluginCatalog, plugins, { standardIds: STANDARD_PLUGIN_IDS });
}

function readOperatorFiles(filenames, baseDir) {
    return filenames.map((filename) => {
        const operatorPath = path.resolve(baseDir, String(filename));
        const operatorSource = readFileSync(operatorPath, "utf8");
        return extractOperatorDeclarationsFromSource(operatorSource, { label: operatorPath });
    });
}

function registerBuiltPluginInstallers(pluginCatalog) {
    // Discovery finds the metadata before createDefaultSystemContext has a
    // chance to register bundled implementations, so approve these explicit
    // first-party installers in the CLI host.
    pluginCatalog.registerInstaller("float", installFloatPlugin);
    pluginCatalog.registerInstaller("example-array-js", installArrayJsExample);
    pluginCatalog.registerInstaller("draw", ({ systemContext }) => installDrawPlugin({ systemContext }));
    pluginCatalog.registerInstaller("fracfun", installFracfunPlugin);
    pluginCatalog.registerInstaller("plot", ({ systemContext }) => installPlotPlugin({ systemContext }));
    pluginCatalog.registerInstaller("scene3d", ({ systemContext }) => installScene3DPlugin({ systemContext }));
    pluginCatalog.registerInstaller("nd", ({ systemContext }) => installNdPlugin({ systemContext }));
    pluginCatalog.registerInstaller("geometry", ({ systemContext }) => installGeometryPlugin({ systemContext }));
    pluginCatalog.registerInstaller("data", ({ systemContext }) => installDataPlugin({ systemContext }));
    pluginCatalog.registerInstaller("document", ({ systemContext }) => installDocumentPlugin({ systemContext }));
    pluginCatalog.registerInstaller("terminal-ascii", installTerminalAsciiPlugin);
    pluginCatalog.registerInstaller("svg", installSvgPlugin);
    pluginCatalog.registerInstaller("canvas", installCanvasPlugin);
    pluginCatalog.registerInstaller("tikz", installTikzPlugin);
    pluginCatalog.registerInstaller("markdown", installMarkdownPlugin);
    pluginCatalog.registerInstaller("html", installHtmlPlugin);
    pluginCatalog.registerInstaller("quarto", installQuartoPlugin);
    pluginCatalog.registerInstaller("latex", installLatexPlugin);
    pluginCatalog.registerInstaller("png", (api) => installPngPlugin({ ...api, rasterizeSvg }));
    pluginCatalog.registerInstaller("pdf", (api) => installPdfPlugin({ ...api, compileLatex }));
    pluginCatalog.registerInstaller("gltf", installGltfPlugin);
    pluginCatalog.registerInstaller("csv", installCsvPlugin);
    pluginCatalog.registerInstaller("gif", (api) => installGifPlugin({ ...api, encodeGif: encodeGifFrames }));
}

function validateArtifactPath(outDir, artifactPath) {
    if (typeof artifactPath !== "string" || !artifactPath.trim()) throw new Error(".Out path must be a non-empty string");
    if (path.isAbsolute(artifactPath)) throw new Error(`.Out path must be relative: ${artifactPath}`);
    const target = path.resolve(outDir, artifactPath);
    const relative = path.relative(outDir, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`.Out path escapes --out directory: ${artifactPath}`);
    return target;
}

function pageHtml({ source, sourcePath, title, plugins }) {
    const config = JSON.stringify({ source, sourcePath, title, plugins }).replaceAll("<", "\\u003c");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title><link rel="stylesheet" href="assets/rix-page.css"></head>
<body><main id="rix-app"><noscript>This RiX page needs JavaScript enabled.</noscript></main><script>globalThis.__RIX_PAGE__=${config};</script><script src="assets/rix-page.js"></script></body></html>\n`;
}

function staticPageHtml({ value, title, context }) {
    const escapedTitle = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const body = renderOutputHtml(value, (item) => formatResult(item, { context }));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapedTitle}</title><link rel="stylesheet" href="assets/rix-page.css"></head>
<body><main id="rix-app">${body}</main></body></html>\n`;
}

function browserNodeShims() {
    return {
        name: "rix-browser-node-shims",
        setup(build) {
            build.onResolve({ filter: /^node:(fs|path|module)$/ }, ({ path: specifier }) => ({ path: specifier, namespace: "rix-node-shim" }));
            build.onLoad({ filter: /.*/, namespace: "rix-node-shim" }, ({ path: specifier }) => {
                const message = JSON.stringify(`${specifier} is unavailable in a generated RiX page`);
                if (specifier === "node:path") {
                    return {
                        contents: "const path = { isAbsolute: () => false, resolve: (...parts) => parts.at(-1) || \"\", dirname: () => \"\" }; export default path;",
                        loader: "js",
                    };
                }
                if (specifier === "node:module") {
                    return {
                        contents: `const unavailable = () => { throw new Error(${message}); }; const createRequire = () => unavailable; export { createRequire };`,
                        loader: "js",
                    };
                }
                return {
                    contents: `const unavailable = () => { throw new Error(${message}); }; const existsSync = unavailable, readdirSync = unavailable, readFileSync = unavailable, statSync = unavailable; export default new Proxy({}, { get: unavailable }); export { existsSync, readdirSync, readFileSync, statSync };`,
                    loader: "js",
                };
            });
        },
    };
}

async function buildBrowserRuntime(outDir) {
    const assetsDir = path.join(outDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(path.join(assetsDir, "rix-page.css"), readFileSync(WEB_PAGE_STYLE, "utf8"));
    const result = await Bun.build({
        entrypoints: [WEB_PAGE_ENTRY],
        outdir: assetsDir,
        target: "browser",
        format: "iife",
        naming: "rix-page.js",
        sourcemap: "none",
        loader: { ".rix": "text" },
        plugins: [browserNodeShims()],
    });
    if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n") || "Could not build the RiX browser runtime");
}

async function writeArtifacts({ outDir, artifacts, source, sourcePath, plugins, context, result, rendererRegistry = null }) {
    if (!outDir) {
        if (artifacts.length > 0) throw new Error("This script declares .Out artifacts; rerun with --out=DIR");
        return [];
    }
    const resolvedOutDir = path.resolve(outDir);
    mkdirSync(resolvedOutDir, { recursive: true });
    const htmlArtifacts = artifacts.filter(({ path: artifactPath }) => /\.html?$/i.test(artifactPath));
    const interactiveArtifacts = htmlArtifacts.filter((artifact) => artifact.value === result);
    if (interactiveArtifacts.length > 1) {
        throw new Error("Only one .html .Out artifact can be the final reactive view");
    }
    const legacyHtmlArtifacts = htmlArtifacts.filter((artifact) =>
        !artifact.value?._renderResult
        && (artifact.value === result || !rendererRegistry?.targetForPath(artifact.path)));
    if (legacyHtmlArtifacts.length > 0) await buildBrowserRuntime(resolvedOutDir);
    const written = [];
    for (const artifact of artifacts) {
        const target = validateArtifactPath(resolvedOutDir, artifact.path);
        mkdirSync(path.dirname(target), { recursive: true });
        let rendered = artifact.value?._renderResult || null;
        if (!rendered && rendererRegistry && !(artifact.value === result && /\.html?$/i.test(artifact.path))) {
            const renderTarget = rendererRegistry.targetForPath(artifact.path, { preserveAlias: true });
            if (renderTarget) {
                rendered = rendererRegistry.render(artifact.value, renderTarget, {
                    title: path.basename(artifact.path, path.extname(artifact.path)),
                }, { format: (item) => formatResult(item, { context }) });
            }
        }
        if (rendered) {
            writeFileSync(target, rendered.content);
            for (const asset of rendered.assets) {
                const assetTarget = validateArtifactPath(path.dirname(target), asset.path);
                mkdirSync(path.dirname(assetTarget), { recursive: true });
                writeFileSync(assetTarget, asset.content);
                written.push(assetTarget);
            }
        } else if (/\.html?$/i.test(artifact.path)) {
            const title = path.basename(artifact.path, path.extname(artifact.path));
            writeFileSync(target, artifact.value === result
                ? pageHtml({ source, sourcePath, title, plugins })
                : staticPageHtml({ value: artifact.value, title, context }));
        } else {
            writeFileSync(target, `${formatResult(artifact.value, { context })}\n`);
        }
        written.push(target);
    }
    return written;
}

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
    if (rawArgs[0] === "lint") return runLint(rawArgs.slice(1));
    if (rawArgs[0] === "explain-scope") return runExplainScope(rawArgs.slice(1));
    if (["parse", "symbols", "format", "verify"].includes(rawArgs[0])) return runEditorTool(rawArgs[0], rawArgs.slice(1));
    const {
        positional: args,
        plugins,
        pluginsSpecified,
        allPlugins,
        allBuiltPlugins,
        outDir,
        operatorFiles,
        preamble,
        noPreamble,
        noConfig,
        configDir: configDirOption,
    } = parseRunnerArgs(rawArgs);
    if (args[0] === "--help" || args[0] === "-h") {
        console.log(usage());
        return;
    }
    if (outDir && args[0] === "test") throw new Error("--out is only available when running a RiX program");
    const inputPath = args.length > 0 && args[0] !== "test" && args[0] !== "setup" ? path.resolve(args[0]) : null;
    const pluginRoots = [
        path.resolve(process.cwd(), "plugins"),
        inputPath ? path.join(path.dirname(inputPath), "plugins") : null,
        FIRST_PARTY_PLUGINS_DIR,
        EXAMPLE_PLUGINS_DIR,
    ].filter(Boolean);
    const pluginCatalog = new NodePluginCatalog({ roots: [...new Set(pluginRoots)] }).scan();
    registerBuiltPluginInstallers(pluginCatalog);
    const configDir = configDirOption ? path.resolve(configDirOption) : resolveRixConfigDir();

    if (args[0] === "setup") {
        if (args.length > 1) throw new Error("rix setup does not accept positional arguments");
        if (outDir || allPlugins || allBuiltPlugins || operatorFiles.length || preamble || noPreamble || noConfig) {
            throw new Error("rix setup accepts --plugins and --config-dir only");
        }
        const current = readRixCliConfig(configDir);
        const configuredPlugins = pluginsSpecified ? plugins : current.plugins;
        // Resolve now so misspelled plugin IDs and group names do not become a
        // persistent startup failure. Store selectors so groups remain dynamic.
        const resolved = resolvePluginSelectors(pluginCatalog, configuredPlugins, {
            standardIds: STANDARD_PLUGIN_IDS,
        });
        const configPath = writeRixCliConfig(configDir, {
            ...current,
            plugins: configuredPlugins,
        });
        const preamblePath = ensureRixCliPreamble(configDir);
        console.log(`RiX configuration: ${configPath}`);
        console.log(`REPL preamble: ${preamblePath}`);
        console.log(`Default REPL plugins: ${configuredPlugins.join(", ") || "none"}`);
        console.log(`Currently resolved: ${resolved.join(", ") || "none"}`);
        return;
    }

    const context = new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext({ pluginCatalog });

    if (args.length > 0 && args[0] === "test") {
        // Test runner mode
        const filters = args.slice(1);
        return runTests(filters);
    }

    if (args.length > 0) {
        // Run file
        const inputFile = args[0];

        try {
            const source = readFileSync(inputFile, "utf-8");
            const sourceHeader = readSourceHeader(source, inputFile);
            const operatorDefinitionSources = [
                ...readOperatorFiles(sourceHeader.operatorFiles, path.dirname(inputFile)),
                ...readOperatorFiles(operatorFiles, process.cwd()),
            ];
            const sourceOperatorDefinitions = mergeOperatorDefinitions(...operatorDefinitionSources);
            // Establish the synchronous RiX-plugin loader before command-line
            // preloads. Scripts may still use .Plugin.Load themselves.
            parseAndEvaluate("", { context, registry, systemContext });
            const pluginIds = [...new Set([
                ...selectedPluginIds(pluginCatalog, { plugins, allPlugins, allBuiltPlugins }),
                ...sourceHeader.plugins.map(String),
            ])];
            for (const id of pluginIds) {
                pluginCatalog.load(id, {
                    context,
                    registry,
                    systemContext,
                    loadRix: context.getEnv("__plugin_load_rix__"),
                });
            }
            const artifacts = [];
            if (outDir) context.setEnv("__output_sink__", (artifact) => artifacts.push(artifact));
            const result = await evaluateSource(source, {
                context,
                registry,
                systemContext,
                file: path.resolve(inputFile),
                operatorDefinitions: sourceOperatorDefinitions,
            });
            await drainBackgroundTasks(context);
            const written = await writeArtifacts({
                outDir,
                artifacts,
                source,
                sourcePath: path.resolve(inputFile),
                plugins: pluginIds,
                context,
                result,
                rendererRegistry: systemContext._rendererRegistry,
            });
            
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
            for (const outputPath of written) console.log(`Wrote ${outputPath}`);
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
        if (outDir) throw new Error("--out requires a RiX program file with .Out declarations");
        const cliConfig = noConfig
            ? { plugins: [] }
            : readRixCliConfig(configDir);
        const automaticPreamble = path.join(configDir, "cli-preamble.rix");
        const preamblePath = noPreamble
            ? null
            : preamble
                ? path.resolve(preamble)
                : !noConfig && existsSync(automaticPreamble)
                    ? automaticPreamble
                    : null;
        const preambleSource = preamblePath ? readFileSync(preamblePath, "utf8") : "";
        const preambleHeader = preamblePath
            ? readSourceHeader(preambleSource, preamblePath)
            : { plugins: [], operatorFiles: [] };
        const requestedPlugins = [
            ...cliConfig.plugins,
            ...plugins,
            ...preambleHeader.plugins.map(String),
        ];
        const pluginIds = selectedPluginIds(pluginCatalog, {
            plugins: requestedPlugins,
            allPlugins,
            allBuiltPlugins,
        });
        const replOperatorDefinitions = mergeOperatorDefinitions(
            ...readOperatorFiles(operatorFiles, process.cwd()),
            ...(preamblePath ? readOperatorFiles(preambleHeader.operatorFiles, path.dirname(preamblePath)) : []),
            ...(preamblePath ? [extractOperatorDeclarationsFromSource(preambleSource, {
                label: preamblePath,
            })] : []),
        );

        // Install the plugin loader first; plugin-provided syntax is then
        // available while parsing the preamble and all later submissions.
        parseAndEvaluate("", { context, registry, systemContext });
        for (const id of pluginIds) {
            pluginCatalog.load(id, {
                context,
                registry,
                systemContext,
                loadRix: context.getEnv("__plugin_load_rix__"),
            });
        }
        if (preamblePath) {
            await evaluateSource(preambleSource, {
                context,
                registry,
                systemContext,
                file: preamblePath,
                operatorDefinitions: replOperatorDefinitions,
            });
        }
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

        rl.on("line", async (line) => {
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
                const evaluationOptions = {
                    context,
                    registry,
                    systemContext,
                    operatorDefinitions: replOperatorDefinitions,
                };
                // Keep ordinary REPL submissions fully synchronous so multiple
                // lines already buffered by readline cannot overlap. Async
                // syntax deliberately yields until its scope has completed.
                const result = sourceUsesAsyncEvaluation(buffer)
                    ? await parseAndEvaluateAsync(buffer, evaluationOptions)
                    : parseAndEvaluate(buffer, evaluationOptions);
                
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

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
