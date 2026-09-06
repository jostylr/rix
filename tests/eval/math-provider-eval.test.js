import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {adaptRealConstant} from '../../src/runtime/math-real.js';
import {expressionConstant,expressionOperation} from '../../src/runtime/math-expression.js';
import {evaluateMathematics} from '../../src/runtime/math-localize.js';
const field=(v,k)=>v.entries.get(k);
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: exact interval arithmetic retains set denotation`,async()=> {
        const ans=await run('(::x^2+1).Eval([(::x,-1:2)]);');
        expect(field(ans,'status').value).toBe('complete');
        expect(field(ans,'resultkind').value).toBe('setEnclosure');
        expect(String(field(ans,'value').low)).toBe('1');
        expect(String(field(ans,'value').high)).toBe('5');
        const dependency=await run('(::x-::x).Eval([(::x,1:2)]);');
        expect(String(field(dependency,'value').low)).toBe('-1');
        expect(String(field(dependency,'value').high)).toBe('1');
        const literal=await run('.MathEvaluate({& & 1:2 });');
        expect(field(literal,'status').value).toBe('complete');
    });
    test(`${mode}: interval domain checks distinguish inside, outside and overlap`,async()=> {
        for (const [range,status] of [['1:2','complete'],['-2:-1','invalidAssumptions'],['-1:1','conditional'],['0:1','conditional']]) {
            const ans=await run(`c := {& :::t>0 & :::t+1 }; c.Instantiate([(c[:binders][1],${range})]).Eval();`);
            expect(field(ans,'status').value).toBe(status);
        }
        const excluded=await run('c := {& :::t!=1 & :::t }; c.Instantiate([(c[:binders][1],0:2)]).Eval();');
        expect(field(excluded,'status').value).toBe('conditional');
    });
    test(`${mode}: exact scalars use bounded ring arithmetic, not presumed fields`,async()=> {
        const ans=await run('p := 1~{pi}; expr := (::x+1)^2/2; ans := expr.Eval([(::x,p)]); (ans[:status],ans[:resultKind],.ExpressionConstant(ans[:value])==.ExpressionConstant((p+1)^2/2));');
        expect(ans.values[0].value).toBe('complete');
        expect(ans.values[1].value).toBe('exactScalar');
        expect(ans.values[2].value).toBe(1n);
        for (const [expr,reason] of [['1/::x','nonRationalExactDivisor'],['::x^0','nonzeroNotEstablished'],['::x+(1:2)','mixedProviderArithmetic']]) {
            const result=await run(`(${expr}).Eval([(::x,1~{pi})]);`);
            expect(field(result,'status').value).toBe('unresolved');
            expect(field(result,'reasons').values.map(v=>v.value)).toContain(reason);
        }
    });
    test(`${mode}: live reals evaluate stored enclosures without implicit refinement`,async()=> {
        const ans=await run('.Plugin.Load("numerics"); r := .ExpressionReal(.numerics.Sqrt(2)); before := .ExpressionConstantInfo(r)[:enclosure]; ans := (r^2).Eval(); after := .ExpressionConstantInfo(r)[:enclosure]; (ans,before,after);');
        const report=ans.values[0],range=field(report,'enclosure');
        expect(field(report,'status').value).toBe('enclosed');
        expect(field(report,'value')).toBeNull();
        expect(field(report,'resultkind').value).toBe('singletonEnclosure');
        expect(range.low.lessThanOrEqual(new Rational(2n))).toBe(true);
        expect(range.high.greaterThanOrEqual(new Rational(2n))).toBe(true);
        expect(String(ans.values[1])).toBe(String(ans.values[2]));
        expect(field(report,'providers').values.some(v=>field(v,'validation')?.value==='protocolChecked')).toBe(true);
    });
    test(`${mode}: real snapshot evaluation keeps imported evidence unverified`,async()=> {
        const ans=await run('.Plugin.Load("numerics"); r := .MathDecodeJSON(.MathEncodeJSON(.ExpressionReal(.numerics.Sqrt(2)))); (r+1).Eval();');
        expect(field(ans,'status').value).toBe('conditional');
        expect(field(ans,'value')).toBeNull();
        expect(field(ans,'enclosure')).not.toBeNull();
        expect(field(ans,'providers').values.some(v=>field(v,'validation')?.value==='unverifiedImport')).toBe(true);
    });
    test(`${mode}: uncertain divisors, powers, and expansion budgets remain explicit`,async()=> {
        const ans=await run('(1/::x).Eval([(::x,-1:1)]);');
        expect(field(ans,'reasons').values[0].value).toBe('divisorMayContainZero');
        const zero=await run('(::x^0).Eval([(::x,-1:1)]);');
        expect(field(zero,'status').value).toBe('unresolved');
        await expect((async()=>run('((::x+1)^64).Eval([(::x,1~{pi})]);'))()).rejects.toThrow('budget');
    });
}

test('provider evaluation never invokes the retained refinement procedure',()=> {
    const data=parseAndEvaluate('.Plugin.Load("numerics"); r := .numerics.Sqrt(2); (r.NumericsCapabilities(),r.Refine(.RefinementRequest({= absoluteWidth=1/1000 },:refine,r.NumericsCapabilities())));',{context:new Context()});
    let calls=0;
    const real=adaptRealConstant({type:'map',entries:new Map()},null,new Context(),node=> {
        calls++;
        return data.values[node.args[1]==='NUMERICSCAPABILITIES' ? 0 : 1];
    });
    const before=calls;
    const expr=expressionOperation('multiply',[expressionConstant(real),expressionConstant(real)]);
    expect(field(evaluateMathematics(expr),'status').value).toBe('enclosed');
    expect(calls).toBe(before);
});
