import { realJSONCapabilities, encodeRefinableReal, decodeRefinableReal } from "./refinable-real-json.js";
/** Inert, bounded document-local graph interchange. No evaluator callbacks. */
import {Integer,Rational,RationalInterval} from "@ratmath/core";
import {UNDECIDED} from "./decision.js";
import {attachMathContextMethods} from './math-context-methods.js';
import {createExactGenerator,exactPi,isExactPi} from "./exact-values.js";
import {realConstantState} from "./math-real.js";
import {expressionField as field,isMathExpression,expressionStructuralKey,expressionDefinition,
    freshExpressionSymbol,restoreExpressionDefinition,expressionConstant,expressionOperation,expressionApplication} from "./math-expression.js";

export const MATH_DOCUMENT_SCHEMA="rix.math.document@1";
const MAX_TEXT=2_000_000, MAX_NODES=10000, MAX_DEPTH=128, MAX_DIGITS=1024;
const fail=message=>{throw new Error(`Mathematical JSON: ${message}`);};
const text=value=>({type:"string",value});
const immutable=entries=>attachMathContextMethods({type:"map",entries:new Map(entries),_ext:new Map([["immutable",new Integer(1n)]])});
function fields(value,keys) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key=>!Object.hasOwn(value,key))) fail("unexpected or missing fields");
}
function string(value) { if (typeof value !== "string" || value.length>MAX_TEXT) fail("invalid string"); return value; }
function integer(value) {
    if (typeof value !== "string" || value.length>MAX_DIGITS || !/^(0|-?[1-9][0-9]*)$/.test(value)) fail("invalid or oversized integer");
    return BigInt(value);
}
function list(value) { if (!Array.isArray(value) || value.length>MAX_NODES) fail("invalid or oversized array"); return value; }
function exact(value) { if (!(value instanceof Integer || value instanceof Rational)) fail("expected exact scalar"); return value; }
function safeTree(value,depth=0) {
    if (depth>MAX_DEPTH) fail("nesting budget exceeded");
    if (value && typeof value === "object") for (const item of Object.values(value)) safeTree(item,depth+1);
}

