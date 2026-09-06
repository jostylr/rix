/** Browser-safe adapter into the closed derivative.graph proof rule. */
import {Integer,Rational} from '@ratmath/core';
import {checkCalculusDerivativeTransformation} from './calculus-range.js';
import {checkRangeEvidence,RANGE_EVIDENCE_SCHEMA,RANGE_CHECKER_VOCABULARY} from './range-evidence-checker.js';

function portable(value) {
    if (value == null || value === false) return null;
    if (value === true) return new Integer(1n);
    if (typeof value === 'number') return new Integer(BigInt(value));
    if (typeof value === 'string') return {type:'string',value};
    if (value?.type === 'map' || value?.type === 'sequence' || value?.type === 'string') return value;
    if (Array.isArray(value)) return {type:'sequence',values:value.map(portable)};
    if (value instanceof Integer || value instanceof Rational) return value;
    return {type:'map',entries:new Map(Object.entries(value).map(([key,item])=>[key.toLowerCase(),portable(item)]))};
}

export function calculusDerivativeProofValue(transformation, options) {
    const identity=checkCalculusDerivativeTransformation(transformation,options);
    if (!identity.accepted || identity.order !== 1) return portable({accepted:false,certified:false,
        diagnostics:[identity.reason || 'derivativeGraphRuleRequiresFirstDerivative'],evidence:null});
    const evidence={schema:RANGE_EVIDENCE_SCHEMA,vocabulary:RANGE_CHECKER_VOCABULARY,root:'derivative',nodes:[{
        id:'derivative',rule:'derivative.graph',premises:[],parameters:{transformation},
        conclusion:{type:'derivativeIdentity',functionGraph:identity.functionGraph,
            derivativeGraph:identity.derivativeGraph,variable:identity.variable,
            obligations:identity.obligationDescriptors},
    }]};
    // No resolveTrusted hook: source code cannot authorize trusted proof leaves.
    return portable({...checkRangeEvidence(evidence,{derivativeOptions:options}),evidence});
}
