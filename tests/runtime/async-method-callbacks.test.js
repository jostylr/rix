import { expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/index.js";
import { resolveMethod } from "../../src/runtime/methods.js";
import { createShaped } from "../../src/runtime/shaped.js";
import { UNDECIDED } from "../../src/runtime/decision.js";
import { structuralForm, structuralAlgebra, createStructuralAlgebraProfile } from "../../src/runtime/structural-arithmetic.js";

const integer = n => new Integer(BigInt(n));
const plain = value => value?.values ? value.values.map(plain)
    : value?.entries ? Object.fromEntries([...value.entries].map(([k,v])=>[k,plain(v)]))
    : value?.data ? value.data.map(plain)
    : value?.value ?? value;

async function run(source, name, callback, extra = []) {
    const target = parseAndEvaluate(source);
    const calls = [];
    const invoke = async (_fn,args) => {
        calls.push(args);
        await Promise.resolve();
        return callback(...args);
    };
    const method = resolveMethod(target,name);
    const value = await method.impl([target,{},...extra],null,null,invoke,{promiseAware:true});
    return {value,calls};
}

for (const source of ["[1,2,3]", "{= a=1,b=2,c=3 }", "{| 1,2,3 }"]) {
    test(`async predicates await false answers: ${source}`, async () => {
        expect(plain((await run(source,"COUNT",()=>null)).value)).toBe(0n);
        expect((await run(source,"ANY",()=>null)).value).toBeNull();
        const all = await run(source,"ALL",()=>null);
        expect(all.value).toBeNull();
        expect(all.calls).toHaveLength(1);
        const filtered = plain((await run(source,"FILTER",()=>null)).value);
        expect(filtered).toEqual(source.startsWith("{=") ? {} : []);
    });
    test(`async reductions receive resolved accumulators: ${source}`, async () => {
        const result = await run(source,"REDUCE",(acc,value)=>acc.add(value),[integer(0)]);
        expect(plain(result.value)).toBe(6n);
    });
}

test("async searches preserve short circuit and one-based locations", async () => {
    for (const [method,expected] of [["FIND",2n],["FINDINDEX",2n],["ANY",1n]]) {
        const result = await run("[1,2,3]",method,value=>value.value===2n ? integer(1) : null);
        expect(plain(result.value)).toBe(expected);
        expect(result.calls).toHaveLength(2);
    }
});

test("async map values contain results, not promises", async () => {
    const result = await run("{= a=1,b=2 }","MAPVALUES",value=>value.add(integer(10)));
    expect(plain(result.value)).toEqual({a:11n,b:12n});
});

test("async callback rejection stops iteration and propagates", async () => {
    const calls=[];
    const target=parseAndEvaluate("[1,2,3]");
    await expect(resolveMethod(target,"FILTER").impl([target,{}],null,null,async (_fn,[value])=>{
        calls.push(value.value);
        throw new Error("callback failed");
    },{promiseAware:true})).rejects.toThrow("callback failed");
    expect(calls).toEqual([1n]);
});

test("async updates await the replacement and do not mutate on rejection", async () => {
    for (const name of ["UPDATE","UPDATE!"]) {
        const target=parseAndEvaluate("{= a=1 }");
        const args=[target,{type:"string",value:"a"},{}];
        const method=resolveMethod(target,name);
        const result=await method.impl(args,null,null,async (_fn,[value,key,source])=>{
            expect(key.value).toBe("a");
            expect(source).toBe(target);
            await Promise.resolve();
            return value.add(integer(1));
        },{promiseAware:true});
        expect(plain(result)).toEqual({a:2n});
        expect(plain(target)).toEqual({a:name==="UPDATE!" ? 2n : 1n});
        await expect(method.impl(args,null,null,async ()=>{throw new Error("update failed");},
            {promiseAware:true})).rejects.toThrow("update failed");
        expect(plain(target)).toEqual({a:name==="UPDATE!" ? 2n : 1n});
    }
});

test("async key reductions retain key/value/source callback positions", async () => {
    const result=await run('{= a=1,b=2 }',"REDUCEKEYS",(acc,key,value,source)=>{
        expect(source.entries.get(key.value)).toBe(value);
        return acc.add(value);
    },[integer(0)]);
    expect(plain(result.value)).toBe(3n);
});

test("async shaped and structural maps store resolved values in order", async () => {
    const shaped=createShaped([2],[integer(1),integer(2)]);
    const form=structuralForm("add",[integer(1),integer(2)]);
    const algebra=structuralAlgebra(createStructuralAlgebraProfile("Complex",["i"],{cayleyDickson:true}),[integer(1),integer(2)]);
    for (const [target,name] of [[shaped,"MAP"],[form,"MAPARGUMENTS"],[algebra,"MAPARGUMENTS"]]) {
        let active=0;
        const result=await resolveMethod(target,name).impl([target,{}],null,null,async (_fn,[value])=>{
            expect(++active).toBe(1);
            await Promise.resolve();
            active--;
            return value.add(integer(10));
        },{promiseAware:true});
        expect((result.data??result.args??result.components).map(plain)).toEqual([11n,12n]);
    }
});

test("async predicates preserve zero truth and undecided policy; empty inputs do not call back", async () => {
    expect(plain((await run("[1]","FILTER",()=>integer(0))).value)).toEqual([1n]);
    // Preserve the existing receiver-method predicate convention, including
    // its treatment of undecided values; this fix changes awaiting, not truth.
    expect(plain((await run("[1]","FILTER",()=>UNDECIDED)).value)).toEqual([1n]);
    for (const name of ["FILTER","MAP","ANY","ALL","COUNT","FIND","FINDINDEX","REDUCE"]) {
        const result=await run("[]",name,()=>{throw new Error("must not run");});
        expect(result.calls).toHaveLength(0);
    }
});
