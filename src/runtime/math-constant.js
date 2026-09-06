/** Closed core provider set. Display strings are never mathematical identities. */
import {Integer,Rational,RationalInterval} from "@ratmath/core";
import {isExactValue,equalScalars} from "./exact-values.js";
import {UNDECIDED} from "./decision.js";
import {realConstantState} from "./math-real.js";
import {refinementEntry} from "./refinement.js";

const rationalKey=value=> {
    if (value instanceof Integer) return `${value.value}/1`;
    if (!(value instanceof Rational) || value.denominator === 0n) throw new Error("Expression constant provider requires finite rational components");
    return `${value.numerator}/${value.denominator}`;
};
export const isExpressionScalar=value=>value instanceof Integer || value instanceof Rational || value instanceof RationalInterval || isExactValue(value) || !!realConstantState(value);

export function constantKey(value) {
    const real=realConstantState(value);
    if (real) return ["refinableReal",real.id];
    if (value instanceof Integer || value instanceof Rational) return ["rational",rationalKey(value)];
    if (value instanceof RationalInterval) return ["interval",rationalKey(value.start),rationalKey(value.end)];
    if (value?.type === "exact_generator") return ["exactGenerator",value.id];
    if (value?.type === "exact_expression") return ["exactExpression",[...value.terms.values()].map(term=>[
        rationalKey(term.coefficient),[...term.powers].map(([generator,exponent])=>[generator.id,exponent]).sort((a,b)=>a[0].localeCompare(b[0])),
    ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
    throw new Error("Expression constant requires a supported core scalar provider (Integer, Rational, RationalInterval, or exact scalar)");
}

export function isEnclosureConstant(value) { return value instanceof RationalInterval; }

// null denotes undecided. Distinct exact normal forms are not automatically
// unequal: separately named generators may represent the same algebraic root.
export function constantEquality(left,right) {
    const aReal=realConstantState(left), bReal=realConstantState(right);
    if (aReal || bReal) {
        if (aReal && bReal && aReal.id === bReal.id) return true;
        // Identity is the only implicit real equality evidence. Refinement and
        // comparisons of different adapters remain explicit consumer work.
        return null;
    }
    if (left instanceof RationalInterval || right instanceof RationalInterval) {
        const interval=value=>value instanceof RationalInterval ? value : value instanceof Integer || value instanceof Rational ? new RationalInterval(value,value) : null;
        const a=interval(left), b=interval(right);
        if (!a || !b) return null;
        if (a.high.lessThan(b.low) || b.high.lessThan(a.low)) return false;
        if (a.low.equals(a.high) && b.low.equals(b.high)) return a.low.equals(b.low);
        return null;
    }
    if (!isExpressionScalar(left) || !isExpressionScalar(right)) return null;
    if (equalScalars(left,right)) return true;
    return isExactValue(left) || isExactValue(right) ? null : false;
}

export function constantProviderInfo(value) {
    constantKey(value); // Reject unsupported providers without duck-typed claims.
    const interval=isEnclosureConstant(value), exact=isExactValue(value), real=realConstantState(value);
    const text=value=>({type:"string",value});
    const decision=value=>value ? new Integer(1n) : null;
    return {type:"map",entries:new Map([
        ["schema",text("rix.math.constant-provider@1")],
        ["provider",text(real ? "refinableReal" : interval ? "rationalInterval" : exact ? "exactScalar" : "rational")],
        ["denotation",text(interval ? "setEnclosure" : "singleton")],
        ["exact",decision(!interval)],
        ["refinable",decision(!!real)],
        ["commutative",new Integer(1n)],
        ["associative",new Integer(1n)],
        ["distributive",decision(!interval)],
        ["cancellation",exact ? UNDECIDED : decision(!interval)],
        ["enclosure",real ? real.interval : interval ? value : null],
        ["evidencelevel",real ? real.evidence : null],
        ["validation",real ? text("protocolChecked") : null],
        ["laststatus",real ? text(refinementEntry(real.result,"status")?.value) : null],
        ["lastgoalmet",real ? decision(refinementEntry(real.result,"goalmet")?.value === 1n) : null],
    ]),_ext:new Map([["immutable",new Integer(1n)]])};
}
