/** Bounded, inert localization. No semantic application or imported code is run. */
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {attachMathContextMethods} from './math-context-methods.js';
import {createProviderEvaluation,compareProviderValues} from './math-provider-eval.js';
import {isExpressionScalar} from './math-constant.js';
import {mathBudgets,mathBudgetRecord} from './math-budgets.js';
import {expressionField as field,expressionDefinition,expressionOperation,expressionApplication,
    promoteExpression,isMathExpression} from './math-expression.js';

const str=value=>({type:'string',value});
const seq=values=>({type:'sequence',values});
const record=fields=>attachMathContextMethods({type:'map',entries:new Map(Object.entries(fields)),_ext:new Map([['immutable',new Integer(1n)]])});
const rational=value=>value instanceof Integer ? new Rational(value.value,1n) : value instanceof Rational && value.denominator!==0n ? value : null;
const isContext=value=>field(value,'schema')?.value==='rix.math.context@1';
const id=value=>field(value,'symbolid')?.value;

function worker(bindings,allowedBinders=null,limits=mathBudgets()) {
    if (!['sequence','tuple'].includes(bindings?.type)) throw new Error('Mathematical bindings require a sequence of (symbol, value) pairs');
    const replacements=new Map();
    let visits=0;
    const tick=depth=>{if (++visits>limits.maxvisits || depth>limits.maxdepth) throw new Error('Mathematical localization traversal budget exceeded');};
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

export function instantiateMathematics(value,bindings,options) {
    if (!isContext(value) || field(value,'binders')?.type!=='sequence') throw new Error('MathInstantiate requires a mathematical context');
    const allowed=new Set(field(value,'binders').values.map(id));
    const localized=worker(bindings,allowed,mathBudgets(options)).walk(value);
    // Provenance is data, not an active binder list or a new definition.
    localized.entries.set('instantiations',seq([
        ...(field(localized,'instantiations')?.values || []),
        ...bindings.values.map(pair=>record({symbol:pair.values[0],value:promoteExpression(pair.values[1])})),
    ]));
    return localized;
}

export function substituteMathematics(value,bindings,options) {
    if (!isMathExpression(value) && !isContext(value)) throw new Error('MathSubstitute requires an expression or mathematical context');
    return worker(bindings,null,mathBudgets(options)).walk(value);
}

export function evaluateMathematics(value,bindings=seq([]),options) {
    const limits=mathBudgets(options);
    const assumptionContext=isContext(bindings) ? bindings : null;
    if (assumptionContext) {
        if (!isMathExpression(value)) throw new Error('Evaluation under a context requires an expression receiver');
        const assumptions=field(assumptionContext,'assumptions');
        if (assumptions?.type!=='sequence' || field(assumptionContext,'domains')?.type!=='sequence' || field(assumptionContext,'binders')?.type!=='sequence') throw new Error('Invalid mathematical evaluation context');
        const inferred=new Map();
        const inspector=worker(seq([]),null,limits);
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
    const localized=worker(bindings,null,limits).walk(value);
    if (!isMathExpression(value) && !isContext(value)) throw new Error('MathEvaluate requires an expression or mathematical context');
    const {tick}=worker(seq([]),null,limits);
    const reasons=new Set();
    const provider=createProviderEvaluation(reasons,limits);
    function calculate(expr,depth=0) {
        tick(depth);
        if (isExpressionScalar(expr)) return provider.read(expr);
        if (!isMathExpression(expr)) {reasons.add('unsupportedResult');return null;}
        const kind=field(expr,'kind')?.value;
        if (kind==='constant') {
            return provider.read(field(expr,'value'));
        }
        if (kind==='variable') {reasons.add('unboundSymbol');return null;}
        if (kind==='apply') {reasons.add('unlinkedSemanticApplication');return null;}
        const args=field(expr,'operands').values.map(v=>calculate(v,depth+1));
        if (args.some(v=>v===null)) return null;
        return provider.operate(field(expr,'operation').value,args);
    }
    const context=isContext(localized) ? localized : null;
    const candidate=calculate(context ? field(context,'result') : localized);
    const resultKind=provider.resultKind(candidate),approximation=provider.isApproximation(candidate);
    let conditional=false,invalid=false;
    if (context) {
        conditional=!!field(context,'binders')?.values.length || field(context,'validation')?.value==='unverifiedImport';
        for (const entry of field(context,'domains')?.values || []) {
            const point=calculate(field(entry,'symbol'));
            const domain=field(entry,'domain');
            if (!point || !domain) {conditional=true;continue;}
            for (const [endpoint,closed,lower] of [['lower','lowerclosed',true],['upper','upperclosed',false]]) {
                const raw=field(domain,endpoint);
                if (raw===null) continue;
                const bound=rational(raw), inclusion=field(domain,closed);
                if (!bound || !(inclusion===null || inclusion instanceof Integer && inclusion.value===1n)) {conditional=true;continue;}
                const truth=compareProviderValues(point,bound,lower ? inclusion===null ? '>' : '>=' : inclusion===null ? '<' : '<=');
                if (truth===null) conditional=true;
                else if (!truth) invalid=true;
            }
            const excluded=field(domain,'excluded');
            if (excluded?.type!=='sequence') conditional=true;
            else for (const raw of excluded.values) {
                const bound=rational(raw);
                if (!bound) conditional=true;
                else {
                    const truth=compareProviderValues(point,bound,'!=');
                    if (truth===null) conditional=true;
                    else if (!truth) invalid=true;
                }
            }
        }
        for (const assumption of field(context,'assumptions')?.values || []) {
            const a=calculate(field(assumption,'left')),b=calculate(field(assumption,'right'));
            if (!a || !b) {conditional=true;continue;}
            const truth=compareProviderValues(a,b,field(assumption,'operator')?.value);
            if (truth===null) conditional=true;
            else if (!truth) invalid=true;
        }
    }
    conditional ||= provider.unverified;
    const status=invalid ? 'invalidAssumptions' : candidate===null ? 'unresolved' : conditional ? 'conditional' : approximation ? 'enclosed' : 'complete';
    return record({schema:str('rix.math.evaluation@1'),status:str(status),value:status==='complete' ? candidate : null,
        candidate:invalid ? null : candidate,localized,context,assumptioncontext:assumptionContext,reasons:seq([...reasons].map(str)),
        resultkind:str(invalid ? 'unresolved' : resultKind),
        enclosure:!invalid && candidate instanceof RationalInterval ? candidate : null,providers:seq(provider.providers),budgets:mathBudgetRecord(limits)});
}

export const mathematicalLocalizationCapabilities={
    MathBudgets:{impl:([options])=>mathBudgetRecord(mathBudgets(options)),pure:true,doc:'Inspect default or overridden per-call mathematical budgets'},
    MathInstantiate:{impl:([value,bindings,options])=>instantiateMathematics(value,bindings,options),pure:false,doc:'Instantiate selected local binders while retaining their domains and assumptions'},
    MathSubstitute:{impl:([value,bindings,options])=>substituteMathematics(value,bindings,options),pure:false,doc:'Simultaneous identity-based free substitution retaining context conditions'},
    MathEvaluate:{impl:([value,bindings,options])=>evaluateMathematics(value,bindings,options),pure:false,doc:'Bounded provider evaluation with explicit unresolved context obligations'},
};
