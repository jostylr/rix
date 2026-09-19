/** Exact sources and bounded, deterministic display policy. Browser-safe; no locale runtime dependency. */
import { Integer, Rational, Fraction, RationalInterval, CertifiedApproximation } from "@ratmath/core";

export const NUMERIC_PRESENTATION_SCHEMA = "rix.numeric-presentation@1";
const DEFAULTS = Object.freeze({ schema: NUMERIC_PRESENTATION_SCHEMA, notation: "exact", fraction: "improper",
    significantDigits: 12, decimalPlaces: null, rounding: "nearest-even", locale: "invariant", grouping: false, maxPeriod: 1024 });
const CONTEXT = Symbol("numeric formatter context");
const unwrap = value => value instanceof Integer ? Number(value.value) : value?.type === "string" ? value.value : value;
const error = text => { throw new Error(`Numeric presentation: ${text}`); };

export function createNumericPolicy(options = {}) {
    if (options !== null && (typeof options !== "object" || Array.isArray(options))) error("policy must be a map");
    const entries = options instanceof Map ? options : options?.type === "map" ? options.entries : Object.entries(options || {});
    if (!entries || typeof entries[Symbol.iterator] !== "function") error("policy must be a map");
    const names = new Map(Object.keys(DEFAULTS).map(key => [key.toLowerCase(), key]));
    const policy = { ...DEFAULTS };
    for (const [key, raw] of entries) {
        const name = names.get(String(key).toLowerCase());
        if (!name) error(`unknown option ${key}`);
        policy[name] = unwrap(raw);
    }
    if (policy.schema !== NUMERIC_PRESENTATION_SCHEMA) error("unsupported policy version");
    for (const [key, allowed] of Object.entries({ notation: ["exact", "decimal", "scientific", "engineering", "repeating"],
        fraction: ["improper", "mixed"], rounding: ["nearest-even", "floor", "ceil", "toward-zero"], locale: ["invariant", "en-US", "de-DE", "fr-FR"] })) {
        if (!allowed.includes(policy[key])) error(`invalid ${key}`);
    }
    for (const [key, min, max] of [["significantDigits", 1, 256], ["maxPeriod", 1, 4096], ["decimalPlaces", 0, 256]]) {
        if (key === "decimalPlaces" && policy[key] === null) continue;
        if (!Number.isSafeInteger(policy[key]) || policy[key] < min || policy[key] > max) error(`${key} must be within ${min}…${max}`);
    }
    if ([0, 1].includes(policy.grouping)) policy.grouping = Boolean(policy.grouping);
    if (typeof policy.grouping !== "boolean") error("grouping must be a boolean or 0/1");
    return Object.freeze(policy);
}

function parts(value) {
    let n, d;
    if (value instanceof Integer) { n = value.value; d = 1n; }
    else if (value instanceof Rational || value instanceof Fraction) { n = value.numerator; d = value.denominator; }
    else return null;
    if (d === 0n) error("nonfinite exact source");
    if (d < 0n) { n = -n; d = -d; }
    if (n.toString().length > 16384 || d.toString().length > 16384) error("source digit budget exceeded");
    return [n, d];
}
const pow10 = n => { if (Math.abs(n) > 16640) error("decimal exponent budget exceeded"); return 10n ** BigInt(n); };
function exponent(n, d) {
    n = n < 0n ? -n : n;
    if (n === 0n) return 0;
    let e = n.toString().length - d.toString().length;
    if (e >= 0 ? n < d * pow10(e) : n * pow10(-e) < d) e--;
    return e;
}
function roundedQuotient(n, d, mode) {
    let q = n / d, r = n % d;
    if (r === 0n) return [q, false];
    const sign = n < 0n ? -1n : 1n, magnitude = r < 0n ? -r : r;
    if (mode === "floor" && sign < 0n || mode === "ceil" && sign > 0n
        || mode === "nearest-even" && (2n * magnitude > d || 2n * magnitude === d && q % 2n !== 0n)) q += sign;
    return [q, true];
}
function decimal(n, d, places, mode) {
    const [q, rounded] = places >= 0 ? roundedQuotient(n * pow10(places), d, mode) : roundedQuotient(n, d * pow10(-places), mode);
    const sign = q < 0n ? "-" : "", digits = (q < 0n ? -q : q).toString();
    const padded = digits.padStart(places + 1, "0");
    return { text: places > 0 ? `${sign}${padded.slice(0, -places)}.${padded.slice(-places)}`
        : sign + digits + "0".repeat(-places), rounded };
}
function localize(text, policy, { decimalPoint = false, exact = false } = {}) {
    const separator = policy.locale === "de-DE" ? "." : policy.locale === "fr-FR" ? " " : ",";
    const point = ["de-DE", "fr-FR"].includes(policy.locale) ? "," : ".";
    // Process each integer component separately; mixed-number '..' is source grammar.
    if (exact) return policy.grouping ? text.replace(/\d+/g, digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator)) : text;
    const [mantissa, exp] = text.split("E");
    const dot = decimalPoint ? mantissa.indexOf(".") : -1;
    const whole = dot < 0 ? mantissa : mantissa.slice(0, dot);
    const rest = dot < 0 ? "" : point + mantissa.slice(dot + 1);
    return (policy.grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole) + rest + (exp === undefined ? "" : "E" + exp);
}
function scalar(value, policy, rounding = policy.rounding) {
    const pair = parts(value);
    if (!pair) return null;
    const [n, d] = pair, formal = value instanceof Fraction;
    let result;
    // Formal fractions are always kept unreduced; policy never silently normalizes parentage.
    if (policy.notation === "exact" || formal) {
        let text = d === 1n && !formal ? String(n) : `${n}/${d}`;
        if (policy.fraction === "mixed" && !formal && n !== 0n) {
            const a = n < 0n ? -n : n, whole = a / d, remainder = a % d;
            if (whole && remainder) text = `${n < 0n ? "-" : ""}${whole}..${remainder}/${d}`;
        }
        return { text: localize(text, policy, { exact: true }), rounded: false, exhausted: false };
    }
    if (policy.notation === "repeating") {
        const a = n < 0n ? -n : n;
        let remainder = a % d, digits = "", repeat = -1;
        const seen = new Map();
        while (remainder && digits.length < policy.maxPeriod) {
            if (seen.has(remainder)) { repeat = seen.get(remainder); break; }
            seen.set(remainder, digits.length); remainder *= 10n;
            digits += remainder / d; remainder %= d;
        }
        if (remainder && seen.has(remainder)) repeat = seen.get(remainder);
        if (remainder && repeat < 0) return { ...scalar(value, { ...policy, notation: "decimal" }, rounding), exhausted: true };
        const fraction = repeat < 0 ? digits : digits.slice(0, repeat) + "#" + digits.slice(repeat);
        result = { text: `${n < 0n ? "-" : ""}${a / d}${fraction ? "." + fraction : ""}`, rounded: false };
    } else {
        const e = exponent(n, d);
        if (policy.notation === "decimal") result = decimal(n, d, policy.decimalPlaces ?? policy.significantDigits - 1 - e, rounding);
        else {
            let scale = policy.notation === "engineering" ? Math.floor(e / 3) * 3 : e;
            const scaled = () => scale >= 0 ? [n, d * pow10(scale)] : [n * pow10(-scale), d];
            result = decimal(...scaled(), policy.significantDigits - 1 - (e - scale), rounding);
            // Carry at 9.99… / 999.99… must normalize the displayed exponent.
            const limit = policy.notation === "engineering" ? 1000 : 10;
            const displayedWhole = BigInt(result.text.split(".")[0]);
            if (displayedWhole >= BigInt(limit) || displayedWhole <= -BigInt(limit)) {
                scale += policy.notation === "engineering" ? 3 : 1;
                result = decimal(...scaled(), policy.significantDigits - 1, rounding);
            }
            result.text += `E${scale >= 0 ? "+" : ""}${scale}`;
        }
    }
    return { ...result, text: localize(result.text, policy, { decimalPoint: true }), exhausted: false };
}

