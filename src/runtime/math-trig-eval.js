/** Closed real sine/cosine kernels: exact rational bounds, no linked code. */
import {Rational,RationalInterval} from '@ratmath/core';

function pointBounds(value,cosine,limits,check,unsupported) {
    const zero=new Rational(0n),one=new Rational(1n);
    if(value.equals(zero)) return cosine ? [one,one] : [zero,zero];
    if(Math.ceil(limits.transcendentalbits/3)+1>limits.maxdigits) throw new Error('Mathematical trigonometric precision integer budget exceeded');
    const target=check(new Rational(1n,1n<<BigInt(limits.transcendentalbits)));
    const square=check(value.multiply(value));
    let term=cosine ? one : value,sum=zero;
    for(let n=0;n<limits.maxsumterms;n++) {
        sum=check(sum.add(term));
        const degree=2n*BigInt(n)+(cosine ? 0n : 1n);
        const ratio=check(square.divide(check(new Rational((degree+1n)*(degree+2n)))));
        const next=check(check(term.multiply(ratio)).negate());
        // Once this ratio is <= 1, all later magnitudes decrease to zero.
        // The alternating remainder lies between zero and the next term.
        if(ratio.lessThanOrEqual(one) && next.abs().lessThanOrEqual(target)) {
            const other=check(sum.add(next));
            return sum.lessThanOrEqual(other) ? [sum,other] : [other,sum];
        }
        term=next;
    }
    return unsupported('trigonometricSeriesBudgetExceeded');
}

export function evaluateTrigonometric(value,cosine,limits,check,unsupported) {
    const one=new Rational(1n),minusOne=new Rational(-1n),two=new Rational(2n);
    const interval=value instanceof RationalInterval;
    const center=interval ? check(check(value.low.add(value.high)).divide(two)) : value;
    const bounds=pointBounds(center,cosine,limits,check,unsupported);
    if(!bounds) return null;
    let [low,high]=bounds;
    if(interval) {
        // Both real derivatives have absolute value <= 1. This covers interior
        // extrema without pi approximations or untrusted floating-point tests.
        const radius=check(check(value.high.subtract(value.low)).divide(two));
        low=check(low.subtract(radius));high=check(high.add(radius));
    }
    if(low.lessThan(minusOne)) low=minusOne;
    if(high.greaterThan(one)) high=one;
    return check(low.equals(high) ? low : new RationalInterval(low,high));
}
