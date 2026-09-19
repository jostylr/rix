import {test,expect} from 'bun:test';
import {Integer,Rational,RationalInterval} from '@ratmath/core';
import {Context,createDefaultRegistry,createDefaultSystemContext,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {decodeRefinableReal,encodeRefinableReal,inspectRefinableReal,refineImportedReal,RealRecipeRegistry} from '../../src/runtime/refinable-real-json.js';
import {encodeMathematicalJSON,decodeMathematicalJSON} from '../../src/runtime/math-json.js';
import {realConstantState} from '../../src/runtime/math-real.js';
const str=value=>({type:'string',value});
const field=(value,key)=>value.entries.get(key);
const scalar=n=>({$integer:String(n)});
const envelope=(graph={kind:'call',semanticId:'rix.function.sqrt@1',branch:'nonnegative',arguments:[{kind:'constant',value:scalar(2)}]})=>({schema:'rix.refinable-real@1',subject:{kind:'expression',graph},snapshot:{interval:{$interval:[scalar(1),scalar(2)]},status:'certified',evidenceLevel:'proof',verification:'checked',evidence:[],achievedWidth:scalar(1),work:{calls:'0',iterations:'0'}},recipe:{kind:'expression',provider:'numerics',providerVersion:'2',algorithm:'semantic-enclosure',algorithmVersion:'1',checker:'rix.real.numerics-replay@1',graph}});
const runtime=()=>({context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});
test('complete relation JSON/CSV/JSONL preserve schema, exact cells, empty text, missing values and oriented intervals',()=>{
 const rt=runtime();rt.context.set('note',str('comma,quote " and newline\n'));
 const value=parseAndEvaluate(`.Plugin.Load("data");r:=.data.Relation([{= id="big",type=:Integer,nullable=_},{= id="note",type=:String},{= id="range",type=:Interval}],[[123456789012345678901234567890,note,2:1],[2,_,1/3],[3," ".Slice(1,1),_]]); a:=.data.DecodeJSON(.data.EncodeJSON(r));b:=.data.ParseCSV(.data.RenderCSV(r));c:=.data.ParseJSONLDocument(.data.RenderJSONLDocument(r));[.data.EncodeJSON(r)==.data.EncodeJSON(a),.data.EncodeJSON(a)==.data.EncodeJSON(b),.data.EncodeJSON(b)==.data.EncodeJSON(c),.data.Schema(b),.data.Rows(c)];`,rt);
 expect(value.values.slice(0,3).map(v=>v.value)).toEqual([1n,1n,1n]);
 const rows=value.values[4].values;expect(field(rows[0],'big').value).toBe(123456789012345678901234567890n);expect(String(field(rows[0],'range').start)).toBe('2');expect(field(rows[1],'note')).toBeNull();expect(field(rows[2],'note').value).toBe('');
});
test('relation import bounds and malformed exact tags fail before cell use',()=>{
 const rt=runtime();parseAndEvaluate('.Plugin.Load("data");',rt);
 const base={schema:'rix.data.relation-document@1',columns:[{id:'n',label:'n',type:'Integer',nullable:false}],rows:[[scalar(1)]]};
 for(const mutate of [d=>d.rows=[[null]],d=>d.rows=[[{$integer:'01'}]],d=>d.rows=[[{$rational:['1','0']}]],d=>d.columns.push({...d.columns[0]}),d=>d.rows=[[]],d=>d.rows=[[{$integer:'1'.repeat(4097)}]]]){const doc=structuredClone(base);mutate(doc);rt.context.set('input',str(JSON.stringify(doc)));expect(()=>parseAndEvaluate('.data.DecodeJSON(input);',rt)).toThrow();}
});
test('real loading and graph roundtrips are inert, opaque imports have fresh identities, and exact data survives',()=>{
 const doc=envelope(),a=decodeRefinableReal(JSON.stringify(doc)),b=decodeRefinableReal(JSON.stringify(doc));
 expect(realConstantState(a).id).not.toBe(realConstantState(b).id);expect(field(inspectRefinableReal(a),'verification').value).toBe('unavailable');
 expect(encodeRefinableReal(a)).toBe(encodeRefinableReal(a));
 const pair=decodeMathematicalJSON(encodeMathematicalJSON({type:'sequence',values:[a,a]}));expect(pair.values[0]).toBe(pair.values[1]);expect(JSON.parse(encodeRefinableReal(pair.values[0]))).toEqual(doc);
});
test('unavailable and mismatched recipes preserve snapshots and never run callbacks',async()=>{
 const reg=new RealRecipeRegistry();let calls=0;reg.register({provider:'numerics',providerVersion:'3',algorithm:'semantic-enclosure',algorithmVersion:'1',checker:'rix.real.numerics-replay@1',refine(){calls++;},check(){calls++;}});
 const value=decodeRefinableReal(JSON.stringify(envelope()));await refineImportedReal(value,null,reg);expect(calls).toBe(0);expect(String(realConstantState(value).interval)).toBe('1:2');
 const doc=envelope();doc.recipe.graph={kind:'constant',value:scalar(9)};const wrong=decodeRefinableReal(JSON.stringify(doc));expect(field(await refineImportedReal(wrong,null,reg),'verification').value).toBe('unavailable');
});
test('provider replay failures and contradictory refinements retain the original enclosure',async()=>{
 const config={provider:'numerics',providerVersion:'2',algorithm:'semantic-enclosure',algorithmVersion:'1',checker:'rix.real.numerics-replay@1'};
 for(const checked of [false,true]){const reg=new RealRecipeRegistry().register({...config,refine:()=>({interval:new RationalInterval(new Rational(3),new Rational(4)),work:{calls:1,iterations:1}}),check:()=>checked});const value=decodeRefinableReal(JSON.stringify(envelope()));await refineImportedReal(value,null,reg);expect(String(realConstantState(value).interval)).toBe('1:2');expect(field(inspectRefinableReal(value),'verification').value).toBe('failed');}
});
test('installed Numerics refines and independently replays an explicit root recipe; reload downgrades evidence',async()=>{
 const rt=runtime();rt.context.set('input',str(JSON.stringify(envelope())));
 await parseAndEvaluateAsync('.Plugin.Load("numerics"); r:=.RealImportJSON(input); info:=.RealRefineImported(r,{= absTol=1/1000,width=1/1000,maxCalls=256,maxIterations=256});',rt);
 const info=parseAndEvaluate('.RealImportInfo(r);',rt);expect(field(info,'verification').value).toBe('providerChecked');expect(field(info,'interval').high.subtract(field(info,'interval').low).lessThan(new Rational(1,1000))).toBe(true);
 const exported=parseAndEvaluate('.RealExportJSON(r);',rt).value;expect(JSON.parse(exported).snapshot.evidence[0].checker).toBe('rix.real.numerics-replay@1');expect(field(inspectRefinableReal(decodeRefinableReal(exported)),'verification').value).toBe('unavailable');
},20000);
test('malformed, noncanonical, cyclic-depth and oversized real envelopes are rejected',()=>{
 const base=envelope();for(const mutate of [d=>d.snapshot.interval={$interval:[scalar(2),scalar(1)]},d=>d.snapshot.achievedWidth=scalar(0),d=>d.snapshot.work.calls='-1',d=>d.snapshot.interval.$interval[0]={$rational:['2','4']},d=>d.subject.graph.arguments[0].value=scalar('1'.repeat(4097))]){const d=structuredClone(base);mutate(d);expect(()=>decodeRefinableReal(JSON.stringify(d))).toThrow();}
 expect(()=>decodeRefinableReal(' '.repeat(2000001))).toThrow('budget');
 const d=structuredClone(base);for(let i=0;i<70;i++)d.metadata={child:d.metadata??{}};expect(()=>decodeRefinableReal(JSON.stringify(d))).toThrow('budget');
});
test('named constants, arithmetic and branch-labelled elementary recipes use installed exact providers',async()=>{
 const rt=runtime();await parseAndEvaluateAsync('.Plugin.Load("numerics");',rt);
 const constant=n=>({kind:'constant',value:scalar(n)});
 const graphs=[{kind:'namedConstant',semanticId:'rix.constant.pi@1'},{kind:'namedConstant',semanticId:'rix.constant.e@1'},...['exp','log','sin','cos','tan'].map(name=>({kind:'call',semanticId:`rix.function.${name}@1`,branch:name==='log'?'positive':name==='tan'?'poleFree':'real',arguments:[constant(name==='log'?1:0)]})),{kind:'divide',left:{kind:'power',base:constant(2),exponent:'3'},right:constant(4)},{kind:'add',left:{kind:'negate',argument:constant(2)},right:{kind:'multiply',left:constant(2),right:constant(3)}}];
 for(const graph of graphs){const doc=envelope(graph);doc.snapshot.interval={$interval:[scalar(-5),scalar(5)]};doc.snapshot.achievedWidth=scalar(10);rt.context.set('input',str(JSON.stringify(doc)));const info=await parseAndEvaluateAsync('r:=.RealImportJSON(input);.RealRefineImported(r,{= width=1/1000,maxCalls=1024,maxIterations=1024});',rt);expect(field(info,'verification').value).toBe('providerChecked');}
},20000);
test('real cells, graph documents and portable tables retain snapshots without activating recipes',()=>{
 const rt=runtime();rt.context.set('real',decodeRefinableReal(JSON.stringify(envelope())));
 const value=parseAndEvaluate('.Plugin.Load("data");r:=.data.Relation(["real"],[[real]]);r2:=.data.ParseCSV(.data.RenderCSV(r));.RealImportInfo(.data.Rows(r2)[1][:real]);',rt);
 expect(field(value,'verification').value).toBe('unavailable');expect(String(field(value,'interval'))).toBe('1:2');
});
test('missing capability, unsupported branches and narrow work retain the prior snapshot',async()=>{
 const rt=runtime();rt.context.set('input',str(JSON.stringify(envelope())));
 const absent=await parseAndEvaluateAsync('r:=.RealImportJSON(input);.RealRefineImported(r);',rt);expect(field(absent,'verification').value).toBe('unavailable');expect(String(field(absent,'interval'))).toBe('1:2');
 await parseAndEvaluateAsync('.Plugin.Load("numerics");',rt);const limited=await parseAndEvaluateAsync('.RealRefineImported(r,{= maxCalls=1 });',rt);expect(field(limited,'verification').value).toBe('unavailable');
 const doc=envelope();doc.subject.graph.branch='complex';rt.context.set('input',str(JSON.stringify(doc)));const unsupported=await parseAndEvaluateAsync('r:=.RealImportJSON(input);.RealRefineImported(r);',rt);expect(field(unsupported,'verification').value).toBe('unavailable');
});
test('existing ExpressionReal adapters export standalone snapshots and document persistence retains recipes',async()=>{
 const rt=runtime();const source=parseAndEvaluate('.Plugin.Load("numerics");.RealExportJSON(.ExpressionReal(.numerics.Sqrt(2)));',rt).value;
 const doc=JSON.parse(source);expect(doc.subject.kind).toBe('opaqueSingleton');expect(doc.recipe).toBeNull();
 const {encodeOutputJSON,decodeOutputJSON}=await import('../../src/runtime/output-json.js');
 const value=decodeRefinableReal(JSON.stringify(envelope()));const report={type:'output',kind:'table',columns:[{id:'r',label:'real',align:null,format:null}],rows:[[value]],caption:null,options:new Map()};
 const imported=decodeOutputJSON(encodeOutputJSON(report)).value.rows[0][0];expect(JSON.parse(encodeRefinableReal(imported))).toEqual(envelope());expect(field(inspectRefinableReal(imported),'verification').value).toBe('unavailable');
});
test('recipe-local reference spelling stays inert inside the enclosing mathematical graph',()=>{
 const doc=envelope();doc.recipe={kind:'futureRecipe',graph:{$ref:'provider-local-name'}};doc.metadata={document:{$ref:'not-a-math-node'}};
 const value=decodeRefinableReal(JSON.stringify(doc));const restored=decodeMathematicalJSON(encodeMathematicalJSON({type:'sequence',values:[value,value]}));expect(restored.values[0]).toBe(restored.values[1]);expect(JSON.parse(encodeRefinableReal(restored.values[0]))).toEqual(doc);
});
