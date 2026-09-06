/** Closed, bounded arithmetic over known core providers. No callbacks/refinement. */
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {isExactValue,addScalars,subtractScalars,multiplyScalars,divideScalars,negateScalar} from './exact-values.js';
import {constantProviderInfo,constantEquality} from './math-constant.js';
import {realConstantState} from './math-real.js';

export const asRational=value=>value instanceof Integer ? new Rational(value.value,1n) : value instanceof Rational && value.denominator!==0n ? value : null;
const interval=value=>value instanceof RationalInterval ? value : asRational(value) ? new RationalInterval(asRational(value),asRational(value)) : null;
const size=value=>value?.type==='exact_expression' ? value.terms.size : 1;
function rationalBudget(value,limits) {
    const maxDigits=limits.maxdigits;
    if (!asRational(value) || value.numerator?.toString().length>maxDigits || value.denominator?.toString().length>maxDigits || value.value?.toString().length>maxDigits) throw new Error('Mathematical evaluation integer budget exceeded');
}
function budget(value,limits) {
    if (value instanceof RationalInterval) {rationalBudget(value.low,limits);rationalBudget(value.high,limits);return value;}
    if (!isExactValue(value)) {rationalBudget(value,limits);return value;}
    const checkGenerator=generator=> {
        if (generator.polynomial?.length>limits.maxpolynomialcoefficients) throw new Error('Mathematical evaluation polynomial budget exceeded');
        for (const c of generator.polynomial || []) rationalBudget(c,limits);
    };
    if (value.type==='exact_generator') checkGenerator(value);
    else {
        if (size(value)>limits.maxterms) throw new Error('Mathematical evaluation exact-term budget exceeded');
        for (const term of value.terms.values()) {
            rationalBudget(term.coefficient,limits);
            if (term.powers.size>limits.maxgenerators) throw new Error('Mathematical evaluation generator budget exceeded');
            for (const [generator,power] of term.powers) {
                checkGenerator(generator);
                if (!Number.isSafeInteger(power) || Math.abs(power)>limits.maxdegree) throw new Error('Mathematical evaluation degree budget exceeded');
            }
        }
    }
    return value;
}

/** True/false mean all possible values satisfy/fail; null means undecided. */
export function compareProviderValues(left,right,op) {
    const a=interval(left),b=interval(right);
    if (!a || !b) {
        if (['==','!='].includes(op)) {
            const equal=constantEquality(left,right);
            return equal===null ? null : op==='==' ? equal : !equal;
        }
        return null;
    }
    if (op==='>') return compareProviderValues(right,left,'<');
    if (op==='>=') return compareProviderValues(right,left,'<=');
    if (op==='<') return a.high.lessThan(b.low) ? true : !a.low.lessThan(b.high) ? false : null;
    if (op==='<=') return !a.high.greaterThan(b.low) ? true : a.low.greaterThan(b.high) ? false : null;
    if (op==='==' || op==='!=') {
        const equal=a.high.lessThan(b.low) || b.high.lessThan(a.low) ? false
            : a.low.equals(a.high) && b.low.equals(b.high) ? a.low.equals(b.low) : null;
        return equal===null ? null : op==='==' ? equal : !equal;
    }
    return null;
}

export function createProviderEvaluation(reasons,limits) {
    const check=value=>budget(value,limits);
    const providers=new Map(),reals=new Map();
    let sawReal=false,sawSet=false,unverified=false;
    const unsupported=reason=>{reasons.add(reason);return null;};
    function read(value) {
        const real=realConstantState(value);
        if (real) {
            sawReal=true;unverified ||= !real.source;
            if (!reals.has(real.id)) {
                reals.set(real.id,check(new RationalInterval(real.interval.start,real.interval.end)));
                providers.set(real.id,constantProviderInfo(value));
            }
            return reals.get(real.id);
        }
        if (value instanceof RationalInterval) sawSet=true;
        if (!asRational(value) && !(value instanceof RationalInterval) && !isExactValue(value)) return unsupported('unsupportedConstantProvider');
        const result=check(asRational(value) || value);
        const key=value instanceof RationalInterval ? 'rationalInterval' : isExactValue(value) ? 'exactScalar' : 'rational';
        if (!providers.has(key)) providers.set(key,constantProviderInfo(value));
        return result;
    }
    function multiply(a,b) {
        if (size(a)*size(b)>limits.maxproductpairs) throw new Error('Mathematical evaluation exact-term budget exceeded');
        return check(multiplyScalars(a,b));
    }
    function operate(op,args) {
        const [a,b]=args;
        if (op==='power') {
            const exponent=asRational(b);
            if (!exponent || exponent.denominator!==1n || exponent.numerator>BigInt(limits.maxexponent) || exponent.numerator< -BigInt(limits.maxexponent)) return unsupported('unsupportedExponent');
            const n=exponent.numerator, range=interval(a);
            if (n<=0n && (range ? range.containsZero() : true)) return unsupported(range ? 'undefinedPower' : 'nonzeroNotEstablished');
            if (range) {
                const magnitude=Number(n<0n ? -n : n);
                if ([range.low,range.high].some(v=>Math.max(v.numerator.toString().length,v.denominator.toString().length)*magnitude>limits.maxdigits)) throw new Error('Mathematical evaluation integer budget exceeded');
                return check(a instanceof RationalInterval ? a.pow(n) : asRational(a).pow(n));
            }
            // Exact scalars use bounded multiplication, never formal inversion.
            let result=new Rational(1n),factor=a,remaining=n;
            while (remaining>0n) {
                if (remaining%2n) result=multiply(result,factor);
                remaining/=2n;
                if (remaining) factor=multiply(factor,factor);
            }
            return result;
        }
        if (args.some(v=>v instanceof RationalInterval)) {
            if (args.some(v=>!interval(v))) return unsupported('mixedProviderArithmetic');
            const x=interval(a),y=b===undefined ? null : interval(b);
            if (op==='divide' && y.containsZero()) return unsupported('divisorMayContainZero');
            return check(({add:()=>x.add(y),subtract:()=>x.subtract(y),multiply:()=>x.multiply(y),divide:()=>x.divide(y),negate:()=>x.negate()})[op]());
        }
        if (op==='divide') {
            const denominator=asRational(b);
            if (!denominator) return unsupported('nonRationalExactDivisor');
            if (denominator.numerator===0n) return unsupported('divisionByZero');
            return check(divideScalars(a,denominator));
        }
        if (op==='multiply') return multiply(a,b);
        if (op==='add' || op==='subtract') {
            if ((isExactValue(a) || isExactValue(b)) && size(a)+size(b)>limits.maxsumterms) throw new Error('Mathematical evaluation exact-term budget exceeded');
            return check(op==='add' ? addScalars(a,b) : subtractScalars(a,b));
        }
        if (op==='negate') return check(negateScalar(a));
        return unsupported('unsupportedOperation');
    }
    return {read,operate,get unverified(){return unverified;},get providers(){return [...providers.values()];},
        isApproximation:value=>sawReal && value instanceof RationalInterval,
        resultKind:value=>value===null ? 'unresolved' : value instanceof RationalInterval ? sawSet ? 'setEnclosure' : 'singletonEnclosure' : isExactValue(value) ? 'exactScalar' : 'rational'};
}
