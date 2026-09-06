import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {evaluateMathematics} from '../../src/runtime/math-localize.js';
import {Integer,Rational} from '@ratmath/core';
const field=(v,k)=>v.entries.get(k);
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: exact contextual equality supports methods and system calls`,async()=> {
        const result=await run('expr := ::x^2+::y; ctx := {& ::x==3; 7==::y & }; ans := expr.Eval(ctx); (ans[:status],ans[:value],.MathEvaluate(expr,ctx)[:value],.ExpressionDefinition(::x),ans[:assumptionContext][:assumptions].Len());');
        expect(result.values[0].value).toBe('complete');
        expect(result.values.slice(1,3).map(String)).toEqual(['16','16']);
        expect(result.values[3]).toBeNull();
        expect(result.values[4].value).toBe(2n);
        const rational=await run('(::x+1).Eval({& ::x==1/3 & });');
        expect(String(field(rational,'value'))).toBe('4/3');
    });
    test(`${mode}: exact points check open bounds and exclusions without solving`,async()=> {
        const result=await run('(::x+1).Eval({& ::x>0; ::x!=2; ::x==3 & });');
        expect(field(result,'status').value).toBe('complete');
        expect(String(field(result,'value'))).toBe('4');
        for (const source of ['(::x+1).Eval({& ::x>0 & });','(::x+1).Eval({& ::x==::y; ::y==7 & });']) {
            expect(field(await run(source),'status').value).toBe('unresolved');
        }
        const conditional=await run('.ExpressionConstant(5).Eval({& ::x>0 & });');
        expect(field(conditional,'status').value).toBe('conditional');
        expect(field(conditional,'value')).toBeNull();
    });
    test(`${mode}: retained conditions catch later contradictions and cannot override definitions`,async()=> {
        const result=await run('ctx := {& ::x==3 & }; ::x = 2; (::x+1).Eval(ctx);');
        expect(field(result,'status').value).toBe('invalidAssumptions');
        expect(field(result,'candidate')).toBeNull();
        const cross=await run('(::x+::y).Eval({& ::x==3; ::y==7; ::x==::y & });');
        expect(field(cross,'status').value).toBe('invalidAssumptions');
        await expect((async()=>run('(::x+1).Eval({& ::x==3; ::x==4 & });'))()).rejects.toThrow('Conflicting');
    });
    test(`${mode}: bound identities and imported evidence remain protected`,async()=> {
        const bound=await run('(::x+1).Eval({& :::x==3 & });');
        expect(field(bound,'status').value).toBe('unresolved');
        const restored=await run('saved := .MathDecodeJSON(.MathEncodeJSON((::x+1,{& ::x==3 & }))); saved[1].Eval(saved[2]);');
        expect(field(restored,'status').value).toBe('conditional');
        expect(String(field(restored,'candidate'))).toBe('4');
        expect(field(restored,'value')).toBeNull();
    });
    test(`${mode}: context reuse does not rerun its body or leak assumptions`,async()=> {
        const result=await run('calls:=0; ctx := {& ::x==3 & calls+=1; 99 }; a := (::x+1).Eval(ctx); b := (::x+2).Eval(ctx); (calls,a[:value],b[:value],ctx[:result],(::x+1).Eval()[:status]);');
        expect(result.values.slice(0,4).map(String)).toEqual(['1','4','5','99']);
        expect(result.values[4].value).toBe('unresolved');
    });
}

test('retained data checks conflicting equalities and normalized domain obligations',()=> {
    const source=parseAndEvaluate('(::x,{& ::x==3 & },{& ::x==4 & });',{context:new Context()});
    const [expr,ctx,other]=source.values;
    // Exercise retained data independently of construction-time rejection.
    const conflicting={...ctx,entries:new Map(ctx.entries)};
    conflicting.entries.set('assumptions',{type:'sequence',values:[...field(ctx,'assumptions').values,...field(other,'assumptions').values]});
    expect(field(evaluateMathematics(expr,conflicting),'status').value).toBe('invalidAssumptions');
    for (const patch of [
        {lower:new Rational(3n),lowerclosed:null},
        {upper:new Rational(2n),upperclosed:new Integer(1n)},
        {excluded:{type:'sequence',values:[new Rational(3n)]}},
    ]) {
        const entry=field(ctx,'domains').values[0];
        const domain={...field(entry,'domain'),entries:new Map(field(entry,'domain').entries)};
        for (const [key,value] of Object.entries(patch)) domain.entries.set(key,value);
        const revised={...entry,entries:new Map(entry.entries)};
        revised.entries.set('domain',domain);
        const altered={...ctx,entries:new Map(ctx.entries)};
        altered.entries.set('domains',{type:'sequence',values:[revised]});
        expect(field(evaluateMathematics(expr,altered),'status').value).toBe('invalidAssumptions');
    }
});