export function encodeMathematicalJSON(root) {
    const nodes=[], identities=new Map(), objects=new Map();
    function encode(value,depth=0) {
        if (depth>MAX_DEPTH) fail("graph depth budget exceeded");
        if (value === null) return null;
        if (value === UNDECIDED) return {$undecided:true};
        if (value instanceof Integer) {integer(String(value.value));return {$integer:String(value.value)};}
        if (value instanceof Rational) {
            if (value.denominator === 0n) fail("nonfinite rational");
            integer(String(value.numerator));integer(String(value.denominator));
            return {$rational:[String(value.numerator),String(value.denominator)]};
        }
        if (value?.type === "string") return {$string:value.value};
        if (!value || typeof value !== "object") fail("unsupported value or callable");
        const kind=isMathExpression(value) ? field(value,"kind")?.value : null;
        const real=realConstantState(value);
        const identity=kind === "variable" ? `symbol:${expressionStructuralKey(value)}` : real ? `real:${real.id}` : value.type === "exact_generator" ? `generator:${value.id}` : null;
        if (identity && identities.has(identity)) return {$ref:identities.get(identity)};
        if (objects.has(value)) return {$ref:objects.get(value)};
        if (nodes.length>=MAX_NODES) fail("node budget exceeded");
        const id=`n${nodes.length}`, node={id};
        nodes.push(node);objects.set(value,id);if (identity) identities.set(identity,id);
        const child=value=>encode(value,depth+1);
        if (kind === "variable") Object.assign(node,{kind:"symbol",name:field(value,"name").value,bound:!!field(value,"bound"),definition:child(expressionDefinition(value))});
        else if (kind === "constant") Object.assign(node,{kind,value:child(field(value,"value"))});
        else if (kind === "operator") Object.assign(node,{kind,operation:field(value,"operation").value,operands:field(value,"operands").values.map(child)});
        else if (kind === "apply") Object.assign(node,{kind,semanticId:field(value,"semanticid").value,name:field(value,"name").value,arguments:field(value,"arguments").values.map(child)});
        else if (value instanceof RationalInterval) Object.assign(node,{kind:"interval",start:child(value.start),end:child(value.end)});
        else if (real?.interchange) Object.assign(node,{kind:"real",envelope:JSON.parse(encodeRefinableReal(value))});
        else if (real) Object.assign(node,{kind:"real",envelope:{schema:"rix.refinable-real@1",subject:{kind:"opaqueSingleton",stableName:id},
            snapshot:{interval:{$interval:[child(real.interval.low),child(real.interval.high)]},status:real.source ? "certified" : "assumed",
                evidenceLevel:real.savedEvidence || real.evidence?.value || "declared",verification:"unavailable",evidence:[],
                achievedWidth:child(real.interval.high.subtract(real.interval.low)),work:{calls:"0",iterations:"0"}},recipe:null}});
        else if (isExactPi(value)) Object.assign(node,{kind:"namedConstant",semanticId:"rix.constant.pi@1"});
        else if (value.type === "exact_generator") Object.assign(node,{kind:"generator",name:value.name,category:value.category,real:value.real,positiveRoot:value.positiveRoot,
            polynomial:value.minimalPolynomial ? value.minimalPolynomial.map(child) : null});
        else if (value.type === "exact_expression") Object.assign(node,{kind:"exact",terms:[...value.terms.values()].map(term=>({coefficient:child(term.coefficient),powers:[...term.powers].map(([g,e])=>[child(g),e])}))});
        else if (["tuple","sequence"].includes(value.type)) Object.assign(node,{kind:value.type,values:list(value.values).map(child)});
        else if (value.type === "map") Object.assign(node,{kind:"map",entries:list([...value.entries]).map(([key,item])=>[string(key),child(item)])});
        else fail(`unsupported value type ${value.type || "object"}`);
        return {$ref:id};
    }
    const doc={schema:MATH_DOCUMENT_SCHEMA,root:encode(root),nodes};
    const output=JSON.stringify(doc);
    // The same structural validation applies to writer output (cycles, arity,
    // component sizes); validation never imports or evaluates expressions.
    validateDocument(output);
    return output;
}

function validateDocument(source) {
    if (typeof source !== "string" || source.length>MAX_TEXT) fail("text budget exceeded or non-string input");
    let doc;try {doc=JSON.parse(source);} catch {fail("invalid JSON");}
    safeTree(doc);fields(doc,["schema","root","nodes"]);
    if (doc.schema!==MATH_DOCUMENT_SCHEMA) fail("unsupported document version");
    const table=new Map();
    for (const node of list(doc.nodes)) {
        if (!node || typeof node.id !== "string" || !/^n[0-9]+$/.test(node.id) || table.has(node.id)) fail("invalid or duplicate node ID");
        table.set(node.id,node);
    }
    const visited=new Set(),active=new Set();
    function scan(value,depth=0) {
        if (depth>MAX_DEPTH) fail("graph depth budget exceeded");
        if (!value || typeof value !== "object") return;
        if (Object.hasOwn(value,"$ref")) {
            fields(value,["$ref"]);const id=value.$ref;
            if (!table.has(id)) fail("dangling reference");
            if (active.has(id)) fail("cyclic graph or definition");
            if (visited.has(id)) return;
            active.add(id);scan(table.get(id),depth+1);active.delete(id);visited.add(id);return;
        }
        // Real envelopes carry their own inert data; $ref inside a saved recipe
        // or metadata is not a reference into the surrounding mathematical graph.
        if (value.kind === "real" && table.get(value.id) === value) return;
        for (const child of Object.values(value)) scan(child,depth+1);
    }
    scan(doc.root);for (const id of table.keys()) scan({$ref:id});
    // A tiny shared DAG must not expand exponentially in downstream tree APIs.
    const weights=new Map();
    function weight(value) {
        if (!value || typeof value !== "object") return {size:1,height:1};
        if (Object.hasOwn(value,"$ref")) {
            if (!weights.has(value.$ref)) weights.set(value.$ref,weight(table.get(value.$ref)));
            return weights.get(value.$ref);
        }
        if (value.kind === "real" && table.get(value.id) === value) {
            function plain(item) {
                if(!item || typeof item !== "object") return {size:1,height:1};
                let size=1,height=1;
                for(const entry of Object.values(item)){const child=plain(entry);size+=child.size;height=Math.max(height,child.height+1);if(size>100000||height>MAX_DEPTH)fail("expanded graph budget exceeded");}
                return {size,height};
            }
            return plain(value);
        }
        let total=1,height=1;
        for (const child of Object.values(value)) {
            const nested=weight(child);total+=nested.size;height=Math.max(height,nested.height+1);
            if (total>100000 || height>MAX_DEPTH) fail("expanded graph budget exceeded");
        }
        return {size:total,height};
    }
    weight(doc.root);for (const id of table.keys()) weight({$ref:id});
    return {doc,table};
}

