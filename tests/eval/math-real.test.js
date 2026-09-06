import {test,expect} from "bun:test";
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from "../../src/index.js";
import {UNDECIDED} from "../../src/runtime/decision.js";
import {adaptRealConstant,refineRealConstant,realConstantState} from "../../src/runtime/math-real.js";
import {Integer} from "@ratmath/core";

for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    const run=source=>evaluate(source,{context:new Context()});
    test(`${mode}: real constants retain identity, copies, and explicit refinement`,async()=> {
        const value=await run(`
            .Plugin.Load("numerics");
            r := .ExpressionReal(.numerics.Sqrt(2),{= absoluteWidth=1/10,maxWork=30 });
            copy ::= r; key := .ExpressionKey(r);
            before := .ExpressionConstantInfo(r)[:enclosure];
            refined := .ExpressionRefine(copy,{= absoluteWidth=1/10000,maxWork=100 });
            after := .ExpressionConstantInfo(r)[:enclosure];
            {: r==copy,key==.ExpressionKey(r),before,after,refined[:goalMet],(::x+r).Kind(),
               .ExpressionConstantInfo(r)[:provider],r==.ExpressionReal(.numerics.Sqrt(2)) };
        `);
        expect(value.values[0].value).toBe(1n);
        expect(value.values[1].value).toBe(1n);
        expect(value.values[3].high.subtract(value.values[3].low).lessThan(value.values[2].high.subtract(value.values[2].low))).toBe(true);
        expect(value.values[4].value).toBe(1n);
        expect(value.values[5].value).toBe("operator");
        expect(value.values[6].value).toBe("refinableReal");
        expect(value.values[7]).toBe(UNDECIDED);
    });
    test(`${mode}: adapter accepts certified singleton Oracle providers`,async()=> {
        const value=await run('.Plugin.Load("oracle"); r := .ExpressionReal(.oracle.Rational(3/2)); .ExpressionConstantInfo(r)[:refinable];');
        expect(value.value).toBe(1n);
    });
    test(`${mode}: certified budget exhaustion retains usable coarse evidence`,async()=> {
        const value=await run('.Plugin.Load("numerics"); r := .ExpressionReal(.numerics.Sqrt(2),{= absoluteWidth=1/100000,maxWork=1 }); initial := .ExpressionConstantInfo(r); result := .ExpressionRefine(r,{= absoluteWidth=1/100000,maxWork=1 }); {: result[:status],result[:certified],result[:goalMet],initial[:lastStatus],initial[:lastGoalMet] };');
        expect(value.values[0].value).toBe("budgetExhausted");
        expect(value.values[1].value).toBe(1n);
        expect(value.values[2]).toBeNull();
        expect(value.values[3].value).toBe("budgetExhausted");
        expect(value.values[4]).toBeNull();
    });
    test(`${mode}: raw intervals and unadapted real-looking maps are rejected`,async()=> {
        for (const source of ['.ExpressionReal(0:1);','.ExpressionConstant({= schema="rix.cauchy.real@1" });','.ExpressionRefine(.ExpressionConstant(1));']) {
            await expect((async()=>run(source))()).rejects.toThrow();
        }
    });
}

test("adapter validates claims and refinement contracts before keeping state",()=> {
    const data=parseAndEvaluate('.Plugin.Load("numerics"); r := .numerics.Sqrt(2); {: r.NumericsCapabilities(),r.Refine(.RefinementRequest({= absoluteWidth=1/1000 },:refine,r.NumericsCapabilities())) };',{context:new Context()});
    const capabilities=data.values[0], result=data.values[1];
    const source={type:"map",entries:new Map()};
    const call=(caps,res)=>(node)=>node.args[1] === "NUMERICSCAPABILITIES" ? caps : res;
    for (const [key,value] of [["certified",null],["arbitraryrefinement",null],["denotation",{type:"string",value:"setEnclosure"}]]) {
        const altered={...capabilities,entries:new Map(capabilities.entries)};
        altered.entries.set(key,value);
        expect(()=>adaptRealConstant(source,null,new Context(),call(altered,result))).toThrow("singleton provider");
    }
    const invalid={...result,entries:new Map(result.entries)};
    invalid.entries.set("achievedwidth",new Integer(100n));
    expect(()=>adaptRealConstant(source,null,new Context(),call(capabilities,invalid))).toThrow("valid certified");
    const real=adaptRealConstant(source,null,new Context(),call(capabilities,result));
    const before=realConstantState(real).interval;
    expect(()=>refineRealConstant(real,null,new Context(),call(capabilities,invalid))).toThrow("valid certified");
    expect(realConstantState(real).interval).toBe(before);
    const contradictory=parseAndEvaluate('.Plugin.Load("numerics"); r := .numerics.Sqrt(3); r.Refine(.RefinementRequest({= absoluteWidth=1/1000 },:refine,r.NumericsCapabilities()));',{context:new Context()});
    expect(()=>refineRealConstant(real,null,new Context(),call(capabilities,contradictory))).toThrow("contradicts");
    expect(realConstantState(real).interval).toBe(before);
    expect(()=>realConstantState({type:"math_real"})).toThrow("Invalid mathematical real identity");
});
