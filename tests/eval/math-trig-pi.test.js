import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {createExactGenerator,exactPi,multiplyScalars} from '../../src/runtime/exact-values.js';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
import {encodeMathematicalJSON,decodeMathematicalJSON} from '../../src/runtime/math-json.js';
const get=(v,k)=>v.entries.get(k);
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('S(x) -> .ExpressionApply("rix.function.sin@1",:Sin,[x]); C(x) -> .ExpressionApply("rix.function.cos@1",:Cos,[x]);'+source,{context:new Context()});
    test(`${mode}: rational pi course angles are exact in every quadrant`,async()=> {
        const result=await run('(S(1~{pi}).Eval()[:value],C(1~{pi}).Eval()[:value],S((1/6)~{pi}).Eval()[:value],S((-1/6)~{pi}).Eval()[:value],C((1/3)~{pi}).Eval()[:value],S((3/2)~{pi}).Eval()[:value],S((1/4)~{pi}).Eval()[:value]^2,C((1/6)~{pi}).Eval()[:value]^2,S((2000000000001/6)~{pi}).Eval()[:value]);');
        expect(result.values.map(String)).toEqual(['0','-1','1/2','-1/2','1/2','-1','1/2','3/4','-1']);
    });
    test(`${mode}: turns and degrees already convert exactly to scalar radians`,async()=> {
        const result=await run('angle := (1/12)~[turn]; radians := angle / (1~[rad]); (radians==(1/6)~{pi},S(radians).Eval()[:value],C((60~[deg])/(1~[rad])).Eval()[:value],.ConvertUnit((1/2)~[turn],.Units[:rad])==1~{pi}~[rad]);');
        expect(result.values.map(String)).toEqual(['1','1/2','1/2','1']);
    });
    test(`${mode}: other rational pi angles are certified with configurable work`,async()=> {
        const result=await run('(S((1/7)~{pi}).Eval([], {= transcendentalBits=32 }),S((15/7)~{pi}).Eval([], {= transcendentalBits=32 }),S((1/7)~{pi}).Eval([], {= maxSumTerms=1 }),C((1/4)~{pi}).Eval([], {= maxSumTerms=1 }));');
        const a=get(result.values[0],'enclosure'),b=get(result.values[1],'enclosure');
        expect(get(result.values[0],'status').value).toBe('enclosed');
        expect(a.low.greaterThan(new Rational(43388n,100000n))).toBe(true);
        expect(a.high.lessThan(new Rational(43389n,100000n))).toBe(true);
        expect(a.high.subtract(a.low).lessThanOrEqual(new Rational(1n,1n<<32n))).toBe(true);
        expect(String(a)).toBe(String(b));
        expect(get(result.values[2],'reasons').values.map(v=>v.value)).toContain('trigonometricPiSeriesBudgetExceeded');
        expect(get(result.values[3],'status').value).toBe('complete');
        await expect((async()=>run('S((1/7)~{pi}).Eval([], {= transcendentalBits=1000,maxDigits=10 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: canonical pi survives inert JSON while formal pi names stay formal`,async()=> {
        const result=await run('expr := S((1/6)~{pi}); (.MathDecodeJSON(.MathEncodeJSON(expr)).Eval()[:value],.MathDecodeJSON(.MathEncodeJSON(S((1/7)~{pi}))).Eval()[:status]);');
        expect(String(result.values[0])).toBe('1/2');
        expect(result.values[1].value).toBe('enclosed');
        const localized=await run('expr := S(::x*1~{pi}); expr.Eval([(::x,1/6)])[:value];');
        expect(String(localized)).toBe('1/2');
    });
}

test('a name or forged public ID cannot acquire canonical pi semantics',()=> {
    for(const fake of [createExactGenerator('pi'),createExactGenerator('pi',{id:'exact:pi'})]) {
        let reason;
        expect(evaluateRealSemantic('rix.function.sin@1',[fake],mathBudgets(),v=>v,r=>{reason=r;return null;})).toBeNull();
        expect(reason).toBe('unsupportedSemanticProvider');
    }
});

test('pi serialization uses a closed semantic allowlist, never generator spelling',()=> {
    expect(decodeMathematicalJSON(encodeMathematicalJSON(exactPi()))).toBe(exactPi());
    const formal=decodeMathematicalJSON(encodeMathematicalJSON(createExactGenerator('pi')));
    expect(formal).not.toBe(exactPi());
    let reason;
    expect(evaluateRealSemantic('rix.function.cos@1',[formal],mathBudgets(),v=>v,r=>{reason=r;return null;})).toBeNull();
    expect(reason).toBe('unsupportedSemanticProvider');
    const saved=JSON.parse(encodeMathematicalJSON(exactPi()));
    saved.nodes[0].semanticId='rix.constant.fake@1';
    expect(()=>decodeMathematicalJSON(JSON.stringify(saved))).toThrow('unknown named constant');
    saved.nodes[0].semanticId='rix.constant.pi@1';saved.nodes[0].code='anything';
    expect(()=>decodeMathematicalJSON(JSON.stringify(saved))).toThrow();
});

test('pi quadrants preserve parity, period and requested enclosure width',()=> {
    for(const id of ['rix.function.sin@1','rix.function.cos@1']) for(let n=-12;n<=12;n++) {
        const run=q=>evaluateRealSemantic(id,[multiplyScalars(q,exactPi())],{...mathBudgets(),transcendentalbits:16},v=>v,r=>{throw new Error(r);});
        const q=new Rational(BigInt(n),7n),a=run(q),b=run(q.add(new Rational(2n)));
        expect(String(a)).toBe(String(b));
        if(a.low) expect(a.high.subtract(a.low).lessThanOrEqual(new Rational(1n,1n<<16n))).toBe(true);
    }
});
