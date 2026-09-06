/** Explicit, protocol-checked singleton adapters; never execute saved recipes. */
import {Integer,RationalInterval} from "@ratmath/core";
import {deepCopyValue} from "./cell.js";
import {refinementEntry as field,refinementSupports,normalizeRefinementRequest,checkRefinementResult} from "./refinement.js";

const states=new WeakMap();
const TOKEN="__math_real_token";
let nextIdentity=1;
const yes=value=>value instanceof Integer && value.value === 1n;
const then=(value,finish)=>value instanceof Promise ? value.then(finish) : finish(value);
const method=(source,name,args,context,evaluate)=>evaluate({fn:"CALL_METHOD",args:[source,name,...args]},context);

export function realConstantState(value) {
    if (value?.type !== "math_real") return null;
    const state=states.get(value._ext?.get(TOKEN));
    if (!state) throw new Error("Invalid mathematical real identity");
    return state;
}

export function restoreRealSnapshot(interval, savedEvidence) {
    if (!(interval instanceof RationalInterval) || interval.low.denominator === 0n || interval.high.denominator === 0n) throw new Error("Invalid saved real enclosure");
    const token=()=>{throw new Error("Opaque real identity is not callable");};
    states.set(token,{id:`real:${nextIdentity++}`,source:null,capabilities:null,interval,
        evidence:{type:"string",value:"declared"},savedEvidence,
        result:{type:"map",entries:new Map([["status",{type:"string",value:"snapshot"}],["goalmet",null]])}});
    return {type:"math_real",_ext:new Map([[TOKEN,token],["immutable",new Integer(1n)]])};
}

function requestFor(options,capabilities) {
    if (options !== null && options !== undefined && options?.type !== "map") throw new Error("Real refinement options require a map");
    return normalizeRefinementRequest(options,{operation:"refine",capabilities});
}

function checkedInterval(result,request,capabilities) {
    const check=checkRefinementResult(result,request,capabilities);
    const interval=field(result,"interval");
    if (!yes(field(check,"valid")) || !yes(field(result,"certified")) || !(interval instanceof RationalInterval)) {
        throw new Error("Mathematical real requires a valid certified refinement result");
    }
    if (interval.low.denominator === 0n || interval.high.denominator === 0n) throw new Error("Mathematical real requires a finite certified enclosure");
    return interval;
}

export function adaptRealConstant(source,options,context,evaluate) {
    const captured=deepCopyValue(source);
    return then(method(captured,"NUMERICSCAPABILITIES",[],context,evaluate),capabilities=> {
        if (!refinementSupports(capabilities,"refine") || !yes(field(capabilities,"certified")) ||
            !yes(field(capabilities,"arbitraryrefinement")) || field(capabilities,"denotation")?.value !== "singleton") {
            throw new Error("Mathematical real requires a certified arbitrarily refinable singleton provider");
        }
        const request=requestFor(options,capabilities);
        return then(method(captured,"REFINE",[request],context,evaluate),result=> {
            const interval=checkedInterval(result,request,capabilities);
            const token=()=>{throw new Error("Opaque real identity is not callable");};
            states.set(token,{id:`real:${nextIdentity++}`,source:captured,capabilities:deepCopyValue(capabilities),interval,
                evidence:field(result,"evidencelevel"),result:deepCopyValue(result)});
            return {type:"math_real",_ext:new Map([[TOKEN,token],["immutable",new Integer(1n)]])};
        });
    });
}

export function refineRealConstant(value,options,context,evaluate) {
    const state=realConstantState(value);
    if (!state) throw new Error("ExpressionRefine requires an adapted real constant");
    if (!state.source) throw new Error("Saved real is a frozen snapshot; no refinement recipe is installed");
    const request=requestFor(options,state.capabilities);
    return then(method(state.source,"REFINE",[request],context,evaluate),result=> {
        const interval=checkedInterval(result,request,state.capabilities);
        if (interval.high.lessThan(state.interval.low) || state.interval.high.lessThan(interval.low)) {
            throw new Error("Refinement contradicts the retained real enclosure");
        }
        const lower=interval.low.greaterThan(state.interval.low) ? interval.low : state.interval.low;
        const upper=interval.high.lessThan(state.interval.high) ? interval.high : state.interval.high;
        state.interval=new RationalInterval(lower,upper);
        const evidence=field(result,"evidencelevel");
        if (state.evidence?.value !== evidence?.value) state.evidence={type:"string",value:"mixed"};
        state.result=deepCopyValue(result);
        return result;
    });
}
