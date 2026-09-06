import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {RationalInterval} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,key)=>v.entries.get(key);
const setup='Root(x) -> .ExpressionApply("rix.function.sqrt.real-principal@1",:Sqrt,[x]); Magnitude(x) -> .ExpressionApply("rix.function.abs.real@1",:Abs,[x]);';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(setup+source,{context:new Context()});
    test(`${mode}: rational square roots preserve exactness and identities`,async()=> {
        const value=await run('a := Root(::x).Eval([(::x,2)]); b := Root(::x).Eval([(::x,2)]); (a[:status],a[:resultKind],.ExpressionConstant(a[:value]^2)==.ExpressionConstant(2),.ExpressionConstant(a[:value])==.ExpressionConstant(b[:value]),Root(Root(16)).Eval()[:value]);');
        expect(value.values.slice(0,2).map(v=>v.value)).toEqual(['complete','exactScalar']);
        expect(value.values.slice(2,4).map(v=>v.value)).toEqual([1n,1n]);
        expect(String(value.values[4])).toBe('2');
    });
    test(`${mode}: dyadic interval root enclosures are sound and precision is explicit`,async()=> {
        const value=await run('expr := Root(::x); a := expr.Eval([(::x,2:3)],{= rootBits=8 }); b := expr.Eval([(::x,2:3)],{= rootBits=32 }); (a,b);');
        const a=get(value.values[0],'enclosure'),b=get(value.values[1],'enclosure');
        for (const range of [a,b]) {
            expect(range.low.pow(2n).lessThanOrEqual(new Rational(2n))).toBe(true);
            expect(range.high.pow(2n).greaterThanOrEqual(new Rational(3n))).toBe(true);
        }
        expect(b.low.greaterThanOrEqual(a.low)).toBe(true);
        expect(b.high.lessThanOrEqual(a.high)).toBe(true);
        expect(get(value.values[0],'resultkind').value).toBe('setEnclosure');
        await expect((async()=>run('Root(::x).Eval([(::x,2:3)],{= rootBits=1000,maxDigits=20 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: absolute value and context domains use the trusted semantic meaning`,async()=> {
        const value=await run('ans := Magnitude(::x).Eval([(::x,-2:3)]); (ans[:enclosure].Start(),ans[:enclosure].End(),Magnitude(::x).Eval({& ::x == -3 & })[:value],Root(::x).Eval({& ::x==4 & })[:value]);');
        expect(value.values.map(String)).toEqual(['0','3','3','2']);
    });
    test(`${mode}: names cannot redirect semantic dispatch, and loading stays inert`,async()=> {
        const value=await run('a := .ExpressionApply("rix.function.sqrt.real-principal@1",:NotACall,[4]); b := .ExpressionApply(:unknown,:Sqrt,[4]); (.MathDecodeJSON(.MathEncodeJSON(a)).Eval()[:value],b.Eval()[:status],a.Eval()[:semantics][1]);');
        expect(String(value.values[0])).toBe('2');
        expect(value.values[1].value).toBe('unresolved');
        expect(value.values[2].value).toBe('rix.function.sqrt.real-principal@1');
    });
    test(`${mode}: unsupported branches, providers and arities remain diagnostic`,async()=> {
        for (const [expr,reason] of [['Root(-1)','outsideRealSquareRootDomain'],['Root(-1:2)','squareRootDomainUnresolved'],['Root(1~{pi})','unsupportedSemanticProvider'],['.ExpressionApply("rix.function.abs.real@1",:Abs,[])','semanticArityMismatch']]) {
            const value=await run(`${expr}.Eval();`);
            expect(get(value,'status').value).toBe('unresolved');
            expect(get(value,'reasons').values.map(v=>v.value)).toContain(reason);
        }
    });
    test(`${mode}: live and saved real evidence survives semantic evaluation`,async()=> {
        const value=await run('.Plugin.Load("numerics"); r := .ExpressionReal(.numerics.Sqrt(2)); a := Root(r).Eval(); saved := .MathDecodeJSON(.MathEncodeJSON(r)); b := Magnitude(saved).Eval(); (a,b);');
        expect(get(value.values[0],'status').value).toBe('enclosed');
        expect(get(value.values[1],'status').value).toBe('conditional');
        const range=get(value.values[0],'enclosure');
        expect(range.low.pow(4n).lessThanOrEqual(new Rational(2n))).toBe(true);
        expect(range.high.pow(4n).greaterThanOrEqual(new Rational(2n))).toBe(true);
    });
}

test('dyadic root kernel certifies rational edge cases at several precisions',()=> {
    for (const bits of [1,4,16]) for (let n=0;n<=20;n++) for (let d=1;d<=7;d++) {
        const q=new Rational(BigInt(n),BigInt(d));
        const result=evaluateRealSemantic('rix.function.sqrt.real-principal@1',[new RationalInterval(q,q)],
            {...mathBudgets(),rootbits:bits},v=>v,reason=>{throw new Error(reason);});
        expect(result.low.pow(2n).lessThanOrEqual(q)).toBe(true);
        expect(result.high.pow(2n).greaterThanOrEqual(q)).toBe(true);
        expect(result.high.subtract(result.low).lessThanOrEqual(new Rational(1n,1n<<BigInt(bits)))).toBe(true);
    }
});
