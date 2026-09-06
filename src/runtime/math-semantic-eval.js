/** Explicit trusted mathematical meanings; display names are never executable. */
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {exactSquareRoot} from './exact-values.js';

export const REAL_SEMANTICS=Object.freeze(['rix.function.abs.real@1','rix.function.sqrt.real-principal@1']);

function integerRoot(value) {
    if (value<2n) return value;
    let root=1n<<BigInt(Math.ceil(value.toString(2).length/2));
    for (;;) {
        const next=(root+value/root)/2n;
        if (next>=root) return root;
        root=next;
    }
}

function rootBounds(value,limits) {
    // Bound the scaled numerator before allocation, using an upper decimal bound.
    if (value.numerator.toString().length+Math.ceil(2*limits.rootbits/3)>limits.maxdigits) throw new Error('Mathematical square-root integer budget exceeded');
    const scale=1n<<BigInt(limits.rootbits);
    const numerator=value.numerator*scale*scale;
    const root=integerRoot(numerator/value.denominator);
    const exact=root*root*value.denominator===numerator;
    return [new Rational(root,scale),new Rational(exact ? root : root+1n,scale)];
}

export function evaluateRealSemantic(id,args,limits,check,unsupported) {
    if (!REAL_SEMANTICS.includes(id)) return unsupported('unlinkedSemanticApplication');
    if (args.length!==1) return unsupported('semanticArityMismatch');
    const value=args[0] instanceof Integer ? new Rational(args[0].value,1n) : args[0];
    if (!(value instanceof Rational) && !(value instanceof RationalInterval)) return unsupported('unsupportedSemanticProvider');
    const zero=new Rational(0n);
    if (id==='rix.function.abs.real@1') {
        if (value instanceof Rational) return check(value.abs());
        if (value.high.lessThan(zero)) return check(value.negate());
        if (!value.low.lessThan(zero)) return check(new RationalInterval(value.low,value.high));
        const negative=value.low.negate();
        return check(new RationalInterval(zero,negative.greaterThan(value.high) ? negative : value.high));
    }
    if (value instanceof Rational) {
        if (value.lessThan(zero)) return unsupported('outsideRealSquareRootDomain');
        return check(exactSquareRoot(value));
    }
    if (value.high.lessThan(zero)) return unsupported('outsideRealSquareRootDomain');
    if (value.low.lessThan(zero)) return unsupported('squareRootDomainUnresolved');
    const lower=rootBounds(value.low,limits),upper=rootBounds(value.high,limits);
    return check(new RationalInterval(lower[0],upper[1]));
}
