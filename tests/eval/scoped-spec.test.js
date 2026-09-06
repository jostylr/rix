import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {createSymbolicSpec} from '../../src/eval/functions/symbolic.js';

test('unconverted spec consumers cannot silently drop identity metadata',()=> {
    const spec=parseAndEvaluate('.SpecFromExpression(::x+1,[::x]);',{context:new Context()});
    expect(()=>createSymbolicSpec({inputs:spec.inputs,expression:spec.expression})).toThrow('does not preserve scoped symbol bindings');
});

for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: scoped specs compile and restore distinct same-named identities`,async()=> {
        const result=await run(`a := ::x; b := {; ::x };
            spec := .SpecFromExpression(a^2+b,[b,a]);
            F := .Poly(spec); expr := .ExpressionFromSpec(F);
            (F(2,3),expr.Eval([(a,3),(b,2)])[:value],.InspectSpec(spec)[:symbolBindings].Len());`);
        expect(result.values.map(String)).toEqual(['11','11','2']);
    });
    test(`${mode}: composition and arithmetic retain both binding tables`,async()=> {
        const result=await run(`a := ::x; b := {; ::x };
            P := .SpecFromExpression(a^2,[a]); Q := .SpecFromExpression(b+1,[b]);
            sum := .ExpressionFromSpec(P+Q); composed := .ExpressionFromSpec(P(Q));
            d := .ExpressionFromSpec(.Deriv(P,a));
            (sum.Eval([(a,2),(b,3)])[:value],composed.Eval([(b,3)])[:value],d.Eval([(a,3)])[:value]);`);
        expect(result.values.map(String)).toEqual(['8','16','6']);
    });
    test(`${mode}: definitions expand and numeric partial application preserves remaining identity`,async()=> {
        const result=await run(`::y = ::x^2; S := .SpecFromExpression(::y+::z,[::x,::z]);
            expr := .ExpressionFromSpec(S(3)); expr.Eval([(::z,2)])[:value];`);
        expect(String(result)).toBe('11');
    });
    test(`${mode}: scoped spec conversion rejects ambiguous or unsupported contracts`,async()=> {
        for (const source of [
            '.SpecFromExpression(::x+1);',
            '.SpecFromExpression(::x+1,[:x]);',
            '.SpecFromExpression(::x+::y,[::x]);',
            '.SpecFromExpression(::x,[::x,::x]);',
            '::y = ::x^2; .SpecFromExpression(::y,[::y]);',
            '.SpecFromExpression(::x+(0:1),[::x]);',
            '.SpecFromExpression({& ::x == 3 & ::x+1 },[::x]);',
            '.Plugin.Load("calculus"); .SpecFromExpression(.calculus.Sin()(::x),[::x]);',
            '.Deriv(.SpecFromExpression(::x^2,[::x]),:x);',
            '.SpecFromExpression(::x+1,[::x],{= maxVisits=1 });',
        ]) await expect((async()=>run(source))()).rejects.toThrow();
        expect(String(await run('F := .Poly(.SpecFromExpression(::x+1,[::x],{= maxVisits=3 })); F(2);'))).toBe('3');
    });
}
