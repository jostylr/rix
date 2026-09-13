/** Closed real sine/cosine kernels: exact rational bounds, no linked code. */
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {isExactPi,exactSquareRoot,multiplyScalars,negateScalar} from './exact-values.js';

function piCoefficient(value) {
    if(isExactPi(value)) return new Rational(1n);
    if(value?.type!=='exact_expression' || value.terms.size!==1) return null;
    const term=value.terms.values().next().value;
    if(term.powers.size!==1) return null;
    const [generator,power]=term.powers.entries().next().value;
    if(!isExactPi(generator) || power!==1) return null;
    return term.coefficient instanceof Integer ? new Rational(term.coefficient.value) : term.coefficient;
}

// Machin's identity pi=16 atan(1/5)-4 atan(1/239), with alternating tails.
function piBounds(limits,check,unsupported) {
    if(Math.ceil(limits.transcendentalbits/3)+3>limits.maxdigits) throw new Error('Mathematical pi precision integer budget exceeded');
    const tolerance=check(new Rational(1n,80n*(1n<<BigInt(limits.transcendentalbits))));
    const atan=denominator=> {
        const x=new Rational(1n,denominator),square=check(x.multiply(x));
        let power=x,sum=new Rational(0n);
        for(let n=0;n<limits.maxsumterms;n++) {
            const term=check(power.divide(new Rational(2n*BigInt(n)+1n)));
            sum=check(n%2 ? sum.subtract(term) : sum.add(term));
            power=check(power.multiply(square));
            const next=check(power.divide(new Rational(2n*BigInt(n)+3n)));
            if(next.lessThanOrEqual(tolerance)) {
                const other=check(n%2 ? sum.add(next) : sum.subtract(next));
                return n%2 ? [sum,other] : [other,sum];
            }
        }
        return unsupported('trigonometricPiSeriesBudgetExceeded');
    };
    const a=atan(5n);if(!a) return null;
    const b=atan(239n);if(!b) return null;
    return [check(check(a[0].multiply(new Rational(16n))).subtract(check(b[1].multiply(new Rational(4n))))),
        check(check(a[1].multiply(new Rational(16n))).subtract(check(b[0].multiply(new Rational(4n)))))];
}

export function evaluatePiTrigonometric(value,cosine,limits,check,unsupported) {
    const coefficient=piCoefficient(value);
    if(!coefficient) return unsupported('unsupportedSemanticProvider');
    // Reduce exactly before approximating pi, even for enormous revolution counts.
    const modulus=2n*coefficient.denominator;
    let q=check(new Rational(((coefficient.numerator%modulus)+modulus)%modulus,coefficient.denominator));
    const one=new Rational(1n),half=new Rational(1n,2n);
    // cos(q*pi)=sin((q+1/2)*pi). Fold into the first quadrant.
    if(cosine) {
        q=check(q.add(half));
        if(q.greaterThanOrEqual(new Rational(2n))) q=check(q.subtract(new Rational(2n)));
    }
    const negative=q.greaterThan(one);
    if(negative) q=check(q.subtract(one));
    if(q.greaterThan(half)) q=check(one.subtract(q));
    let exact=null;
    if(q.numerator===0n) exact=new Rational(0n);
    else if(q.equals(half)) exact=one;
    else if(q.equals(new Rational(1n,6n))) exact=half;
    else if(q.equals(new Rational(1n,4n))) exact=check(multiplyScalars(half,exactSquareRoot(new Rational(2n))));
    else if(q.equals(new Rational(1n,3n))) exact=check(multiplyScalars(half,exactSquareRoot(new Rational(3n))));
    if(exact!==null) return check(negative ? negateScalar(exact) : exact);
    const pi=piBounds(limits,check,unsupported);if(!pi) return null;
    const angle=new RationalInterval(check(q.multiply(pi[0])),check(q.multiply(pi[1])));
    // Reserve half the requested width for the point series; pi's error uses
    // less than a quarter. The Lipschitz widening then meets the final target.
    const result=evaluateTrigonometric(angle,false,{...limits,transcendentalbits:limits.transcendentalbits+1},check,unsupported);
    if(!result) return null;
    return negative ? check(result.negate()) : result;
}

