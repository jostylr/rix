/** Exact interval elimination, checked interval Newton, and complete box queues. */
import { Integer, Rational, RationalInterval, RationalIntervalSet } from "@ratmath/core";
import { createRationalBox, checkedSystemBoxData, invertRationalMatrix, evaluateKrawczykBox } from "./multivariate-range.js";
import { isShaped, forEachShapedCell } from "./shaped.js";
import { rangeMathPolicy } from "./range-policy.js";

export const INTERVAL_LINEAR_SCHEMA = "rix.numerics.interval-linear-solve@1";
export const INTERVAL_NEWTON_BOX_SCHEMA = "rix.numerics.interval-newton-box@1";
export const BOX_SUBDIVISION_SCHEMA = "rix.numerics.box-subdivision@1";
export const VALIDATED_BOX_CHECKER = "rix.runtime.validated-box-checker@1";
const ZERO = Rational.zero, ONE = Rational.one;
const point = (value) => new RationalInterval(value, value);
const seq = (value) => Array.isArray(value) ? value : Array.isArray(value?.values) ? value.values : null;
const text = (value) => typeof value === "string" ? value : value?.type === "string" ? value.value : null;
function field(value, name, fallback = null) {
    const entries = value instanceof Map ? value : value?.entries instanceof Map ? value.entries : null;
    if (entries) { for (const [key, entry] of entries) if (String(key).toLowerCase() === name.toLowerCase()) return entry; }
    else if (value && typeof value === "object") for (const key of Object.keys(value)) if (key.toLowerCase() === name.toLowerCase()) return value[key];
    return fallback;
}
function rational(value, label) {
    const result = value instanceof Rational ? value : value instanceof Integer ? new Rational(value.value)
        : typeof value === "bigint" || (typeof value === "number" && Number.isSafeInteger(value)) ? new Rational(value) : null;
    if (!result || result.denominator === 0n) throw new Error(`${label}MustBeExactRational`);
    return result;
}
function interval(value, label) {
    if (value instanceof RationalInterval) return value;
    if (value instanceof RationalIntervalSet) {
        if (!value.isBounded || value.isEmpty || value.componentCount !== 1 || !value.components[0].lowClosed || !value.components[0].highClosed) throw new Error(`${label}RequiresClosedBoundedInterval`);
        return value.toRationalInterval();
    }
    if (text(field(value,"schema")) === "rix.ball@1") return interval(field(value,"interval"),label);
    return point(rational(value,label));
}
function count(value, fallback, maximum, name, minimum = 0) {
    const exact = value === null ? new Rational(fallback) : rational(value,name);
    if (exact.denominator !== 1n || exact.numerator < BigInt(minimum) || exact.numerator > BigInt(maximum)) throw new Error(`${name}MustBeWithin${minimum}And${maximum}`);
    return Number(exact.numerator);
}
function vector(value, label) {
    if (isShaped(value)) {
        if (value.shape.length !== 1 || value.shape[0] < 1 || value.shape[0] > 16) throw new Error(`${label}DimensionOutOfRange`);
        const result=[]; forEachShapedCell(value,(entry) => result.push(interval(entry,label))); return result;
    }
    const values=seq(value);
    if (!values || values.length < 1 || values.length > 16) throw new Error(`${label}DimensionOutOfRange`);
    return values.map((entry) => interval(entry,label));
}
function matrix(value, label) {
    if (isShaped(value)) {
        if (value.shape.length !== 2 || value.shape[0] !== value.shape[1] || value.shape[0] < 1 || value.shape[0] > 16) throw new Error(`${label}MustBeSquareAtMost16`);
        const result=Array.from({length:value.shape[0]},()=>[]);
        forEachShapedCell(value,(entry,tuple) => { result[tuple[0]-1][tuple[1]-1]=interval(entry,label); }); return result;
    }
    const rows=seq(value);
    if (!rows || rows.length < 1 || rows.length > 16 || rows.some((row)=>seq(row)?.length!==rows.length)) throw new Error(`${label}MustBeSquareAtMost16`);
    return rows.map((row)=>seq(row).map((entry)=>interval(entry,label)));
}
const midpoint = (value) => value.low.add(value.high).divide(new Rational(2));
const containsZero = (value) => !value.low.greaterThan(ZERO) && !value.high.lessThan(ZERO);
const magnitude = (value) => value.low.abs().greaterThan(value.high.abs()) ? value.low.abs() : value.high.abs();
const add = (a,b) => a.add(b), sub = (a,b) => a.subtract(b), mul = (a,b) => a.multiply(b);
const sum = (values) => values.reduce(add,point(ZERO));
const norm = (rows) => rows.reduce((largest,row) => {
    const total=row.reduce((a,b)=>a.add(b.abs()),ZERO); return total.greaterThan(largest) ? total : largest;
},ZERO);
const freeze = (value) => Object.freeze(value);

