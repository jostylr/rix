/**
 * Generated first-pass editor execution allowlist.
 *
 * This is deliberately explicit. `scripts/generate-editor-policy.js --check`
 * compares it with the filtered default runtime and CI fails on drift. Plugin
 * mounts are not ambient snapshot capabilities: the host approves them per
 * execution request and `createStandardSystemContext` admits only that loaded
 * dependency closure.
 */
export const STANDARD_CAPABILITY_NAMES = Object.freeze([
    "Abs", "Add", "AffineBoxRange", "Algebra", "All", "And", "Any", "Array", "ASSET", "Assign",
    "AssignCopy", "AssignDeepCopy", "AssignDeepUpdate", "AssignUpdate", "AUDIO", "BIND",
    "Block", "BoxResume", "BoxSubdivide", "CalculusDerivativeCheck", "CalculusDerivativeProof", "CalculusDerivativeSign", "CalculusGraphRewrite",
    "CalculusGraphRewriteCheck", "CalculusGraphSimplificationCheck", "CalculusGraphSimplify",
    "CalculusLipschitzRange", "CalculusRange", "CalculusRangeCheck", "CalculusRangeRecognize",
    "CalculusTaylorRange", "CALLOUT", "Case", "CertifiedApproximation", "Chunk", "CODE", "CODEBLOCK",
    "Complex", "Concat", "Config", "CONTROLPANEL", "Controls", "ConvertUnit", "DEBUG", "DEEPMUTABLE",
    "Define", "DefineExactGenerator", "DefineUnit", "DERIV", "Difference", "Disjoint", "Div", "DivMod",
    "DivRound", "DivUp", "DOCUMENT_TEMPLATE", "DoubleFactorial", "DUMP", "EMPHASIS", "EQ",
    "Equal", "ERROR", "EVAL", "Exact", "ExpressionApply", "ExpressionConstant", "ExpressionConstantInfo", "ExpressionDefinition", "ExpressionExpand", "EXPRESSIONFROMSPEC", "ExpressionHasExtendedConstants", "ExpressionHasScopedSymbols", "ExpressionKey", "ExpressionOperation", "ExpressionReal", "ExpressionRefine", "ExpressionVariable", "ExpressionVariableMatches", "ExpressionVariableSelector", "Factorial", "FIGURE", "Filter", "FIRST",
    "FORMULASHEET", "FRAGMENT", "GETEL", "Graphics", "Greater", "GreaterEqual", "GRID", "GT",
    "GTE", "HEADING", "Hull", "If", "IMAGE", "ImmutableValue", "ImplicitTrace", "ImplicitTraceCheck", "ImplicitTraceRefine", "INFO", "INFOVALUE", "INSPECTSPEC",
    "IntDiv", "INTEGRATE", "Intersect", "Intersects", "Interval", "IntervalLinearSolve", "IntervalNewtonBox", "IRANGE", "IsExpression", "JacobianBoxRange", "KEYOF", "KEYS", "KrawczykBox", "KrawczykCheck", "Lambda",
    "LAST", "LEN", "Less", "LessEqual", "LINEBREAK", "LINK", "LIST", "LISTITEM", "LIVEVIEW",
    "LogicSequent", "LogicCheckSequent", "LogicSequentTree", "LogicExactProposition", "LogicCheckProposition",
    "Loop", "LT", "LTE", "Map", "MATH", "MATHBLOCK", "MathBudgets", "MathDecodeJSON", "MathDecodeJSONL", "RealImportJSON", "RealExportJSON", "RealImportInfo", "RealRefineImported", "MathEncodeJSON", "MathEncodeJSONL", "MathEvaluate", "MathEvaluateCalculus", "MathInstantiate", "MathPolynomialCoefficients", "MathSubstitute", "Max", "Min", "Mod", "Mul", "MULTI",
    "MultivariateRangeCheck", "MultivariateRangeRequest", "Neg", "NEQ", "Not", "NotationParser", "NotEqual", "Or", "Pair", "PARAGRAPH", "Params",
    "Pipe", "PipeExplicit", "PMap", "Poly", "Pow", "PowProd", "PRINT", "Product", "QUOTE",
    "RAND_NAME", "RANDOMSEED", "RangeAbsoluteValue", "RangeAdd", "RangeDivide", "RangeEvidence",
    "RangeIntegerPower", "RangeMultiply", "RangeNegate", "RangePolicy", "RangeReciprocal",
    "RangeSubtract", "RationalBox", "REACTIVEGRAPH", "Reduce", "RefinementCheck",
    "RefinementEffectiveLimits", "RefinementRequest", "RefinementSupports", "RefinementUnsupported",
    "REGISTERMETHOD", "Retry", "Reverse", "RIXCELEXPORT", "RIXCELEXPORTCSV", "RIXCELEXPORTTSV",
    "RIXCELIMPORT", "RIXCELIMPORTCSV", "RIXCELIMPORTTSV", "RNG", "SAME_CELL", "SameCell",
    "SameSymbol", "SArith", "SECTION", "Set", "SHEET", "SIMPLIFY", "Slice", "SliceClamp", "SLIDE", "SLIDES",
    "SNAPSHOTS", "Sort", "SPEC", "SPECCABILITY", "SPECFRACTIONPARTS", "SPECFROMEXPRESSION", "SPECROLES", "Split",
    "STOP", "Stream", "STRONG", "Sub", "SUBSTR", "SymmetricDifference", "TABLE", "TaylorModelBoxRange",
    "TEMPLATE_TEXT", "TEST", "TESTERROR", "TESTSTOP", "TEXT", "Shaped", "Timeline", "TRACE",
    "TRANSFORM", "Tuple", "TypeExport", "TypeImport", "TypeKnown",
    "NumeralSystem", "NumeralParse", "NumeralFormat", "NumeralPlaces", "NumeralLocale",
    "Undecided", "Union", "Units", "UPPER", "ValidatedBoxCheck", "ValidatedClaimEqual", "VALUES", "VIDEO", "WARN",
]);

export const STANDARD_PLUGIN_SNAPSHOT = Object.freeze([]);

export const STANDARD_DENIED_NAMES = Object.freeze([
    "BACKGROUND", "CapabilityRegister", "Core", "FILES", "Host", "ImportJS", "JSCall",
    "NET", "Out", "Plugin", "Render", "Renderer", "TraitRegister", "TypeInstall", "TypeRegister",
]);

export function createStandardSystemContext(source, { pluginIds = [], pluginNames = [] } = {}) {
    const full = typeof source === "function" ? source() : source;
    const allowed = new Set(STANDARD_CAPABILITY_NAMES.map((name) => name.toUpperCase()));
    const allowedPlugins = new Set(pluginIds.map(String));
    const allowedHostNames = new Set(pluginNames.map((name) => String(name).toLowerCase()));
    const withheld = full.getAllEntries()
        .filter((entry) => entry.namespace === "core"
            ? !allowed.has(entry.displayName.toUpperCase())
            : !(entry.pluginId && allowedPlugins.has(entry.pluginId))
                && !allowedHostNames.has(entry.displayName.toLowerCase()))
        .map((entry) => entry.displayName);
    return full.withhold(...withheld);
}
