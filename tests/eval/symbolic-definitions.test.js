import { test, expect } from "bun:test";
import { Context, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { expressionField, expressionStructuralKey } from "../../src/runtime/math-expression.js";
import { UNDECIDED } from "../../src/runtime/decision.js";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: definitions preserve identity and support mathematical equality`, async()=> {
        const result=await run(`
            ::y = ::x - 0;
            {: ::x==::y,.SameSymbol(::x,::y),.ExpressionDefinition(::y).Kind(),
               .ExpressionKey(::x)==.ExpressionKey(::y) };
        `);
        expect(result.values[0].value).toBe(1n);
        expect(result.values[1]).toBeNull();
        expect(result.values[2].value).toBe("operator");
        expect(result.values[3]).toBeNull();
    });
    test(`${mode}: earlier expressions and copies observe the once-only definition`, async()=> {
        const result=await run(`
            earlier := ::x+1; copy ::= ::x;
            ::x = 2;
            {: copy==2,.ExpressionExpand(earlier),.ExpressionDefinition(copy) };
        `);
        expect(result.values[0].value).toBe(1n);
        expect(expressionField(expressionField(result.values[1],"operands").values[0],"value").value).toBe(2n);
        expect(expressionField(result.values[2],"value").value).toBe(2n);
    });
    test(`${mode}: redefinition is rejected before evaluating its payload`, async()=> {
        const context=new Context();
        await evaluate("count := 0; ::x = 1;",{context});
        await expect((async()=>evaluate("::x = (count ~= count+1);",{context}))()).rejects.toThrow("immutable");
        expect((await evaluate("count;",{context})).value).toBe(0n);
    });
    test(`${mode}: direct and indirect cycles fail without installing a definition`, async()=> {
        for (const setup of ["", "::y = ::x;"]) {
            const context=new Context();
            if (setup) await evaluate(setup,{context});
            await expect((async()=>evaluate(setup ? "::x = ::y;" : "::x = ::x+1;",{context}))()).rejects.toThrow("Cyclic");
            await evaluate("::x = 3;",{context});
            expect((await evaluate("::x==3;",{context})).value).toBe(1n);
        }
    });
    test(`${mode}: local definitions do not redefine enclosing symbols`, async()=> {
        const result=await run(`
            ::x = 1;
            {; ::x = 2; {: ::x==2,@::x==1 }; };
        `);
        expect(result.values.map(value=>value.value)).toEqual([1n,1n]);
        await expect((async()=>run("::x = 1; {; @::x = 2; };"))()).rejects.toThrow("local symbolic");
    });
    test(`${mode}: failed payloads and read-only snapshots cannot install definitions`, async()=> {
        const context=new Context();
        await expect((async()=>evaluate('::x = .Error("failed payload");',{context}))()).rejects.toThrow("failed payload");
        expect(await evaluate(".ExpressionDefinition(::x);",{context})).toBeNull();
        const snapshot=context.concurrentChild();
        await expect((async()=>evaluate("::x = 2;",{context:snapshot}))()).rejects.toThrow("read-only");
        await expect((async()=>evaluate("::new;",{context:snapshot}))()).rejects.toThrow("read-only");
        expect(await evaluate(".ExpressionDefinition(::x);",{context})).toBeNull();
    });
    test(`${mode}: bounded equality does not erase partial-expression domains`, async()=> {
        const result=await run("{: ::x/::x==1, 0*(1/::x)==0, ::x^0==1 };");
        expect(result.values).toEqual([UNDECIDED,UNDECIDED,UNDECIDED]);
    });
    test(`${mode}: editing record labels or IDs cannot forge a scoped identity`, async()=> {
        const symbol=await run("::x;");
        for (const [field,value] of [["name","y"],["symbolid","forged"]]) {
            const altered={...symbol,entries:new Map(symbol.entries)};
            altered.entries.set(field,{type:"string",value});
            expect(()=>expressionStructuralKey(altered)).toThrow("Invalid scoped symbol identity");
        }
    });
}
