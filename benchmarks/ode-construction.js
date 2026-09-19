/** Informational wall time plus deterministic evaluator/derivative work. */
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../src/index.js";
import { createEvaluationBudget, EVALUATION_BUDGET_ENV } from "../src/runtime/evaluation-budget.js";
import { validatedClaimKey } from "../src/runtime/validated-boxes.js";
const rows=[];let expected;
for(const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
    for(const cache of [false,true]) {
        const options={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
        await evaluate('.Plugin.Load("ode");x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);p:=.ode.IVP([y,-x],0,[1,0],0:1/4,{= stateNames=[:x,:y] });',options);
        const budget=createEvaluationBudget({maxSteps:2000000});options.context.setEnv(EVALUATION_BUDGET_ENV,budget);
        const started=performance.now();
        const result=await evaluate(`p.PrepareTaylor({= order=4,cacheDerivatives=${cache?"1":"_"} });`,options);
        const milliseconds=performance.now()-started;
        const claim=validatedClaimKey(result.entries.get("derivativerows"));
        if(expected!==undefined&&claim!==expected)throw new Error("derivative parity failed");expected=claim;
        const work=result.entries.get("work").entries;
        rows.push({mode,cache,milliseconds,evaluatorSteps:budget.steps,
            partialComputed:Number(work.get("partialcomputed").value),partialCacheHits:Number(work.get("partialcachehits").value),
            totalComputed:Number(work.get("totalcomputed").value),derivativeParity:true});
    }
}
console.log(JSON.stringify({schema:"rix.benchmark.ode-construction@1",fixture:"[y,-x], order 4",rows},null,2));
