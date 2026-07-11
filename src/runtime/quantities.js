import { Integer, Rational } from "@ratmath/core";
import {
    addScalars,
    divideScalars,
    equalScalars,
    isExactValue,
    isRationalScalar,
    multiplyScalars,
    negateScalar,
    powScalar,
    subtractScalars,
} from "./exact-values.js";

function int(value) {
    return new Integer(BigInt(value));
}

function rat(numerator, denominator = 1n) {
    return denominator === 1n ? new Integer(numerator) : new Rational(numerator, denominator);
}

function stringValue(value, label = "name") {
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    throw new Error(`${label} must be a string or colon string`);
}

export function isScalar(value) {
    return isRationalScalar(value) || isExactValue(value);
}

function cloneDimensions(dimensions = {}) {
    return Object.fromEntries(Object.entries(dimensions).filter(([, exponent]) => exponent !== 0));
}

function combineDimensions(left, right, sign = 1) {
    const dimensions = cloneDimensions(left);
    for (const [name, exponent] of Object.entries(right)) {
        const next = (dimensions[name] || 0) + sign * exponent;
        if (next === 0) delete dimensions[name];
        else dimensions[name] = next;
    }
    return dimensions;
}

function scaleDimensions(dimensions, exponent) {
    return Object.fromEntries(
        Object.entries(dimensions)
            .map(([name, power]) => [name, power * exponent])
            .filter(([, power]) => power !== 0),
    );
}

export function dimensionsEqual(left, right) {
    const a = Object.entries(cloneDimensions(left)).sort();
    const b = Object.entries(cloneDimensions(right)).sort();
    return a.length === b.length && a.every(([name, exponent], index) => name === b[index][0] && exponent === b[index][1]);
}

function describeDimensions(dimensions) {
    const entries = Object.entries(dimensions).sort();
    return entries.length
        ? entries.map(([name, exponent]) => exponent === 1 ? name : `${name}^${exponent}`).join("*")
        : "Dimensionless";
}

function unitExt(name) {
    return new Map([["key", { type: "string", value: name }], ["immutable", int(1)]]);
}

export function createUnit(name, options = {}) {
    const symbol = options.symbol || name;
    return Object.freeze({
        type: "unit",
        name,
        symbol,
        dimensions: cloneDimensions(options.dimensions),
        scale: options.scale || int(1),
        offset: options.offset || int(0),
        affine: options.affine === true,
        difference: options.difference === true,
        differenceUnit: options.differenceUnit || null,
        _ext: unitExt(name),
    });
}

export function isUnitValue(value) {
    return value?.type === "unit" || value?.type === "unit_expr";
}

function factorKey(factor) {
    return factor.name || factor.symbol;
}

function factorsFromUnit(unit) {
    if (unit.type === "unit_expr") return new Map(unit.factors);
    return new Map([[unit, 1]]);
}

function createUnitExpr(dimensions, scale, factors) {
    return {
        type: "unit_expr",
        dimensions: cloneDimensions(dimensions),
        scale,
        offset: int(0),
        affine: false,
        factors: new Map([...factors.entries()].filter(([, exponent]) => exponent !== 0)),
    };
}

function ensureLinearUnit(unit) {
    if (unit?.affine) throw new Error(`Affine unit '${unit.symbol}' cannot be used in a compound unit expression`);
}

export function multiplyUnits(left, right) {
    ensureLinearUnit(left);
    ensureLinearUnit(right);
    const factors = factorsFromUnit(left);
    for (const [factor, exponent] of factorsFromUnit(right)) {
        const next = (factors.get(factor) || 0) + exponent;
        if (next === 0) factors.delete(factor);
        else factors.set(factor, next);
    }
    return createUnitExpr(
        combineDimensions(left.dimensions, right.dimensions),
        multiplyScalars(left.scale, right.scale),
        factors,
    );
}

