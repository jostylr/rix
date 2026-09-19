/** Bounded inert real envelopes and explicitly invoked installed recipe providers. */
import { Integer, Rational, RationalInterval } from '@ratmath/core';
import { realConstantState, restoreRealSnapshot } from './math-real.js';

export const REFINABLE_REAL_SCHEMA='rix.refinable-real@1';
export const REAL_JSON_LIMITS=Object.freeze({text:2_000_000,nodes:8192,depth:64,digits:4096,evidence:128,graphNodes:128,calls:4096});
const fail=message=>{throw new Error(`Real interchange: ${message}`);};
const str=value=>({type:'string',value});
const field=(value,name)=>value?.entries?.get(name.toLowerCase());
const realState=value=>realConstantState(field(value,'kind')?.value==='constant'?field(value,'value'):value);
const one=value=>value instanceof Integer&&value.value===1n;
const record=entries=>({type:'map',entries:new Map(entries),_ext:new Map([['immutable',new Integer(1n)]])});
function tree(value,depth=0,budget={nodes:0}){
 if(typeof value==='number'&&!Number.isFinite(value))fail('nonfinite JSON number');
 if(++budget.nodes>REAL_JSON_LIMITS.nodes||depth>REAL_JSON_LIMITS.depth)fail('structure budget exceeded');
 if(value&&typeof value==='object')for(const child of Object.values(value))tree(child,depth+1,budget);
}
function clone(value){const source=JSON.stringify(value);if(source.length>REAL_JSON_LIMITS.text)fail('text budget exceeded');const result=JSON.parse(source);tree(result);return result;}
function integer(value){if(typeof value!=='string'||value.length>REAL_JSON_LIMITS.digits||!/^(0|-?[1-9][0-9]*)$/.test(value))fail('invalid or oversized exact integer');return BigInt(value);}
function exact(value){
 if(!value||typeof value!=='object'||Object.keys(value).length!==1)fail('requires exact scalar tag');
 if(Object.hasOwn(value,'$integer'))return new Rational(integer(value.$integer));
 if(Array.isArray(value.$rational)&&value.$rational.length===2){const [n,d]=value.$rational.map(integer);if(d<=0n)fail('nonpositive denominator');const r=new Rational(n,d);if(r.numerator!==n||r.denominator!==d)fail('noncanonical rational');return r;}
 fail('invalid scalar tag');
}
function encodeExact(value){const r=value instanceof Integer?new Rational(value.value):value;if(!(r instanceof Rational)||r.denominator<=0n)fail('requires finite exact scalar');integer(String(r.numerator));integer(String(r.denominator));return r.denominator===1n?{$integer:String(r.numerator)}:{$rational:[String(r.numerator),String(r.denominator)]};}
function interval(value){
 if(!value||Object.keys(value).length!==1||!Array.isArray(value.$interval)||value.$interval.length!==2)fail('invalid interval');
 const [low,high]=value.$interval.map(exact);if(low.greaterThan(high))fail('descending singleton enclosure');return new RationalInterval(low,high);
}
const encodeInterval=value=>({$interval:[encodeExact(value.low),encodeExact(value.high)]});
function short(value,label){if(typeof value!=='string'||!value.length||value.length>256)fail(`invalid ${label}`);return value;}
function shape(value,required,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail('unexpected or missing fields');}
function sorted(value){if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])]));return value;}
const stable=value=>JSON.stringify(sorted(value));
const METHODS=Object.freeze({'rix.function.sqrt@1':['Sqrt',1,'nonnegative'],'rix.function.exp@1':['Exp',1,'real'],'rix.function.log@1':['Log',1,'positive'],'rix.function.sin@1':['Sin',1,'real'],'rix.function.cos@1':['Cos',1,'real'],'rix.function.tan@1':['Tan',1,'poleFree']});
export const REAL_RECIPE_SEMANTICS=Object.freeze(['rix.constant.pi@1','rix.constant.e@1',...Object.keys(METHODS)]);
function graph(node,budget={nodes:0},depth=0){
 if(++budget.nodes>REAL_JSON_LIMITS.graphNodes||depth>32)fail('recipe graph budget exceeded');
 if(!node||typeof node!=='object')fail('invalid recipe graph');
 const child=value=>graph(value,budget,depth+1);
 switch(node.kind){
  case 'constant':shape(node,['kind','value']);exact(node.value);break;
  case 'namedConstant':shape(node,['kind','semanticId']);if(!REAL_RECIPE_SEMANTICS.slice(0,2).includes(node.semanticId))return false;break;
  case 'negate':shape(node,['kind','argument']);return child(node.argument);
  case 'add':case 'subtract':case 'multiply':case 'divide':shape(node,['kind','left','right']);{const left=child(node.left),right=child(node.right);return left&&right;}
  case 'power':shape(node,['kind','base','exponent']);if(integer(node.exponent)<-64n||integer(node.exponent)>64n)fail('power budget exceeded');return child(node.base);
  case 'call':shape(node,['kind','semanticId','branch','arguments']);short(node.semanticId,'semantic ID');short(node.branch,'branch');if(!Array.isArray(node.arguments)||node.arguments.length>8)fail('invalid call arguments');{const args=node.arguments.map(child);const entry=METHODS[node.semanticId];return !!entry&&entry[1]===args.length&&entry[2]===node.branch&&args.every(Boolean);}
  default:return false;
 }
 return true;
}
function subjectGraph(subject){return subject.kind==='namedConstant'?{kind:'namedConstant',semanticId:subject.semanticId}:subject.kind==='expression'?subject.graph:null;}
function validate(source){
 if(typeof source!=='string'||source.length>REAL_JSON_LIMITS.text)fail('text budget exceeded');
 let doc;try{doc=JSON.parse(source);}catch{fail('invalid JSON');}tree(doc);
 shape(doc,['schema','subject','snapshot','recipe'],['id','requirements','metadata']);if(doc.schema!==REFINABLE_REAL_SCHEMA)fail('unsupported version');
 if(doc.id!==undefined)short(doc.id,'document ID');
 if(!doc.subject||typeof doc.subject!=='object'||Array.isArray(doc.subject))fail('invalid subject');short(doc.subject.kind,'subject kind');
 if(doc.subject.kind==='opaqueSingleton'){shape(doc.subject,['kind','stableName']);short(doc.subject.stableName,'opaque name');}
 else if(doc.subject.kind==='namedConstant'){shape(doc.subject,['kind','semanticId']);short(doc.subject.semanticId,'constant ID');}
 else if(doc.subject.kind==='expression'){shape(doc.subject,['kind','graph']);graph(doc.subject.graph);}
 const s=doc.snapshot;shape(s,['interval','status','evidenceLevel','verification','evidence','achievedWidth','work']);
 const enclosure=interval(s.interval);if(!enclosure.high.subtract(enclosure.low).equals(exact(s.achievedWidth)))fail('inconsistent snapshot width');
 if(!['certified','assumed','approximate','unresolved'].includes(s.status)||!['checked','providerChecked','unavailable','failed'].includes(s.verification))fail('invalid evidence status');
 short(s.evidenceLevel,'evidence level');if(!Array.isArray(s.evidence)||s.evidence.length>REAL_JSON_LIMITS.evidence||s.evidence.some(item=>!item||typeof item!=='object'||Array.isArray(item)))fail('invalid evidence list');
 for(const evidence of s.evidence)if(evidence.schema==='rix.real.replay-evidence@1'){shape(evidence,['schema','checker','provider','providerVersion','algorithm','algorithmVersion','claim','premises','conclusion']);for(const key of ['checker','provider','providerVersion','algorithm','algorithmVersion'])short(evidence[key],key);interval(evidence.conclusion);if(stable(evidence.claim)!==stable(doc.subject))fail('replay evidence subject mismatch');}
 shape(s.work,['calls','iterations'],['exhausted']);if(integer(s.work.calls)<0n||integer(s.work.iterations)<0n)fail('negative work');if(s.work.exhausted!==undefined&&typeof s.work.exhausted!=='boolean')fail('invalid exhaustion');
 if(doc.recipe!==null){if(!doc.recipe||typeof doc.recipe!=='object'||Array.isArray(doc.recipe))fail('invalid recipe');short(doc.recipe.kind,'recipe kind');}
 if(doc.requirements!==undefined&&(!Array.isArray(doc.requirements)||doc.requirements.length>128))fail('invalid requirements');
 if(doc.metadata!==undefined&&(!doc.metadata||typeof doc.metadata!=='object'||Array.isArray(doc.metadata)))fail('invalid metadata');
 return {doc,enclosure};
}

