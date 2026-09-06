import {test,expect} from "bun:test";
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from "../../src/index.js";
import {Integer,Rational} from "@ratmath/core";
import {expressionConstant,expressionStructuralKey} from "../../src/runtime/math-expression.js";
import {createExactGenerator} from "../../src/runtime/exact-values.js";
import {UNDECIDED} from "../../src/runtime/decision.js";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: intervals promote without claiming singleton semantics`,async()=> {
        const value=await run("e := ::x + (0:1); {: e.Kind(),.ExpressionConstantInfo(e.Operands()[2])[:denotation],.ExpressionHasExtendedConstants(e) };");
        expect(value.values[0].value).toBe("operator");
        expect(value.values[1].value).toBe("setEnclosure");
        expect(value.values[2].value).toBe(1n);
    });
    test(`${mode}: interval equality uses separation and singleton evidence`,async()=> {
        const value=await run("{: .ExpressionConstant(0:1)==(0:1),.ExpressionConstant(0:1)==(2:3),.ExpressionConstant(1:1)==1,.ExpressionConstant(0:1)!=1, (::x+(0:1))==(::x+(0:1)) };");
        expect(value.values).toEqual([UNDECIDED,null,new Integer(1n),UNDECIDED,UNDECIDED]);
    });
    test(`${mode}: exact scalar generators promote and retain algebraic laws`,async()=> {
        const value=await run("p := 1~{pi}; e := ::x+p; info := .ExpressionConstantInfo(p); {: e.Kind(),info[:provider],info[:commutative],info[:cancellation],.ExpressionConstant(p)==p };");
        expect(value.values[0].value).toBe("operator");
        expect(value.values[1].value).toBe("exactScalar");
        expect(value.values[2].value).toBe(1n);
        expect(value.values[3]).toBe(UNDECIDED);
        expect(value.values[4].value).toBe(1n);
    });
    test(`${mode}: interval definitions expand and preserve conservative equality`,async()=> {
        const value=await run("::a = 0:1; {: ::a==0,.ExpressionConstantInfo(.ExpressionExpand(::a))[:refinable],.ExpressionKey(::a) };");
        expect(value.values[0]).toBe(UNDECIDED);
        expect(value.values[1]).toBeNull();
    });
    test(`${mode}: null remains a decided absence sentinel`,async()=> {
        const value=await run("{: ::x==_,_!=::x,.ExpressionConstant(0:1)==_,.ExpressionConstant(1)!=_ };");
        expect(value.values).toEqual([null,new Integer(1n),null,new Integer(1n)]);
    });
    test(`${mode}: unsupported scalar families and consumers fail explicitly`,async()=> {
        for (const source of ['::x + 2~[m];','.ExpressionConstant(1/0);','.ExpressionConstant({= schema="rix.cauchy.real@1" });','.SpecFromExpression(.ExpressionConstant(0:1));']) {
            await expect((async()=>run(source))()).rejects.toThrow();
        }
    });
}

test("constant keys use generator identity, not display names",()=> {
    const a=createExactGenerator("same"), b=createExactGenerator("same");
    expect(expressionStructuralKey(expressionConstant(a))).not.toBe(expressionStructuralKey(expressionConstant(b)));
    expect(expressionStructuralKey(expressionConstant(new Integer(1n)))).toBe(expressionStructuralKey(expressionConstant(new Rational(1n,1n))));
});
