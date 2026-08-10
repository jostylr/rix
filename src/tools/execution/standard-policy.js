/**
 * Generated first-pass editor execution allowlist.
 *
 * This is deliberately explicit. `scripts/generate-editor-policy.js --check`
 * compares it with the filtered default runtime and CI fails on drift. Host
 * plugin mounts are empty in the first release; they require a later reviewed
 * snapshot addition.
 */
export const STANDARD_CAPABILITY_NAMES = Object.freeze([
    "Abs", "Add", "Algebra", "All", "And", "Any", "Array", "ASSET", "Assign",
    "AssignCopy", "AssignDeepCopy", "AssignDeepUpdate", "AssignUpdate", "AUDIO", "BIND",
    "Block", "CALLOUT", "Case", "CertifiedApproximation", "Chunk", "CODE", "CODEBLOCK",
    "Complex", "Concat", "CONTROLPANEL", "Controls", "ConvertUnit", "DEBUG", "DEEPMUTABLE",
    "Define", "DefineExactGenerator", "DefineUnit", "DERIV", "Difference", "Div", "DivMod",
    "DivRound", "DivUp", "DOCUMENT_TEMPLATE", "DoubleFactorial", "DUMP", "EMPHASIS", "EQ",
    "Equal", "ERROR", "EVAL", "Exact", "Factorial", "FIGURE", "Filter", "FIRST",
    "FORMULASHEET", "FRAGMENT", "GETEL", "Graphics", "Greater", "GreaterEqual", "GRID", "GT",
    "GTE", "HEADING", "If", "IMAGE", "ImmutableValue", "INFO", "INFOVALUE", "INSPECTSPEC",
    "IntDiv", "INTEGRATE", "Intersect", "Interval", "IRANGE", "KEYOF", "KEYS", "Lambda",
    "LAST", "LEN", "Less", "LessEqual", "LINEBREAK", "LINK", "LIST", "LISTITEM", "LIVEVIEW",
    "Loop", "LT", "LTE", "Map", "MATH", "MATHBLOCK", "Max", "Min", "Mod", "Mul", "MULTI",
    "Neg", "NEQ", "Not", "NotationParser", "NotEqual", "Or", "Pair", "PARAGRAPH", "Params",
    "Pipe", "PipeExplicit", "PMap", "Poly", "Pow", "PowProd", "PRINT", "Product", "QUOTE",
    "RAND_NAME", "RANDOMSEED", "REACTIVEGRAPH", "Reduce", "RefinementCheck",
    "RefinementEffectiveLimits", "RefinementRequest", "RefinementSupports", "RefinementUnsupported",
    "REGISTERMETHOD", "Retry", "Reverse", "RIXCELEXPORT", "RIXCELEXPORTCSV", "RIXCELEXPORTTSV",
    "RIXCELIMPORT", "RIXCELIMPORTCSV", "RIXCELIMPORTTSV", "RNG", "SAME_CELL", "SameCell",
    "SArith", "SECTION", "Set", "SHEET", "SIMPLIFY", "Slice", "SliceClamp", "SLIDE", "SLIDES",
    "SNAPSHOTS", "Sort", "SPEC", "SPECCABILITY", "SPECFRACTIONPARTS", "SPECROLES", "Split",
    "Sqrt", "STOP", "Stream", "STRONG", "Sub", "SUBSTR", "SymmetricDifference", "TABLE",
    "TEMPLATE_TEXT", "TEST", "TESTERROR", "TESTSTOP", "TEXT", "TGEN", "Timeline", "TRACE",
    "TraitRegister", "TRANSFORM", "Tuple", "TypeExport", "TypeImport", "TypeKnown", "TypeRegister",
    "Undecided", "Union", "Units", "UPPER", "VALUES", "VIDEO", "WARN",
]);

export const STANDARD_PLUGIN_SNAPSHOT = Object.freeze([]);

export const STANDARD_DENIED_NAMES = Object.freeze([
    "BACKGROUND", "CapabilityRegister", "Core", "FILES", "Host", "ImportJS", "JSCall",
    "NET", "Out", "Plugin", "Render", "Renderer", "TypeInstall",
]);

export function createStandardSystemContext(createDefaultSystemContext) {
    const full = createDefaultSystemContext();
    const allowed = new Set(STANDARD_CAPABILITY_NAMES.map((name) => name.toUpperCase()));
    const withheld = full.getAllEntries()
        .filter((entry) => entry.namespace !== "core" || !allowed.has(entry.displayName.toUpperCase()))
        .map((entry) => entry.displayName);
    return full.withhold(...withheld);
}

