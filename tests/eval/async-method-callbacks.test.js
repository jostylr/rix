// These host fixtures deliberately permit overlapping invocations; default unknown effects serialize.
import { expect, test } from "bun:test";
import { Context, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { formatValue } from "../../src/eval/format.js";

for (const source of [
    '[1,2,3].Filter((v,k,s)->v==2 && k==2 && s.Len()==3)',
    '{= a=1,b=2 }.Filter((v,k,s)->k==:b && v==s[k])',
    '{| 1,2,3 }.Filter((v,k,s)->v==k && v>1)',
    '[1,2,3].Reduce((acc,v)->acc*10+v,0)',
    '{: 1,2,3 }.Reduce((acc,v,k)->acc+v*k,0)',
    '"abc".Reduce((acc,v)->acc+v,:seed)',
    '{= a=1,b=2 }.ReduceKeys((acc,k,v)->acc.Set!(k,v))',
    '[1,2].Any((v)->{; v==1 ?_> .Error("must short circuit"); 1; })',
    '[1,2].All((v)->{; v==1 ?_> .Error("must short circuit"); _; })',
    '[1,2].Find((v)->{; v==1 ?_> .Error("must short circuit"); 1; })',
    '[1,2].Filter((v)->{; v>1 ?_> _; 1; })',
]) {
    test(`receiver callbacks have sync/async parity: ${source}`, async () => {
        expect(formatValue(await parseAndEvaluateAsync(source)))
            .toBe(formatValue(parseAndEvaluate(source)));
    });
}

test("delayed nested callbacks run in order and preserve captured scopes", async () => {
    const systemContext=createDefaultSystemContext({frozen:false});
    const visits=[];
    systemContext.registerHost("delay",{ concurrency: "safe",impl:async ([value])=>{
        visits.push(value.value);
        await new Promise(resolve=>setTimeout(resolve,1));
        return value;
    }});
    systemContext.freeze();
    const value=await parseAndEvaluateAsync(`
        F(offset)->[1,2,3].Map((v)->{;
            kept = [v].Filter((inner)->.delay(inner)>1);
            kept.Reduce((acc,item)->acc+item,@offset);
        });
        F(10);
    `,{context:new Context(),systemContext});
    expect(value.values.map(v=>v.value)).toEqual([10n,12n,13n]);
    expect(visits).toEqual([1n,2n,3n]);
});

test("callback rejection unwinds scopes before the next evaluation", async () => {
    const context=new Context();
    await expect(parseAndEvaluateAsync('[1,2].Filter((v)->.Error("predicate failed"))',{context}))
        .rejects.toThrow("predicate failed");
    expect((await parseAndEvaluateAsync('F(v)->v+1; F(4)',{context})).value).toBe(5n);
});

test("registered plugin callables use the caller's evaluator", async () => {
    const systemContext=createDefaultSystemContext({frozen:false});
    const context=new Context();
    parseAndEvaluate(`
        .Host.Register("callbackProbe",(value)->{; local=value+1; local*2; });
        .Host.RegisterCallableValue("callableProbe",(value)->{; local=value+1; local*3; });
        .Host.RegisterMethod(:Integer,"CallbackProbe",(self,value)->{; local=self+value; local*4; });
    `,{context,systemContext});
    expect((await parseAndEvaluateAsync('.callbackProbe(4)',{context,systemContext})).value).toBe(10n);
    expect((await parseAndEvaluateAsync('P := .callbackProbe(_1); P(4)',{context,systemContext})).value).toBe(10n);
    expect((await parseAndEvaluateAsync('.callableProbe(4)',{context,systemContext})).value).toBe(15n);
    expect((await parseAndEvaluateAsync('2.CallbackProbe(4)',{context,systemContext})).value).toBe(24n);
    expect(context.env.has("__embedded_caller_scopes__")).toBe(false);
    await parseAndEvaluateAsync('.Host.Register("registeredAsync",(value)->value+2)',{context,systemContext});
    expect(parseAndEvaluate('.registeredAsync(4)',{context,systemContext}).value).toBe(6n);
});
