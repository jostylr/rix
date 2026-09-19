import {test,expect} from "bun:test";
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from "../../src/index.js";
import {encodeMathematicalJSON,decodeMathematicalJSON,MATH_DOCUMENT_SCHEMA} from "../../src/runtime/math-json.js";
import {Rational} from "@ratmath/core";
import {expressionConstant,expressionOperation,expressionStructuralKey} from "../../src/runtime/math-expression.js";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: symbols, definitions, exact scalars, and imports retain their boundaries`,async()=> {
        const value=await run(`
            ::dependent = ::x-0;
            source := (::x,::dependent,::x,123456789012345678901234567890,2:1);
            saved := .MathEncodeJSON(source); a := .MathDecodeJSON(saved); b := .MathDecodeJSON(saved);
            {: .SameSymbol(a[1],a[3]),a[1]==a[2],.SameSymbol(a[1],b[1]),.SameSymbol(::x,a[1]),a[4],a[5],saved==.MathEncodeJSON(source) };
        `);
        expect(value.values.slice(0,2).map(v=>v.value)).toEqual([1n,1n]);
        expect(value.values[2]).toBeNull();expect(value.values[3]).toBeNull();
        expect(value.values[4].value).toBe(123456789012345678901234567890n);
        expect(String(value.values[5].start)).toBe("2");expect(String(value.values[5].end)).toBe("1");
        expect(value.values[6].value).toBe(1n);
    });
    test(`${mode}: contexts retain binders, free identities, domains, and unverified assumptions`,async()=> {
        const value=await run(`
            c := {& :::t | 1:0; :::t>0; ::y==::x-0 & :::t*::x };
            saved := .MathEncodeJSON((c,::x)); loaded := .MathDecodeJSON(saved); c2 := loaded[1];
            {: .SameSymbol(c2[:result].Operands()[1],c2[:binders][1]),
               .SameSymbol(c2[:result].Operands()[2],loaded[2]),c2[:consistency],c2[:validation],
               c2[:domains][1][:domain][:orientation],c2[:assumptions].Len() };
        `);
        expect(value.values.slice(0,2).map(v=>v.value)).toEqual([1n,1n]);
        expect(value.values[2].value).toBe("unresolved");expect(value.values[3].value).toBe("unverifiedImport");
        expect(value.values[4].value).toBe("desc");expect(value.values[5].value).toBe(2n);
    });
    test(`${mode}: exact generators retain shared identity without name collisions`,async()=> {
        const value=await run('p := 1~{pi}; loaded := .MathDecodeJSON(.MathEncodeJSON((p,p+1,.ExpressionConstant(p)))); {: .ExpressionConstant(loaded[1])==loaded[3],.ExpressionConstant(loaded[1]+1)==.ExpressionConstant(loaded[2]) };');
        expect(value.values.map(v=>v.value)).toEqual([1n,1n]);
    });
    test(`${mode}: reals load as frozen, unverified singleton snapshots`,async()=> {
        const context=new Context();
        const value=await evaluate(`
            .Plugin.Load("numerics"); r := .ExpressionReal(.numerics.Sqrt(2));
            saved := .MathEncodeJSON((r,r)); loaded := .MathDecodeJSON(saved); info := .ExpressionConstantInfo(loaded[1]);
            {: loaded[1]==loaded[2],info[:refinable],info[:validation],info[:enclosure],info[:savedEvidenceLevel] };
        `,{context});
        expect(value.values[0].value).toBe(1n);expect(value.values[1]).toBeNull();
        expect(value.values[2].value).toBe("unverifiedImport");expect(value.values[3].low.greaterThan(new Rational(1n))).toBe(true);
        expect(value.values[4].value).toBe("proof");
        await expect((async()=>evaluate('.ExpressionRefine(loaded[1]);',{context}))()).rejects.toThrow("frozen snapshot");
    });
    test(`${mode}: JSONL records are independent and report line errors`,async()=> {
        const value=await run('lines := .MathEncodeJSONL([::x,::x]); rows := .MathDecodeJSONL(lines); {: rows.Len(),.SameSymbol(rows[1],rows[2]) };');
        expect(value.values[0].value).toBe(2n);expect(value.values[1]).toBeNull();
        await expect((async()=>run('.MathDecodeJSONL("bad");'))()).rejects.toThrow("line 1");
        await expect((async()=>run('.MathEncodeJSON(()->1);'))()).rejects.toThrow("unsupported");
    });
}

test("malformed graphs, cycles, metadata execution, and resource abuse are rejected",()=> {
    const symbol={id:"n0",kind:"symbol",name:"x",bound:false,definition:null};
    const wrap=(nodes,root={$ref:"n0"})=>JSON.stringify({schema:MATH_DOCUMENT_SCHEMA,root,nodes});
    for (const source of [
        wrap([symbol,symbol]),wrap([symbol],{$ref:"missing"}),wrap([{...symbol,definition:{$ref:"n0"}}]),
        wrap([{...symbol,evil:"execute"}]),wrap([{id:"n0",kind:"eval",source:".Error(1)"}]),
        wrap([],{$integer:"1".repeat(1025)}),wrap([],{$rational:["2","4"]}),wrap([],{$rational:["1","0"]}),
        wrap([{id:"n0",kind:"operator",operation:"add",operands:[]}])," ".repeat(2000001),
    ]) expect(()=>decodeMathematicalJSON(source)).toThrow();
    const cyclic={type:"sequence",values:[]};cyclic.values.push(cyclic);
    expect(()=>encodeMathematicalJSON(cyclic)).toThrow("cyclic");
    const nodes=[{id:"n0",kind:"constant",value:{$integer:"1"}}];
    for (let i=1;i<30;i++) nodes.push({id:`n${i}`,kind:"operator",operation:"add",operands:[{$ref:`n${i-1}`},{$ref:`n${i-1}`}]});
    expect(()=>decodeMathematicalJSON(wrap(nodes,{$ref:"n29"}))).toThrow("expanded graph budget");
});

test("JSON map keys cannot pollute host prototypes",()=> {
    const source=JSON.stringify({schema:MATH_DOCUMENT_SCHEMA,root:{$ref:"n0"},nodes:[{id:"n0",kind:"map",entries:[["__proto__",{$string:"inert"}]]}]});
    expect(decodeMathematicalJSON(source).entries.get("__proto__").value).toBe("inert");
    expect({}.polluted).toBeUndefined();
});

test("the design document's complete graph example loads",async()=> {
    const doc=await Bun.file(new URL("../../documentation/design/mathematical-json.md",import.meta.url)).text();
    const source=doc.match(/```json\n([\s\S]*?)```/)[1];
    const value=decodeMathematicalJSON(source);
    expect(value.values[0]).toBe(value.values[2]);
});

test("real recipes remain inert and inconsistent snapshot evidence is rejected",()=> {
    const real=parseAndEvaluate('.Plugin.Load("numerics"); .ExpressionReal(.numerics.Sqrt(2));',{context:new Context()});
    const source=encodeMathematicalJSON(real);
    const withRecipe=JSON.parse(source);
    withRecipe.nodes.find(n=>n.kind === "real").envelope.recipe={kind:"builtin",provider:"numerics",algorithm:"squareRoot"};
    const frozen=decodeMathematicalJSON(JSON.stringify(withRecipe));
    expect(frozen).toBeDefined();
    expect(encodeMathematicalJSON(frozen)).toContain("squareRoot");
    const badWidth=JSON.parse(source);
    badWidth.nodes.find(n=>n.kind === "real").envelope.snapshot.achievedWidth={$integer:"0"};
    expect(()=>decodeMathematicalJSON(JSON.stringify(badWidth))).toThrow("width");
});

test("nested structural keys do not grow by recursively escaping JSON strings",()=> {
    let expression=expressionConstant(new Rational(1n));
    for (let i=0;i<25;i++) expression=expressionOperation("negate",[expression]);
    const imported=decodeMathematicalJSON(encodeMathematicalJSON(expression));
    expect(expressionStructuralKey(imported).length).toBeLessThan(2000);
});
