/** Bounded, inert localization. No semantic application or imported code is run. */
import {Integer,Rational} from '@ratmath/core';
import {expressionField as field,expressionDefinition,expressionOperation,expressionApplication,
    promoteExpression,isMathExpression} from './math-expression.js';

const str=value=>({type:'string',value});
const seq=values=>({type:'sequence',values});
const record=fields=>({type:'map',entries:new Map(Object.entries(fields)),_ext:new Map([['immutable',new Integer(1n)]])});
const rational=value=>value instanceof Integer ? new Rational(value.value,1n) : value instanceof Rational && value.denominator!==0n ? value : null;
const isContext=value=>field(value,'schema')?.value==='rix.math.context@1';
const id=value=>field(value,'symbolid')?.value;

function worker(bindings) {
    if (!['sequence','tuple'].includes(bindings?.type)) throw new Error('Mathematical bindings require a sequence of (symbol, value) pairs');
    const replacements=new Map();
    let visits=0;
    const tick=depth=>{if (++visits>10000 || depth>128) throw new Error('Mathematical localization traversal budget exceeded');};
    function checkReplacement(value,depth=0) {
        tick(depth);
        if (field(value,'bound')) throw new Error('Substitution cannot introduce bound symbols; binder instantiation is not supported');
        const definition=expressionDefinition(value);
        if (definition) checkReplacement(definition,depth+1);
        for (const key of ['operands','arguments']) for (const child of field(value,key)?.values || []) checkReplacement(child,depth+1);
    }
    for (const pair of bindings.values) {
        if (pair?.type!=='tuple' || pair.values.length!==2) throw new Error('Expected a (symbol, value) binding');
        const [symbol,value]=pair.values;
        if (!isMathExpression(symbol) || field(symbol,'kind')?.value!=='variable' || !id(symbol) || field(symbol,'bound')) throw new Error('Bindings require free scoped symbols');
        expressionDefinition(symbol); // Validate the opaque identity, not just its printed ID.
        if (replacements.has(id(symbol))) throw new Error('Duplicate mathematical binding');
        const replacement=promoteExpression(value);
        checkReplacement(replacement);
        replacements.set(id(symbol),replacement);
    }
    function walk(value,depth=0) {
        tick(depth);
        if (isMathExpression(value)) {
            // Simultaneous substitution: inserted expressions are not visited again.
            if (replacements.has(id(value))) return replacements.get(id(value));
            const definition=expressionDefinition(value);
            if (definition) return walk(definition,depth+1);
            if (field(value,'kind')?.value==='operator') return expressionOperation(field(value,'operation').value,field(value,'operands').values.map(v=>walk(v,depth+1)));
            if (field(value,'kind')?.value==='apply') return expressionApplication(field(value,'semanticid').value,field(value,'name').value,field(value,'arguments').values.map(v=>walk(v,depth+1)));
            return value;
        }
        if (['sequence','tuple'].includes(value?.type)) return {type:value.type,values:value.values.map(v=>walk(v,depth+1))};
        if (value?.type==='map') {
            const fields=Object.fromEntries([...value.entries].map(([key,v])=>[key,walk(v,depth+1)]));
            if (isContext(value)) fields.consistency=str('unresolved');
            return record(fields);
        }
        return value;
    }
    return {walk,tick};
}

export function substituteMathematics(value,bindings) {
    if (!isMathExpression(value) && !isContext(value)) throw new Error('MathSubstitute requires an expression or mathematical context');
    return worker(bindings).walk(value);
}

export function evaluateMathematics(value,bindings=seq([])) {
    const localized=substituteMathematics(value,bindings);
    const {tick}=worker(seq([]));
    const reasons=new Set();
    function calculate(expr,depth=0) {
        tick(depth);
        const direct=rational(expr);
        if (direct) return direct;
        if (!isMathExpression(expr)) {reasons.add('unsupportedResult');return null;}
        const kind=field(expr,'kind')?.value;
        if (kind==='constant') {
            const result=rational(field(expr,'value'));
            if (!result) reasons.add('unsupportedConstantProvider');
            return result;
        }
        if (kind==='variable') {reasons.add('unboundSymbol');return null;}
        if (kind==='apply') {reasons.add('unlinkedSemanticApplication');return null;}
        const args=field(expr,'operands').values.map(v=>calculate(v,depth+1));
        if (args.some(v=>v===null)) return null;
        const [a,b]=args,op=field(expr,'operation').value;
        if (op==='divide' && b.numerator===0n) {reasons.add('divisionByZero');return null;}
        if (op==='power') {
            if (b.denominator!==1n || b.numerator>256n || b.numerator< -256n) {reasons.add('unsupportedExponent');return null;}
            if (a.numerator===0n && b.numerator<=0n) {reasons.add('undefinedPower');return null;}
            const magnitude=Number(b.numerator<0n ? -b.numerator : b.numerator);
            if (Math.max(a.numerator.toString().length,a.denominator.toString().length)*magnitude>10000) throw new Error('Mathematical evaluation integer budget exceeded');
        }
        const result=({add:()=>a.add(b),subtract:()=>a.subtract(b),multiply:()=>a.multiply(b),divide:()=>a.divide(b),negate:()=>a.negate(),power:()=>a.pow(b.numerator)})[op]();
        if (result.numerator.toString().length>10000 || result.denominator.toString().length>10000) throw new Error('Mathematical evaluation integer budget exceeded');
        return result;
    }
    const context=isContext(localized) ? localized : null;
    const candidate=calculate(context ? field(context,'result') : localized);
    let conditional=false,invalid=false;
    if (context) {
        conditional=!!field(context,'binders')?.values.length || !!field(context,'domains')?.values.length || field(context,'validation')?.value==='unverifiedImport';
        for (const assumption of field(context,'assumptions')?.values || []) {
            const a=calculate(field(assumption,'left')),b=calculate(field(assumption,'right'));
            if (!a || !b) {conditional=true;continue;}
            const c=a.lessThan(b) ? -1 : a.greaterThan(b) ? 1 : 0;
            const truth={'==':c===0,'!=':c!==0,'<':c<0,'>':c>0,'<=':c<=0,'>=':c>=0}[field(assumption,'operator')?.value];
            if (truth===undefined) conditional=true;
            else if (!truth) invalid=true;
        }
    }
    const status=invalid ? 'invalidAssumptions' : candidate===null ? 'unresolved' : conditional ? 'conditional' : 'complete';
    return record({schema:str('rix.math.evaluation@1'),status:str(status),value:status==='complete' ? candidate : null,
        candidate:invalid ? null : candidate,localized,context,reasons:seq([...reasons].map(str))});
}

export const mathematicalLocalizationCapabilities={
    MathSubstitute:{impl:([value,bindings])=>substituteMathematics(value,bindings),pure:false,doc:'Simultaneous identity-based free substitution retaining context conditions'},
    MathEvaluate:{impl:([value,bindings])=>evaluateMathematics(value,bindings),pure:false,doc:'Bounded exact rational evaluation with explicit unresolved context obligations'},
};
