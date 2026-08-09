import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";

function asRational(value, label) {
    if (value instanceof Integer) return value.toRational();
    if (value instanceof Rational) return value;
    throw new TypeError(`${label} must be an exact Integer or Rational`);
}

export function enclosureOf(value) {
    if (value instanceof CertifiedApproximation) return value.enclosure;
    if (value instanceof RationalInterval) return value;
    if (value instanceof Integer || value instanceof Rational) {
        const point = asRational(value, "Halo value");
        return new RationalInterval(point, point);
    }
    return null;
}

/** A bounded-refinement comparison request; it does not enlarge its target. */
export class HaloNeighborhood {
    constructor(target, epsilon, limits = null) {
        if (!(target instanceof Integer || target instanceof Rational || target instanceof RationalInterval)) {
            throw new TypeError("Halo target must be an exact scalar or RationalInterval");
        }
        const width = asRational(epsilon, "Halo epsilon");
        if (!width.greaterThan(Rational.zero)) {
            throw new RangeError("Halo epsilon must be positive");
        }
        if (limits !== null && (limits?.type !== "map" || !(limits.entries instanceof Map))) {
            throw new TypeError("Halo limits must be a map");
        }
        this.target = target;
        this.epsilon = width;
        this.limits = limits;
        this.type = "halo";
        Object.freeze(this);
    }

    toString() {
        return `{~ ${this.target}, ${this.epsilon}${this.limits ? ", ..." : ""} }`;
    }
}

export const isHaloNeighborhood = (value) => value instanceof HaloNeighborhood;

