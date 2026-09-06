import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("cas");'+source,{context:new Context()});
    test(`${mode}: calculus and CAS distinguish same-named scoped variables`,async()=> {
        const value=await run('a := ::x; b := {; ::x }; expr := a^2+b; da := .calculus.Differentiate(expr,a); db := .calculus.Differentiate(expr,b); integral := .cas.Integrate(a*b,a); (da.Eval([(a,3)])[:value],db.Eval()[:value],integral[:antiderivative].Eval([(a,2),(b,3)])[:value],.cas.CheckIntegral(integral)[:accepted],.calculus.StructuralKey(a)==.calculus.StructuralKey(b));');
        expect(value.values.slice(0,3).map(String)).toEqual(['6','1','6']);
        expect(value.values[3].value).toBe(1n);expect(value.values[4]).toBeNull();
    });
    test(`${mode}: semantic construction, simplification and immutable definitions stay in core`,async()=> {
        const value=await run('::y = ::x^2; d := .calculus.Differentiate(::y,::x); simplified := .cas.Simplify(d+0); root := .calculus.Sqrt()(::x); (simplified[:expression].Eval([(::x,3)])[:value],.cas.CheckSimplification(simplified)[:accepted],root.Eval([(::x,4)])[:value]);');
        expect(value.values.map(String)).toEqual(['6','1','2']);
        for (const source of ['.calculus.Differentiate(::x^2,:x);','.cas.Integrate(::x^2,:x);','::x=2; .calculus.Differentiate(::x,::x);','.cas.Integrate(::x+(1:2),::x);','.calculus.Differentiate(::x+(1:2),::x);']) await expect((async()=>run(source))()).rejects.toThrow();
    });
    test(`${mode}: derivatives retain and discharge domains through provider evaluation`,async()=> {
        const value=await run('d := .calculus.DifferentiateResult(.calculus.Log()(::x),::x); good := .calculus.EvaluateResult(d,[(::x,2)]); bad := .calculus.EvaluateResult(d,[(::x,-2)]); (good[:status],good[:value],bad[:status],good[:obligations].Len(),.calculus.Evaluate(::x^2,[(::x,3)]));');
        expect(value.values[0].value).toBe('complete');expect(String(value.values[1])).toBe('1/2');
        expect(value.values[2].value).toBe('invalidAssumptions');expect(String(value.values[3])).toBe('1');expect(String(value.values[4])).toBe('9');
        const branch=await run('d := .calculus.DifferentiateResult(.calculus.ComplexLog()(::x),::x); .calculus.EvaluateResult(d,[(::x,2)]);');
        expect(branch.entries.get('status').value).toBe('conditional');expect(branch.entries.get('value')).toBeNull();
        await expect((async()=>run('.calculus.Evaluate(::x,{= x=3 });'))()).rejects.toThrow('identity');
    });
    test(`${mode}: simplification never identifies foreign symbols or drops partial domains`,async()=> {
        const value=await run('a := ::x; b := {; ::x }; s := .cas.Simplify(a-b); q := .cas.Simplify(a/a); (s[:expression].Eval([(a,3),(b,1)])[:value],q[:expression].Eval([(a,0)])[:status]);');
        expect(String(value.values[0])).toBe('2');expect(value.values[1].value).toBe('unresolved');
    });
}
