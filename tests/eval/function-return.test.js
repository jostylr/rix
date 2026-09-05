import { describe, expect, test } from "bun:test";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { UNDECIDED } from "../../src/runtime/decision.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";

function plain(value) {
    if (value === UNDECIDED) return "?";
    if (value == null) return null;
    if (value.values) return value.values.map(plain);
    if (value.entries instanceof Map) return Object.fromEntries([...value.entries].map(([k,v])=>[k,plain(v)]));
    return typeof value.value === "bigint" ? Number(value.value) : value.value;
}

test("return guard tokens, binding precedence, and left-associated decision chains", () => {
    expect(tokenize("?_> ??> ?_ ?? ?- ??-").filter(t=>t.value!=null).map(t=>t.value))
        .toEqual(["?_>","??>","?_","??","?-","??-"]);
    const ast = parse(tokenize("value = a && b ?_> :no ??> :unknown;"));
    expect(ast[0].expression.type).toBe("ReturnGuard");
    expect(ast[0].expression.condition.type).toBe("ReturnGuard");
    expect(ast[0].expression.condition.condition.operator).toBe("=");
    const ir = lower(ast)[0];
    expect(ir.fn).toBe("GUARD_RETURN");
    expect(ir.args[0].decision).toBe("undecided");
    expect(ir.args[1].fn).toBe("DEFER");
});

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    describe(`${mode} function-scoped return guards`, () => {
        const run = async source => plain(await evaluate(source, { context:new Context() }));

        test("distinguishes truth, zero, null, and undecided; preserves untriggered values", async () => {
            expect(await run(`
                F(x)->{; x ?_> :negative ??> :unresolved; {: :accepted,x }; };
                G(x)->{; x ??> :unresolved ?_> :negative; x; };
                {: F(1),F(0),F(_),F(?),G(_),G(?),G(7) };
            `)).toEqual([["accepted",1],["accepted",0],"negative","unresolved","negative","unresolved",7]);
        });

        test("evaluates the left side once and only the selected payload", async () => {
            expect(await run(`
                F()->{;
                  count:=0;
                  (count ~= count+1)>0 ?_> .Error("unused") ??> .Error("unused");
                  count;
                };
                F();
            `)).toBe(1);
        });

        test("prep bindings are available in the body and in diagnostic payloads", async () => {
            expect(await run(`
                F(x) ?!- [bound=x ?_> {= reason=:missing,value=bound },bound>0 ?_> :nonpositive] -> bound+1;
                {: F(_),F(-2),F(4) };
            `)).toEqual([{reason:"missing",value:null},"nonpositive",5]);
        });

        test("compound conditions bind before a return guard", async () => {
            expect(await run(`
                F(x)->{; x ? :Integer && x>0 ?_> :bad; :good; };
                {: F(_),F(-1),F(2) };
            `)).toEqual(["bad","bad","good"]);
        });

        test("handled prep rejections stop dispatch even for null and undecided payloads", async () => {
            expect(await run(`
                F = [(x) ?- [x ?_> _ ??> ?] -> :yes,(x)->.Error("must not fall through")];
                G = [(x) ??- [x ??> :uncertain] -> :yes,(x)->:fallback];
                {: F(_),F(?),F(1),G(?) };
            `)).toEqual([null,"?","yes","uncertain"]);
        });

        test("unhandled prep decisions retain existing mode policies", async () => {
            expect(await run(`
                F=[(x) ?- [x] -> :yes,(x)->:fallback];
                G=[(x) ??- [x] -> :yes,(x)->:fallback];
                {: F(_),F(?),G(?) };
            `)).toEqual(["fallback","?","fallback"]);
            await expect(run("F(x) ?!- [x] -> 1; F(_);")).rejects.toThrow("prep failed");
            await expect(run("F(x) ??!- [x] -> 1; F(?);")).rejects.toThrow("prep remained undecided");
        });

        test("returns through nested blocks, conditionals, and loops rather than breaking them", async () => {
            expect(await run(`
                F()->{;
                  {@ i=1; i<=5; {; {; @i<3 ?_> @i; }; }; i+=1 };
                  .Error("unreachable");
                };
                G()->{; 1 ?: {; _ ?_> :returned; } ?_ _; .Error("unreachable"); };
                {: F(),G() };
            `)).toEqual([3,"returned"]);
        });

        test("nested calls, callbacks, recursion, and tail recursion keep their own return targets", async () => {
            expect(await run(`
                Inner()->{; _ ?_> 4; 100; };
                Outer()->Inner()+2;
                R(n)->{; n>0 ?_> 10; $(n-1)+1; };
                T(n) ?- [n>0 ?_> 9] -> $(n-1);
                {: Outer(),[1,_,?].Map((x)->{; x ?_> 2 ??> 3; x; }),R(3),T(20) };
            `)).toEqual([6,[1,2,3],13,9]);
        });

        test("argument expressions return from the caller, default expressions from the callee", async () => {
            expect(await run(`
                Inner(x)->100;
                Outer()->{; Inner(_ ?_> 7); 200; };
                Default(x ?= (_ ?_> 8))->100;
                {: Outer(),Default() };
            `)).toEqual([7,8]);
        });

        test("prepared trial checks do not swallow function returns", async () => {
            expect(await run(`
                F()->{; 9 ?- x: [_ ?_> 7]; 100; };
                G()->{; (_ ?_> 8) ?- x: [1]; 100; };
                {: F(),G() };
            `)).toEqual([7,8]);
        });

        test("diagnostic payload errors propagate even from soft prep", async () => {
            await expect(run('F(x) ?- [x ?_> .Error("payload failed")] -> 1; F(_);'))
                .rejects.toThrow("payload failed");
        });

        test("diagnostic test containers do not misclassify return as an error", async () => {
            expect(await run(`
                F()->{; .TestError("return",{; 1; },{; _ ?_> 7; }); 100; };
                G()->{; .Test("return",{; _ ?_> 8; },[1]); 100; };
                {: F(),G() };
            `)).toEqual([7,8]);
        });

        test("outside-call use always errors, even if its branch would not fire", async () => {
            for (const source of ["_ ?_> 1;","1 ?_> 2;","? ??> 1;","1 ??> 2;","{; _ ?_> 1; };","1 ?- x: [1 ?_> 2];"]) {
                await expect(run(source)).rejects.toThrow("require an active function call");
            }
        });

        test("return activation and scopes are removed after return or error", async () => {
            const context = new Context();
            const options = {context,registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
            const depth = context.localScopes.length;
            expect(plain(await evaluate("F()->{; _ ?_> 7; }; F();",options))).toBe(7);
            expect(context.functionReturnTargets).toHaveLength(0);
            expect(context.localScopes).toHaveLength(depth);
            await expect(Promise.resolve().then(()=>evaluate("1 ?_> 2;",options))).rejects.toThrow("active function call");
            expect(plain(await evaluate("2+3;",options))).toBe(5);
        });

        test("cleanup runs on return and cleanup errors are not lost", async () => {
            const closed = [];
            const systemContext = createDefaultSystemContext({frozen:false});
            systemContext.registerHost("close",{impl:([value])=>{ closed.push(plain(value)); return null; }});
            systemContext.registerHost("failClose",{impl:()=>{throw new Error("cleanup failed");}});
            systemContext.freeze();
            expect(plain(await evaluate("F()->{; a:=1 ##_ .close; b:=2 ##_ .close; _ ?_> 7; }; F();",{systemContext}))).toBe(7);
            expect(closed).toEqual([2,1]);
            await expect(Promise.resolve().then(()=>evaluate("F()->{; a:=1 ##_ .failClose; _ ?_> 7; }; F();",{systemContext})))
                .rejects.toThrow("cleanup failed");
        });
    });
}

test("async host decisions, payloads, and scoped concurrent callbacks are awaited", async () => {
    const systemContext = createDefaultSystemContext({frozen:false});
    systemContext.registerHost("slow",{impl:async ([value])=>{await Promise.resolve(); return value;}});
    systemContext.freeze();
    const result = await parseAndEvaluateAsync(`
        F(x) ?!- [.slow(x) ?_> .slow(:rejected) ??> .slow(:unknown)] -> .slow(:accepted);
        G()->{$:2$ _ ?_> .slow(7); .Error("unreachable"); };
        {: F(_),F(?),F(1),G(),[1,_,?].Map((x)->{; .slow(x) ?_> 2 ??> 3; x; }) };
    `,{systemContext});
    expect(plain(result)).toEqual(["rejected","unknown","accepted",7,[1,2,3]]);
});
