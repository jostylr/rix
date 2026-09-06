import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate} from '../../src/index.js';
import {RationalIntervalSet,Integer} from '@ratmath/core';
import {calculusGraphStructuralKey as key,substituteCalculusGraphVariable as substitute} from '../../src/runtime/calculus-range.js';
import {checkRangeEvidence,RANGE_EVIDENCE_SCHEMA,RANGE_CHECKER_VOCABULARY} from '../../src/runtime/range-evidence-checker.js';
const range=(low,high=low)=>new RationalIntervalSet({low,high});
function fixture(outerSource='b^2',direction='nondecreasing') {
    const [a,b,inner,outer]=parseAndEvaluate(`a := ::x; b := {; ::x }; (a,b,a+1,${outerSource});`,{context:new Context()}).values;
    const composed=substitute(outer,b,inner),input=range(1,2),outerInput=range(2,4);
    const innerGraph=key(inner),outerGraph=key(outer);
    const nodes=[
        {id:'di',rule:'trusted.derivativeRange',premises:[],conclusion:{type:'derivativeRange',variable:a,functionGraph:innerGraph,derivativeGraph:'di',input,range:range(1),domainCoverage:'allDefined'}},
        {id:'mi',rule:'monotone.derivativeSign',premises:['di'],conclusion:{type:'monotonicity',functionGraph:innerGraph,input,direction:'nondecreasing'}},
        {id:'do',rule:'trusted.derivativeRange',premises:[],conclusion:{type:'derivativeRange',variable:b,functionGraph:outerGraph,derivativeGraph:'do',input:outerInput,range:direction==='nondecreasing'?range(4,8):range(-1),domainCoverage:'allDefined'}},
        {id:'mo',rule:'monotone.derivativeSign',premises:['do'],conclusion:{type:'monotonicity',functionGraph:outerGraph,input:outerInput,direction}},
        {id:'image',rule:'trusted.range',premises:[],conclusion:{type:'rangeEnclosure',subject:innerGraph,input,range:range(2,3),domainCoverage:'allDefined',exclusions:[]}},
        {id:'composed',rule:'monotone.compose',premises:['mi','mo','image'],parameters:{innerExpression:inner,outerExpression:outer,outerVariable:b,composedExpression:composed},conclusion:{type:'monotonicity',functionGraph:key(composed),input,direction}},
    ];
    return {a,b,inner,outer,composed,nodes,document:{schema:RANGE_EVIDENCE_SCHEMA,vocabulary:RANGE_CHECKER_VOCABULARY,root:'composed',nodes}};
}
test('scoped monotone composition checks substitution and retains the inner coordinate',()=> {
    const f=fixture(),result=checkRangeEvidence(f.document,{resolveTrusted:()=>true});
    expect(result.accepted).toBe(true);
    expect(key(result.conclusion.variable)).toBe(key(f.a));
    expect(result.evidenceLevel).toBe('trustedCapability');
    expect(checkRangeEvidence(f.document).accepted).toBe(false);
});
test('composition rejects wrong coordinates, uncovered images and hidden parameter dependence',()=> {
    const wrong=fixture();
    wrong.nodes[5].parameters.outerVariable=wrong.a;
    wrong.nodes[5].parameters.composedExpression=wrong.outer;
    wrong.nodes[5].conclusion.functionGraph=key(wrong.outer);
    expect(checkRangeEvidence(wrong.document,{resolveTrusted:()=>true}).diagnostics).toEqual(['monotoneCompositionVariableMismatch']);
    const narrow=fixture();
    narrow.nodes[2].conclusion.input=range(2,'5/2');narrow.nodes[3].conclusion.input=range(2,'5/2');
    expect(checkRangeEvidence(narrow.document,{resolveTrusted:()=>true}).diagnostics).toEqual(['monotoneCompositionDomainMismatch']);
    expect(checkRangeEvidence(fixture('100*a-b','nonincreasing').document,{resolveTrusted:()=>true}).diagnostics).toEqual(['monotoneCompositionRequiresUnivariateGraphs']);
});
test('composition budgets cover the result and scoped selectors cannot be names',()=> {
    const f=fixture();
    const options=depth=>({type:'map',entries:new Map([['maxdepth',new Integer(BigInt(depth))]])});
    expect(()=>substitute(f.outer,'x',f.inner)).toThrow('symbolic selector');
    expect(()=>substitute(f.outer,f.b,f.inner,options(1))).toThrow('DepthLimit');
    expect(key(substitute(f.outer,f.b,f.inner,options(3)))).toBe(key(f.composed));
    expect(checkRangeEvidence(f.document,{resolveTrusted:()=>true,compositionOptions:options(1)}).accepted).toBe(false);
    expect(checkRangeEvidence(f.document,{resolveTrusted:()=>true,compositionOptions:options(3)}).accepted).toBe(true);
});
