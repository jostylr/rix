/** Checked two-dimensional implicit charts with a complete bounded box cover. */
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { createRationalBox, checkedScalarBoxData } from "./multivariate-range.js";
import { validatedClaimKey, validatedClaimCost, validatedPortable } from "./validated-boxes.js";
import { rangeMathPolicy } from "./range-policy.js";

export const IMPLICIT_TRACE_SCHEMA = "rix.geometry.implicit-trace@1";
export const IMPLICIT_TRACE_CHECKER = "rix.runtime.implicit-trace-checker@1";
const zero = Rational.zero;
const string = value => typeof value === "string" ? value : value?.value;
function field(value, key, fallback = null) {
    const entries = value instanceof Map ? value : value?.entries instanceof Map ? value.entries : new Map(Object.entries(value || {}));
    for (const [name, entry] of entries) if (String(name).toLowerCase() === key.toLowerCase()) return entry;
    return fallback;
}
function optionsMap(value) {
    const entries = value instanceof Map ? value : value?.entries instanceof Map ? value.entries : new Map(Object.entries(value || {}));
    return Object.fromEntries([...entries].map(([key,entry]) => [String(key).toLowerCase(),entry]));
}
function exact(value, label) {
    const result = value instanceof Rational ? value : value instanceof Integer ? new Rational(value.value)
        : typeof value === "number" && Number.isSafeInteger(value) ? new Rational(value) : null;
    if (!result || result.denominator === 0n) throw new Error(`${label}RequiresExactRational`);
    validatedClaimKey(result);
    return result;
}
function limit(value, fallback, max, label) {
    const number = value === null ? new Rational(fallback) : exact(value,label);
    if (number.denominator !== 1n || number.numerator < 0n || number.numerator > BigInt(max)) throw new Error(`${label}OutOfRange`);
    return Number(number.numerator);
}
const ranges = box => box.variables.map(name => box.axes.get(name).toRationalInterval());
const width = interval => interval.high.subtract(interval.low);
const mid = interval => interval.low.add(interval.high).divide(new Rational(2));
const point = value => new RationalInterval(value,value);
const hasZero = value => !value.low.greaterThan(zero) && !value.high.lessThan(zero);
const boxOf = (names, intervals) => createRationalBox(new Map(names.map((name,i) => [name,intervals[i]])));
function replaceAxis(box, axis, value) {
    const intervals = ranges(box); intervals[axis] = value; return boxOf(box.variables, intervals);
}
function intersect(first,second) {
    const low = first.low.greaterThan(second.low) ? first.low : second.low;
    const high = first.high.lessThan(second.high) ? first.high : second.high;
    return low.greaterThan(high) ? null : new RationalInterval(low,high);
}
function cellClassification(expression,gradient,box,options,conventions) {
    let calls=0;
    const evaluate = source => {
        const result=checkedScalarBoxData(expression,gradient,source,validatedPortable(field(options,"graphOptions",{})),conventions);
        calls+=result.graphEvaluations; validatedClaimKey(result); return result;
    };
    try {
        const data=evaluate(box);
        if(!hasZero(data.range)) return {classification:"excluded",certified:true,range:data.range,graphEvaluations:calls};
        const intervals=ranges(box);
        // Prefer y(x), then x(y); neither orientation assumes a global graph.
        for(const dependent of [1,0]) {
            const derivative=data.gradientRanges[dependent];
            if(hasZero(derivative)) continue;
            const independent=1-dependent;
            const lower=evaluate(replaceAxis(box,dependent,point(intervals[dependent].low)));
            const upper=evaluate(replaceAxis(box,dependent,point(intervals[dependent].high)));
            const increasing=derivative.low.greaterThan(zero);
            const bracket=increasing
                ? !lower.range.high.greaterThan(zero) && !upper.range.low.lessThan(zero)
                : !lower.range.low.lessThan(zero) && !upper.range.high.greaterThan(zero);
            if(!bracket) continue;
            const center=mid(intervals[dependent]);
            const middle=evaluate(replaceAxis(box,dependent,point(center)));
            const image=point(center).subtract(middle.range.divide(derivative));
            const contracted=intersect(intervals[dependent],image);
            if(!contracted) throw new Error("implicitChartContainmentMismatch");
            const rootBox=replaceAxis(box,dependent,contracted);
            const slope=data.gradientRanges[independent].negate().divide(derivative);
            const result={classification:"regularArc",certified:true,rootBox,
                independent:box.variables[independent],dependent:box.variables[dependent],
                range:data.range,gradientRanges:data.gradientRanges,obligationChecks:data.obligationChecks,
                lowerFace:lower.range,upperFace:upper.range,increasing,midpoint:center,middleRange:middle.range,
                operator:image,slope,existence:"oneRootPerParameter",topology:"localGraph",graphEvaluations:calls};
            validatedClaimKey(result);return result;
        }
        return {classification:data.gradientRanges.every(hasZero)?"singularOrTangentUnknown":"boundaryTopologyUnknown",
            certified:true,range:data.range,gradientRanges:data.gradientRanges,obligationChecks:data.obligationChecks,
            topology:"unknown",graphEvaluations:calls};
    } catch(error) {
        const budget=error.message.includes("BudgetExceeded");
        return {classification:budget?"arithmeticBudgetExceeded":"invalidEvidence",certified:budget,
            topology:"unknown",diagnostics:[error.message],graphEvaluations:calls};
    }
}