export function divideUnits(left, right) {
    ensureLinearUnit(left);
    ensureLinearUnit(right);
    const factors = factorsFromUnit(left);
    for (const [factor, exponent] of factorsFromUnit(right)) {
        const next = (factors.get(factor) || 0) - exponent;
        if (next === 0) factors.delete(factor);
        else factors.set(factor, next);
    }
    return createUnitExpr(
        combineDimensions(left.dimensions, right.dimensions, -1),
        divideScalars(left.scale, right.scale),
        factors,
    );
}

export function invertUnit(unit) {
    ensureLinearUnit(unit);
    const factors = new Map([...factorsFromUnit(unit)].map(([factor, exponent]) => [factor, -exponent]));
    return createUnitExpr(scaleDimensions(unit.dimensions, -1), divideScalars(int(1), unit.scale), factors);
}

function integerExponent(value) {
    if (value instanceof Integer) return Number(value.value);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    throw new Error("Unit exponent must be an integer");
}

export function powUnit(unit, exponentValue) {
    ensureLinearUnit(unit);
    const exponent = integerExponent(exponentValue);
    const factors = new Map([...factorsFromUnit(unit)].map(([factor, power]) => [factor, power * exponent]));
    return createUnitExpr(
        scaleDimensions(unit.dimensions, exponent),
        powScalar(unit.scale, int(exponent)),
        factors,
    );
}

export function constructQuantity(magnitude, unit) {
    if (!isScalar(magnitude)) throw new Error("A unit must be applied to an exact scalar value");
    if (!isUnitValue(unit)) throw new Error("Quantity construction requires a Unit or UnitExpr");
    const scaled = multiplyScalars(magnitude, unit.scale);
    const baseMagnitude = unit.affine ? addScalars(scaled, unit.offset) : scaled;
    return {
        type: "quantity",
        baseMagnitude,
        dimensions: cloneDimensions(unit.dimensions),
        displayUnit: unit,
        affinePoint: unit.affine === true,
    };
}

export function isQuantity(value) {
    return value?.type === "quantity";
}

export function displayMagnitude(quantity) {
    const unit = quantity.displayUnit;
    const shifted = unit.affine ? subtractScalars(quantity.baseMagnitude, unit.offset) : quantity.baseMagnitude;
    return divideScalars(shifted, unit.scale);
}

export function convertQuantity(quantity, target) {
    if (!isQuantity(quantity)) throw new Error("ConvertUnit expects a quantity");
    if (!isUnitValue(target)) throw new Error("ConvertUnit target must be a Unit or UnitExpr");
    if (!dimensionsEqual(quantity.dimensions, target.dimensions)) {
        throw new Error(`Incompatible unit dimensions: ${describeDimensions(quantity.dimensions)} cannot convert to ${describeDimensions(target.dimensions)}`);
    }
    if (quantity.affinePoint && target.difference) {
        throw new Error("Cannot convert an affine quantity point to a difference unit");
    }
    if (!quantity.affinePoint && target.affine) {
        throw new Error("Cannot convert a quantity difference to an affine coordinate unit");
    }
    return {
        ...quantity,
        displayUnit: target,
        affinePoint: quantity.affinePoint || target.affine === true,
    };
}

export function addQuantities(left, right) {
    if (!dimensionsEqual(left.dimensions, right.dimensions)) {
        throw new Error(`Incompatible quantity dimensions for addition: ${describeDimensions(left.dimensions)} and ${describeDimensions(right.dimensions)}`);
    }
    if (left.affinePoint && right.affinePoint) {
        throw new Error("Cannot add two affine quantity points; add a temperature difference instead");
    }
    const point = left.affinePoint ? left : right.affinePoint ? right : null;
    return {
        type: "quantity",
        baseMagnitude: addScalars(left.baseMagnitude, right.baseMagnitude),
        dimensions: cloneDimensions(left.dimensions),
        displayUnit: point?.displayUnit || left.displayUnit,
        affinePoint: Boolean(point),
    };
}

