import {test,expect} from "bun:test";
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from "../../src/index.js";
import {expressionField as field} from "../../src/runtime/math-expression.js";
import {UNDECIDED} from "../../src/runtime/decision.js";
import {lintRix} from "../../src/eval/lint.js";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: context shares programming scope and evaluates its body once`,async()=> {
        const result=await run("count := 0; c := {& :::x | 0:1 & count ~= count+1; saved := ::y; :::x+saved; }; {: count,.SameSymbol(saved,::y),c };");
        expect(result.values[0].value).toBe(1n);
        expect(result.values[1].value).toBe(1n);
        expect(field(result.values[2],"schema").value).toBe("rix.math.context@1");
        expect(field(result.values[2],"binders").values).toHaveLength(1);
    });
    test(`${mode}: fresh binders shadow nested names and survive closure escape`,async()=> {
        const value=await run("c := {& :::x & outer := :::x; F := ()->:::x; inner := {& :::x & :::x }; {: .SameSymbol(outer,F()),.SameSymbol(outer,inner[:result]) }; }; c[:result];");
        expect(value.values[0].value).toBe(1n);
        expect(value.values[1]).toBeNull();
        const inherited=await run("{& :::x & {& & :::x } };");
        expect(field(field(inherited,"result"),"result")).toBe(field(inherited,"binders").values[0]);
        const escaped=await run("c := {& :::x & ()->:::x }; F := c[:result]; .SameSymbol(F(),c[:binders][1]);");
        expect(escaped.value).toBe(1n);
    });
    test(`${mode}: compatible headers intersect open bounds and preserve traversal`,async()=> {
        const value=await run("{& :::x | 2:0; :::x > 0; :::x <= 1; :::x | 3:0 & :::x };");
        const domain=field(field(value,"domains").values[0],"domain");
        expect(String(field(domain,"lower"))).toBe("0");
        expect(String(field(domain,"upper"))).toBe("1");
        expect(field(domain,"lowerclosed")).toBeNull();
        expect(String(field(domain,"start"))).toBe("2");
        expect(field(domain,"orientation").value).toBe("desc");
        expect(field(value,"binders").values).toHaveLength(1);
    });
    test(`${mode}: domain objects and explicit direction tuples normalize`,async()=> {
        for (const source of ["{= start=2,end=0,lowerclosed=_ }","(0:2,:desc)"]) {
            const value=await run(`{& :::x | ${source} & :::x };`);
            expect(field(field(field(value,"domains").values[0],"domain"),"orientation").value).toBe("desc");
        }
    });
    test(`${mode}: tuple binders evaluate their product-domain source once`,async()=> {
        const result=await run("count := 0; Domains()->{; @count ~= @count+1; (0:1,2:3); }; c := {& (:::x,:::y) | Domains() & :::x+:::y }; {: count,c };");
        expect(result.values[0].value).toBe(1n);
        expect(field(result.values[1],"binders").values).toHaveLength(2);
        expect(field(result.values[1],"domains").values).toHaveLength(2);
    });
    test(`${mode}: contradictions fail before running the body`,async()=> {
        for (const header of [":::x > 0; :::x < 0",":::x >= 1; :::x <= 1; :::x != 1","2 < 1",":::x | 0:1; :::x | 2:3",":::x | 0:1; :::x | 1:0"]) {
            const context=new Context();
            await evaluate("count := 0;",{context});
            await expect((async()=>evaluate(`{& ${header} & count ~= 1 };`,{context}))()).rejects.toThrow("Conflicting");
            expect((await evaluate("count;",{context})).value).toBe(0n);
        }
    });
    test(`${mode}: equality assumptions stay local data, not global definitions`,async()=> {
        const value=await run("c := {& ::y == ::x-0 & ::y==::x }; {: c,.ExpressionDefinition(::y),::y==::x };");
        expect(field(value.values[0],"result")).toBe(UNDECIDED);
        expect(field(value.values[0],"assumptions").values).toHaveLength(1);
        expect(field(value.values[0],"consistency").value).toBe("unresolved");
        expect(value.values[1]).toBeNull();
        expect(value.values[2]).toBe(UNDECIDED);
    });
    test(`${mode}: invalid declarations and escaped binder names error`,async()=> {
        for (const source of [":::x;","{& & :::x };","{& :::y == :::x; :::x & 1 };","{& ::x = 1 & 1 };","{& :::x | [1,2] & 1 };","{& :::x & :::x = 1 };","{& :::x };"]) {
            await expect((async()=>run(source))()).rejects.toThrow();
        }
        expect(field(await run("{& & };"),"result")).toBeNull();
    });
}

test("lint retains assignments from the shared mathematical body",()=> {
    expect(lintRix("{& :::x & x := ::x; }; x;").filter(d=>d.code.startsWith("RX100"))).toEqual([]);
});
