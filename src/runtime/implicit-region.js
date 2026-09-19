/** Bounded scalar implicit sets. Leaves cover the original domain; no mesh topology is inferred. */
import { Integer,Rational,RationalInterval } from '@ratmath/core';
import { createRationalBox } from './multivariate-range.js';
import { evaluateCalculusGraphRange,checkCalculusGraphRangeResult } from './calculus-range.js';
import { expressionConstant,expressionVariable,expressionOperation,expressionApplication } from './math-expression.js';
import { validatedClaimKey,validatedClaimCost,validatedPortable } from './validated-boxes.js';
import { rangeMathPolicy } from './range-policy.js';
export const IMPLICIT_REGION_SCHEMA='rix.geometry.implicit-region@1';
export const IMPLICIT_REGION_CHECKER='rix.runtime.implicit-region-checker@1';
const zero=Rational.zero;
const text=v=>typeof v==='string'?v:v?.value;
const seq=v=>Array.isArray(v)?v:v?.values;
function field(value,key,fallback=null){const entries=value instanceof Map?value:value?.entries instanceof Map?value.entries:new Map(Object.entries(value||{}));for(const [name,v]of entries)if(String(name).toLowerCase()===key.toLowerCase())return v;return fallback;}
function optionsObject(v){return Object.fromEntries([...(v instanceof Map?v:v?.entries instanceof Map?v.entries:new Map(Object.entries(v||{})))].map(([k,v])=>[k.toLowerCase(),v]));}
function exact(v,label){const n=v instanceof Rational?v:v instanceof Integer?new Rational(v.value):typeof v==='number'&&Number.isSafeInteger(v)?new Rational(v):null;if(!n||n.denominator===0n)throw new Error(`${label}RequiresExactRational`);validatedClaimKey(n);return n;}
function count(v,fallback,maximum,label){const n=v===null?new Rational(fallback):exact(v,label);if(n.denominator!==1n||n.numerator<0n||n.numerator>BigInt(maximum))throw new Error(`${label}OutOfRange`);return Number(n.numerator);}
const ranges=box=>box.variables.map(name=>box.axes.get(name).toRationalInterval());
const boxOf=(names,intervals)=>createRationalBox(new Map(names.map((name,i)=>[name,intervals[i]])));
const width=v=>v.high.subtract(v.low);
function affineExpression(expression,box,affine){
    if(affine===null)return expression;
    const names=seq(field(affine,'variables'))?.map(text),matrix=seq(field(affine,'matrix'))?.map(seq),offset=seq(field(affine,'offset'));
    if(!names||names.length<1||names.length>8||names.some(n=>typeof n!=='string'||!n)||new Set(names.map(n=>n.toLowerCase())).size!==names.length||!matrix||!offset||matrix.length!==names.length||offset.length!==names.length||matrix.some(r=>!r||r.length!==box.dimension))throw new Error('implicitAffineDimensionMismatch');
    const replacements=new Map(names.map((name,i)=>[name.toLowerCase(),matrix[i].reduce((sum,c,j)=>expressionOperation('add',[sum,expressionOperation('multiply',[expressionConstant(exact(c,'affineCoefficient')),expressionVariable(box.variables[j])])]),expressionConstant(exact(offset[i],'affineOffset')))]));
    let visits=0;
    function walk(node,depth=0){
        if(++visits>4096||depth>32)throw new Error('implicitAffineTraversalBudgetExceeded');
        const kind=text(field(node,'kind'));
        if(kind==='constant')return node;
        if(kind==='variable'){if(field(node,'symbolid'))throw new Error('implicitAffineRequiresNameBasedVariables');return replacements.get(text(field(node,'name'))?.toLowerCase())||node;}
        if(kind==='operator')return expressionOperation(text(field(node,'operation')),seq(field(node,'operands')).map(v=>walk(v,depth+1)));
        if(kind==='apply')return expressionApplication(text(field(node,'semanticid')),text(field(node,'name')),seq(field(node,'arguments')).map(v=>walk(v,depth+1)));
        throw new Error('unsupportedImplicitAffineGraph');
    }
    return walk(expression);
}
function classify(expression,box,relation,level,graphOptions,conventions){
    let graphEvaluations=0;
    try{
        graphEvaluations++;
        const result=evaluateCalculusGraphRange(expression,validatedPortable(box.axes),validatedPortable(graphOptions),conventions);
        graphEvaluations++;
        const checked=checkCalculusGraphRangeResult(result);
        if(!checked.accepted||!checked.certified||result.domainStatus!=='allDefined'||!result.range.isBounded||result.range.isEmpty)throw new Error('implicitRangeNotDefinedAndBounded');
        // A hull may widen a disconnected range, and therefore cannot create a false exclusion.
        const range=result.range.hull().toRationalInterval();validatedClaimKey(range);
        const lower=range.low.compareTo(level),upper=range.high.compareTo(level);
        const outside=relation==='eq'?(lower>0||upper<0):relation==='le'?lower>0:upper<0;
        const inside=relation==='eq'?(lower===0&&upper===0):relation==='le'?upper<=0:lower>=0;
        return {classification:outside?'excluded':inside?'inside':'boundaryUnknown',certified:true,range,domainStatus:'allDefined',graphEvaluations};
    }catch(error){return {classification:'domainOrRangeUnknown',certified:false,range:null,reason:error.message,graphEvaluations};}
}
export function evaluateImplicitRegion(expression,source,options={},conventions={zeroPowerZero:'undefined'}){
    validatedClaimKey({expression,source,options,conventions});
    const inputBox=createRationalBox(source);if(inputBox.dimension>8)throw new Error('implicitRegionDimensionExceedsEight');
    const transformed=affineExpression(expression,inputBox,field(options,'affine'));
    validatedClaimKey(transformed);
    const relation=text(field(options,'relation','eq'));if(!['eq','le','ge'].includes(relation))throw new Error('implicitRegionRelationMustBeEqLeGe');
    const level=exact(field(options,'level',zero),'implicitLevel');
    const maxCells=count(field(options,'maxCells'),127,4096,'implicitMaxCells');
    const maxDepth=count(field(options,'maxDepth'),8,64,'implicitMaxDepth');
    const maxWidth=exact(field(options,'maxWidth',new Rational(1,16)),'implicitMaxWidth');if(maxWidth.lessThan(zero))throw new Error('implicitMaxWidthMustBeNonnegative');
    const maxEvidenceText=count(field(options,'maxEvidenceText'),16*1024*1024,16*1024*1024,'implicitMaxEvidenceText');
    const queue=[{id:'r',box:inputBox,depth:0}],inside=[],excluded=[],unresolved=[],nodes=[];
    let processed=0,attempted=0,graphEvaluations=0,outputExhausted=false;
    const evidence={kind:'implicitRegion',checker:IMPLICIT_REGION_CHECKER,expression,source:inputBox,options:optionsObject(options),conventions};
    const pendingRecord=node=>({...node,classification:'unprocessed',reason:outputExhausted?'outputEvidenceBudgetExceeded':'cellBudgetReached'});
    const output=()=>{const pending=queue.map(pendingRecord);return {schema:IMPLICIT_REGION_SCHEMA,valueKind:'implicitRegion',inputBox,variables:inputBox.variables,relation,level,transformedExpression:transformed,
        status:pending.length?'budgetExhausted':unresolved.length?'partial':'complete',certified:unresolved.every(v=>v.certified),coverage:'completeInputCover',boundaryPolicy:'closedOverlap',topology:'unproved',
        inside,excluded,unresolved:[...unresolved,...pending],pending,nodes,work:{processed,attempted,graphEvaluations,maxCells,maxDepth,maxWidth,maxEvidenceText,outputExhausted,exhausted:pending.length>0},evidence};};
    const base=validatedClaimCost({...output(),unresolved:[],pending:[]});
    let retainedText=base.text+4096,retainedNodes=base.nodes+512;
    const pendingCost=v=>validatedClaimCost({...v,classification:'unprocessed',reason:'outputEvidenceBudgetExceeded'});
    let waitingText=2*pendingCost(queue[0]).text,waitingNodes=2*pendingCost(queue[0]).nodes;
    const fits=(t,n)=>t<=maxEvidenceText&&n<=2000000;
    if(base.depth>254||!fits(retainedText+waitingText,retainedNodes+waitingNodes))throw new Error('implicitRegionInputEvidenceBudgetExceeded');
    while(queue.length&&processed<maxCells){
        const current=queue[0];attempted++;
        const result=classify(transformed,current.box,relation,level,field(options,'graphOptions',{}),conventions);graphEvaluations+=result.graphEvaluations;
        const intervals=ranges(current.box);let axis=0;for(let i=1;i<intervals.length;i++)if(width(intervals[i]).greaterThan(width(intervals[axis])))axis=i;
        let leaf=null,children=[],record;
        if(result.classification==='inside'||result.classification==='excluded'){leaf=result.classification;record={...current,...result,action:leaf};}
        else if(!result.certified||current.depth>=maxDepth||!width(intervals[axis]).greaterThan(maxWidth)){
            leaf='unresolved';record={...current,...result,action:leaf,reason:result.reason|| (current.depth>=maxDepth?'depthLimit':'widthLimit')};
        }else{
            const splitAt=intervals[axis].low.add(intervals[axis].high).divide(new Rational(2));
            children=[new RationalInterval(intervals[axis].low,splitAt),new RationalInterval(splitAt,intervals[axis].high)].map((range,i)=>{const child=intervals.slice();child[axis]=range;return {id:`${current.id}.${i}`,box:boxOf(current.box.variables,child),depth:current.depth+1};});
            record={...current,...result,action:'split',axis:current.box.variables[axis],splitAt,children:children.map(v=>v.id)};
        }
        let cost,childCosts,currentCost;try{cost=validatedClaimCost(record);childCosts=children.map(pendingCost);currentCost=pendingCost(current);}catch(error){if(!error.message.includes('BudgetExceeded'))throw error;outputExhausted=true;break;}
        const nextText=waitingText-2*currentCost.text+2*childCosts.reduce((sum,v)=>sum+v.text,0),nextNodes=waitingNodes-2*currentCost.nodes+2*childCosts.reduce((sum,v)=>sum+v.nodes,0);
        if(cost.depth>253||childCosts.some(v=>v.depth>253)||!fits(retainedText+2*cost.text+nextText,retainedNodes+2*cost.nodes+nextNodes)){outputExhausted=true;break;}
        queue.shift();queue.push(...children);processed++;waitingText=nextText;waitingNodes=nextNodes;retainedText+=2*cost.text;retainedNodes+=2*cost.nodes;nodes.push(record);
        if(leaf){const {action,...entry}=record;(leaf==='inside'?inside:leaf==='excluded'?excluded:unresolved).push(entry);}
    }
    const result=output();validatedClaimKey(result);return Object.freeze(result);
}
export function checkImplicitRegion(candidate){try{
    const claim=validatedClaimKey(candidate),evidence=field(candidate,'evidence');
    if(text(field(evidence,'kind'))!=='implicitRegion'||text(field(evidence,'checker'))!==IMPLICIT_REGION_CHECKER)throw new Error('unsupportedImplicitRegionEvidence');
    const result=evaluateImplicitRegion(field(evidence,'expression'),field(evidence,'source'),field(evidence,'options'),field(evidence,'conventions'));
    const accepted=claim===validatedClaimKey(result);return Object.freeze({accepted,certified:accepted&&result.certified,checkedBy:IMPLICIT_REGION_CHECKER,reason:accepted?null:'implicitRegionClaimMismatch'});
}catch(error){return Object.freeze({accepted:false,certified:false,reason:error.message});}}
export function refineImplicitRegion(candidate,options={}){
    if(!checkImplicitRegion(candidate).accepted)throw new Error('cannotRefineUncheckedImplicitRegion');
    const overrides=optionsObject(options);if(Object.keys(overrides).some(k=>!['maxcells','maxdepth','maxwidth','maxevidencetext'].includes(k)))throw new Error('implicitRefinementMayOnlyChangeWorkLimits');
    const evidence=field(candidate,'evidence');return evaluateImplicitRegion(field(evidence,'expression'),field(evidence,'source'),{...optionsObject(field(evidence,'options')),...overrides},field(evidence,'conventions'));
}
export function implicitRegionValue(operation,args,context){
    if(operation==='check')return validatedPortable(checkImplicitRegion(args[0]));
    const result=operation==='refine'?refineImplicitRegion(...args):evaluateImplicitRegion(args[0],args[1],args[2],{zeroPowerZero:rangeMathPolicy(context).zeroPowerZero});
    return validatedPortable({...result,checker:checkImplicitRegion(result)});
}
