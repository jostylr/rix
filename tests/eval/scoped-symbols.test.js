import { test, expect } from "bun:test";
import { Context, parse, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { UNDECIDED } from "../../src/runtime/decision.js";
import { lintRix } from "../../src/eval/lint.js";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    test(`${mode}: symbols have separate names and survive copies`, async () => {
        const result=await evaluate(`
            x := 7; y := ::x; copy ::= y;
            {: x,.SameSymbol(y,::x),.SameSymbol(copy,y),::x==::x,::x==::y,::x!=::y };
        `,{context:new Context()});
        expect(result.values.slice(0,4).map(v=>v.value)).toEqual([7n,1n,1n,1n]);
        expect(result.values[4]).toBe(UNDECIDED);
        expect(result.values[5]).toBe(UNDECIDED);
    });
    test(`${mode}: block capture distinguishes same-named symbols`, async () => {
        const result=await evaluate(`
            outer := ::x;
            {; local := ::x; captured := @::x;
               {: .SameSymbol(local,captured),.SameSymbol(captured,@outer),local==captured };
            };
        `,{context:new Context()});
        expect(result.values[0]).toBeNull();
        expect(result.values[1].value).toBe(1n);
        expect(result.values[2]).toBe(UNDECIDED);
    });
    test(`${mode}: function invocations are fresh and escaped closures retain symbols`, async () => {
        const result=await evaluate(`
            Fresh()->::x;
            Make()->{; own := ::x; ()->@::x; };
            F := Make(); first := F(); second := F();
            {: .SameSymbol(Fresh(),Fresh()),.SameSymbol(first,second) };
        `,{context:new Context()});
        expect(result.values[0]).toBeNull();
        expect(result.values[1].value).toBe(1n);
    });
    test(`${mode}: persistent top-level context reuses its symbol namespace`, async () => {
        const context=new Context();
        await evaluate("saved := ::x;",{context});
        expect((await evaluate(".SameSymbol(saved,::x);",{context})).value).toBe(1n);
        await expect((async()=>evaluate("@::missing;",{context}))()).rejects.toThrow("No enclosing symbolic");
    });
}

test("syntax retains interval subdivision and reserves full-slice position", () => {
    expect(parse("::x;")[0].expression.type).toBe("SymbolicVariable");
    expect(parse("0:1 :: 3;")[0].expression.type).toBe("IntervalDivision");
    expect(()=>parse("a[::x];")).toThrow();
    expect(JSON.stringify(parse("a[(::x)];"))).toContain('"type":"SymbolicVariable"');
    for (const source of [":: x;",":::x;","::x = 1;"]) expect(()=>parseAndEvaluate(source)).toThrow();
});

test("lint keeps ordinary and symbolic namespaces separate", () => {
    expect(lintRix("x := ::x; {; .SameSymbol(::x,@::x); }; ").filter(d=>d.code.startsWith("RX100"))).toEqual([]);
    expect(lintRix("x := 1; {; @::x; };").some(d=>d.code === "RX1003")).toBe(true);
});

test("name-based consumers reject scoped expressions until their conversion lands", () => {
    for (const source of [
        ".SpecFromExpression(::x+1);",
        ".CalculusGraphSimplify(::x+1);",
        '.Plugin.Load("cas"); .cas.Integrate(::x^2,:x);',
    ]) expect(()=>parseAndEvaluate(source,{context:new Context()})).toThrow();
});
