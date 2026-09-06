import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: per-call budgets raise and lower work without changing defaults`,async()=> {
        const value=await run('expr := (::x+1)^64; ans := expr.Eval([(::x,1~{pi})],{= maxProductPairs=2048 }); (ans[:status],ans[:budgets][:maxProductPairs],.MathBudgets()[:maxProductPairs],(::x^257).Eval([(::x,2)],{= maxExponent=300 })[:status]);');
        expect(value.values.map(v=>v.value)).toEqual(['complete',2048n,1024n,'complete']);
        await expect((async()=>run('(::x+1).Eval([(::x,1~{pi})],{= maxSumTerms=1 });'))()).rejects.toThrow('budget');
        expect((await run('(::x+1).Eval([(::x,1)],{= maxSumTerms=1 })[:status];')).value).toBe('complete');
        await expect((async()=>run('(::x^2).Eval([(::x,123)],{= maxDigits=2 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: traversal options also cover substitution and instantiation`,async()=> {
        for (const source of ['(::x+1).Substitute([(::x,2)],{= maxVisits=1 });','ctx := {& :::x & :::x+1 }; ctx.Instantiate([(ctx[:binders][1],1)],{= maxDepth=1 });']) await expect((async()=>run(source))()).rejects.toThrow('budget');
        const value=await run('(::x+1).Substitute([(::x,2)],{= maxVisits=100 }).Eval()[:value];');
        expect(String(value)).toBe('3');
    });
    test(`${mode}: malformed options and host-unsafe recursion are rejected`,async()=> {
        for (const options of ['1','{= maxDigits=0 }','{= maxTerms=1/2 }','{= maxDepth=513 }','{= maxTermz=10 }','{= maxVisits=9007199254740992 }']) await expect((async()=>run(`.MathBudgets(${options});`))()).rejects.toThrow();
    });
}