export function decodeMathematicalJSON(source) {
    const {doc,table}=validateDocument(source), memo=new Map();
    function decode(value,depth=0) {
        if (depth>MAX_DEPTH) fail("graph depth budget exceeded");
        if (value === null) return null;
        if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected tagged value");
        const keys=Object.keys(value);if (keys.length!==1) fail("invalid value tag");
        if (keys[0]==="$integer") return new Integer(integer(value.$integer));
        if (keys[0]==="$rational") {
            const parts=list(value.$rational);if (parts.length!==2) fail("invalid rational");
            const n=integer(parts[0]),d=integer(parts[1]);if (d<=0n) fail("nonpositive denominator");
            const rational=new Rational(n,d);if (rational.numerator!==n || rational.denominator!==d) fail("noncanonical rational");return rational;
        }
        if (keys[0]==="$string") return text(string(value.$string));
        if (keys[0]==="$undecided" && value.$undecided === true) return UNDECIDED;
        if (keys[0]!=="$ref" || !table.has(value.$ref)) fail("unknown tag or reference");
        if (memo.has(value.$ref)) return memo.get(value.$ref);
        const n=table.get(value.$ref), child=value=>decode(value,depth+1);
        const shape=(...names)=>fields(n,["id","kind",...names]);
        let result;
        switch(n.kind) {
            case "symbol": {
                shape("name","bound","definition");string(n.name);
                if (!n.name || typeof n.bound!=="boolean") fail("invalid symbol");
                result=freshExpressionSymbol(n.name,n.bound);
                if (n.definition!==null) restoreExpressionDefinition(result,child(n.definition));
                break;
            }
            case "constant": shape("value");result=expressionConstant(child(n.value));break;
            case "operator": shape("operation","operands");result=expressionOperation(string(n.operation),list(n.operands).map(child));break;
            case "apply": shape("semanticId","name","arguments");result=expressionApplication(string(n.semanticId),string(n.name),list(n.arguments).map(child));break;
            case "interval": shape("start","end");result=new RationalInterval(exact(child(n.start)),exact(child(n.end)));break;
            case "namedConstant": {
                shape("semanticId");
                if(n.semanticId!=="rix.constant.pi@1") fail("unknown named constant semantic ID");
                result=exactPi();break;
            }
            case "generator": {
                shape("name","category","real","positiveRoot","polynomial");
                if (typeof n.real!=="boolean" || typeof n.positiveRoot!=="boolean") fail("invalid generator flags");
                const polynomial=n.polynomial === null ? null : list(n.polynomial).map(value=>exact(child(value)));
                if (polynomial && polynomial.length>64) fail("generator degree budget exceeded");
                result=createExactGenerator(string(n.name),{category:string(n.category),real:n.real,positiveRoot:n.positiveRoot,minimalPolynomial:polynomial});break;
            }
            case "exact": {
                shape("terms");const terms=new Map();
                for (const term of list(n.terms)) {
                    fields(term,["coefficient","powers"]);const coefficient=exact(child(term.coefficient)),powers=new Map();
                    for (const pair of list(term.powers)) {
                        if (!Array.isArray(pair) || pair.length!==2) fail("invalid generator power");
                        const generator=child(pair[0]),exponent=pair[1];
                        if (generator?.type!=="exact_generator" || !Number.isSafeInteger(exponent) || exponent<1 || exponent>10000 || powers.has(generator)) fail("invalid generator power");
                        powers.set(generator,exponent);
                    }
                    const key=[...powers].sort(([a],[b])=>a.id.localeCompare(b.id)).map(([g,e])=>`${g.id}^${e}`).join("|");
                    if (terms.has(key)) fail("duplicate exact term");terms.set(key,{coefficient,powers});
                }
                result={type:"exact_expression",terms};break;
            }
            case "real": {
                shape("envelope");result=decodeRefinableReal(JSON.stringify(n.envelope));break;
            }
            case "tuple": case "sequence": shape("values");result={type:n.kind,values:list(n.values).map(child)};break;
            case "map": {
                shape("entries");const entries=new Map();
                for (const pair of list(n.entries)) {
                    if (!Array.isArray(pair) || pair.length!==2 || entries.has(string(pair[0]))) fail("invalid or duplicate map key");
                    entries.set(pair[0],child(pair[1]));
                }
                if (entries.get("schema")?.value === "rix.math.context@1") {
                    entries.set("consistency",text("unresolved"));entries.set("validation",text("unverifiedImport"));
                }
                result=immutable(entries);break;
            }
            default: fail("unknown node kind");
        }
        memo.set(n.id,result);return result;
    }
    // Reject malformed unreachable records as well as the selected root.
    for (const id of table.keys()) decode({$ref:id});
    return decode(doc.root);
}

