import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,checkCalculusDerivativeTransformation,evaluateCalculusDerivativeSign} from '../../src/index.js';
import {Integer,RationalIntervalSet} from '@ratmath/core';
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("calculus"); .Plugin.Load("numerics");'+source,{context:new Context()});
    test(`${mode}: scoped derivative checking and sign distinguish identities`,async()=> {
        const result=await run(`a := ::x; b := {; ::x };
            ::y = a^2+b;
            d := .calculus.DifferentiateResult(::y,a);
            checked := .numerics.CheckDerivativeGraph(d);
            sign := .numerics.DerivativeSign(d,[(a,1:2),(b,4:5)]);
            (.SameSymbol(checked[:variable],a),checked[:certified],sign[:direction]);`);
        expect(result.values.map(v=>v?.type==='string'?v.value:String(v))).toEqual(['1','1','nondecreasing']);
    });
    test(`${mode}: scoped Lipschitz and Taylor certificates replay`,async()=> {
        const result=await run(`d := .calculus.DifferentiateResult(::x^2,::x);
            dd := .calculus.DifferentiateNResult(::x^2,::x,2);
            broad := .numerics.LipschitzRange(d,[(::x,(-1):1)]);
            split := .numerics.LipschitzRange(d,[(::x,(-1):1)],{= maxSubintervals=2 });
            taylor := .numerics.TaylorRange(dd,[(::x,(-1):1)]);
            (broad[:range],split[:range],taylor[:certified],taylor[:checker][:accepted],taylor[:curvature]);`);
        expect(result.values.slice(0,2).map(String)).toEqual(['[-2,2]','[-3/4,5/4]']);
        expect(result.values.slice(2).map(v=>v?.type==='string'?v.value:String(v))).toEqual(['1','1','convex']);
    });
    test(`${mode}: obligations and configurable checker budgets cannot be bypassed`,async()=> {
        const result=await run(`d := .calculus.DifferentiateResult((::x+1)/(::x-1),::x);
            good := .numerics.DerivativeSign(d,[(::x,2:3)]);
            bad := .numerics.LipschitzRange(d,[(::x,0:2)]);
            dd := .calculus.DifferentiateNResult(::x^3,::x,2);
            (.numerics.CheckDerivativeGraph(dd,{= maxDerivativeOrder=1 })[:accepted],
             .numerics.CheckDerivativeGraph(dd,{= maxDerivativeOrder=2 })[:accepted],
             .numerics.CheckDerivativeGraph(d,{= maxDepth=1 })[:accepted],good[:certified],bad[:certified]);`);
        expect(result.values.map(String)).toEqual(['null','1','null','1','null']);
    });
    test(`${mode}: graph recognition retains the symbol and source holes with bounded arithmetic`,async()=> {
        const result=await run(`a := ::x; b := {; ::x };
            p := .numerics.RecognizeGraph((a+1)^3,a);
            q := .numerics.RecognizeGraph(a/a,a);
            foreign := .numerics.RecognizeGraph(a+b,a);
            low := .numerics.RecognizeGraph((a+1)^8,a,{= maxProductPairs=2 });
            high := .numerics.RecognizeGraph((a+1)^8,a,{= maxProductPairs=100 });
            (.SameSymbol(p[:variable],a),p[:numerator],q[:kind],q[:sourceDomainRestrictions].Len(),
             foreign[:recognized],low[:recognized],high[:recognized]);`);
        expect(String(result.values[0])).toBe('1');
        expect(result.values[1].values.map(String)).toEqual(['1','3','3','1']);
        expect(result.values[2].value).toBe('rationalFunction');
        expect(result.values.slice(3).map(String)).toEqual(['1','null','null','1']);
        const failures=await run(`(.numerics.RecognizeGraph(::x,:x)[:recognized],
            .numerics.RecognizeGraph(::x,::x,{= maxTerms=1 })[:recognized],
            .numerics.RecognizeGraph(::x^5,::x,{= maxExponent=4 })[:recognized],
            .numerics.RecognizeGraph(::x+123,::x,{= maxDigits=1 })[:recognized]);`);
        expect(failures.values).toEqual([null,null,null,null]);
    });
}
test('checker rejects replacing the differentiation symbol with a same-named foreign one',()=> {
    const value=parseAndEvaluate('.Plugin.Load("calculus"); a := ::x; b := {; ::x }; (.calculus.DifferentiateResult(a^2,a),b);',{context:new Context()});
    const [d,b]=value.values;
    const forged={...d,entries:new Map(d.entries)};
    forged.entries.set('variable',b);forged.entries.set('variables',{type:'sequence',values:[b]});
    expect(checkCalculusDerivativeTransformation(forged).accepted).toBe(false);
});

test('a negative derivative across disconnected components is not global monotonicity',()=> {
    const [d,x]=parseAndEvaluate('.Plugin.Load("calculus"); (.calculus.DifferentiateResult(1/::x,::x),::x);',{context:new Context()}).values;
    const domain=new RationalIntervalSet([{low:-2,high:-1},{low:1,high:2}]);
    const result=evaluateCalculusDerivativeSign(d,{type:'sequence',values:[{type:'tuple',values:[x,domain]}]});
    expect(result.certified).toBe(true);
    expect(result.monotonicityCertified).toBe(false);
    expect(result.direction).toBe('unknown');
});

test('derivative checker order budget can be raised beyond the former fixed ceiling',()=> {
    const d=parseAndEvaluate('.Plugin.Load("calculus"); .calculus.DifferentiateResult(::x,::x);',{context:new Context()});
    const zero=parseAndEvaluate('.ExpressionConstant(0);');
    const x=d.entries.get('variable');
    const record={...d,entries:new Map(d.entries)};
    record.entries.set('order',new Integer(17n));
    record.entries.set('variables',{type:'sequence',values:Array(17).fill(x)});
    record.entries.set('expression',zero);
    expect(checkCalculusDerivativeTransformation(record).accepted).toBe(false);
    expect(checkCalculusDerivativeTransformation(record,{type:'map',entries:new Map([['maxderivativeorder',new Integer(17n)]])}).accepted).toBe(true);
});
