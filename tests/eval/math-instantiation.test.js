import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
for (const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: instantiation retains and discharges oriented domains`,async()=> {
        const value=await run('c := {& :::t | 1:0; :::t>0 & :::t^2 }; d := c.Instantiate([(c[:binders][1],1/2)]); (d.Eval()[:value],d[:binders].Len(),c[:binders].Len(),d[:domains][1][:domain][:orientation],d[:instantiations].Len(),c.Eval()[:status]);');
        expect(value.values.slice(0,3).map(String)).toEqual(['1/4','0','1']);
        expect(value.values[3].value).toBe('desc');
        expect(String(value.values[4])).toBe('1');
        expect(value.values[5].value).toBe('unresolved');
        for (const point of ['0','2']) {
            const ans=await run(`c := {& :::t | 0:1; :::t>0 & :::t+1 }; c.Instantiate([(c[:binders][1],${point})]).Eval();`);
            expect(ans.entries.get('status').value).toBe('invalidAssumptions');
            expect(ans.entries.get('value')).toBeNull();
        }
    });
    test(`${mode}: partial symbolic instantiation and later free localization`,async()=> {
        const value=await run('c := {& (:::'+'x,:::y) | (0:1,0:2) & :::x+:::y }; d := .MathInstantiate(c,[(c[:binders][1],::a+1)]); e := d.Instantiate([(d[:binders][1],1)]); (d[:binders].Len(),e.Eval()[:status],e.Eval([(::a,0)])[:value],e[:instantiations].Len());');
        expect(String(value.values[0])).toBe('1');
        expect(value.values[1].value).toBe('unresolved');
        expect(String(value.values[2])).toBe('2');
        expect(String(value.values[3])).toBe('2');
    });
    test(`${mode}: nested scopes preserve inner binders and replace outer captures once`,async()=> {
        const value=await run('calls:=0; c := {& :::x & calls+=1; {& :::y & :::x+:::y } }; d := c.Instantiate([(c[:binders][1],3)]); inner := d[:result]; e := inner.Instantiate([(inner[:binders][1],4)]); (calls,e.Eval()[:value],.SameSymbol(c[:result][:binders][1],inner[:binders][1]));');
        expect(value.values.map(String)).toEqual(['1','7','1']);
        const shadow=await run('c := {& :::x & {& :::x & :::x } }; d := c.Instantiate([(c[:binders][1],3)]); .SameSymbol(d[:result][:binders][1],d[:result][:result]);');
        expect(shadow.value).toBe(1n);
    });
    test(`${mode}: foreign, free, repeated, and capturing bindings are rejected`,async()=> {
        for (const bindings of ['[(::x,1)]','[(b[:binders][1],1)]','[(a[:binders][1],b[:binders][1])]','[(a[:binders][1],1),(a[:binders][1],2)]']) {
            await expect((async()=>run(`a := {& :::x & :::x }; b := {& :::x & :::x }; a.Instantiate(${bindings});`))()).rejects.toThrow();
        }
        await expect((async()=>run('a := {& :::x & :::x }; b := a.Instantiate([(a[:binders][1],1)]); b.Instantiate([(a[:binders][1],2)]);'))()).rejects.toThrow();
    });
    test(`${mode}: imported contexts regain trusted methods, not evidence`,async()=> {
        const ans=await run('c := .MathDecodeJSON(.MathEncodeJSON({& :::t | 0:1 & :::t+1 })); d := c.Instantiate([(c[:binders][1],1/2)]); d.Eval();');
        expect(ans.entries.get('status').value).toBe('conditional');
        expect(String(ans.entries.get('candidate'))).toBe('3/2');
    });
}