function optionsObject(value) {
    const entries=value instanceof Map ? value : value?.entries instanceof Map ? value.entries : new Map(Object.entries(value || {}));
    return Object.fromEntries([...entries].map(([key,entry])=>[String(key).toLowerCase(),entry]));
}

/** Encloses every solution of every point system A*x=b in the given intervals. */
export function evaluateIntervalLinearSolve(matrixSource, rhsSource, options = {}) {
    const A=matrix(matrixSource,"intervalMatrix"), b=vector(rhsSource,"intervalRhs");
    if (b.length!==A.length) throw new Error("intervalLinearDimensionMismatch");
    const n=A.length, midpointMatrix=A.map((row)=>row.map(midpoint));
    const supplied=field(options,"preconditioner");
    let preconditioner;
    if (supplied!==null) {
        const suppliedMatrix=matrix(supplied,"preconditioner");
        if (suppliedMatrix.length!==n) throw new Error("preconditionerDimensionMismatch");
        preconditioner=suppliedMatrix.map((row)=>row.map((entry)=>{
            if (!entry.low.equals(entry.high)) throw new Error("preconditionerMustBeExactPointMatrix"); return entry.low;
        }));
        if (!invertRationalMatrix(preconditioner)) throw new Error("preconditionerMustBeNonsingular");
    } else preconditioner=invertRationalMatrix(midpointMatrix);
    const evidence={kind:"intervalLinear",checker:VALIDATED_BOX_CHECKER,matrix:A,rhs:b,options:optionsObject(options)};
    const base={schema:INTERVAL_LINEAR_SCHEMA,valueKind:"intervalLinearResult",matrix:A,rhs:b,midpointMatrix,preconditioner,evidence,
        denotation:"allPointSystems",regular:false,certified:false,solution:null,pivots:[],stages:[],diagnostics:[],work:{dimension:n,eliminations:0}};
    if (!preconditioner) return freeze({...base,status:"unknown",classification:"singularPreconditioner",diagnostics:["singularMidpointMatrix"]});
    const inverseMidpoint=invertRationalMatrix(midpointMatrix);
    const condition=inverseMidpoint ? norm(midpointMatrix).multiply(norm(inverseMidpoint)) : null;
    const threshold=rational(field(options,"illConditionThreshold",new Rational(100000000)),"illConditionThreshold");
    if (!threshold.greaterThan(ZERO)) throw new Error("illConditionThresholdMustBePositive");
    const diagnostics=condition?.greaterThan(threshold) ? ["illConditionedMidpointMatrix"] : [];
    const rows=preconditioner.map((row)=>Array.from({length:n},(_,column)=>sum(row.map((entry,k)=>mul(point(entry),A[k][column])))));
    const right=preconditioner.map((row)=>sum(row.map((entry,k)=>mul(point(entry),b[k]))));
    const pivots=[],stages=[]; let eliminations=0;
    for(let column=0;column<n;column+=1) {
        const pivot=rows.findIndex((row,index)=>index>=column && !containsZero(row[column]));
        if(pivot<0) return freeze({...base,status:"unknown",classification:"pivotContainsZero",conditionEstimate:condition,
            preconditionedMatrix:rows,preconditionedRhs:right,pivots,stages,diagnostics:[...diagnostics,"intervalPivotContainsZero"],work:{dimension:n,eliminations}});
        if(pivot!==column) { [rows[pivot],rows[column]]=[rows[column],rows[pivot]]; [right[pivot],right[column]]=[right[column],right[pivot]]; }
        const divisor=rows[column][column]; pivots.push({column:column+1,row:pivot+1,interval:divisor});
        for(let row=column+1;row<n;row+=1) {
            const factor=rows[row][column].divide(divisor);
            const before=[...rows[row]], beforeRhs=right[row];
            for(let j=column+1;j<n;j+=1) rows[row][j]=sub(rows[row][j],mul(factor,rows[column][j]));
            right[row]=sub(right[row],mul(factor,right[column])); rows[row][column]=point(ZERO); eliminations+=1;
            stages.push({column:column+1,row:row+1,factor,before,beforeRhs,after:[...rows[row]],afterRhs:right[row]});
        }
    }
    const solution=Array(n);
    for(let row=n-1;row>=0;row-=1) {
        const remainder=sum(rows[row].slice(row+1).map((entry,index)=>mul(entry,solution[row+1+index])));
        solution[row]=sub(right[row],remainder).divide(rows[row][row]);
    }
    const residual=A.map((row,index)=>sub(sum(row.map((entry,j)=>mul(entry,solution[j]))),b[index]));
    return freeze({...base,status:"enclosed",classification:"regular",certified:true,regular:true,solution,
        conditionEstimate:condition,triangularMatrix:rows,triangularRhs:right,pivots,stages,residual,diagnostics,
        proof:"nonzeroIntervalEliminationPivots",work:{dimension:n,eliminations}});
}

