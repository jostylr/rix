import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,checkCalculusDerivativeTransformation} from '../../src/index.js';
import {Integer,RationalIntervalSet} from '@ratmath/core';
import {checkRangeEvidence,RANGE_EVIDENCE_SCHEMA,RANGE_CHECKER_VOCABULARY} from '../../src/runtime/range-evidence-checker.js';
const document=nodes=>({schema:RANGE_EVIDENCE_SCHEMA,vocabulary:RANGE_CHECKER_VOCABULARY,nodes,root:nodes.at(-1).id});
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    test(`${mode}: browser derivative proofs retain identities and need no trusted leaves`,async()=> {
        const result=await evaluate(`.Plugin.Load("calculus"); .Plugin.Load("numerics");
            d := .calculus.DifferentiateResult(::x^2,::x);
            proof := .numerics.DerivativeProof(d);
            (proof[:certified],proof[:evidenceLevel],proof[:trustedDependencies].Len(),
             .SameSymbol(proof[:conclusion][:variable],::x),
             proof[:evidence][:nodes][1][:rule],
             .numerics.DerivativeProof(d,{= maxWork=1 })[:accepted]);`,{context:new Context()});
        expect(result.values.map(v=>v?.type==='string'?v.value:String(v))).toEqual(['1','checkedEvidence','0','1','derivative.graph','null']);
    });
}

function criticalProof() {
    const [transformation,x,other]=parseAndEvaluate(`.Plugin.Load("calculus");
        (.calculus.DifferentiateResult(::x^3-3*::x,::x),::x,{; ::x });`,{context:new Context()}).values;
    const checked=checkCalculusDerivativeTransformation(transformation);
    const polynomial=[-3,0,3],searchSet=new RationalIntervalSet({low:-2,high:2});
    const isolatingComponents=[new RationalIntervalSet({low:'-3/2',high:'-1/2'}),new RationalIntervalSet({low:'1/2',high:'3/2'})];
    const identity={functionGraph:checked.functionGraph,derivativeGraph:checked.derivativeGraph,variable:x};
    return {other,nodes:[
        {id:'d',rule:'derivative.graph',premises:[],parameters:{transformation},conclusion:{type:'derivativeIdentity',...identity,obligations:checked.obligationDescriptors}},
        {id:'sturm',rule:'polynomial.sturmSequence',premises:[],conclusion:{type:'sturmSequence',polynomial,sequence:[polynomial,[0,6],[3]]}},
        {id:'roots',rule:'polynomial.isolateRoots',premises:['sturm'],conclusion:{type:'isolatedRoots',polynomial,searchSet,isolatingComponents,endpointPolicy:'endpointsNotRoots',complete:true}},
        {id:'critical',rule:'polynomial.completeCriticalPoints',premises:['d','roots'],conclusion:{type:'criticalPoints',...identity,searchSet,isolatingComponents,endpointPolicy:'endpointsNotRoots',complete:true}},
    ]};
}
test('critical-point proof adapters distinguish opaque symbols from names and same-named symbols',()=> {
    const {nodes,other}=criticalProof();
    expect(checkRangeEvidence(document(nodes)).certified).toBe(true);
    for(const variable of [other,'x']) {
        const altered=[...nodes];altered[3]={...nodes[3],conclusion:{...nodes[3].conclusion,variable}};
        expect(checkRangeEvidence(document(altered)).accepted).toBe(false);
    }
    expect(checkRangeEvidence(document(nodes),{limits:{maxPolynomialDegree:1}}).accepted).toBe(false);
    expect(checkRangeEvidence(document(nodes),{limits:{maxPolynomialDegree:2}}).accepted).toBe(true);
    expect(checkRangeEvidence(document(nodes),{recognitionOptions:{type:'map',entries:new Map([['maxterms',new Integer(1n)]])}}).accepted).toBe(false);
    expect(checkRangeEvidence(document(nodes),{limits:{maxNodes:-1}}).diagnostics).toEqual(['invalidResourceLimit']);
});

test('proof chains use an iterative checker with configurable node limits',()=> {
    const set=new RationalIntervalSet({low:0,high:1});
    const conclusion={type:'exactSet',set};
    const nodes=[{id:'0',rule:'given.input',premises:[],conclusion}];
    for(let i=1;i<2000;i++) nodes.push({id:String(i),rule:'set.union',premises:[String(i-1)],conclusion});
    expect(checkRangeEvidence(document(nodes),{limits:{maxNodes:1000}}).accepted).toBe(false);
    expect(checkRangeEvidence(document(nodes),{limits:{maxNodes:2000}}).accepted).toBe(true);
});

test('scoped critical points feed identity-preserving monotonicity partitions',()=> {
    const {nodes,other}=criticalProof();
    const isolatingComponents=[RationalIntervalSet.point(-1),RationalIntervalSet.point(1)];
    for(const index of [2,3]) nodes[index]={...nodes[index],conclusion:{...nodes[index].conclusion,endpointPolicy:'closed',isolatingComponents}};
    const critical=nodes[3].conclusion;
    const partition={id:'partition',rule:'polynomial.monotonicityPartition',premises:['critical'],conclusion:{
        type:'monotonicityPartition',functionGraph:critical.functionGraph,derivativeGraph:critical.derivativeGraph,
        variable:critical.variable,parent:critical.searchSet,endpointPolicy:'closed',roots:[-1,1],
        pieces:[new RationalIntervalSet({low:-2,high:-1}),new RationalIntervalSet({low:-1,high:1}),new RationalIntervalSet({low:1,high:2})],
        directions:['nondecreasing','nonincreasing','nondecreasing'],
    }};
    expect(checkRangeEvidence(document([...nodes,partition])).certified).toBe(true);
    expect(checkRangeEvidence(document([...nodes,{...partition,conclusion:{...partition.conclusion,variable:other}}])).accepted).toBe(false);
});

test('trusted derivative ranges cannot be paired with a foreign symbolic coordinate',()=> {
    const {nodes,other}=criticalProof();
    const identity=nodes[0].conclusion,input=new RationalIntervalSet({low:1,high:2});
    const range={id:'range',rule:'trusted.derivativeRange',premises:[],conclusion:{
        type:'derivativeRange',functionGraph:identity.functionGraph,derivativeGraph:identity.derivativeGraph,
        variable:other,input,range:new RationalIntervalSet({low:0,high:9}),domainCoverage:'allDefined',
    }};
    const sign={id:'sign',rule:'monotone.derivativeSign',premises:['d','range'],conclusion:{type:'monotonicity',functionGraph:identity.functionGraph,input,direction:'nondecreasing'}};
    expect(checkRangeEvidence(document([nodes[0],range,sign]),{resolveTrusted:()=>true}).diagnostics).toEqual(['derivativeRangeIdentityMismatch']);
});
