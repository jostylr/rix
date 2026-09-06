import {test,expect} from 'bun:test';
import {Integer,RationalInterval} from '@ratmath/core';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,evaluateCalculusGraphRange,checkCalculusGraphRangeResult} from '../../src/index.js';
import {calculusExpressionToSpec} from '../../src/eval/functions/symbolic.js';
import {freshExpressionSymbol,expressionOperation,expressionConstant} from '../../src/runtime/math-expression.js';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("numerics");'+source,{context:new Context()});
    test(`${mode}: certified ranges distinguish same-named identities and replay evidence`,async()=> {
        const result=await run(`a := ::x; b := {; ::x };
            same := .numerics.GraphRange(a-a,[(a,1:2)]);
            different := .numerics.GraphRange(a-b,[(a,1:2),(b,1:2)]);
            (same[:interval],different[:interval],same[:exactImage],different[:exactImage],
             .numerics.CheckGraphRange(same)[:certified],.numerics.CheckGraphRange(different)[:certified]);`);
        expect(result.values.slice(0,2).map(String)).toEqual(['0:0','-1:1']);
        expect(result.values.slice(2).map(String)).toEqual(['1','1','1','1']);
    });
    test(`${mode}: scoped source holes and definitions survive certified evaluation`,async()=> {
        const result=await run(`::y = ::x^2;
            square := .numerics.GraphRange(::y,[(::x,(-1):2)],{= checkedSimplify=1 });
            hole := .numerics.GraphRange(::x/::x,[(::x,(-1):1)]);
            (square[:interval],.numerics.CheckGraphRange(square)[:certified],
             hole[:domainStatus],hole[:interval],.numerics.CheckGraphRange(hole)[:certified]);`);
        expect(result.values.map(v=>v?.type==='string'?v.value:String(v))).toEqual(['0:4','1','partiallyDefined','1:1','1']);
    });
    test(`${mode}: budgets and identity-only binding contracts are enforced`,async()=> {
        for (const source of [
            '.numerics.GraphRange(::x,{= x=1:2 });',
            '.numerics.GraphRange(::x,[(::x,1:2),(::x,2:3)]);',
            '.numerics.GraphRange((::x+1)^2,[(::x,1:2)],{= maxDepth=1 });',
            '.numerics.GraphRange(::x+1,[(::x,1:2)],{= maxWork=1 });',
            '.numerics.GraphRange(::x,[(::x,1:2)],{= maxWork=1/2 });',
        ]) await expect((async()=>run(source))()).rejects.toThrow();
        const result=await run('.numerics.GraphRange((::x+1)^2,[(::x,1:2)],{= maxDepth=3,maxWork=1000001,maxSubintervals=1 })[:certified];');
        expect(String(result)).toBe('1');
        const raised=await run('.numerics.GraphRange(::x,[(::x,1:1)],{= maxSubintervals=10001 })[:budgets][:maxSubintervals];');
        expect(String(raised)).toBe('10001');
    });
}

test('range depth can be raised above the default without changing defaults',()=> {
    const x=freshExpressionSymbol('x');
    let expression=x;
    for(let i=0;i<140;i++) expression=expressionOperation('add',[expression,expressionConstant(new Integer(1n))]);
    const bindings={type:'sequence',values:[{type:'tuple',values:[x,new RationalInterval(0,1)]}]};
    expect(()=>evaluateCalculusGraphRange(expression,bindings)).toThrow('DepthLimit');
    const result=evaluateCalculusGraphRange(expression,bindings,{type:'map',entries:new Map([['maxdepth',new Integer(200n)]])});
    expect(result.certified).toBe(true);
    expect(result.range.toString()).toBe('[140,141]');
    const inputs={type:'sequence',values:[x]};
    expect(()=>calculusExpressionToSpec(expression,inputs)).toThrow('budget');
    expect(calculusExpressionToSpec(expression,inputs,null,{type:'map',entries:new Map([['maxdepth',new Integer(200n)]])}).type).toBe('symbolic_spec');
});

test('replay rejects replacement of a binding with a distinct same-named symbol',()=> {
    const x=freshExpressionSymbol('x'),other=freshExpressionSymbol('x');
    const pairs=symbol=>({type:'sequence',values:[{type:'tuple',values:[symbol,new RationalInterval(1,2)]}]});
    const result=evaluateCalculusGraphRange(x,pairs(x));
    const tampered={...result,evidence:{...result.evidence,bindings:pairs(other)}};
    expect(checkCalculusGraphRangeResult(tampered).accepted).toBe(false);
});
