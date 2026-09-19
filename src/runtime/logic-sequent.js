/** Bounded classical, multi-succedent sequent calculus over existing formulas. */
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { createFragment, createHeading, createParagraph, createTable, createGraphic, createTextMark, createPath } from "./output.js";

export const LOGIC_SEQUENT_SCHEMA = "rix.logic.sequent@1";
export const LOGIC_SEQUENT_CHECKER = "classical-lk-replay@1";
const FORMULA = "rix.logic.formula@1";
const fail = message => { throw new Error(`Logic sequent: ${message}`); };
const raw = x => x instanceof Integer ? Number(x.value) : x?.type === "string" ? x.value : x;
const entries = value => value?.entries instanceof Map ? [...value.entries] : value && [Object.prototype,null].includes(Object.getPrototypeOf(value)) ? Object.entries(value) : fail("expected a record");
const field = (value,key,fallback=null) => entries(value).find(([name])=>String(name).toLowerCase()===key)?.[1] ?? fallback;
const list = value => Array.isArray(value)?value:value?.type==="sequence"?value.values:fail("expected an array");
function limit(value,name,low,high,fallback) {
    const number=raw(field(value,name,fallback));
    if(!Number.isSafeInteger(number)||number<low||number>high) fail(`${name} must be within ${low}…${high}`);
    return number;
}
function options(value={}) {
    for(const [key] of entries(value)) if(!["maxsteps","maxnodes","maxdepth","maxtext"].includes(key.toLowerCase())) fail(`unknown option ${key}`);
    return {maxsteps:limit(value,"maxsteps",0,4096,512),maxnodes:limit(value,"maxnodes",1,4096,1024),maxdepth:limit(value,"maxdepth",0,128,64),maxtext:limit(value,"maxtext",4096,4*1024*1024,1024*1024)};
}
function formulaNormalizer() {
    let count=0,text=0;const active=new Set();
    function normalize(value,depth=0) {
        if(++count>4096||depth>64) fail("formula size/depth limit");
        if(active.has(value)) fail("cyclic formula");active.add(value);
        if(raw(field(value,"schema"))!==FORMULA) fail("expected an existing Logic formula");
        const kind=raw(field(value,"kind")), result={schema:FORMULA,valuekind:"logicFormula",kind};
        if(kind==="atom") {
            result.name=raw(field(value,"name"));
            if(typeof result.name!=="string"||!result.name.length||result.name.length>256||/[\x00-\x1f]/.test(result.name)) fail("invalid atom name");
            text+=result.name.length;if(text>65536) fail("atom text limit");
        } else if(kind==="not") result.operand=normalize(field(value,"operand"),depth+1);
        else if(["and","or","implies","iff"].includes(kind)) {result.left=normalize(field(value,"left"),depth+1);result.right=normalize(field(value,"right"),depth+1);}
        else if(!["top","bottom"].includes(kind)) fail(`unsupported formula kind ${kind}`);
        active.delete(value);return Object.freeze(result);
    }
    return normalize;
}
const key=f=>JSON.stringify(f);
const context=values=>[...new Map(values.map(f=>[key(f),f])).values()];
const same=(a,b)=>key(a)===key(b);
function evaluate(f,valuation) {
    switch(f.kind) {
    case "atom":return valuation.get(f.name)??false;case "top":return true;case "bottom":return false;
    case "not":return !evaluate(f.operand,valuation);case "and":return evaluate(f.left,valuation)&&evaluate(f.right,valuation);
    case "or":return evaluate(f.left,valuation)||evaluate(f.right,valuation);case "implies":return !evaluate(f.left,valuation)||evaluate(f.right,valuation);
    case "iff":return evaluate(f.left,valuation)===evaluate(f.right,valuation);
    }
}
function atoms(f,names) {if(f.kind==="atom")names.add(f.name);if(f.operand)atoms(f.operand,names);if(f.left){atoms(f.left,names);atoms(f.right,names);}}
const binary=(kind,left,right)=>({schema:FORMULA,valuekind:"logicFormula",kind,left,right});
/** Each rule gives premise sequents above a conclusion; contexts are finite sets. */
function rule(left,right) {
    if(left.some(a=>right.some(b=>same(a,b)))) return {id:"identity",premises:[]};
    if(left.some(f=>f.kind==="bottom"))return {id:"bottom-left",premises:[]};
    if(right.some(f=>f.kind==="top"))return {id:"top-right",premises:[]};
    for(const side of ["left","right"]) {
        const source=side==="left"?left:right;
        const index=source.findIndex(f=>f.kind!=="atom");if(index<0)continue;
        const f=source[index],l=side==="left"?left.filter((_,i)=>i!==index):left,r=side==="right"?right.filter((_,i)=>i!==index):right;
        const premise=(moreL=[],moreR=[])=>({left:context([...l,...moreL]),right:context([...r,...moreR])});
        const L=side==="left";let premises;
        switch(f.kind) {
        case "top":case "bottom":premises=[premise()];break;
        case "not":premises=[L?premise([],[f.operand]):premise([f.operand])];break;
        case "and":premises=L?[premise([f.left,f.right])]:[premise([],[f.left]),premise([],[f.right])];break;
        case "or":premises=L?[premise([f.left]),premise([f.right])]:[premise([],[f.left,f.right])];break;
        case "implies":premises=L?[premise([],[f.left]),premise([f.right])]:[premise([f.left],[f.right])];break;
        case "iff": {
            const expansion=binary("and",binary("implies",f.left,f.right),binary("implies",f.right,f.left));
            premises=[L?premise([expansion]):premise([],[expansion])];break;
        }
        }
        return {id:`${f.kind}-${side}`,principal:index,premises};
    }
    return {id:"open",premises:[]};
}
export function createSequent(leftInput,rightInput,optionsInput={}) {
    const normalize=formulaNormalizer(),opts=options(optionsInput);
    const sources=[list(leftInput),list(rightInput)];if(sources.some(x=>x.length>256))fail("context size limit");
    const left=context(sources[0].map(f=>normalize(f))),right=context(sources[1].map(f=>normalize(f)));
    const names=new Set();[...left,...right].forEach(f=>atoms(f,names));if(names.size>64)fail("atom count limit");
    const nodes=[];let text=0,steps=0;
    const add=(sequent,depth)=>{
        const n={id:nodes.length,depth,...sequent,rule:"pending",principal:null,premises:[],status:"unresolved",reason:null};
        nodes.push(n);text+=key(sequent).length;return n;
    };
    add({left,right},0);if(text>opts.maxtext)fail("initial sequent exceeds text budget");
    for(let index=0;index<nodes.length;index++) {
        const n=nodes[index];
        if(steps>=opts.maxsteps){n.rule="budget";n.reason="step-limit";continue;}
        const inference=rule(n.left,n.right);
        if(inference.premises.length && n.depth>=opts.maxdepth){n.rule="budget";n.reason="depth-limit";continue;}
        if(nodes.length+inference.premises.length>opts.maxnodes){n.rule="budget";n.reason="node-limit";continue;}
        if(text+inference.premises.reduce((sum,p)=>sum+key(p).length,0)>opts.maxtext){n.rule="budget";n.reason="text-limit";continue;}
        steps++;n.rule=inference.id;n.principal=inference.principal??null;
        if(inference.id==="open")n.status="invalid";
        else if(!inference.premises.length)n.status="valid";
        else n.premises=inference.premises.map(p=>add(p,n.depth+1).id);
    }
    for(let i=nodes.length-1;i>=0;i--) {
        const n=nodes[i];if(!n.premises.length)continue;
        const states=n.premises.map(id=>nodes[id].status);
        n.status=states.includes("invalid")?"invalid":states.every(s=>s==="valid")?"valid":"unresolved";
    }
    const open=nodes.find(n=>n.rule==="open");let countermodel=null;
    if(open) {
        const valuation=new Map([...names].sort().map(name=>[name,false]));open.left.forEach(f=>valuation.set(f.name,true));
        if(!left.every(f=>evaluate(f,valuation))||right.some(f=>evaluate(f,valuation)))fail("countermodel verification failed");
        countermodel=[...valuation].map(([atom,truth])=>({atom,truth:truth?1:0}));
    }
    return {schema:LOGIC_SEQUENT_SCHEMA,system:"classical-lk",checker:LOGIC_SEQUENT_CHECKER,left,right,options:opts,
        status:nodes[0].status,complete:nodes.every(n=>n.rule!=="budget")?1:null,countermodel,nodes,
        work:{steps,nodes:nodes.length,text,unresolved:nodes.filter(n=>n.rule==="budget").length}};
}
/** Read inert data within aggregate bounds before checking any stored claim. */
function plain(value) {
    let count=0,size=0;const active=new Set();
    function visit(v,depth) {
        if(++count>500000||depth>256)fail("evidence node/depth limit");
        if(v instanceof Integer){if(v.value>BigInt(Number.MAX_SAFE_INTEGER)||v.value<BigInt(Number.MIN_SAFE_INTEGER))fail("evidence integer limit");return Number(v.value);}
        if(v?.type==="string")v=v.value;
        if(v===null||typeof v==="number"||typeof v==="string") {size+=typeof v==="string"?v.length+2:32;if(size>16*1024*1024)fail("evidence text limit");return v;}
        if(typeof v!=="object")fail("evidence contains unsupported value");
        if(active.has(v))fail("cyclic evidence");active.add(v);
        let result;
        if(Array.isArray(v)||v.type==="sequence")result=list(v).map(x=>visit(x,depth+1));
        else {result=Object.create(null);for(const [k,x] of entries(v)){if(typeof k!=="string"||k.length>256)fail("invalid field");size+=k.length;if(Object.hasOwn(result,k))fail("duplicate field");result[k]=visit(x,depth+1);}}
        active.delete(v);return result;
    }
    return visit(value,0);
}
function canonical(v) {return Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")}}`:JSON.stringify(v);}
export function checkSequent(candidate) {
    try {
        const c=plain(candidate);
        if(c.schema!==LOGIC_SEQUENT_SCHEMA||c.checker!==LOGIC_SEQUENT_CHECKER)fail("unsupported evidence schema/checker");
        const replay=createSequent(c.left,c.right,c.options);
        const accepted=canonical(c)===canonical(replay);
        return {accepted:accepted?1:null,reason:accepted?null:"sequent-evidence-mismatch",status:replay.status};
    } catch(error){return {accepted:null,reason:error.message,status:"unverified"};}
}
function formatFormula(f) {
    if(f.kind==="atom")return f.name;if(f.kind==="top")return "TRUE";if(f.kind==="bottom")return "FALSE";
    if(f.kind==="not")return `not ${formatFormula(f.operand)}`;
    return `(${formatFormula(f.left)} ${{and:"and",or:"or",implies:"implies",iff:"iff"}[f.kind]} ${formatFormula(f.right)})`;
}
export function sequentValue(value) {
    if(value instanceof Rational||value instanceof Integer||value instanceof RationalInterval||value?.type==="output")return value;
    if(value===null)return null;if(typeof value==="number")return new Integer(BigInt(value));if(typeof value==="string")return {type:"string",value};
    if(Array.isArray(value))return {type:"sequence",values:value.map(sequentValue)};
    return {type:"map",entries:new Map(Object.entries(value).map(([k,v])=>[k,sequentValue(v)]))};
}
export function renderSequentTree(candidate,renderOptions={}) {
    const check=checkSequent(candidate);if(!check.accepted)fail(`cannot render unchecked evidence: ${check.reason}`);
    const graphicOnly=raw(field(renderOptions,"graphic",0));if(![0,1].includes(graphicOnly))fail("graphic must be 0 or 1");
    const source=plain(candidate),maximum=limit(renderOptions,"maxnodes",1,512,128),selected=source.nodes.slice(0,maximum);
    const text=n=>`${n.left.map(formatFormula).join(", ")} entails ${n.right.map(formatFormula).join(", ")}`;
    const rows=selected.map(n=>[String(n.id),text(n),n.rule,n.status,n.premises.join(", ")]);
    const scene=[];
    selected.forEach((n,index)=>{
        const x=20+Math.min(n.depth,12)*12,y=24+index*30;
        if(n.id>0){const parent=selected.find(p=>p.premises.includes(n.id));if(parent){const px=20+Math.min(parent.depth,12)*12,py=24+parent.id*30;scene.push(createPath([sequentValue([[px,py+4],[px,y-5],[x-5,y-5]]),sequentValue({stroke:"#64748b"})]));}}
        scene.push(createTextMark([sequentValue([x,y]),sequentValue(`${n.id}: ${text(n).slice(0,32)} [${n.rule}]`),sequentValue({fill:n.status==="valid"?"#166534":n.status==="invalid"?"#991b1b":"#92400e",fontSize:10,id:`sequent-${n.id}`})]));
    });
    const metadata={schema:"rix.logic.sequent-tree@1",status:source.status,checker:source.checker,omitted:source.nodes.length-selected.length,source};
    const graphic=createGraphic([sequentValue([460,Math.max(60,selected.length*30+20)]),sequentValue(scene),sequentValue(metadata)]);
    if(graphicOnly===1)return graphic;
    return createFragment([sequentValue([
        createHeading([new Integer(1n),sequentValue(`Classical sequent: ${source.status}`)]),
        createParagraph([sequentValue(`Checked replay; ${source.work.steps} rule steps. Showing ${selected.length} of ${source.nodes.length} nodes. Labels are shortened in the graphic; the table retains their full text. An unresolved tree is not a proof.`)]),
        graphic,
        createTable([sequentValue(["Node","Sequent","Rule","Status","Premises"]),sequentValue(rows)]),
    ]),sequentValue(metadata)]);
}
function rational(value) {
    const r=value instanceof Integer?new Rational(value.value):value;
    if(!(r instanceof Rational))fail("proposition operands require exact rationals or rational intervals");
    if(r.numerator.toString().length>4096||r.denominator.toString().length>4096)fail("proposition rational component limit");return r;
}
function interval(value){const a=rational(value instanceof RationalInterval?value.start:value),b=rational(value instanceof RationalInterval?value.end:value);return a.compareTo(b)<=0?[a,b]:[b,a];}
export function exactProposition(operation,left,right) {
    const op=raw(operation),[a,b]=interval(left),[c,d]=interval(right);let truth;
    switch(op) {
    case "eq":truth=a.equals(b)&&c.equals(d)&&a.equals(c)?"true":b.compareTo(c)<0||d.compareTo(a)<0?"false":"undecided";break;
    case "neq":truth=a.equals(b)&&c.equals(d)&&a.equals(c)?"false":b.compareTo(c)<0||d.compareTo(a)<0?"true":"undecided";break;
    case "lt":truth=b.compareTo(c)<0?"true":a.compareTo(d)>=0?"false":"undecided";break;
    case "lte":truth=b.compareTo(c)<=0?"true":a.compareTo(d)>0?"false":"undecided";break;
    case "gt":return exactProposition("lt",right,left);
    case "gte":return exactProposition("lte",right,left);
    default:fail("proposition comparison must be eq, neq, lt, lte, gt, or gte");
    }
    return {schema:"rix.logic.exact-proposition@1",checker:"exact-rational-comparison@1",operation:op,left,right,truth,
        formula:truth==="undecided"?null:{schema:FORMULA,valuekind:"logicFormula",kind:truth==="true"?"top":"bottom"}};
}

export function checkExactProposition(candidate) {
    try {
        const expected=exactProposition(field(candidate,"operation"),field(candidate,"left"),field(candidate,"right"));
        const names=entries(candidate).map(([k])=>k.toLowerCase()).sort();
        const accepted=canonical(names)===canonical(Object.keys(expected).sort())
            && ["schema","checker","operation","truth"].every(name=>raw(field(candidate,name))===expected[name])
            && canonical(plain(field(candidate,"formula")))===canonical(expected.formula);
        return {accepted:accepted?1:null,reason:accepted?null:"proposition-evidence-mismatch",truth:expected.truth};
    } catch(error){return {accepted:null,reason:error.message,truth:"unverified"};}
}
