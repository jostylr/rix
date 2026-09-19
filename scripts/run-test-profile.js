#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import path from "node:path";

export const rixRoot = path.resolve(import.meta.dir, "..");

export const documentationTests = new Set([
    "tests/tools/documentation-examples.test.js",
    "tests/tools/documentation-methods.test.js",
    "tests/tools/documentation-navigation.test.js",
    "tests/tools/plugin-tutorials.test.js",
]);

// These exhaustive files are intentionally suite-only. Geometry construction
// is the single slowest standalone file, while the concurrency stress matrix
// adds coverage already sampled by the short/CI async contracts.
export const suiteOnlyTests = new Set([
    "tests/eval/async-concurrency.test.js",
    "tests/eval/geometry-plugin.test.js",
]);

// The short profile is the edit/compile feedback loop. Keep it broad across
// parser, evaluator, runtime, CLI, and editor boundaries, but avoid tests that
// load the large mathematical plugin corpus repeatedly.
export const shortTests = new Set([
    "editors/vscode/tests/manifest.test.js",
    "examples/newton/nth-root-compact.test.js",
    "examples/newton/nth-root.test.js",
    "tests/cli/editor-tools.test.js",
    "tests/cli/lint.test.js",
    "tests/cli/png-policy.test.js",
    "tests/eval/arity-cap.test.js",
    "tests/eval/brace-refactor.test.js",
    "tests/eval/cells.test.js",
    "tests/eval/colon-string.test.js",
    "tests/eval/comma-sequence.test.js",
    "tests/eval/core-syntax-capabilities.test.js",
    "tests/eval/custom-operators.test.js",
    "tests/eval/destructuring.test.js",
    "tests/eval/evaluator.test.js",
    "tests/eval/format.test.js",
    "tests/eval/holes.test.js",
    "tests/eval/identity-comparison.test.js",
    "tests/eval/implicit-adjacency.test.js",
    "tests/eval/lint.test.js",
    "tests/eval/lower.test.js",
    "tests/eval/methods.test.js",
    "tests/eval/operator-dispatch.test.js",
    "tests/eval/partial.test.js",
    "tests/eval/pipe-locator.test.js",
    "tests/eval/semantic-operators.test.js",
    "tests/eval/shaped.test.js",
    "tests/eval/type-system.test.js",
    "tests/parser/array-generators-integration.test.js",
    "tests/parser/array-generators.test.js",
    "tests/parser/async-pipe-operators.test.js",
    "tests/parser/certified-approximations.test.js",
    "tests/parser/comma-sequence.test.js",
    "tests/parser/custom-operators.test.js",
    "tests/parser/op-brace.test.js",
    "tests/parser/parser-units.test.js",
    "tests/parser/parser.test.js",
    "tests/parser/phase1-merger.test.js",
    "tests/parser/phase1b-merger.test.js",
    "tests/parser/system-spec.test.js",
    "tests/parser/ternary.test.js",
    "tests/parser/tokenizer.test.js",
    "tests/runtime/async-runtime.test.js",
    "tests/runtime/async-stream.test.js",
    "tests/runtime/async-stream-pipeline.test.js",
    "tests/runtime/async-stream-adapters.test.js",
    "tests/eval/async-stream-segments.test.js",
    "tests/runtime/range-evidence-checker.test.js",
    "tests/runtime/range-schemas.test.js",
    "tests/runtime/range-set-interchange.test.js",
    "tests/runtime/rixcel-references.test.js",
    "tests/tools/codemirror.test.js",
    "tests/tools/control-panel-view.test.js",
    "tests/tools/graphic-view.test.js",
    "tests/tools/language-service.test.js",
    "tests/tools/lsp.test.js",
    "tests/tools/rix-to-ir.test.js",
    "tests/tools/sheet-view.test.js",
    "tests/tools/test-profiles.test.js",
    "tests/tools/workspace-config.test.js",
]);

// CI adds representative plugin, host, reactive, packaging, and exported-output
// contracts. Exhaustive plugin mathematics and documentation stay in ten/suite.
export const ciAdditionalTests = new Set([
    "tests/cli/config.test.js",
    "tests/cli/examples.test.js",
    "tests/eval/algebra-plugin.test.js",
    "tests/eval/async-reactive-boundary.test.js",
    "tests/eval/diagnostics.test.js",
    "tests/eval/math-plugin-implementation-kind.test.js",
    "tests/eval/numerics-plugin.test.js",
    "tests/eval/output.test.js",
    "tests/eval/plugin-catalog.test.js",
    "tests/eval/plugin-lint.test.js",
    "tests/eval/renderers.test.js",
    "tests/eval/system-context.test.js",
    "tests/eval/system-manifest.test.js",
    "tests/eval/system-spec.test.js",
    "tests/repl/completion.test.js",
    "tests/runtime/binding.test.js",
    "tests/runtime/formula-sheet.test.js",
    "tests/runtime/host-adapter.test.js",
    "tests/runtime/reactive-bindings.test.js",
    "tests/runtime/reactive-graph.test.js",
    "tests/runtime/reactive-view.test.js",
    "tests/runtime/rixcel-document.test.js",
    "tests/runtime/rixcel-interchange.test.js",
    "tests/tools/execution-worker.test.js",
    "tests/tools/geometry-construction-codec.test.js",
    "tests/tools/graphic-accessibility.test.js",
    "tests/tools/output-widgets.test.js",
    "tests/tools/package-smoke.test.js",
    "tests/tools/scene3d-view.test.js",
    "tests/tools/timeline-view.test.js",
]);

export function collectTests(directory, result = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) collectTests(filename, result);
        else if (entry.isFile() && /[._](?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
            result.push(path.relative(rixRoot, filename));
        }
    }
    return result;
}

export function allTests() {
    return ["tests", "editors", "examples"]
        .flatMap((directory) => collectTests(path.join(rixRoot, directory)))
        .sort();
}

function requireKnownTests(all, selected, profile) {
    for (const filename of selected) {
        if (!all.includes(filename)) throw new Error(`Missing ${profile} test: ${filename}`);
    }
}

export function selectTests(profile, all = allTests()) {
    requireKnownTests(all, documentationTests, "documentation");
    requireKnownTests(all, shortTests, "short-profile");
    requireKnownTests(all, ciAdditionalTests, "ci-profile");

    if (profile === "short") return all.filter((filename) => shortTests.has(filename));
    if (profile === "ci") {
        return all.filter((filename) => shortTests.has(filename) || ciAdditionalTests.has(filename));
    }
    if (profile === "ten") {
        return all.filter((filename) => !documentationTests.has(filename) && !suiteOnlyTests.has(filename));
    }
    if (profile === "suite") return all;
    if (profile === "docs") return all.filter((filename) => documentationTests.has(filename));
    return null;
}

export async function runProfile(profile, extraArgs = []) {
    const selectedTests = selectTests(profile);
    if (!selectedTests) {
        console.error("Usage: bun scripts/run-test-profile.js <short|ci|ten|suite|docs> [bun test flags]");
        return 2;
    }

    console.log(`Running ${selectedTests.length} ${profile} test file(s).`);
    const child = Bun.spawn([
        process.execPath,
        "test",
        "--timeout",
        "60000",
        ...extraArgs,
        ...selectedTests,
    ], {
        cwd: rixRoot,
        env: process.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    return child.exited;
}

if (import.meta.main) {
    const [, , profile, ...extraArgs] = process.argv;
    process.exit(await runProfile(profile, extraArgs));
}
