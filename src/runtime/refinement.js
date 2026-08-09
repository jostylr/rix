import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";

export const REFINEMENT_REQUEST_SCHEMA = "rix.numerics.refinement-request@1";
export const REFINEMENT_RESULT_SCHEMA = "rix.numerics.enclosure@1";
export const REFINEMENT_CAPABILITIES_SCHEMA = "rix.numerics.capabilities@1";

const OPERATIONS = new Set(["enclose", "refine", "sample"]);
const STATUSES = new Set([
    "enclosed", "approximate", "goalNotMet", "budgetExhausted",
    "resolutionFloor", "unsupported", "unknown",
]);
const LIMIT_KEYS = ["maxwork", "maxcalls", "maxiterations", "maxdepth", "timeout", "memory"];
const EVIDENCE_RANK = new Map([
    ["approximate", 0], ["observed", 1], ["assumed", 2],
    ["constructorGuarantee", 3], ["proof", 4],
]);

export const refinementText = (value) => ({ type: "string", value: String(value) });
export const refinementMap = (entries = []) => ({ type: "map", entries: new Map(entries) });
export const refinementSequence = (values = []) => ({ type: "sequence", values });

export function refinementEntry(value, key, fallback = null) {
    if (!(value?.type === "map" && value.entries instanceof Map)) return fallback;
    const wanted = String(key).toLowerCase();
    for (const [candidate, item] of value.entries) {
        if (String(candidate).toLowerCase() === wanted) return item;
    }
    return fallback;
}

function nameOf(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (value?.type === "string") return value.value;
    return String(value);
}

function asRational(value, label, { positive = false } = {}) {
    const rational = value instanceof Integer ? value.toRational() : value;
    if (!(rational instanceof Rational)) throw new TypeError(`${label} must be an exact Integer or Rational`);
    if (positive && !rational.greaterThan(Rational.zero)) throw new RangeError(`${label} must be positive`);
    return rational;
}

function asNonnegativeInteger(value, label) {
    if (!(value instanceof Integer) || value.value < 0n) throw new RangeError(`${label} must be a nonnegative Integer`);
    return value;
}

function truth(value) {
    return value !== null && value !== undefined;
}

function bool(value) {
    return value ? new Integer(1n) : null;
}

function option(map, key, fallback) {
    if (arguments.length < 3) fallback = null;
    if (!(map?.type === "map" && map.entries instanceof Map)) return fallback;
    const wanted = String(key).toLowerCase();
    for (const [candidate, value] of map.entries) {
        if (String(candidate).toLowerCase() === wanted) return value;
    }
    return fallback;
}

function exactLessThanOrEqual(left, right) {
    const a = left instanceof Integer ? left.toRational() : left;
    const b = right instanceof Integer ? right.toRational() : right;
    if (!(a instanceof Rational) || !(b instanceof Rational)) return null;
    return a.lessThanOrEqual(b);
}

function restrictiveLimit(requested, provider) {
    if (requested === null || requested === undefined) return provider ?? null;
    if (provider === null || provider === undefined) return requested;
    const comparison = exactLessThanOrEqual(requested, provider);
    return comparison === null || comparison ? requested : provider;
}

function normalizeLimitKey(key) {
    const normalized = String(key).toLowerCase();
    return normalized === "maxmemory" ? "memory" : normalized;
}

function providerLimits(capabilities) {
    const found = new Map();
    if (!(capabilities?.type === "map" && capabilities.entries instanceof Map)) return found;
    for (const [key, value] of capabilities.entries) {
        const normalized = normalizeLimitKey(key);
        if (LIMIT_KEYS.includes(normalized)) found.set(normalized, value);
    }
    for (const container of ["limits", "work"]) {
        const nested = refinementEntry(capabilities, container, null);
        if (!(nested?.type === "map" && nested.entries instanceof Map)) continue;
        for (const [key, value] of nested.entries) {
            const normalized = normalizeLimitKey(key);
            if (LIMIT_KEYS.includes(normalized)) found.set(normalized, value);
        }
    }
    return found;
}