const axes = (box) => box.variables.map((name)=>box.axes.get(name).toRationalInterval());
const boxOf = (names, ranges) => createRationalBox(new Map(names.map((name,index)=>[name,ranges[index]])));
const width = (value) => value.high.subtract(value.low);
function intersect(a,b) {
    const low=a.low.greaterThan(b.low) ? a.low : b.low, high=a.high.lessThan(b.high) ? a.high : b.high;
    return low.greaterThan(high) ? null : new RationalInterval(low,high);
}
function boundedIterations(options) { return count(field(options,"maxIterations",field(options,"maxWork")),2,32,"maxIterations",1); }

export function evaluateIntervalNewtonBox(expressions,jacobian,source,options={},conventions={}) {
    const inputBox=createRationalBox(source), maxIterations=boundedIterations(options);
    const graphOptions=validatedPortable(field(options,"graphOptions",{}));
    let current=inputBox, classification="contracted", rootExistence="unproved", graphEvaluations=0;
    const trace=[], diagnostics=[];
    for(let step=0;step<maxIterations;step+=1) {
        let data;
        try { data=checkedSystemBoxData(expressions,jacobian,current,graphOptions,conventions); }
        catch(error) { classification="invalidEvidence"; diagnostics.push(error.message); break; }
        graphEvaluations+=data.graphEvaluations;
        if(data.functionRange.some((range)=>!containsZero(range))) {
            classification="excluded";rootExistence="none";
            trace.push({inputBox:current,classification,functionRange:data.functionRange,reason:"functionRangeExcludesZero"}); current=null; break;
        }
        const linear=evaluateIntervalLinearSolve(data.jacobianRange,data.functionAtCenter,options);
        if(!linear.certified) {
            classification=linear.classification;diagnostics.push(...linear.diagnostics);
            trace.push({inputBox:current,classification,linear,center:data.center,functionAtCenter:data.functionAtCenter,jacobianRange:data.jacobianRange}); break;
        }
        const image=linear.solution.map((entry,index)=>sub(point(data.center[index]),entry));
        const ranges=axes(current), intersections=ranges.map((range,index)=>intersect(range,image[index]));
        const input=current, operatorBox=boxOf(current.variables,image);
        const strict=image.every((entry,index)=>ranges[index].low.lessThan(entry.low) && entry.high.lessThan(ranges[index].high));
        const excluded=intersections.some((entry)=>entry===null);
        let boundaryRoot=null;
        if(!excluded && !strict && image.every((entry)=>entry.low.equals(entry.high))) {
            const candidate=boxOf(current.variables,image);
            try {
                const check=checkedSystemBoxData(expressions,jacobian,candidate,graphOptions,conventions); graphEvaluations+=check.graphEvaluations;
                if(check.functionRange.every((entry)=>entry.low.equals(ZERO) && entry.high.equals(ZERO))) boundaryRoot=image.map((entry)=>entry.low);
            } catch { /* A domain failure cannot create an existence certificate. */ }
        }
        const contracted=!excluded && intersections.some((entry,index)=>width(entry).lessThan(width(ranges[index])));
        classification=excluded ? "excluded" : strict || boundaryRoot ? "unique" : contracted ? "contracted" : "stalled";
        rootExistence=excluded ? "none" : classification==="unique" ? "unique" : "unproved";
        current=excluded ? null : boxOf(input.variables,intersections);
        trace.push({inputBox:input,outputBox:current,operatorBox,classification,strictInclusion:strict,verifiedBoundaryRoot:boundaryRoot,
            center:data.center,functionAtCenter:data.functionAtCenter,jacobianRange:data.jacobianRange,obligationChecks:data.obligationChecks,linear});
        if(classification!=="contracted") break;
    }
    const exhausted=classification==="contracted" && trace.length===maxIterations;
    return freeze({schema:INTERVAL_NEWTON_BOX_SCHEMA,valueKind:"intervalNewtonBoxResult",strategy:"intervalNewton",
        status:rootExistence!=="unproved" ? "classified" : exhausted ? "budgetExhausted" : "unknown",classification,rootExistence,
        certified:classification!=="invalidEvidence",inputBox,box:current,operatorBox:trace.at(-1)?.operatorBox??null,trace,diagnostics,
        work:{iterations:trace.length,graphEvaluations,maxIterations,exhausted},
        evidence:{kind:"intervalNewtonBox",checker:VALIDATED_BOX_CHECKER,expressions,jacobian,source:inputBox,options:optionsObject(options),conventions}});
}

