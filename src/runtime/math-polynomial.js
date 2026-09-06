/** Identity-aware univariate rational coefficient lowering, without textual names. */
import {Rational} from '@ratmath/core';
import {mathBudgets} from './math-budgets.js';
import {asRational,createProviderEvaluation} from './math-provider-eval.js';
import {expressionField as field,expressionDefinition,expressionStructuralKey,
    expressionCapabilities,isMathExpression} from './math-expression.js';

export function mathematicalPolynomialCoefficients(expression,variable,options) {
    if (!isMathExpression(expression)) throw new Error('Polynomial compilation requires a core expression');
    expressionCapabilities.ExpressionVariableSelector.impl([expression,variable]);
    const limits=mathBudgets(options),provider=createProviderEvaluation(new Set(),limits);
    let visits=0;
    const zero=()=>new Rational(0n),one=()=>new Rational(1n);
    const matches=node=>variable?.type==='string'
        ? !field(node,'symbolid') && field(node,'name')?.value===variable.value
        : expressionStructuralKey(node)===expressionStructuralKey(variable);
    const trim=values=> {
        while (values.length>1 && values.at(-1).numerator===0n) values.pop();
        if (values.length>limits.maxterms || values.length-1>limits.maxdegree) throw new Error('Mathematical polynomial degree/term budget exceeded');
        return values;
    };
    function add(a,b,subtract=false) {
        if (a.length+b.length>limits.maxsumterms) throw new Error('Mathematical polynomial sum budget exceeded');
        return trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>provider.operate(subtract ? 'subtract' : 'add',[a[i] || zero(),b[i] || zero()])));
    }
    function multiply(a,b) {
        if (a.length*b.length>limits.maxproductpairs || a.length+b.length-2>limits.maxdegree || a.length+b.length-1>limits.maxterms) throw new Error('Mathematical polynomial product/degree budget exceeded');
        const result=Array.from({length:a.length+b.length-1},zero);
        for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++) result[i+j]=provider.operate('add',[result[i+j],provider.operate('multiply',[a[i],b[j]])]);
        return trim(result);
    }
    function visit(node,depth=0) {
        if (++visits>limits.maxvisits || depth>limits.maxdepth) throw new Error('Mathematical polynomial traversal budget exceeded');
        const definition=expressionDefinition(node);
        if (definition) return visit(definition,depth+1);
        const kind=field(node,'kind')?.value;
        if (kind==='constant') {
            const value=asRational(field(node,'value'));
            if (!value) throw new Error('Polynomial coefficients require rational constants');
            return [provider.read(value)];
        }
        if (kind==='variable') {
            if (!matches(node)) throw new Error('Univariate polynomial contains another symbolic identity');
            return trim([zero(),one()]);
        }
        if (kind!=='operator') throw new Error('Polynomial compilation does not accept semantic applications');
        const operands=field(node,'operands').values,op=field(node,'operation').value;
        const a=visit(operands[0],depth+1);
        if (op==='negate') return a.map(v=>provider.operate('negate',[v]));
        const b=visit(operands[1],depth+1);
        if (op==='add' || op==='subtract') return add(a,b,op==='subtract');
        if (op==='multiply') return multiply(a,b);
        if (op==='divide') {
            if (b.length!==1 || b[0].numerator===0n) throw new Error('Polynomial compilation requires a nonzero constant denominator');
            return a.map(v=>provider.operate('divide',[v,b[0]]));
        }
        if (op==='power') {
            if (b.length!==1 || b[0].denominator!==1n || b[0].numerator<0n || b[0].numerator>BigInt(limits.maxexponent)) throw new Error('Polynomial exponent unsupported or exceeds budget');
            let n=b[0].numerator;
            if (n===0n && (a.length!==1 || a[0].numerator===0n)) throw new Error('Zero power cannot discard a possible undefined point');
            let result=[one()],factor=a;
            while(n) {if(n%2n) result=multiply(result,factor);n/=2n;if(n) factor=multiply(factor,factor);}
            return result;
        }
        throw new Error('Unsupported polynomial operation');
    }
    return {type:'sequence',values:visit(expression)};
}