export function evaluateImplicitTrace(expression,gradient,source,options={},conventions={}) {
    // Bound the complete retained problem before following graph evidence.
    validatedClaimKey({expression,gradient,source,options,conventions});
    const inputBox=createRationalBox(source);
    if(inputBox.dimension!==2) throw new Error("implicitTraceRequiresTwoDimensions");
    const maxBoxes=limit(field(options,"maxBoxes",field(options,"maxWork")),128,4096,"implicitMaxBoxes");
    const maxDepth=limit(field(options,"maxDepth"),12,128,"implicitMaxDepth");
    const maxWidth=exact(field(options,"maxWidth",zero),"implicitMaxWidth");
    if(maxWidth.lessThan(zero)) throw new Error("implicitMaxWidthMustBeNonnegative");
    const maxEvidenceText=limit(field(options,"maxEvidenceText"),16*1024*1024,16*1024*1024,"implicitMaxEvidenceText");
    const queue=[{id:"r",box:inputBox,depth:0}],excluded=[],arcs=[],unresolved=[],nodes=[];
    let processed=0,attempted=0,graphEvaluations=0,outputExhausted=false;
    const evidence={kind:"implicitTrace",checker:IMPLICIT_TRACE_CHECKER,expression,gradient,source:inputBox,options:optionsMap(options),conventions};
    const pendingRecord=node=>({...node,classification:"unprocessed",topology:"unknown",
        reason:outputExhausted?"outputEvidenceBudgetExceeded":"workBudgetReached"});
    const output=()=>{
        const pending=queue.map(pendingRecord);
        return {schema:IMPLICIT_TRACE_SCHEMA,valueKind:"implicitTraceResult",inputBox,variables:inputBox.variables,
            status:pending.length?"budgetExhausted":unresolved.length?"partial":"complete",
            certified:unresolved.every(node=>node.certified),coverage:"completeInputCover",boundaryPolicy:"closedOverlap",
            topology:"localChartsOnly",excluded,arcs,unresolved:[...unresolved,...pending],pending,nodes,
            work:{processed,attempted,graphEvaluations,maxBoxes,maxEvidenceText,pending:pending.length,
                exhausted:pending.length>0,outputExhausted},evidence};
    };
    // Account for both copies of every leaf and pending record. Split nodes are
    // also charged twice, conservatively. Reserve space for counters, changing
    // labels and the outer convenience checker used by the RiX adapter.
    const base=validatedClaimCost({...output(),pending:[],unresolved:[]});
    let retainedText=base.text+4096,retainedNodes=base.nodes+512;
    const pendingCost=node=>validatedClaimCost({...node,classification:"unprocessed",topology:"unknown",reason:"outputEvidenceBudgetExceeded"});
    let waitingText=2*pendingCost(queue[0]).text,waitingNodes=2*pendingCost(queue[0]).nodes;
    const fits=(text,nodes)=>text<=maxEvidenceText && nodes<=2000000;
    if(base.depth>254 || !fits(retainedText+waitingText,retainedNodes+waitingNodes)) throw new Error("implicitInputEvidenceBudgetExceeded");
    while(queue.length && processed<maxBoxes) {
        const current=queue[0];attempted++;
        const result=cellClassification(expression,gradient,current.box,options,conventions);
        graphEvaluations+=result.graphEvaluations;
        const node={...current,...result},intervals=ranges(current.box);
        let record,leaf=null,children=[];
        const independent=result.classification==="regularArc" ? current.box.variables.indexOf(result.independent) : -1;
        const resolved=result.classification==="regularArc" && (maxWidth.equals(zero)||!width(intervals[independent]).greaterThan(maxWidth));
        const axis=independent>=0?independent:width(intervals[1]).greaterThan(width(intervals[0]))?1:0;
        if(result.classification==="excluded") {leaf="excluded";record={...node,action:leaf};}
        else if(resolved) {leaf="arc";record={...node,action:leaf};}
        else if(current.depth>=maxDepth || width(intervals[axis]).equals(zero) || !result.certified || result.classification==="arithmeticBudgetExceeded") {
            leaf="unresolved";
            record={...node,action:leaf,reason:!result.certified?"invalidEvidence":result.classification==="arithmeticBudgetExceeded"?"arithmeticBudgetExceeded":current.depth>=maxDepth?"depthLimit":"resolutionFloor"};
        } else {
            // Split the complete original cell, including all shared faces.
            const splitAt=mid(intervals[axis]);
            children=[new RationalInterval(intervals[axis].low,splitAt),new RationalInterval(splitAt,intervals[axis].high)].map((value,index)=>({
                id:`${current.id}.${index}`,box:replaceAxis(current.box,axis,value),depth:current.depth+1,
            }));
            record={...node,action:"split",axis:current.box.variables[axis],splitAt,children:children.map(child=>child.id)};
        }
        let cost,childCosts,currentCost;
        try {
            cost=validatedClaimCost(record);childCosts=children.map(pendingCost);currentCost=pendingCost(current);
        } catch(error) {
            if(!error.message.includes("BudgetExceeded")) throw error;
            outputExhausted=true;break;
        }
        const nextWaitingText=waitingText-2*currentCost.text+2*childCosts.reduce((sum,item)=>sum+item.text,0);
        const nextWaitingNodes=waitingNodes-2*currentCost.nodes+2*childCosts.reduce((sum,item)=>sum+item.nodes,0);
        if(cost.depth>253 || childCosts.some(item=>item.depth>253) || !fits(retainedText+2*cost.text+nextWaitingText,retainedNodes+2*cost.nodes+nextWaitingNodes)) {
            outputExhausted=true;break;
        }
        queue.shift();queue.push(...children);processed++;
        waitingText=nextWaitingText;waitingNodes=nextWaitingNodes;retainedText+=2*cost.text;retainedNodes+=2*cost.nodes;
        nodes.push(record);
        if(leaf) {
            const {action,...entry}=record;
            (leaf==="excluded"?excluded:leaf==="arc"?arcs:unresolved).push(entry);
        }
    }
    const result=output();
    // One final bounded traversal checks the incremental conservative account.
    validatedClaimKey(result);
    return Object.freeze(result);
}
export function checkImplicitTrace(candidate) {
    try {
        const claim=validatedClaimKey(candidate),evidence=field(candidate,"evidence");
        if(string(field(evidence,"checker"))!==IMPLICIT_TRACE_CHECKER||string(field(evidence,"kind"))!=="implicitTrace") throw new Error("unsupportedImplicitTraceEvidence");
        const recomputed=evaluateImplicitTrace(field(evidence,"expression"),field(evidence,"gradient"),field(evidence,"source"),field(evidence,"options"),field(evidence,"conventions"));
        const accepted=claim===validatedClaimKey(recomputed);
        return Object.freeze({accepted,certified:accepted&&recomputed.certified,reason:accepted?null:"implicitTraceClaimMismatch",checkedBy:IMPLICIT_TRACE_CHECKER});
    }catch(error){return Object.freeze({accepted:false,certified:false,reason:error.message});}
}
export function refineImplicitTrace(candidate,options={}) {
    if(!checkImplicitTrace(candidate).accepted) throw new Error("cannotRefineUncheckedImplicitTrace");
    const evidence=field(candidate,"evidence");
    return evaluateImplicitTrace(field(evidence,"expression"),field(evidence,"gradient"),field(evidence,"source"),
        {...optionsMap(field(evidence,"options")),...optionsMap(options)},field(evidence,"conventions"));
}
export function implicitTraceValue(operation,args,context) {
    if(operation==="check") return validatedPortable(checkImplicitTrace(args[0]));
    const result=operation==="refine"?refineImplicitTrace(...args):evaluateImplicitTrace(args[0],args[1],args[2],args[3],{zeroPowerZero:rangeMathPolicy(context).zeroPowerZero});
    return validatedPortable({...result,checker:checkImplicitTrace(result)});
}
