import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
const get=(v,k)=>v.entries.get(k);
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: expression methods share system evaluation and substitution`,async()=> {
        const value=await run('expr := ::x^2+1; ans := expr.Eval([(::x,3)]); changed := expr.Substitute([(::x,::y)]); (ans[:value],changed==::y^2+1,expr.Eval()[:status],.MathDecodeJSON(.MathEncodeJSON(expr)).Eval()[:status]);');
        expect(String(value.values[0])).toBe('10');
        expect(value.values[1].value).toBe(1n);
        expect(value.values[2].value).toBe('unresolved');
        expect(value.values[3].value).toBe('unresolved');
    });
    test(`${mode}: exact simultaneous localization and immutable definitions`,async()=> {
        const result=await run('::y = ::x+1; .MathEvaluate(::y^2,[(::x,2)]);');
        expect(get(result,'status').value).toBe('complete');
        expect(String(get(result,'value'))).toBe('9');
        const swap=await run('.MathSubstitute(::x-::y,[(::x,::y),(::y,::x)]) == ::y-::x;');
        expect(swap.value).toBe(1n);
    });
    test(`${mode}: conditions are checked without being erased`,async()=> {
        for (const [n,status] of [[2,'complete'],[-2,'invalidAssumptions']]) {
            const result=await run(`c := {& ::x>0 & ::x+1 }; .MathEvaluate(c,[(::x,${n})]);`);
            // Domain obligations remain explicit even when comparisons decide.
            expect(get(result,'status').value).toBe(status==='complete' ? 'conditional' : status);
            expect(get(result,'value')).toBeNull();
            expect(get(result,'context').entries.get('assumptions').values.length).toBe(1);
        }
        const result=await run('c := {& ::x==::y & ::x+1 }; .MathEvaluate(c,[(::x,2),(::y,2)]);');
        expect(get(result,'status').value).toBe('complete');
    });
    test(`${mode}: binders cannot be captured, replaced, or lost`,async()=> {
        const result=await run('c := {& :::x | 0:1 & :::x+::x }; d := .MathSubstitute(c,[(::x,2)]); .SameSymbol(c[:binders][1],d[:result].Operands()[1]);');
        expect(result.value).toBe(1n);
        for (const code of [
            'c := {& :::x & :::x }; .MathSubstitute(::y,[(::y,c[:result])]);',
            'c := {& :::x & :::x }; .MathSubstitute(c,[(c[:result],2)]);',
            '.MathSubstitute(::x,[(::x,1),(::x,2)]);',
        ]) await expect((async()=>run(code))()).rejects.toThrow();
    });
    test(`${mode}: unsupported operations stay inert and partial domains are retained`,async()=> {
        for (const [expr,reason] of [['::z','unboundSymbol'],['.ExpressionConstant(1:2)','unsupportedConstantProvider'],['.ExpressionApply(:unknown,:Danger,[])','unlinkedSemanticApplication'],['::x/0','divisionByZero'],['::x^0','undefinedPower'],['::x^257','unsupportedExponent']]) {
            const result=await run(`.MathEvaluate(${expr},[(::x,0)]);`);
            expect(get(result,'status').value).toBe('unresolved');
            expect(get(result,'reasons').values.map(v=>v.value)).toContain(reason);
        }
    });
    test(`${mode}: imported contexts remain conditional`,async()=> {
        const result=await run('.MathEvaluate(.MathDecodeJSON(.MathEncodeJSON({& & 3 })));');
        expect(get(result,'status').value).toBe('conditional');
        expect(get(result,'value')).toBeNull();
    });
    test(`${mode}: rational arithmetic, overrides, nested contexts, and budgets`,async()=> {
        const arithmetic=await run('.MathEvaluate(-(::x+1)/3+::x^(-2),[(::x,2)]);');
        expect(String(get(arithmetic,'value'))).toBe('-3/4');
        const override=await run('::y = ::x+1; r := .MathEvaluate(::y,[(::y,7)]); (r[:value],.ExpressionDefinition(::y)==::x+1);');
        expect(String(override.values[0])).toBe('7');
        expect(override.values[1].value).toBe(1n);
        const nested=await run('calls:=0; c := {& :::t & calls+=1; {& :::t & :::t+::x } }; d := .MathSubstitute(c,[(::x,3)]); (calls,.SameSymbol(d[:binders][1],d[:result][:binders][1]),.SameSymbol(d[:result][:binders][1],d[:result][:result].Operands()[1]));');
        expect(nested.values[0].value).toBe(1n);
        expect(nested.values[1]).toBeNull();
        expect(nested.values[2].value).toBe(1n);
        await expect((async()=>run('.MathEvaluate((::x^256)^256,[(::x,1234567890)]);'))()).rejects.toThrow('budget');
    });
}
