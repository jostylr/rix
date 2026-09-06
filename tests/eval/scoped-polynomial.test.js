import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("cas");'+source,{context:new Context()});
    test(`${mode}: collect, expand, factor, and polynomial integration preserve identity`,async()=> {
        const value=await run('p := .cas.Collect((::x+1)^3,::x); f := .cas.Factor(::x^2-1,::x); i := .cas.Integrate(p[:polynomial]); (.SameSymbol(p[:variable],::x),p[:coefficients],p[:polynomial].Evaluate(2),.SameSymbol(f[:polynomial].Variable(),::x),i[:antiderivative].Eval([(::x,1)])[:value],.cas.Expand((::x+1)^3,::x)[:expression].Eval([(::x,2)])[:value],.cas.CheckIntegral(i)[:accepted]);');
        expect(value.values[0].value).toBe(1n);expect(value.values[1].values.map(String)).toEqual(['1','3','3','1']);
        expect(String(value.values[2])).toBe('27');expect(value.values[3].value).toBe(1n);expect(String(value.values[4])).toBe('15/4');expect(String(value.values[5])).toBe('27');expect(value.values[6].value).toBe(1n);
    });
    test(`${mode}: polynomial operations compare identities, not names or map equality`,async()=> {
        const value=await run('a := ::x; b := {; ::x }; p := .poly(a+1,a); q := .poly(a^2,a); r := .poly(b+1,b); ((p*q).Evaluate(2),p==r,.SameSymbol((p+q).Variable(),a));');
        expect(String(value.values[0])).toBe('12');expect(value.values[1]).toBeNull();expect(value.values[2].value).toBe(1n);
        await expect((async()=>run('a := ::x; b := {; ::x }; .poly(a+1,a)+.poly(b+1,b);'))()).rejects.toThrow('identities');
        await expect((async()=>run('a := ::x; b := {; ::x }; .cas.Collect(a+b,a);'))()).rejects.toThrow('another symbolic');
    });
    test(`${mode}: coefficient compilation expands definitions and preserves partial domains`,async()=> {
        const value=await run('::y = (::x+1)^2; .MathPolynomialCoefficients(::y,::x);');
        expect(value.values.map(String)).toEqual(['1','2','1']);
        for (const source of ['.cas.Collect(::x,:x);','.cas.Collect(::x/::x,::x);','.cas.Collect(0*(1/::x),::x);','.cas.Collect(::x^0,::x);','.cas.Collect(::x+1~{pi},::x);','.cas.Collect(.calculus.Sin()(::x),::x);']) await expect((async()=>run(source))()).rejects.toThrow();
    });
    test(`${mode}: univariate work budgets are explicit`,async()=> {
        await expect((async()=>run('.MathPolynomialCoefficients(::x,::x,{= maxTerms=1 });'))()).rejects.toThrow('budget');
        await expect((async()=>run('.MathPolynomialCoefficients((::x+1)^32,::x,{= maxProductPairs=10 });'))()).rejects.toThrow('budget');
        const value=await run('.MathPolynomialCoefficients((::x+1)^32,::x,{= maxProductPairs=4096 }).Len();');
        expect(value.value).toBe(33n);
    });
    test(`${mode}: reconstructed polynomials are defined at zero and can be collected again`,async()=> {
        const value=await run('expanded := .cas.Expand((::x+1)^3,::x)[:expression]; (.cas.Collect(expanded,::x)[:coefficients],expanded.Eval([(::x,0)])[:value],.cas.Expand(0*::x,::x)[:expression].Eval([(::x,0)])[:value]);');
        expect(value.values[0].values.map(String)).toEqual(['1','3','3','1']);
        expect(value.values.slice(1).map(String)).toEqual(['1','0']);
    });
}
