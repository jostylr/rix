import { Context } from '../runtime/context.js';
import { createDefaultRegistry, createDefaultSystemContext, evaluate } from './evaluator.js';
import { createRixCelWorkbook } from '../runtime/rixcel-workbook.js';
import { createFormulaSheetRuntimeOptions } from './functions/formula-sheet.js';
import { enterEvaluationBudget } from '../runtime/evaluation-budget.js';

const withheldNames = ['ImportJS','JSCall','CapabilityRegister','TypeRegister','TraitRegister','TypeInstall','TypeImport','TypeExport','Plugin','Host','Core','Stream','Retry','Config','RangePolicy','RegisterMethod','Eval','Print','Debug','Dump'];
const withheldGroups = new Set(['Async','Files','Net','Random']);

// Each candidate has a fresh private evaluation context. Core definitions are reused;
// executable host providers never enter the formula namespace or the saved record.
export function createRixCelWorkbookHost(document,{withheld=[],...options}={}) {
    const registry=createDefaultRegistry(),core=createDefaultSystemContext();
    const excluded=core.getAllNames().filter(name=>(core.get(name).groups??[]).some(group=>withheldGroups.has(group)));
    const systemContext=core.withhold(...withheldNames,...excluded,...withheld);
    let runtime=null;
    return createRixCelWorkbook(document,{
        ...options,
        compileFormula(source){return runtime.compileFormula(source);},
        runFormula(...args){return runtime.runFormula(...args);},
        withEpoch(run,limits){
            const context=new Context();
            runtime=createFormulaSheetRuntimeOptions(context,node=>evaluate(node,context,registry,systemContext),systemContext);
            const scope=enterEvaluationBudget(context,{maxSteps:limits.maxSteps,maxTimeMs:limits.maxTimeMs});
            try{return run();}finally{scope.leave();runtime=null;}
        },
    });
}