export function subtractQuantities(left, right) {
    if (!dimensionsEqual(left.dimensions, right.dimensions)) {
        throw new Error(`Incompatible quantity dimensions for subtraction: ${describeDimensions(left.dimensions)} and ${describeDimensions(right.dimensions)}`);
    }
    if (!left.affinePoint && right.affinePoint) {
        throw new Error("Cannot subtract an affine quantity point from a quantity difference");
    }
    const pointDifference = left.affinePoint && right.affinePoint;
    const displayUnit = pointDifference
        ? (left.displayUnit.differenceUnit || createUnit(`delta${left.displayUnit.symbol}`, {
            symbol: `delta${left.displayUnit.symbol}`,
            dimensions: left.dimensions,
            scale: left.displayUnit.scale,
            difference: true,
        }))
        : left.displayUnit;
    return {
        type: "quantity",
        baseMagnitude: subtractScalars(left.baseMagnitude, right.baseMagnitude),
        dimensions: cloneDimensions(left.dimensions),
        displayUnit,
        affinePoint: left.affinePoint && !pointDifference,
    };
}

function displayProduct(left, right, divide = false) {
    return divide ? divideUnits(left, right) : multiplyUnits(left, right);
}

export function multiplyQuantityValues(left, right) {
    if (isQuantity(left) && isQuantity(right)) {
        if (left.affinePoint || right.affinePoint) throw new Error("Affine quantity points cannot be multiplied");
        const dimensions = combineDimensions(left.dimensions, right.dimensions);
        const baseMagnitude = multiplyScalars(left.baseMagnitude, right.baseMagnitude);
        if (Object.keys(dimensions).length === 0) return baseMagnitude;
        return {
            type: "quantity",
            baseMagnitude,
            dimensions,
            displayUnit: displayProduct(left.displayUnit, right.displayUnit),
            affinePoint: false,
        };
    }
    const quantity = isQuantity(left) ? left : right;
    const scalar = isQuantity(left) ? right : left;
    if (!isScalar(scalar)) throw new Error("Quantity multiplication requires a scalar or quantity");
    return { ...quantity, baseMagnitude: multiplyScalars(quantity.baseMagnitude, scalar) };
}

export function divideQuantityValues(left, right) {
    if (isQuantity(left) && isQuantity(right)) {
        if (left.affinePoint || right.affinePoint) throw new Error("Affine quantity points cannot be divided");
        const dimensions = combineDimensions(left.dimensions, right.dimensions, -1);
        const baseMagnitude = divideScalars(left.baseMagnitude, right.baseMagnitude);
        if (Object.keys(dimensions).length === 0) return baseMagnitude;
        return {
            type: "quantity",
            baseMagnitude,
            dimensions,
            displayUnit: displayProduct(left.displayUnit, right.displayUnit, true),
            affinePoint: false,
        };
    }
    if (isQuantity(left) && isScalar(right)) {
        return { ...left, baseMagnitude: divideScalars(left.baseMagnitude, right) };
    }
    if (isScalar(left) && isQuantity(right)) {
        if (right.affinePoint) throw new Error("Cannot divide by an affine quantity point");
        return {
            type: "quantity",
            baseMagnitude: divideScalars(left, right.baseMagnitude),
            dimensions: scaleDimensions(right.dimensions, -1),
            displayUnit: invertUnit(right.displayUnit),
            affinePoint: false,
        };
    }
    throw new Error("Unsupported quantity division");
}

export function powQuantity(quantity, exponentValue) {
    if (quantity.affinePoint) throw new Error("Affine quantity points cannot be exponentiated");
    const exponent = integerExponent(exponentValue);
    const dimensions = scaleDimensions(quantity.dimensions, exponent);
    const magnitude = powScalar(quantity.baseMagnitude, int(exponent));
    if (Object.keys(dimensions).length === 0) return magnitude;
    return {
        type: "quantity",
        baseMagnitude: magnitude,
        dimensions,
        displayUnit: powUnit(quantity.displayUnit, int(exponent)),
        affinePoint: false,
    };
}

export function negateQuantity(quantity) {
    return { ...quantity, baseMagnitude: negateScalar(quantity.baseMagnitude) };
}

export function quantitiesEqual(left, right) {
    return dimensionsEqual(left.dimensions, right.dimensions) && equalScalars(left.baseMagnitude, right.baseMagnitude);
}