/** Returned evidence always retains the original value, independent of display text. */
export function presentNumericValue(value, options = {}) {
    const policy = createNumericPolicy(options);
    if (value instanceof CertifiedApproximation) {
        const candidate = scalar(value.candidate, policy);
        const enclosure = presentNumericValue(value.enclosure, policy);
        return Object.freeze({ schema: NUMERIC_PRESENTATION_SCHEMA, value, policy, source: value.toString(),
            text: `≈ ${candidate.text} [certified enclosure ${enclosure.text}]`, rounded: candidate.rounded || enclosure.rounded,
            exhausted: candidate.exhausted || enclosure.exhausted, evidence: "certified-enclosure" });
    }
    if (value instanceof RationalInterval) {
        const ascending = value.start.lessThanOrEqual(value.end);
        const start = scalar(value.start, policy, ascending ? "floor" : "ceil");
        const end = scalar(value.end, policy, ascending ? "ceil" : "floor");
        const rounded = start.rounded || end.rounded, exhausted = start.exhausted || end.exhausted;
        return Object.freeze({ schema: NUMERIC_PRESENTATION_SCHEMA, value, policy, source: value.toString(),
            text: `${rounded ? "≈ " : ""}${start.text}:${end.text}${exhausted ? " [period limit]" : ""}`, rounded, exhausted,
            evidence: "exact-interval", orientation: ascending ? "ascending" : "descending", enclosurePolicy: "outward" });
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) error("nonfinite approximate source");
        return Object.freeze({ schema: NUMERIC_PRESENTATION_SCHEMA, value, policy,
            source: String(value), text: `≈ ${String(value)}`, rounded: false, exhausted: false, evidence: "approximate-input" });
    }
    const result = scalar(value, policy);
    return result ? Object.freeze({ schema: NUMERIC_PRESENTATION_SCHEMA, value, policy, source: value.toString(),
        text: `${result.rounded ? "≈ " : ""}${result.text}${result.exhausted ? " [period limit]" : ""}`,
        rounded: result.rounded, exhausted: result.exhausted, evidence: value instanceof Fraction ? "formal-fraction" : "exact" }) : null;
}

/** Inherited policy; an explicit child policy replaces its parent's policy. */
export function numericFormatter(format, options = null) {
    if (options === null || options === undefined) return format;
    const policy = createNumericPolicy(options), base = format[CONTEXT]?.base || format;
    const formatted = value => presentNumericValue(value, policy)?.text ?? base(value);
    Object.defineProperty(formatted, CONTEXT, { value: { base, policy } });
    return formatted;
}

export function numericFormatterPolicy(format) { return format?.[CONTEXT]?.policy ?? null; }
export function numericSourceFormatter(format) { return format?.[CONTEXT]?.base ?? format; }

/** Attach presentation to a retained output node, without copying its mathematical tree. */
export function withNumericPresentation(value, options = {}) {
    const numericPolicy = createNumericPolicy(options);
    if (value?.type === "output") return Object.freeze({ ...value, numericPolicy });
    if (!presentNumericValue(value, numericPolicy)) error("Present expects a number or output value");
    return Object.freeze({ type: "output", kind: "text", value, style: null, numericPolicy,
        _ext: new Map([["immutable", new Integer(1n)]]) });
}