function subdivisionOptions(options) {
    const maxBoxes=count(field(options,"maxBoxes",field(options,"maxWork")),64,4096,"maxBoxes");
    const maxDepth=count(field(options,"maxDepth"),20,128,"maxDepth");
    const minWidth=rational(field(options,"minWidth",ZERO),"minWidth");
    if(minWidth.lessThan(ZERO)) throw new Error("minWidthMustBeNonnegative");
    const method=text(field(options,"method","intervalNewton"));
    if(!["intervalNewton","krawczyk"].includes(method)) throw new Error("boxSubdivisionMethodUnsupported");
    const maxIterations=boundedIterations(options);
    return {maxBoxes,maxDepth,minWidth,method,maxIterations};
}

export function evaluateBoxSubdivision(expressions,jacobian,source,options={},conventions={}) {
    const inputBox=createRationalBox(source), limits=subdivisionOptions(options);
    if(inputBox.dimension<1||inputBox.dimension>16) throw new Error("boxSubdivisionDimensionOutOfRange");
    const queue=[{id:"r",box:inputBox,depth:0}],excluded=[],unique=[],unresolved=[],nodes=[];
    let processed=0,graphEvaluations=0;
    while(queue.length && processed<limits.maxBoxes) {
        const pending=queue.shift(); processed+=1;
        const kernelOptions=limits.method==="krawczyk"
            ? {...optionsObject(validatedPortable(field(options,"graphOptions",{}))),maxiterations:new Integer(BigInt(limits.maxIterations))}
            : {...optionsObject(options),maxiterations:limits.maxIterations};
        const result=limits.method==="krawczyk" ? evaluateKrawczykBox(expressions,jacobian,pending.box,kernelOptions,conventions)
            : evaluateIntervalNewtonBox(expressions,jacobian,pending.box,kernelOptions,conventions);
        graphEvaluations+=result.work.graphEvaluations;
        const node={...pending,classification:result.classification,result};
        if(result.certified && result.classification==="excluded") {excluded.push(node);nodes.push({...node,action:"excluded"});continue;}
        if(result.certified && result.classification==="unique") {unique.push(node);nodes.push({...node,action:"unique"});continue;}
        const ranges=axes(pending.box);
        let axis=0;
        for(let index=1;index<ranges.length;index+=1) if(width(ranges[index]).greaterThan(width(ranges[axis]))) axis=index;
        const tooSmall=width(ranges[axis]).lessThanOrEqual(limits.minWidth);
        if(pending.depth>=limits.maxDepth || tooSmall || !result.certified) {
            const reason=!result.certified ? "invalidEvidence" : tooSmall ? "resolutionFloor" : "depthLimit";
            const leaf={...node,reason};unresolved.push(leaf);nodes.push({...leaf,action:"unresolved"});continue;
        }
        const splitAt=midpoint(ranges[axis]);
        const children=[new RationalInterval(ranges[axis].low,splitAt),new RationalInterval(splitAt,ranges[axis].high)].map((entry,index)=>{
            const next=[...ranges];next[axis]=entry;
            return {id:`${pending.id}.${index}`,box:boxOf(inputBox.variables,next),depth:pending.depth+1};
        });
        // Split the complete original node box. No region is silently dropped by contraction.
        queue.push(...children);nodes.push({...node,action:"split",axis:inputBox.variables[axis],splitAt,children:children.map((child)=>child.id)});
    }
    const pending=queue.map((entry)=>({...entry,classification:"unprocessed",reason:"workBudgetReached"}));
    return freeze({schema:BOX_SUBDIVISION_SCHEMA,valueKind:"boxSubdivisionResult",status:pending.length?"budgetExhausted":unresolved.length?"unresolved":"complete",
        certified:unresolved.every((entry)=>entry.result.certified),coverage:"completeInputCover",boundaryPolicy:"closedOverlap",inputBox,
        variables:inputBox.variables,excluded,unique,unresolved:[...unresolved,...pending],pending,nodes,
        work:{processed,graphEvaluations,maxBoxes:limits.maxBoxes,pending:pending.length,exhausted:pending.length>0},
        evidence:{kind:"boxSubdivision",checker:VALIDATED_BOX_CHECKER,expressions,jacobian,source:inputBox,options:optionsObject(options),conventions}});
}