export function unitsEquivalent(left, right) {
    return dimensionsEqual(left.dimensions, right.dimensions) &&
        left.affine === right.affine &&
        equalScalars(left.scale, right.scale) &&
        equalScalars(left.offset || int(0), right.offset || int(0));
}

export function compareQuantities(left, right) {
    if (!dimensionsEqual(left.dimensions, right.dimensions)) {
        throw new Error(`Incompatible quantity dimensions for ordering: ${describeDimensions(left.dimensions)} and ${describeDimensions(right.dimensions)}`);
    }
    const difference = subtractScalars(left.baseMagnitude, right.baseMagnitude);
    if (isExactValue(difference)) throw new Error("Exact symbolic quantity expressions are not ordered");
    if (difference instanceof Integer) return difference.value < 0n ? -1 : difference.value > 0n ? 1 : 0;
    if (difference instanceof Rational) return difference.numerator < 0n ? -1 : difference.numerator > 0n ? 1 : 0;
    throw new Error("Quantity ordering requires an ordered scalar magnitude");
}

export function formatUnit(unit) {
    if (unit.type === "unit") return unit.symbol;
    const numerator = [];
    const denominator = [];
    const factors = [...unit.factors.entries()].sort(([a], [b]) => factorKey(a).localeCompare(factorKey(b)));
    for (const [factor, exponent] of factors) {
        const target = exponent > 0 ? numerator : denominator;
        const power = Math.abs(exponent);
        target.push(power === 1 ? factor.symbol : `${factor.symbol}^${power}`);
    }
    if (numerator.length === 0 && denominator.length === 0) return "1";
    const top = numerator.length ? numerator.join("*") : "1";
    return denominator.length ? `${top}/${denominator.join("*")}` : top;
}

export function formatQuantity(quantity, formatScalar) {
    return `${formatScalar(displayMagnitude(quantity))}~[${formatUnit(quantity.displayUnit)}]`;
}

function unitEntry(collection, name) {
    if (!collection || collection.type !== "map" || !(collection.entries instanceof Map)) {
        throw new Error("Active Units value must be a RiX map collection");
    }
    const value = collection.entries.get(name);
    if (!isUnitValue(value)) throw new Error(`Unknown unit '${name}'`);
    return value;
}

export function parseUnitExpression(source, collection) {
    const input = String(source).replace(/\s+/g, "");
    let index = 0;

    function parsePrimary() {
        if (input[index] === "(") {
            index++;
            const value = parseProduct();
            if (input[index] !== ")") throw new Error(`Expected ')' in unit expression '${source}'`);
            index++;
            return value;
        }
        const match = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(input.slice(index));
        if (!match) throw new Error(`Invalid unit expression '${source}' at character ${index + 1}`);
        index += match[0].length;
        return unitEntry(collection, match[0]);
    }

    function parsePower() {
        let value = parsePrimary();
        if (input[index] === "^") {
            index++;
            const match = /^-?\d+/.exec(input.slice(index));
            if (!match) throw new Error(`Expected integer exponent in unit expression '${source}'`);
            index += match[0].length;
            value = powUnit(value, int(match[0]));
        }
        return value;
    }

    function parseProduct() {
        let value = parsePower();
        while (input[index] === "*" || input[index] === "/") {
            const operator = input[index++];
            const right = parsePower();
            value = operator === "*" ? multiplyUnits(value, right) : divideUnits(value, right);
        }
        return value;
    }

    if (!input) throw new Error("Unit expression cannot be empty");
    const result = parseProduct();
    if (index !== input.length) throw new Error(`Invalid trailing input in unit expression '${source}'`);
    return result;
}

export function defineUnitFromValue(nameValue, definition) {
    const name = stringValue(nameValue, "Unit name");
    if (isUnitValue(definition)) {
        return createUnit(name, {
            symbol: name,
            dimensions: definition.dimensions,
            scale: definition.scale,
        });
    }
    if (!isQuantity(definition) || definition.affinePoint) {
        throw new Error("DefineUnit expects a linear Unit or Quantity definition");
    }
    return createUnit(name, {
        symbol: name,
        dimensions: definition.dimensions,
        scale: definition.baseMagnitude,
    });
}