function requestedLimits(options) {
    const found = new Map();
    const work = option(options, "work", null);
    for (const key of LIMIT_KEYS) {
        const aliases = key === "memory" ? ["memory", "maxmemory"] : [key];
        let value;
        for (const alias of aliases) {
            value = option(options, alias, undefined);
            if (value === undefined && work) value = option(work, alias, undefined);
            if (value !== undefined) break;
        }
        if (value !== undefined) found.set(key, value);
    }
    return found;
}

function normalizeWork(options, capabilities) {
    const requested = requestedLimits(options);
    const defaults = new Map([
        ["maxwork", new Integer(100n)],
    ]);
    if (!requested.has("maxwork")) requested.set("maxwork", defaults.get("maxwork"));
    if (!requested.has("maxcalls")) requested.set("maxcalls", requested.get("maxwork"));
    if (!requested.has("maxiterations")) requested.set("maxiterations", requested.get("maxwork"));

    const provider = providerLimits(capabilities);
    const effective = new Map();
    for (const key of LIMIT_KEYS) {
        const value = restrictiveLimit(requested.get(key), provider.get(key));
        if (value === null || value === undefined) continue;
        if (["maxwork", "maxcalls", "maxiterations", "maxdepth", "memory"].includes(key)) {
            asNonnegativeInteger(value, key);
        } else if (key === "timeout") {
            asRational(value, key, { positive: true });
        }
        effective.set(key, value);
    }
    return refinementMap(effective);
}

/** Normalize every request boundary, including already-shaped requests. */
export function normalizeRefinementRequest(options = null, { operation = null, capabilities = null } = {}) {
    const source = options?.type === "map" && options.entries instanceof Map ? options : refinementMap();
    const selectedOperation = nameOf(operation, nameOf(option(source, "operation", null), "enclose"));
    if (!OPERATIONS.has(selectedOperation)) throw new RangeError(`Unknown refinement operation '${selectedOperation}'`);
    const absoluteWidth = asRational(
        option(source, "absolutewidth", option(source, "width", new Rational(1n, 1000n))),
        "absoluteWidth",
        { positive: true },
    );
    const relativeWidthValue = option(source, "relativewidth", null);
    const relativeWidth = relativeWidthValue === null
        ? null
        : asRational(relativeWidthValue, "relativeWidth", { positive: true });
    const work = normalizeWork(source, capabilities);
    const entries = [
        ["valuekind", refinementText("refinementRequest")],
        ["schema", refinementText(REFINEMENT_REQUEST_SCHEMA)],
        ["operation", refinementText(selectedOperation)],
        ["absolutewidth", absoluteWidth],
        ["relativewidth", relativeWidth],
        ["evidencerequired", option(source, "evidencerequired", refinementText("any"))],
        ["trace", option(source, "trace", new Integer(1n))],
        ["seed", option(source, "seed", new Integer(1n))],
        ["work", work],
    ];
    const purpose = option(source, "purpose", null);
    if (purpose !== null) entries.push(["purpose", purpose]);
    for (const key of ["timeout", "memory"]) {
        const value = refinementEntry(work, key, null);
        if (value !== null) entries.push([key, value]);
    }
    return refinementMap(entries);
}

export function refinementEffectiveLimits(request, capabilities = null) {
    return normalizeWork(normalizeRefinementRequest(request), capabilities);
}

export function refinementSupports(capabilities, operation) {
    if (!(capabilities?.type === "map" && capabilities.entries instanceof Map)) return false;
    if (nameOf(refinementEntry(capabilities, "schema", null)) !== REFINEMENT_CAPABILITIES_SCHEMA) return false;
    const wanted = nameOf(operation);
    const operations = refinementEntry(capabilities, "operations", null)?.values;
    return Array.isArray(operations) && operations.some((item) => nameOf(item) === wanted);
}

function intervalWidth(interval) {
    return interval.high.subtract(interval.low);
}

function limitObserved(work, name) {
    if (!(work?.type === "map" && work.entries instanceof Map)) return null;
    const aliases = name === "maxwork" ? ["total", "work", "calls"] :
        name === "maxcalls" ? ["calls"] :
        name === "maxiterations" ? ["iterations"] :
        name === "maxdepth" ? ["depth"] :
        name === "timeout" ? ["elapsed", "timeout"] :
        name === "memory" ? ["memory", "maxmemory"] : [];
    for (const alias of aliases) {
        const value = refinementEntry(work, alias, null);
        if (value !== null) return value;
    }
    return null;
}