function canonical(value, state={nodes:0,seen:new Set()}, depth=0) {
    if(depth>256 || ++state.nodes>2000000) throw new Error("validatedReplayClaimBudgetExceeded");
    if(value===undefined||value===null||value===false) return null;
    if(value===true) return "1";
    if(value instanceof Integer) return String(value.value);
    if(value instanceof Rational) return value.denominator===1n ? String(value.numerator) : `${value.numerator}/${value.denominator}`;
    if(value instanceof RationalInterval||value instanceof RationalIntervalSet) return String(value);
    if(typeof value==="number"||typeof value==="bigint") return String(value);
    if(typeof value==="string") return value;
    if(value?.type==="string") return value.value;
    if(state.seen.has(value)) throw new Error("cyclicValidatedReplayClaim");
    state.seen.add(value);
    try {
        const values=seq(value);if(values)return values.map((entry)=>canonical(entry,state,depth+1));
        const entries=value instanceof Map?value:value?.entries instanceof Map?value.entries:new Map(Object.entries(value));
        return Object.fromEntries([...entries].filter(([key])=>!["_ext","checker","evidence"].includes(String(key).toLowerCase()))
            .map(([key,entry])=>[String(key).toLowerCase(),canonical(entry,state,depth+1)]).sort(([a],[b])=>a<b?-1:a>b?1:0));
    } finally{state.seen.delete(value);}
}