export function createDefaultUnitCollection() {
    const entries = new Map();
    const add = (name, options, aliases = []) => {
        const unit = createUnit(name, options);
        entries.set(name, unit);
        entries.set(name.toLowerCase(), unit);
        entries.set(unit.symbol, unit);
        entries.set(unit.symbol.toLowerCase(), unit);
        for (const alias of aliases) entries.set(alias, unit);
        return unit;
    };

    const m = add("m", { dimensions: { Length: 1 } }, ["meter", "metre"]);
    const s = add("s", { dimensions: { Time: 1 } }, ["second"]);
    const kg = add("kg", { dimensions: { Mass: 1 } }, ["kilogram"]);
    add("A", { dimensions: { Current: 1 } }, ["ampere"]);
    add("deltaK", {
        dimensions: { Temperature: 1 }, symbol: "deltaK", difference: true,
    });
    add("K", { dimensions: { Temperature: 1 }, symbol: "K" }, ["kelvin"]);
    add("mol", { dimensions: { Amount: 1 } }, ["mole"]);
    add("cd", { dimensions: { Luminosity: 1 } }, ["candela"]);
    add("rad", { dimensions: { Angle: 1 } }, ["radian"]);

    add("min", { dimensions: s.dimensions, scale: int(60), symbol: "min" }, ["minute"]);
    add("h", { dimensions: s.dimensions, scale: int(3600), symbol: "h" }, ["hour"]);
    add("day", { dimensions: s.dimensions, scale: int(86400), symbol: "day" });
    add("km", { dimensions: m.dimensions, scale: int(1000), symbol: "km" }, ["kilometer", "kilometre"]);
    add("cm", { dimensions: m.dimensions, scale: rat(1n, 100n), symbol: "cm" });
    add("mm", { dimensions: m.dimensions, scale: rat(1n, 1000n), symbol: "mm" });
    add("in", { dimensions: m.dimensions, scale: rat(127n, 5000n), symbol: "in" }, ["inch"]);
    add("ft", { dimensions: m.dimensions, scale: rat(381n, 1250n), symbol: "ft" }, ["foot"]);
    add("yd", { dimensions: m.dimensions, scale: rat(1143n, 1250n), symbol: "yd" }, ["yard"]);
    add("mi", { dimensions: m.dimensions, scale: rat(201168n, 125n), symbol: "mi" }, ["mile"]);

    add("Hz", { dimensions: { Time: -1 }, symbol: "Hz" }, ["hertz"]);
    add("N", { dimensions: { Mass: 1, Length: 1, Time: -2 }, symbol: "N" }, ["newton"]);
    add("J", { dimensions: { Mass: 1, Length: 2, Time: -2 }, symbol: "J" }, ["joule"]);
    add("W", { dimensions: { Mass: 1, Length: 2, Time: -3 }, symbol: "W" }, ["watt"]);
    add("Pa", { dimensions: { Mass: 1, Length: -1, Time: -2 }, symbol: "Pa" }, ["pascal"]);

    const deltaDegC = add("deltaDegC", { dimensions: { Temperature: 1 }, symbol: "deltaDegC", difference: true });
    const deltaDegF = add("deltaDegF", {
        dimensions: { Temperature: 1 }, symbol: "deltaDegF", difference: true, scale: rat(5n, 9n),
    });
    add("degC", {
        dimensions: { Temperature: 1 }, symbol: "degC", affine: true,
        scale: int(1), offset: rat(27315n, 100n), differenceUnit: deltaDegC,
    }, ["celsius"]);
    add("degF", {
        dimensions: { Temperature: 1 }, symbol: "degF", affine: true,
        scale: rat(5n, 9n), offset: rat(45967n, 180n), differenceUnit: deltaDegF,
    }, ["fahrenheit"]);

    return {
        type: "map",
        entries,
        _ext: new Map([["immutable", int(1)]]),
    };
}

export function unitName(value) {
    return stringValue(value, "Unit name");
}
