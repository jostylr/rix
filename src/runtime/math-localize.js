/** Bounded, inert localization. No semantic application or imported code is run. */
import {Integer,Rational} from '@ratmath/core';
import {attachMathContextMethods} from './math-context-methods.js';
import {expressionField as field,expressionDefinition,expressionOperation,expressionApplication,
    promoteExpression,isMathExpression} from './math-expression.js';

const str=value=>({type:'string',value});
const seq=values=>({type:'sequence',values});
const record=fields=>attachMathContextMethods({type:'map',entries:new Map(Object.entries(fields)),_ext:new Map([['immutable',new Integer(1n)]])});
const rational=value=>value instanceof Integer ? new Rational(value.value,1n) : value instanceof Rational && value.denominator!==0n ? value : null;
const isContext=value=>field(value,'schema')?.value==='rix.math.context@1';
const id=value=>field(value,'symbolid')?.value;

function worker(bindings,allowedBinders=null) {
    if (!['sequence','tuple'].includes(bindings?.type)) throw new Error('Mathematical bindings require a sequence of (symbol, value) pairs');
    const replacements=new Map();
    let visits=0;
    const tick=depth=>{if (++visits>10000 || depth>128) throw new Error('Mathematical localization traversal budget exceeded');};
    function checkReplacement(value,depth=0) {
        tick(depth);
        if (field(value,'bound')) throw new Error('Substitution cannot introduce bound symbols');
        const definition=expressionDefinition(value);
        if (definition) checkReplacement(definition,depth+1);
        for (const key of ['operands','arguments']) for (const child of field(value,key)?.values || []) checkReplacement(child,depth+1);
    }
    for (const pair of bindings.values) {
        if (pair?.type!=='tuple' || pair.values.length!==2) throw new Error('Expected a (symbol, value) binding');
        const [symbol,value]=pair.values;
        if (!isMathExpression(symbol) || field(symbol,'kind')?.value!=='variable' || !id(symbol)) throw new Error('Bindings require scoped symbols');
        if (allowedBinders ? !field(symbol,'bound') || !allowedBinders.has(id(symbol)) : field(symbol,'bound')) throw new Error(allowedBinders ? 'Instantiation requires a binder declared by this context' : 'Bindings require free scoped symbols');
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
            const fields=Object.fromEntries([...value.entries].map(([key,v])=>[key,
                isContext(value) && key==='binders' && allowedBinders
                    ? seq(v.values.filter(symbol=>!replacements.has(id(symbol)))) : walk(v,depth+1)]));
            if (isContext(value)) fields.consistency=str('unresolved');
            return record(fields);
        }
        return value;
    }
    return {walk,tick};
}

export function instantiateMathematics(value,bindings) {
    if (!isContext(value) || field(value,'binders')?.type!=='sequence') throw new Error('MathInstantiate requires a mathematical context');
    const allowed=new Set(field(value,'binders').values.map(id));
    const localized=worker(bindings,allowed).walk(value);
    // Provenance is data, not an active binder list or a new definition.
    localized.entries.set('instantiations',seq([
        ...(field(localized,'instantiations')?.values || []),
        ...bindings.values.map(pair=>record({symbol:pair.values[0],value:promoteExpression(pair.values[1])})),
    ]));
    return localized;
}

export function substituteMathematics(value,bindings) {
    if (!isMathExpression(value) && !isContext(value)) throw new Error('MathSubstitute requires an expression or mathematical context');
    return worker(bindings).walk(value);
}

export function evaluateMathematics(value,bindings=seq([])) {
    const assumptionContext=isContext(bindings) ? bindings : null;
    if (assumptionContext) {
        if (!isMathExpression(value)) throw new Error('Evaluation under a context requires an expression receiver');
        const assumptions=field(assumptionContext,'assumptions');
        if (assumptions?.type!=='sequence' || field(assumptionContext,'domains')?.type!=='sequence' || field(assumptionContext,'binders')?.type!=='sequence') throw new Error('Invalid mathematical evaluation context');
        const inferred=new Map();
        const inspector=worker(seq([]));
        const exactValue=expr=> {
            const expanded=inspector.walk(expr);
            return rational(expanded) || (field(expanded,'kind')?.value==='constant' ? rational(field(expanded,'value')) : null);
        };
        for (const assumption of assumptions.values) {
            if (field(assumption,'operator')?.value!=='==') continue;
            const left=field(assumption,'left'),right=field(assumption,'right');
            for (const [symbol,other] of [[left,right],[right,left]]) {
                if (!isMathExpression(symbol) || field(symbol,'kind')?.value!=='variable' || !id(symbol) || field(symbol,'bound') || expressionDefinition(symbol)) continue;
                const exact=exactValue(other);
                // Keep the first value; a conflicting later assumption will fail
                // during validation, rather than silently overriding it.
                if (exact && !inferred.has(id(symbol))) inferred.set(id(symbol),{type:'tuple',values:[symbol,exact]});
            }
        }
        bindings=seq([...inferred.values()]);
        // The context body has already run. Only its retained conditions are used;
        // no stored code runs and no ambient programming/symbol scope is changed.
        value=record({...Object.fromEntries(assumptionContext.entries),result:value});
    }
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
        conditional=!!field(context,'binders')?.values.length || field(context,'validation')?.value==='unverifiedImport';
        for (const entry of field(context,'domains')?.values || []) {
            const point=rational(calculate(field(entry,'symbol')));
            const domain=field(entry,'domain');
            if (!point || !domain) {conditional=true;continue;}
            for (const [endpoint,closed,lower] of [['lower','lowerclosed',true],['upper','upperclosed',false]]) {
                const raw=field(domain,endpoint);
                if (raw===null) continue;
                const bound=rational(raw), inclusion=field(domain,closed);
                if (!bound || !(inclusion===null || inclusion instanceof Integer && inclusion.value===1n)) {conditional=true;continue;}
                const c=point.lessThan(bound) ? -1 : point.greaterThan(bound) ? 1 : 0;
                if ((lower ? c<0 : c>0) || c===0 && inclusion===null) invalid=true;
            }
            const excluded=field(domain,'excluded');
            if (excluded?.type!=='sequence') conditional=true;
            else for (const raw of excluded.values) {
                const bound=rational(raw);
                if (!bound) conditional=true;
                else if (!point.lessThan(bound) && !point.greaterThan(bound)) invalid=true;
            }
        }
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
        candidate:invalid ? null : candidate,localized,context,assumptioncontext:assumptionContext,reasons:seq([...reasons].map(str))});
}

export const mathematicalLocalizationCapabilities={
    MathInstantiate:{impl:([value,bindings])=>instantiateMathematics(value,bindings),pure:false,doc:'Instantiate selected local binders while retaining their domains and assumptions'},
    MathSubstitute:{impl:([value,bindings])=>substituteMathematics(value,bindings),pure:false,doc:'Simultaneous identity-based free substitution retaining context conditions'},
    MathEvaluate:{impl:([value,bindings])=>evaluateMathematics(value,bindings),pure:false,doc:'Bounded exact rational evaluation with explicit unresolved context obligations'},
};