function pointBounds(value,cosine,limits,check,unsupported) {
    if(value.abs().lessThanOrEqual(new Rational(4n))) return taylorBounds(value,cosine,limits,check,unsupported);
    // Allocate pi precision for amplification by the revolution count. The
    // integer part's bit length bounds |x|, without floating-point conversion.
    const magnitudeBits=(value.numerator/value.denominator).toString(2).replace('-','').length;
    if(magnitudeBits>limits.maxexponent) return unsupported('trigonometricReductionBudgetExceeded');
    const pi=piBounds({...limits,transcendentalbits:limits.transcendentalbits+magnitudeBits+3},check,unsupported);
    if(!pi) return null;
    const period=check(pi[0].add(pi[1]));
    const quotient=check(check(value.divide(period)).add(new Rational(1n,2n)));
    const k=quotient.numerator>=0n ? quotient.numerator/quotient.denominator : -((-quotient.numerator+quotient.denominator-1n)/quotient.denominator);
    const multiplier=new Rational(2n*k);
    const a=check(value.subtract(check(multiplier.multiply(pi[0]))));
    const b=check(value.subtract(check(multiplier.multiply(pi[1]))));
    const center=check(check(a.add(b)).divide(new Rational(2n)));
    const radius=check(check(a.subtract(b)).abs().divide(new Rational(2n)));
    // Any integral k gives an exact periodic identity: no quadrant guess is
    // treated as proof. Enclose the residual uncertainty using |f'| <= 1.
    const bounds=taylorBounds(center,cosine,{...limits,transcendentalbits:limits.transcendentalbits+1},check,unsupported);
    return bounds ? [check(bounds[0].subtract(radius)),check(bounds[1].add(radius))] : null;
}

function taylorBounds(value,cosine,limits,check,unsupported) {
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
    const one=new Rational(1n),minusOne=new Rational(-1n);
    const interval=value instanceof RationalInterval;
    const bounds=pointBounds(interval ? value.low : value,cosine,limits,check,unsupported);
    if(!bounds) return null;
    let [low,high]=bounds;
    if(interval && !value.low.equals(value.high)) {
        const upper=pointBounds(value.high,cosine,limits,check,unsupported);
        if(!upper) return null;
        if(upper[0].lessThan(low)) low=upper[0];
        if(upper[1].greaterThan(high)) high=upper[1];
        const magnitude=value.low.abs().greaterThan(value.high.abs()) ? value.low.abs() : value.high.abs();
        const bits=(magnitude.numerator/magnitude.denominator).toString(2).length;
        if(bits>limits.maxexponent) return unsupported('trigonometricReductionBudgetExceeded');
        const pi=piBounds({...limits,transcendentalbits:limits.transcendentalbits+bits+3},check,unsupported);
        if(!pi) return null;
        // Critical points are (k+1/2)*pi for sine, k*pi for cosine.
        // An outward quotient interval includes every possible k; ambiguous
        // endpoint membership includes the extremum rather than dropping it.
        const quotients=[value.low,value.high].flatMap(x=>pi.map(p=>check(x.divide(p))));
        let lower=quotients[0],upperQ=quotients[0];
        for(const q of quotients) {if(q.lessThan(lower)) lower=q;if(q.greaterThan(upperQ)) upperQ=q;}
        if(!cosine) {lower=check(lower.subtract(new Rational(1n,2n)));upperQ=check(upperQ.subtract(new Rational(1n,2n)));}
        const floor=q=>q.numerator>=0n ? q.numerator/q.denominator : -((-q.numerator+q.denominator-1n)/q.denominator);
        const first=-floor(lower.negate()),last=floor(upperQ);
        if(first<=last) {
            if(first<last) {low=minusOne;high=one;}
            else if(first%2n===0n) high=one;
            else low=minusOne;
        }
    }
    if(low.lessThan(minusOne)) low=minusOne;
    if(high.greaterThan(one)) high=one;
    return check(low.equals(high) ? low : new RationalInterval(low,high));
}
