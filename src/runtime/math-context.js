/** Mathematical contexts retain conditions as data; they do not enable ambient rewrites. */
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import {attachMathContextMethods} from './math-context-methods.js';
import { expressionField, expressionStructuralKey, expandExpression, freshExpressionSymbol, isMathExpression } from "./math-expression.js";

const str=value=>({type:"string",value});
const seq=values=>({type:"sequence",values});
const record=fields=>({type:"map",entries:new Map(Object.entries(fields)),_ext:new Map([["immutable",new Integer(1n)]])});
const exact=value=>value instanceof Integer ? new Rational(value.value,1n) : value instanceof Rational ? value : null;
const scalar=value=>exact(value) || (isMathExpression(value) ? exact(expressionField(expandExpression(value),"value")) : null);
const compare=(a,b)=>a.lessThan(b) ? -1 : a.greaterThan(b) ? 1 : 0;
const then=(value,finish)=>value instanceof Promise ? value.then(finish) : finish(value);
const binderNames=item=>item.names || [item.name];

// Substitute identities into IR, not into the programming environment. Closures
// consequently retain their binder without an ambient stack or async leakage.
function bindIR(node, symbols) {
    if (!node || typeof node !== "object" || node instanceof Map) return node;
    if (node.fn === "BOUND_SYMBOL") {
        const symbol=symbols.get(node.args[0]);
        if (!symbol) throw new Error(`Undeclared bound symbol :::${node.args[0]}`);
        return symbol;
    }
    if (node.fn === "MATH_CONTEXT") {
        const shadowed=new Set(node.args[0].filter(item=>item.kind === "binder").flatMap(binderNames));
        const outer=new Map([...symbols].filter(([name])=>!shadowed.has(name)));
        // Inner declarations are resolved by the inner context. Only substitute
        // inherited names here; unresolved names stay IR until that point.
        return replaceKnown(node,outer);
    }
    if (Array.isArray(node)) return node.map(value=>bindIR(value,symbols));
    if (node.type) return node;
    return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bindIR(value,symbols)]));
}

function replaceKnown(node, symbols) {
    if (!node || typeof node !== "object" || node.type || node instanceof Map) return node;
    if (node.fn === "BOUND_SYMBOL") return symbols.get(node.args[0]) || node;
    if (Array.isArray(node)) return node.map(value=>replaceKnown(value,symbols));
    if (node.fn === "MATH_CONTEXT") {
        const local=new Map(symbols);
        for (const item of node.args[0]) if (item.kind === "binder") for (const name of binderNames(item)) local.delete(name);
        return {...node,args:node.args.map(value=>replaceKnown(value,local))};
    }
    return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,replaceKnown(value,symbols)]));
}

function intervalDomain(value) {
    if (value?.type === "tuple" && value.values.length === 2 && value.values[0] instanceof RationalInterval) {
        const domain=intervalDomain(value.values[0]), direction=value.values[1]?.value;
        if (!["asc","desc"].includes(direction)) throw new Error("Domain direction requires :asc or :desc");
        return {...domain,orientation:direction,start:direction === "asc" ? domain.lower : domain.upper,end:direction === "asc" ? domain.upper : domain.lower};
    }
    if (value?.type === "map") {
        const allowed=new Set(["start","end","lowerclosed","upperclosed"]);
        if ([...value.entries.keys()].some(key=>!allowed.has(key))) throw new Error("Unknown mathematical domain field");
        const start=scalar(value.entries.get("start")), end=scalar(value.entries.get("end"));
        if (!start || !end) throw new Error("Domain endpoints currently require exact rational values");
        const closed=key=> {
            if (!value.entries.has(key)) return true;
            const flag=value.entries.get(key);
            if (flag === null) return false;
            if (flag instanceof Integer && flag.value === 1n) return true;
            throw new Error("Domain endpoint inclusion requires 1 or _");
        };
        const ascending=compare(start,end)<=0;
        const domain={lower:ascending ? start : end,upper:ascending ? end : start,start,end,
            orientation:ascending ? "asc" : "desc",lowerClosed:closed("lowerclosed"),upperClosed:closed("upperclosed")};
        intersect({},domain);
        return domain;
    }
    if (!(value instanceof RationalInterval)) throw new Error("Binding source requires a rational interval, direction tuple, or domain object");
    return {lower:value.low,upper:value.high,lowerClosed:true,upperClosed:true,
        start:value.start,end:value.end,orientation:compare(value.start,value.end)<=0 ? "asc" : "desc"};
}
function intersect(bounds, patch) {
    for (const side of ["lower","upper"]) {
        if (!patch[side]) continue;
        const comparison=bounds[side] ? compare(patch[side],bounds[side]) : null;
        if (comparison === null || (side === "lower" ? comparison>0 : comparison<0)) {
            bounds[side]=patch[side]; bounds[`${side}Closed`]=patch[`${side}Closed`];
        }
        if (comparison === 0) bounds[`${side}Closed`]=bounds[`${side}Closed`] && patch[`${side}Closed`];
    }
    if (bounds.lower && bounds.upper) {
        const order=compare(bounds.lower,bounds.upper);
        if (order>0 || (order === 0 && (!bounds.lowerClosed || !bounds.upperClosed))) throw new Error("Conflicting mathematical header constraints");
        if (order === 0 && bounds.excluded?.some(value=>compare(value,bounds.lower)===0)) throw new Error("Conflicting mathematical header constraints");
    }
}
function domainRecord(domain) {
    if (!domain) return null;
    return record({lower:domain.lower || null,upper:domain.upper || null,
        lowerclosed:domain.lowerClosed ? new Integer(1n) : null,upperclosed:domain.upperClosed ? new Integer(1n) : null,
        start:domain.start || null,end:domain.end || null,orientation:domain.orientation ? str(domain.orientation) : null,
        excluded:seq(domain.excluded || [])});
}

