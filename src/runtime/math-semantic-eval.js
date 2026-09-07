/** Explicit trusted mathematical meanings; display names are never executable. */
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {exactSquareRoot} from './exact-values.js';

export const REAL_SEMANTICS=Object.freeze(['rix.function.abs.real@1','rix.function.sqrt.real-principal@1','rix.function.exp@1','rix.function.log.real-principal@1']);

function logarithmBounds(value,limits,check,unsupported) {
    const zero=new Rational(0n),one=new Rational(1n),two=new Rational(2n);
    if(value.equals(one)) return [zero,zero];
    if(Math.ceil(limits.transcendentalbits/3)+1>limits.maxdigits) throw new Error('Mathematical logarithm precision integer budget exceeded');
    const target=check(new Rational(1n,1n<<BigInt(limits.transcendentalbits)));
    const negative=value.lessThan(one);
    let reduced=negative ? check(value.reciprocal()) : value,halvings=0;
    while(reduced.greaterThan(two)) {
        if(halvings>=limits.maxexponent) return unsupported('logarithmReductionBudgetExceeded');
        reduced=check(reduced.divide(two));halvings++;
    }
    const tolerance=check(target.divide(new Rational(BigInt(halvings)+1n)));
    const series=argument=> {
        const z=check(check(argument.subtract(one)).divide(check(argument.add(one))));
        const square=check(z.multiply(z));
        let sum=zero,power=z;
        for(let n=0;n<limits.maxsumterms;n++) {
            sum=check(sum.add(check(power.divide(new Rational(2n*BigInt(n)+1n)))));
            power=check(power.multiply(square));
            // log(a)=2*atanh(z). Bound every remaining denominator by
            // the first omitted denominator, then sum the geometric powers.
            const tail=check(check(check(two.multiply(power)).divide(new Rational(2n*BigInt(n)+3n))).divide(check(one.subtract(square))));
            if(tail.lessThanOrEqual(tolerance)) {
                const low=check(two.multiply(sum));
                return [low,check(low.add(tail))];
            }
        }
        return unsupported('logarithmSeriesBudgetExceeded');
    };
    const part=series(reduced);
    if(!part) return null;
    let [low,high]=part;
    if(halvings) {
        const base=series(two);
        if(!base) return null;
        const count=new Rational(BigInt(halvings));
        low=check(low.add(check(count.multiply(base[0]))));
        high=check(high.add(check(count.multiply(base[1]))));
    }
    return negative ? [check(high.negate()),check(low.negate())] : [low,high];
}

function exponentialBounds(value,limits,check,unsupported) {
    const zero=new Rational(0n),one=new Rational(1n),two=new Rational(2n);
    if (value.equals(zero)) return [one,one];
    if (Math.ceil(limits.transcendentalbits/3)+1>limits.maxdigits) throw new Error('Mathematical exponential precision integer budget exceeded');
    const target=check(new Rational(1n,1n<<BigInt(limits.transcendentalbits)));
    const negative=value.lessThan(zero);
    let reduced=value.abs(),halvings=0;
    while (reduced.greaterThan(one)) {
        if (halvings>=limits.maxexponent) return unsupported('exponentialReductionBudgetExceeded');
        reduced=check(reduced.divide(two));halvings++;
    }
    let sum=one,term=one;
    for(let n=0;n<limits.maxsumterms;n++) {
        const next=check(check(term.multiply(reduced)).divide(new Rational(BigInt(n)+1n)));
        const ratio=check(reduced.divide(new Rational(BigInt(n)+2n)));
        // All remaining positive series-term ratios are at most this ratio.
        const tail=check(next.divide(check(one.subtract(ratio))));
        let low=sum,high=check(sum.add(tail));
        for(let i=0;i<halvings;i++) {low=check(low.multiply(low));high=check(high.multiply(high));}
        if(negative) [low,high]=[check(high.reciprocal()),check(low.reciprocal())];
        if(check(high.subtract(low)).lessThanOrEqual(target)) return [low,high];
        sum=check(sum.add(next));term=next;
    }
    return unsupported('exponentialSeriesBudgetExceeded');
}

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
    if(id==='rix.function.log.real-principal@1') {
        const lower=value instanceof Rational ? value : value.low;
        const upper=value instanceof Rational ? value : value.high;
        if(upper.lessThanOrEqual(zero)) return unsupported('outsideRealLogarithmDomain');
        if(lower.lessThanOrEqual(zero)) return unsupported('logarithmDomainUnresolved');
        const low=logarithmBounds(lower,limits,check,unsupported);
        if(!low) return null;
        const high=lower.equals(upper) ? low : logarithmBounds(upper,limits,check,unsupported);
        if(!high) return null;
        return check(low[0].equals(high[1]) ? low[0] : new RationalInterval(low[0],high[1]));
    }
    if(id==='rix.function.exp@1') {
        const low=exponentialBounds(value instanceof Rational ? value : value.low,limits,check,unsupported);
        if(!low) return null;
        const high=value instanceof Rational || value.low.equals(value.high) ? low : exponentialBounds(value.high,limits,check,unsupported);
        if(!high) return null;
        return check(low[0].equals(high[1]) ? low[0] : new RationalInterval(low[0],high[1]));
    }
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
