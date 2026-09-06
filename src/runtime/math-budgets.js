import {Integer} from '@ratmath/core';

export const DEFAULT_MATH_BUDGETS=Object.freeze({maxvisits:10000,maxdepth:128,maxdigits:10000,
    maxterms:1024,maxproductpairs:1024,maxsumterms:1024,maxgenerators:64,
    maxpolynomialcoefficients:64,maxdegree:10000,maxexponent:256,rootbits:64});

export function mathBudgets(options) {
    const result={...DEFAULT_MATH_BUDGETS};
    if (options===undefined || options===null) return result;
    if (options?.type!=='map') throw new Error('Mathematical budgets require an options map');
    for (const [key,value] of options.entries) {
        if (!Object.hasOwn(result,key)) throw new Error(`Unknown mathematical budget: ${key}`);
        if (!(value instanceof Integer) || value.value<1n || value.value>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Mathematical budget ${key} requires a positive safe integer`);
        result[key]=Number(value.value);
    }
    // Recursive host traversal needs a stack-safety ceiling, not merely a work budget.
    if (result.maxdepth>512) throw new Error('Mathematical maxDepth exceeds the host safety ceiling of 512');
    return result;
}
export const mathBudgetRecord=limits=>({type:'map',entries:new Map(Object.entries(limits).map(([key,value])=>[key,new Integer(BigInt(value))])),_ext:new Map([['immutable',new Integer(1n)]])});
