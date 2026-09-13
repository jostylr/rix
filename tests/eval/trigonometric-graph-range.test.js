import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,evaluateCalculusGraphRange,checkCalculusGraphRangeResult} from '../../src/index.js';
import {RationalIntervalSet} from '@ratmath/core';
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("calculus"); .Plugin.Load("numerics");'+source,{context:new Context()});
    test(`${mode}: trigonometric graph ranges replay with explicit semantic budgets`,async()=> {
        const result=await run('expr := .calculus.Sin()(::x); ans := .numerics.GraphRange(expr,[(::x,1:2)],{= semanticBudgets={= transcendentalBits=24 } }); (ans[:certified],ans[:exactImage],ans[:interval].Start()>4/5,ans[:interval].End(),.numerics.CheckGraphRange(ans)[:certified],ans[:budgets][:semanticBudgets][:transcendentalBits]);');
        expect(result.values.map(String)).toEqual(['1','null','1','1','1','24']);
    });
    test(`${mode}: source holes and exhausted budgets cannot become certificates`,async()=> {
        const result=await run('expr := .calculus.Sin()(::x/::x); hole := .numerics.GraphRange(expr,[(::x,(-1):1)]); limited := .numerics.GraphRange(.calculus.Sin()(::x),[(::x,1:2)],{= semanticBudgets={= maxSumTerms=1 } }); (hole[:domainStatus],.numerics.CheckGraphRange(hole)[:certified],limited[:certified],limited[:domainStatus]);');
        expect(result.values.map(v=>v?.type==='string'?v.value:String(v))).toEqual(['partiallyDefined','1','null','unresolved']);
    });
    test(`${mode}: sine derivative sign and Lipschitz consumers use certified cosine ranges`,async()=> {
        const result=await run('d := .calculus.DifferentiateResult(.calculus.Sin()(::x),::x); sign := .numerics.DerivativeSign(d,[(::x,0:1)]); bound := .numerics.LipschitzRange(d,[(::x,0:1)]); (sign[:direction],sign[:certified],bound[:certified],bound[:checker][:accepted]);');
        expect(result.values.map(v=>v?.type==='string'?v.value:String(v))).toEqual(['nondecreasing','1','1','1']);
    });
}
test('native replay rejects a forged trigonometric range and preserves disconnected inputs',()=> {
    const [expr,x]=parseAndEvaluate('.Plugin.Load("calculus"); (.calculus.Cos()(::x),::x);',{context:new Context()}).values;
    const pairs={type:'sequence',values:[{type:'tuple',values:[x,new RationalIntervalSet([{low:-1,high:0},{low:6,high:7}])]}]};
    const result=evaluateCalculusGraphRange(expr,pairs);
    expect(result.certified).toBe(true);
    expect(checkCalculusGraphRangeResult(result).certified).toBe(true);
    expect(checkCalculusGraphRangeResult({...result,range:RationalIntervalSet.point(0)}).accepted).toBe(false);
    const unbounded={type:'sequence',values:[{type:'tuple',values:[x,new RationalIntervalSet([{low:null,high:null}])]}]};
    const global=evaluateCalculusGraphRange(expr,unbounded);
    expect(String(global.range)).toBe('[-1,1]');
    expect(global.exactImage).toBe(false);
    expect(checkCalculusGraphRangeResult(global).certified).toBe(true);
});