/** Host-owned registry. Deserialized data can never register or discover code. */
export class RealRecipeRegistry {
 #providers=new Map();
 register({provider,providerVersion,algorithm,algorithmVersion,checker,refine,check}){
  for(const value of [provider,providerVersion,algorithm,algorithmVersion,checker])short(value,'provider identity');
  if(typeof refine!=='function'||typeof check!=='function')fail('provider requires refinement and an independent checker');
  const key=stable([provider,providerVersion,algorithm,algorithmVersion,checker]);if(this.#providers.has(key))fail('provider already registered');
  this.#providers.set(key,Object.freeze({provider,providerVersion,algorithm,algorithmVersion,checker,refine,check}));return this;
 }
 resolve(recipe){return recipe&&this.#providers.get(stable([recipe.provider,recipe.providerVersion,recipe.algorithm,recipe.algorithmVersion,recipe.checker]));}
}
export function decodeRefinableReal(source){
 const {doc,enclosure}=validate(source),value=restoreRealSnapshot(enclosure,doc.snapshot.evidenceLevel),state=realConstantState(value);
 // Wire certification is retained as a declaration, never accepted as a check.
 state.interchange={document:clone(doc),verification:'unavailable',diagnostics:['Imported evidence has not been replayed'],revision:0};return value;
}
export function encodeRefinableReal(value){
 const state=realState(value);if(!state)fail('requires mathematical real');
 const doc=state.interchange?.document??{schema:REFINABLE_REAL_SCHEMA,subject:{kind:'opaqueSingleton',stableName:'subject'},snapshot:{interval:encodeInterval(state.interval),status:state.source?'certified':'assumed',evidenceLevel:state.savedEvidence??state.evidence?.value??'declared',verification:'unavailable',evidence:[],achievedWidth:encodeExact(state.interval.high.subtract(state.interval.low)),work:{calls:'0',iterations:'0'}},recipe:null};
 const source=stable(doc);validate(source);return source;
}
export function inspectRefinableReal(value){
 const state=realState(value);if(!state)fail('requires mathematical real');const saved=state.interchange;
 return record([['schema',str('rix.real.import-state@1')],['interval',state.interval],['verification',str(saved?.verification??'unavailable')],['status',str(saved?.document.snapshot.status??'assumed')],['state',str(saved?.verification==='providerChecked'?'checkedSnapshot':'frozen')],['diagnostics',{type:'sequence',values:(saved?.diagnostics??['No portable recipe']).map(str)}],['subject',str(stable(saved?.document.subject??{kind:'opaqueSingleton'}))]]);
}
function request(options){
 if(options!==null&&options!==undefined&&options?.type!=="map")fail("refinement options require a map");
 const count=(name,fallback)=>{const x=field(options,name)??new Integer(BigInt(fallback));if(!(x instanceof Integer)||x.value<1n||x.value>BigInt(REAL_JSON_LIMITS.calls))fail(`${name} must be 1..4096`);return Number(x.value);};
 const width=field(options,'width')??new Rational(1n,1000000n);const scalar=width instanceof Integer?new Rational(width.value):width;if(!(scalar instanceof Rational)||scalar.numerator<=0n)fail('width must be positive exact scalar');encodeExact(scalar);
 return Object.freeze({width:scalar,maxCalls:count('maxcalls',256),maxIterations:count('maxiterations',256)});
}
export async function refineImportedReal(value,options,registry,runtime={}){
 const state=realState(value);if(!state?.interchange)fail('requires an imported real envelope');const saved=state.interchange,revision=saved.revision;
 const doc=clone(saved.document),r=doc.recipe,provider=registry?.resolve(r),sg=subjectGraph(doc.subject);
 const unavailable=message=>{saved.diagnostics=[message];return inspectRefinableReal(value);};
 if(!provider)return unavailable('Exact provider, algorithm or checker version is unavailable');
 if(!sg||!graph(sg)||r.kind!=='expression'||stable(r.graph)!==stable(sg))return unavailable('Recipe is unsupported or does not establish the saved subject');
 if((doc.requirements??[]).some(item=>item.provider!==provider.provider||item.providerVersion!==provider.providerVersion||item.algorithm!==provider.algorithm||item.algorithmVersion!==provider.algorithmVersion||item.checker!==provider.checker))return unavailable('A required provider/checker version is unavailable');
 const limits=request(options);if(limits.maxCalls<2||limits.maxIterations<2)return unavailable('Insufficient work budget for refinement and independent replay');
 const part={...limits,maxCalls:Math.floor(limits.maxCalls/2),maxIterations:Math.floor(limits.maxIterations/2)};
 try{
  const result=await provider.refine(clone(sg),part,runtime);
  if(!(result?.interval instanceof RationalInterval))return unavailable('Provider returned no finite enclosure');
  encodeInterval(result.interval);
  const checked=await provider.check(clone(sg),result,part,runtime);
  if(checked!==true){saved.verification='failed';return unavailable('Provider evidence replay failed');}
  if(saved.revision!==revision)return unavailable('Concurrent refinement changed the retained snapshot; retry explicitly');
  if(result.interval.low.lessThan(state.interval.low)||result.interval.high.greaterThan(state.interval.high)){
   if(result.interval.high.lessThan(state.interval.low)||result.interval.low.greaterThan(state.interval.high))saved.verification='failed';
   return unavailable('Checked result does not nest inside the saved enclosure; retained snapshot unchanged');
  }
  const work=result.work??{};const calls=Number(work.calls??0),iterations=Number(work.iterations??0);
  if(!Number.isSafeInteger(calls)||!Number.isSafeInteger(iterations)||calls<0||iterations<0||calls>part.maxCalls||iterations>part.maxIterations)fail('provider exceeded work contract');
  doc.snapshot={interval:encodeInterval(result.interval),status:'certified',evidenceLevel:'proof',verification:'providerChecked',evidence:[{schema:'rix.real.replay-evidence@1',checker:provider.checker,provider:provider.provider,providerVersion:provider.providerVersion,algorithm:provider.algorithm,algorithmVersion:provider.algorithmVersion,claim:clone(doc.subject),premises:{request:{width:encodeExact(limits.width),maxCalls:String(limits.maxCalls),maxIterations:String(limits.maxIterations)}},conclusion:encodeInterval(result.interval)}],achievedWidth:encodeExact(result.interval.high.subtract(result.interval.low)),work:{calls:String(calls*2),iterations:String(iterations*2)}};
  validate(stable(doc));state.interval=result.interval;saved.document=doc;saved.verification='providerChecked';saved.diagnostics=[];saved.revision++;return inspectRefinableReal(value);
 }catch(error){return unavailable(`Refinement unavailable: ${String(error?.message??error).slice(0,512)}`);}
}

async function numericsRefine(node,limits,runtime){
 if(typeof runtime.evaluate!=='function')fail('Numerics provider requires its permitted evaluator context');
 const call=(namespace,method,args=[])=>runtime.evaluate({fn:'CALL_METHOD',args:[{fn:'SYS_GET',args:[namespace]},method,...args]},runtime.context);
 let nodes=0;
 async function build(n){
  if(++nodes>REAL_JSON_LIMITS.graphNodes)fail('recipe graph budget exceeded');
  switch(n.kind){
   case 'constant':return exact(n.value);
   case 'namedConstant':return call('numerics','Constant',[str(n.semanticId==='rix.constant.pi@1'?'pi':'e')]);
   case 'negate':return call('oracle','Negate',[await build(n.argument)]);
   case 'add':case 'subtract':case 'multiply':case 'divide':return call('oracle',n.kind[0].toUpperCase()+n.kind.slice(1),[await build(n.left),await build(n.right)]);
   case 'power':{const power=Number(integer(n.exponent));let result=new Rational(1n),base=await build(n.base);for(let i=0;i<Math.abs(power);i++)result=await call('oracle','Multiply',[result,base]);return power<0?call('oracle','Reciprocal',[result]):result;}
   case 'call':return call('numerics',METHODS[n.semanticId][0],await Promise.all(n.arguments.map(build)));
   default:fail('unsupported recipe node');
  }
 }
 const value=await build(node),options=record([['abstol',limits.width],['maxcalls',new Integer(BigInt(limits.maxCalls))],['maxiterations',new Integer(BigInt(limits.maxIterations))]]);
 const result=await call('numerics','Refine',[value,options]),range=field(result,'interval');
 if(!one(field(result,'certified'))||!(range instanceof RationalInterval))fail('Numerics did not establish a certified singleton enclosure');
 const work=field(result,'work');return {interval:range,work:{calls:Number(field(work,'calls')?.value??0n),iterations:Number(field(work,'iterations')?.value??0n)}};
}
export function createDefaultRealRecipeRegistry(){return new RealRecipeRegistry().register({provider:'numerics',providerVersion:'2',algorithm:'semantic-enclosure',algorithmVersion:'1',checker:'rix.real.numerics-replay@1',refine:numericsRefine,async check(node,result,limits,runtime){const replay=await numericsRefine(node,limits,runtime);return replay.interval.low.equals(result.interval.low)&&replay.interval.high.equals(result.interval.high);}});}
const registry=createDefaultRealRecipeRegistry();
export const realJSONCapabilities={
 RealImportJSON:{impl:([source])=>decodeRefinableReal(source?.value??source),pure:false,doc:'Load a bounded frozen real envelope without executing recipes'},
 RealExportJSON:{impl:([value])=>str(encodeRefinableReal(value)),pure:false,doc:'Export a deterministic real envelope with exact scalar tags'},
 RealImportInfo:{impl:([value])=>inspectRefinableReal(value),pure:false,doc:'Inspect imported real evidence without activating a provider'},
 RealRefineImported:{impl:([value,options],context,evaluate)=>refineImportedReal(value,options,registry,{context,evaluate}),pure:false,doc:'Explicitly refine with an already-installed permitted Numerics provider and replay checker'},
};