export const mathematicalJSONCapabilities={
    ...realJSONCapabilities,
    MathEncodeJSON:{impl:([value])=>text(encodeMathematicalJSON(value)),pure:false,groups:["Symbolic"],doc:"Encode an inert document-local mathematical graph"},
    MathDecodeJSON:{impl:([value])=>decodeMathematicalJSON(value?.type === "string" ? value.value : value),pure:false,groups:["Symbolic"],doc:"Load fresh identities and frozen real snapshots without executing code"},
    MathEncodeJSONL:{impl:([values])=> {
        if (!["sequence","tuple"].includes(values?.type) || values.values.length>1000) fail("JSONL requires at most 1000 values");
        const lines=values.values.map(encodeMathematicalJSON).join("\n"),output=lines ? lines+"\n" : "";
        if (output.length>MAX_TEXT) fail("JSONL text budget exceeded");return text(output);
    },pure:false,groups:["Symbolic"],doc:"Encode independent mathematical documents, one per line"},
    MathDecodeJSONL:{impl:([value])=> {
        const source=value?.type === "string" ? value.value : value;
        if (typeof source!=="string" || source.length>MAX_TEXT) fail("JSONL text budget exceeded");
        const lines=source.split(/\r?\n/);if (lines.at(-1)==="") lines.pop();
        if (lines.length>1000 || lines.some(line=>!line.trim())) fail("JSONL line budget or blank line");
        return {type:"sequence",values:lines.map((line,index)=>{try{return decodeMathematicalJSON(line);}catch(error){fail(`line ${index+1}: ${error.message}`);}})};
    },pure:false,groups:["Symbolic"],doc:"Decode independent bounded JSONL documents without executing code"},
};