function evidenceSatisfies(actualValue, requiredValue) {
    const required = nameOf(requiredValue, "any");
    if (required === "any") return true;
    const actual = nameOf(actualValue, "");
    if (!EVIDENCE_RANK.has(required)) return actual === required;
    return (EVIDENCE_RANK.get(actual) ?? -1) >= EVIDENCE_RANK.get(required);
}

/** Return a detailed, non-throwing validation record for a provider result. */
export function checkRefinementResult(result, request, capabilities = null) {
    const normalizedRequest = normalizeRefinementRequest(request);
    const isMap = result?.type === "map" && result.entries instanceof Map;
    const requiredFields = [
        "schema", "status", "interval", "certified", "goalmet", "evidencelevel",
        "backend", "operation", "requestedwidth", "achievedwidth", "work", "diagnostics",
    ];
    const fieldsPresent = isMap && requiredFields.every((key) => {
        const wanted = key.toLowerCase();
        return Array.from(result.entries.keys()).some((candidate) => String(candidate).toLowerCase() === wanted);
    });
    const schemaValid = isMap && nameOf(refinementEntry(result, "schema", null)) === REFINEMENT_RESULT_SCHEMA;
    const status = nameOf(refinementEntry(result, "status", null));
    const statusValid = STATUSES.has(status);
    const interval = refinementEntry(result, "interval", null);
    const intervalValid = interval instanceof RationalInterval;
    const requestedOperation = nameOf(refinementEntry(normalizedRequest, "operation", null));
    const operationValid = nameOf(refinementEntry(result, "operation", null)) === requestedOperation;
    const capabilityValid = capabilities === null || refinementSupports(capabilities, requestedOperation);
    const certified = truth(refinementEntry(result, "certified", null));
    const certificationValid = capabilities === null || !certified || truth(refinementEntry(capabilities, "certified", null));
    const approximation = refinementEntry(result, "approximation", null);
    const approximationPresent = !certified || approximation instanceof CertifiedApproximation;
    const approximationConsistent = !certified || (
        approximation instanceof CertifiedApproximation && intervalValid && approximation.enclosure.equals(interval)
    );
    const achievedWidth = refinementEntry(result, "achievedwidth", null);
    const widthConsistent = !intervalValid || (
        (achievedWidth instanceof Integer || achievedWidth instanceof Rational) &&
        asRational(achievedWidth, "achievedWidth").equals(intervalWidth(interval))
    );
    const requestedWidth = refinementEntry(normalizedRequest, "absolutewidth", null);
    const resultRequestedWidth = refinementEntry(result, "requestedwidth", null);
    const requestedWidthConsistent = (resultRequestedWidth instanceof Integer || resultRequestedWidth instanceof Rational) &&
        asRational(resultRequestedWidth, "requestedWidth").equals(requestedWidth);
    const widthGoal = intervalValid && intervalWidth(interval).lessThanOrEqual(requestedWidth);
    const goalMet = truth(refinementEntry(result, "goalmet", null));
    const goalConsistent = certified
        ? goalMet === widthGoal && !(["budgetExhausted", "resolutionFloor", "unsupported", "unknown"].includes(status) && goalMet)
        : !goalMet;
    const statusConsistent = (status !== "enclosed" || (certified && goalMet)) &&
        (status !== "approximate" || !certified) &&
        (status !== "unsupported" || !certified);
    const evidenceValid = evidenceSatisfies(
        refinementEntry(result, "evidencelevel", null),
        refinementEntry(normalizedRequest, "evidencerequired", null),
    );
    const capabilityEvidence = refinementEntry(capabilities, "evidencelevels", null)?.values;
    const actualEvidence = nameOf(refinementEntry(result, "evidencelevel", null));
    const capabilityEvidenceValid = capabilities === null || !Array.isArray(capabilityEvidence) ||
        capabilityEvidence.some((item) => nameOf(item) === actualEvidence);
    const work = refinementEntry(result, "work", null);
    const requestWork = refinementEntry(normalizedRequest, "work", null);
    let workWithinLimits = work?.type === "map" && work.entries instanceof Map;
    if (workWithinLimits) {
        for (const key of LIMIT_KEYS) {
            const limit = refinementEntry(requestWork, key, null);
            const observed = limitObserved(work, key);
            if (limit !== null && observed !== null && exactLessThanOrEqual(observed, limit) !== true) {
                workWithinLimits = false;
                break;
            }
        }
    }
    const valid = Boolean(fieldsPresent && schemaValid && statusValid && intervalValid && operationValid &&
        capabilityValid && certificationValid && approximationPresent && approximationConsistent &&
        requestedWidthConsistent && widthConsistent && goalConsistent && statusConsistent &&
        evidenceValid && capabilityEvidenceValid && workWithinLimits);
    return refinementMap([
        ["valuekind", refinementText("numericsResultCheck")],
        ["valid", bool(valid)],
        ["fieldspresent", bool(fieldsPresent)],
        ["schemavalid", bool(schemaValid)],
        ["statusvalid", bool(statusValid)],
        ["intervalvalid", bool(intervalValid)],
        ["operationvalid", bool(operationValid)],
        ["capabilityvalid", bool(capabilityValid)],
        ["certificationvalid", bool(certificationValid)],
        ["approximationpresent", bool(approximationPresent)],
        ["approximationconsistent", bool(approximationConsistent)],
        ["widthconsistent", bool(widthConsistent)],
        ["requestedwidthconsistent", bool(requestedWidthConsistent)],
        ["goalconsistent", bool(goalConsistent)],
        ["statusconsistent", bool(statusConsistent)],
        ["evidencevalid", bool(evidenceValid)],
        ["capabilityevidencevalid", bool(capabilityEvidenceValid)],
        ["workwithinlimits", bool(workWithinLimits)],
        ["interval", interval],
        ["request", normalizedRequest],
        ["result", result],
    ]);
}