export function checkValidatedBoxResult(candidate) {
    try {
        const evidence=field(candidate,"evidence"),kind=text(field(evidence,"kind"));
        if(text(field(evidence,"checker"))!==VALIDATED_BOX_CHECKER) throw new Error("unsupportedValidatedEvidence");
        let recomputed;
        if(kind==="intervalLinear") recomputed=evaluateIntervalLinearSolve(field(evidence,"matrix"),field(evidence,"rhs"),field(evidence,"options",{}));
        else if(kind==="intervalNewtonBox"||kind==="boxSubdivision") {
            const evaluate=kind==="intervalNewtonBox"?evaluateIntervalNewtonBox:evaluateBoxSubdivision;
            recomputed=evaluate(field(evidence,"expressions"),field(evidence,"jacobian"),field(evidence,"source"),field(evidence,"options",{}),field(evidence,"conventions",{}));
        } else throw new Error("unsupportedValidatedEvidence");
        const accepted=JSON.stringify(canonical(candidate))===JSON.stringify(canonical(recomputed));
        return freeze({accepted,certified:accepted&&recomputed.certified,reason:accepted?null:"validatedClaimMismatch",checkedBy:VALIDATED_BOX_CHECKER});
    }catch(error){return freeze({accepted:false,certified:false,reason:error.message});}
}

export function resumeBoxSubdivision(candidate, options={}) {
    const checked=checkValidatedBoxResult(candidate);
    if(!checked.accepted || text(field(candidate,"schema"))!==BOX_SUBDIVISION_SCHEMA) throw new Error("cannotResumeUncheckedBoxSubdivision");
    const evidence=field(candidate,"evidence"), prior=Number(rational(field(field(candidate,"work"),"processed"),"processed").numerator);
    const extra=count(field(options,"maxBoxes",field(options,"maxWork")),64,4096,"maxBoxes");
    if(prior+extra>4096) throw new Error("resumedBoxBudgetExceeds4096");
    // Deterministic replay from retained source validates the queue before extending it.
    const next={...optionsObject(field(evidence,"options",{})),maxboxes:prior+extra};
    if(Object.keys(optionsObject(options)).some((key)=>!["maxboxes","maxwork"].includes(key))) throw new Error("resumeMayOnlyExtendWorkBudget");
    return evaluateBoxSubdivision(field(evidence,"expressions"),field(evidence,"jacobian"),field(evidence,"source"),next,field(evidence,"conventions",{}));
}

export function validatedPortable(value) {
    if(value===null||value===undefined||value===false)return null;
    if(value===true)return new Integer(1n);
    if(value instanceof Integer||value instanceof Rational||value instanceof RationalInterval||value instanceof RationalIntervalSet)return value;
    if(typeof value==="number"||typeof value==="bigint")return new Integer(BigInt(value));
    if(typeof value==="string")return {type:"string",value};
    if(Array.isArray(value))return {type:"sequence",values:value.map(validatedPortable)};
    if(value?.type==="map"||value?.type==="sequence"||value?.type==="string")return value;
    const entries=value instanceof Map?value:new Map(Object.entries(value));
    return {type:"map",entries:new Map([...entries].map(([key,entry])=>[String(key).toLowerCase(),validatedPortable(entry)]))};
}
export function validatedBoxValue(operation,args,context) {
    const conventions={zeroPowerZero:rangeMathPolicy(context).zeroPowerZero};
    let result;
    if(operation==="linear")result=evaluateIntervalLinearSolve(...args);
    else if(operation==="newton")result=evaluateIntervalNewtonBox(args[0],args[1],args[2],args[3],conventions);
    else if(operation==="subdivide")result=evaluateBoxSubdivision(args[0],args[1],args[2],args[3],conventions);
    else if(operation==="resume")result=resumeBoxSubdivision(...args);
    else return validatedPortable(checkValidatedBoxResult(args[0]));
    return validatedPortable({...result,checker:checkValidatedBoxResult(result)});
}