function evaluateContext([header,body],context,evaluate) {
    const symbols=new Map(), binders=[], assumptions=[], bounds=new Map();
    let unresolved=false;
    const boundFor=symbol=> {
        const key=expressionStructuralKey(symbol);
        if (!bounds.has(key)) bounds.set(key,{symbol,excluded:[]});
        return bounds.get(key);
    };
    const evaluateNode=node=>evaluate(bindIR(node,symbols),context);
    function assumption(operator,left,right) {
        assumptions.push(record({operator:str(operator),left,right}));
        const a=scalar(left), b=scalar(right);
        if (a && b) {
            const c=compare(a,b);
            if (!({"==":c===0,"!=":c!==0,"<":c<0,">":c>0,"<=":c<=0,">=":c>=0}[operator])) throw new Error("Conflicting mathematical header constraints");
            return;
        }
        if (a && !b) return constrain(right,{"<":">",">":"<","<=":">=",">=":"<=","==":"==","!=":"!="}[operator],a);
        if (b && !a) return constrain(left,operator,b);
        unresolved=true;
    }
    function constrain(symbol,operator,value) {
        if (expressionField(symbol,"kind")?.value !== "variable") { unresolved=true; return; }
        const domain=boundFor(symbol), patch={};
        if ([">",">=","=="].includes(operator)) {patch.lower=value;patch.lowerClosed=operator!==">";}
        if (["<","<=","=="].includes(operator)) {patch.upper=value;patch.upperClosed=operator!=="<";}
        if (operator === "!=") domain.excluded.push(value);
        intersect(domain,patch);
    }
    function declaration(index) {
        if (index === header.length) return statement(0,null);
        const item=header[index];
        if (item.kind === "binder") {
            for (const name of binderNames(item)) {
                if (symbols.has(name)) continue;
                const symbol=freshExpressionSymbol(name,true);
                symbols.set(name,symbol);binders.push(symbol);
            }
            if (!item.source) return declaration(index+1);
            return then(evaluateNode(item.source),source=> {
                const sources=item.names ? source?.type === "tuple" ? source.values : null : [source];
                if (!sources || sources.length !== binderNames(item).length) throw new Error("Tuple binding requires one domain per bound symbol");
                binderNames(item).forEach((name,index)=> {
                    const next=intervalDomain(sources[index]), target=boundFor(symbols.get(name));
                    if (target.orientation && target.orientation!==next.orientation) throw new Error("Conflicting binding traversal orientations");
                    if (!target.orientation) Object.assign(target,{start:next.start,end:next.end,orientation:next.orientation});
                    intersect(target,next);
                });
                return declaration(index+1);
            });
        }
        return then(evaluateNode(item.left),left=>then(evaluateNode(item.right),right=> {
            assumption(item.operator,left,right);
            return declaration(index+1);
        }));
    }
    function statement(index,result) {
        if (index<body.length) return then(evaluateNode(body[index]),value=>statement(index+1,value));
        return attachMathContextMethods(record({schema:str("rix.math.context@1"),result,binders:seq(binders),assumptions:seq(assumptions),
            domains:seq([...bounds.values()].map(domain=>record({symbol:domain.symbol,domain:domainRecord(domain)}))),
            consistency:str(unresolved ? "unresolved" : "checkedBounds")}));
    }
    return declaration(0);
}

export const mathContextSyntaxFunctions={
    MATH_CONTEXT:{impl:evaluateContext,lazy:true,pure:false},
    BOUND_SYMBOL:{impl:([name])=>{throw new Error(`Bound symbol :::${name} requires a declaring mathematical context`);},lazy:true,pure:false},
};
