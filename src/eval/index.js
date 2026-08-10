export { lower, lowerNode } from "./lower.js";
export { ir, IR } from "./ir.js";
export { Registry } from "./registry.js";
export {
    evaluate,
    evaluateAsync,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    parseAndEvaluateAsync,
    drainBackgroundTasks,
} from "./evaluator.js";
export { irToText, irListToText } from "./ir-to-text.js";
export { formatValue } from "./format.js";
export {
    RIX_LINT_LEVELS,
    RIX_LINT_PROFILES,
    RIX_LINT_RULES,
    analyzeRix,
    lintRix,
    explainRixScopes,
    formatLintDiagnostic,
    applyRixLintFixes,
    lintDiagnosticsToSarif,
} from "./lint.js";
export { getAttachedSpec, inspectSymbolicSpec, isSymbolicSpec, resolveSymbolicRoles, symbolicNames } from "./functions/symbolic.js";