export function unsupportedRefinementResult(request, capabilities = null, reason = "unsupported") {
    const normalized = normalizeRefinementRequest(request);
    const operation = refinementEntry(normalized, "operation", refinementText("refine"));
    const backend = refinementEntry(capabilities, "backend", refinementText("unknown"));
    return refinementMap([
        ["valuekind", refinementText("enclosure")],
        ["schema", refinementText(REFINEMENT_RESULT_SCHEMA)],
        ["status", refinementText("unsupported")],
        ["interval", RationalInterval.zero],
        ["certified", null],
        ["goalmet", null],
        ["requestedwidth", refinementEntry(normalized, "absolutewidth", null)],
        ["achievedwidth", Rational.zero],
        ["evidencelevel", refinementText("approximate")],
        ["backend", backend],
        ["operation", operation],
        ["work", refinementMap()],
        ["diagnostics", refinementSequence([refinementText(reason)])],
    ]);
}

export function refinementOutcome(result, request, capabilities = null) {
    const check = checkRefinementResult(result, request, capabilities);
    const status = nameOf(refinementEntry(result, "status", null), "unknown");
    const certified = truth(refinementEntry(result, "certified", null));
    const approximation = refinementEntry(result, "approximation", null);
    const details = refinementMap([
        ["status", refinementEntry(result, "status", refinementText(status))],
        ["backend", refinementEntry(result, "backend", refinementText("unknown"))],
        ["requestedwidth", refinementEntry(request, "absolutewidth", null)],
        ["achievedwidth", refinementEntry(result, "achievedwidth", null)],
        ["work", refinementEntry(result, "work", refinementMap())],
        ["diagnostics", refinementEntry(result, "diagnostics", refinementSequence())],
        ["evidence", refinementEntry(result, "evidence", null)],
        ["check", check],
    ]);
    if (!certified) return { value: null, reason: status === "unsupported" ? "unsupported" : "providerUncertified", details, check };
    if (!truth(refinementEntry(check, "valid", null))) return { value: null, reason: "invalidProviderResult", details, check };
    if (approximation instanceof CertifiedApproximation) {
        const fallbackReason = status === "budgetExhausted" ? "budgetExhausted"
            : status === "resolutionFloor" ? "resolutionFloor"
            : status === "unsupported" ? "unsupported"
            : status === "unknown" ? "unknown"
            : "haloResolutionReached";
        return { value: approximation, reason: fallbackReason, details, check };
    }
    return { value: null, reason: "invalidProviderResult", details, check };
}
