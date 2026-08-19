export const RANGE_SET_INTERCHANGE_VERSION = 1;
export const RANGE_SET_STABLE_VERSIONS = Object.freeze([1]);

export class RangeSetInterchangeVersionError extends Error {
    constructor(code, encounteredVersion) {
        super(`${code}: RationalIntervalSet version ${String(encounteredVersion)}; supported stable versions: ${RANGE_SET_STABLE_VERSIONS.join(", ")}`);
        this.name = "RangeSetInterchangeVersionError";
        this.code = code;
        this.type = "RationalIntervalSet";
        this.encounteredVersion = encounteredVersion;
        this.supportedVersions = RANGE_SET_STABLE_VERSIONS;
    }
}

/**
 * Return the pure in-memory migration plan for a portable range-set version.
 * V1 has no predecessor. Future stable odd versions extend this table rather
 * than changing the meaning of an existing plan.
 */
export function rangeSetMigrationPlan(sourceVersion, targetVersion = RANGE_SET_INTERCHANGE_VERSION) {
    if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1) {
        throw new RangeSetInterchangeVersionError("invalidVersion", sourceVersion);
    }
    if (sourceVersion > RANGE_SET_INTERCHANGE_VERSION) {
        throw new RangeSetInterchangeVersionError("unsupportedFutureVersion", sourceVersion);
    }
    if (!RANGE_SET_STABLE_VERSIONS.includes(sourceVersion)) {
        throw new RangeSetInterchangeVersionError("unsupportedHistoricalVersion", sourceVersion);
    }
    if (targetVersion !== RANGE_SET_INTERCHANGE_VERSION) {
        throw new RangeSetInterchangeVersionError("unsupportedTargetVersion", targetVersion);
    }
    return Object.freeze({
        type: "RationalIntervalSet",
        sourceVersion,
        targetVersion,
        migrated: sourceVersion !== targetVersion,
        steps: Object.freeze([]),
        warnings: Object.freeze([]),
        dropped: Object.freeze([]),
        approximated: Object.freeze([]),
        rewriteSource: false,
    });
}
