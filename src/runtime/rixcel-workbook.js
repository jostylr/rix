/** Explicit workbook namespaces and synchronous, atomic multi-document epochs. */
import { Integer, Rational } from '@ratmath/core';
import { createReactiveGraph } from './reactive-graph.js';
import { deepCopyValue } from './cell.js';
import { parseRixCelDocument, replayRixCelDocument, appendRixCelEvent, rixCelSlotId } from './rixcel-document.js';
import { encodeMathematicalJSON, decodeMathematicalJSON } from './math-json.js';
import { tokenize } from '../parser/tokenizer.js';

export const RIXCEL_WORKBOOK_FORMAT = 'rixcel-workbook';
export const RIXCEL_WORKBOOK_LIMITS = Object.freeze({ documents:32, nodes:4096, reads:50000, evaluations:8192, sourceLength:65536, textLength:8000000, maxSteps:200000, maxTimeMs:2000, refreshTimeMs:5000, refreshConcurrent:4 });
const fail = message => { throw new Error(`RiXCel workbook: ${message}`); };
const str = value => value?.type==='string' ? value.value : value;
function identifier(value,label) { value=str(value); if(typeof value!=='string'||!value.length||value.length>128||/[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} must be a string of 1..128 characters`); return value; }
function ownRecord(value,label) { if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain record`); return value; }
function data(value,depth=0,seen=new Set()) {
    if(depth>64) fail('data nesting exceeds 64');
    if(value===null||typeof value==='string'||typeof value==='boolean') return value;
    if(typeof value==='number'&&Number.isFinite(value)) return value;
    if(!value||typeof value!=='object'||seen.has(value)) fail('records must contain acyclic JSON data, not executable values');
    if(!Array.isArray(value)) ownRecord(value,'data');
    else if(Object.keys(value).length!==value.length||Object.keys(value).some((key,index)=>key!==String(index))) fail("arrays must be dense JSON data");
    seen.add(value);
    const entries=Object.keys(value).map(key=>{ const descriptor=Object.getOwnPropertyDescriptor(value,key); if(!Object.hasOwn(descriptor,'value')) fail('accessors are not portable data'); return [key,data(descriptor.value,depth+1,seen)]; });
    seen.delete(value);
    return Array.isArray(value)?entries.map(([,item])=>item):Object.fromEntries(entries);
}
const clone=value=>data(value);
function dictionary(value,convert,label) {
    ownRecord(value??{},label); const result=Object.create(null);
    for(const [key,entry] of Object.entries(value??{})) { const name=identifier(key,label).toLowerCase(); if(Object.hasOwn(result,name)) fail(`duplicate ${label}: ${name}`); result[name]=convert(entry); }
    return result;
}
function exactIndex(value) {
    const number=value instanceof Integer?Number(value.value):value instanceof Rational&&value.denominator===1n?Number(value.numerator):typeof value==='bigint'?Number(value):value;
    if(!Number.isSafeInteger(number))fail('coordinates and offsets must be exact integers');
    return number;
}
function indexOf(value,shape) {
    if(!Array.isArray(value)||value.length!==shape.length) fail('slot coordinate rank mismatch');
    return value.map((item,axis)=>{ const n=exactIndex(item); if(!Number.isSafeInteger(n)||n<1||n>shape[axis]) fail(`slot coordinate out of bounds on axis ${axis+1}`); return n; });
}
function target(value,shape) {
    ownRecord(value,'definition'); const keys=['index','source','name'].filter(key=>Object.hasOwn(value,key));
    if(keys.length!==1||Object.keys(value).length!==1) fail('definition requires exactly one index, source or owned name');
    if(keys[0]==='index') return {index:indexOf(value.index,shape)};
    if(keys[0]==='name') return {name:identifier(value.name,'owned name').toLowerCase()};
    if(typeof value.source!=='string'||!value.source.trim()||value.source.length>RIXCEL_WORKBOOK_LIMITS.sourceLength) fail('definition source is empty or exceeds its limit');
    return {source:value.source};
}
export function parseRixCelWorkbook(input) {
    if(typeof input==='string') { if(input.length>RIXCEL_WORKBOOK_LIMITS.textLength) fail('workbook text limit exceeded'); input=JSON.parse(input); }
    input=clone(input); ownRecord(input,'workbook');
    if(JSON.stringify(input).length>RIXCEL_WORKBOOK_LIMITS.textLength) fail('workbook text limit exceeded');
    if(input.format!==RIXCEL_WORKBOOK_FORMAT||input.version!==1) fail('unsupported workbook format/version');
    if(!Array.isArray(input.documents)||!input.documents.length||input.documents.length>RIXCEL_WORKBOOK_LIMITS.documents) fail('documents must contain 1..32 records');
    const ids=new Set();
    const documents=input.documents.map(record=>{
        ownRecord(record,'document record'); const document=parseRixCelDocument(record.document); identifier(document.id,'document ID');
        if(ids.has(document.id)) fail(`duplicate document ID: ${document.id}`); ids.add(document.id);
        return {document,names:dictionary(record.names,v=>target(v,document.shape),'name'),exports:dictionary(record.exports,v=>target(v,document.shape),'export'),imports:dictionary(record.imports,v=>{
            ownRecord(v,'import');
            if(Object.keys(v).length===1&&Object.hasOwn(v,'external')) return {external:identifier(v.external,'external source')};
            if(Object.keys(v).length!==2||!Object.hasOwn(v,'document')||!Object.hasOwn(v,'export')) fail('import needs document/export or external');
            return {document:identifier(v.document,'import document'),export:identifier(v.export,'import export').toLowerCase()};
        },'import')};
    });
    ownRecord(input.external??{},"external sources");
    const external=Object.fromEntries(Object.entries(input.external??{}).map(([id,record])=>{
        identifier(id,'external source'); ownRecord(record,'external snapshot');
        if(typeof record.value!=='string') fail('external snapshot value must be mathematical JSON text');
        decodeMathematicalJSON(record.value); ownRecord(record.metadata,'source metadata');
        identifier(record.metadata.source,'source metadata.source'); identifier(record.metadata.version,'source metadata.version');
        return [id,{value:record.value,metadata:clone(record.metadata)}];
    }));
    if(Object.keys(external).length>32) fail('external source limit exceeded');
    const result={format:RIXCEL_WORKBOOK_FORMAT,version:1,documents,external};
    for(const record of documents) for(const entry of Object.values(record.imports)) {
        if(entry.external) { if(!Object.hasOwn(external,entry.external)) fail(`missing external source: ${entry.external}`); }
        else { const owner=documents.find(r=>r.document.id===entry.document); if(!owner||!Object.hasOwn(owner.exports,entry.export)) fail(`missing owned export: ${entry.document}.exports.${entry.export}`); }
    }
    return result;
}
export function createRixCelWorkbookDocument(documents,external={}) { return parseRixCelWorkbook({format:RIXCEL_WORKBOOK_FORMAT,version:1,documents,external}); }
export function stringifyRixCelWorkbook(value) { return JSON.stringify(parseRixCelWorkbook(value),null,2); }

function namespace(get) { return Object.freeze({type:'map',entries:new Map(),_ext:new Map([['GET',{type:'method_builtin',name:'Get',impl:([_self,...args])=>get(...args)}]])}); }
function remapIndex(index,oldDoc,newDoc) {
    const old=oldDoc.events.slice(0,oldDoc.cursor),next=newDoc.events.slice(0,newDoc.cursor);let common=0;
    while(common<old.length&&common<next.length&&JSON.stringify(old[common])===JSON.stringify(next[common])) common++;
    const result=[...index];
    for(const event of old.slice(common).reverse()) if(event.type==='axis:insert') {
        const a=event.axis-1;if(result[a]>=event.coordinate&&result[a]<event.coordinate+event.count) fail('owned slot was removed by structural undo; update its definition in the same transaction');
        if(result[a]>=event.coordinate+event.count) result[a]-=event.count;
    }
    for(const event of next.slice(common)) if(event.type==='axis:insert'&&result[event.axis-1]>=event.coordinate) result[event.axis-1]+=event.count;
    return indexOf(result,newDoc.shape);
}

/** No ambient evaluator or provider is installed by parsing a workbook. */
export function createRixCelWorkbook(input,options={}) {
    if(typeof options.compileFormula!=='function'||typeof options.runFormula!=='function') fail('requires an explicit formula compiler and isolated evaluator');
    const limits={...RIXCEL_WORKBOOK_LIMITS};
    for(const [key,value] of Object.entries(options.limits??{})) { if(!Object.hasOwn(limits,key)||!Number.isSafeInteger(value)||value<1||value>limits[key]) fail(`invalid limit: ${key}`); limits[key]=value; }
    let specification=null,current=null,epoch=0,disposed=false,updating=false;
    const listeners=new Set(),pending=new Map(),schedules=new Set(),views=new Map();
    const check=()=>{if(disposed) fail('workbook is disposed');};
    const notify=event=>{for(const listener of [...listeners]) try{listener(event);}catch(error){try{options.onListenerError?.(error);}catch{}}};
    function build(spec,requested=[]) {
        let reads=0,evaluations=0; const started=Date.now(),labels=new Map(),definitions=new Map(),records=new Map(),slotNodes=new Map(),externalNodes=new Map();
        let graph;
        const checkpoint=()=>{check();if(++reads>limits.reads||Date.now()-started>limits.maxTimeMs) fail('epoch read/time budget exceeded');};
        const add=(label,evaluator,source=null)=>{
            if(graph.nodeCount>=limits.nodes) fail('materialized node budget exceeded');
            const key=`n${graph.nodeCount}`; labels.set(key,label);
            graph.addComputed(key,{fn:'DEFER',args:[]},{initialize:false,source,evaluator(){checkpoint();if(++evaluations>limits.evaluations) fail('epoch evaluation budget exceeded');return evaluator();}});
            return key;
        };
        graph=createReactiveGraph({id:'workbook',evaluateFormula(){fail('missing node evaluator');},cycleLabel:'Workbook cycle',labelForNode:key=>labels.get(key)});
        const read=key=>{checkpoint();return deepCopyValue(graph.get(key));};
        function definitionKey(id,kind,name) { const key=definitions.get(`${id}\0${kind}\0${name}`);if(key===undefined) fail(`missing ${id}.${kind}.${name}`); return key; }
        function slotKey(id,index) {
            const record=records.get(id);if(!record) fail(`unknown document: ${id}`);index=indexOf(index,record.document.shape);
            const address=`${id}\0${index.join(',')}`;if(slotNodes.has(address)) return slotNodes.get(address).key;
            const slot=record.slots.get(index.join(','))??{...record.document.defaultSlot,index,id:rixCelSlotId(record.document,index)};
            if(slot.source.length>limits.sourceLength) fail('formula source limit exceeded');
            const formula=options.compileFormula(slot.source),key=add(`${id}.grid[${index.join(',')}]`,()=>run(id,formula,index),slot.source);
            slotNodes.set(address,{key,slot,id});return key;
        }
        function run(id,formula,index=null) {
            const owner=records.get(id);
            const grid={type:'formula_sheet',shape:owner.document.shape,rank:owner.document.shape.length,get:coords=>read(slotKey(id,coords))};
            const bindings={grid,book:namespace((document,name)=>read(definitionKey(identifier(document,'document'),'exports',identifier(name,'export').toLowerCase()))),names:namespace(name=>read(definitionKey(id,'names',identifier(name,'name').toLowerCase()))),imports:namespace(name=>read(definitionKey(id,'imports',identifier(name,'import').toLowerCase())))};
            if(index) Object.assign(bindings,{index:{type:'tuple',values:index.map(n=>new Integer(BigInt(n)))},row:new Integer(BigInt(index[0])),...(index.length>1?{col:new Integer(BigInt(index[1]))}:{}),near:{type:'formula_near',rank:index.length,index,get:offsets=>{if(offsets.length!==index.length)fail('near rank mismatch');return grid.get(offsets.map((n,a)=>index[a]+exactIndex(n)));}}});
            return options.runFormula(formula,bindings,{reactiveGraph:graph});
        }
        function resolve(id,entry,formula) { if(entry.index) return read(slotKey(id,entry.index));if(entry.name) return read(definitionKey(id,'names',entry.name));return run(id,formula); }
        for(const record of spec.documents) { const replay=replayRixCelDocument(record.document);records.set(record.document.id,{...record,...replay,slots:new Map(replay.slots.map(slot=>[slot.index.join(','),slot]))}); }
        for(const [id,record] of Object.entries(spec.external)) externalNodes.set(id,add(`external.${id}`,()=>decodeMathematicalJSON(record.value)));
        for(const [id,record] of records) for(const kind of ['names','exports','imports']) for(const [name,entry] of Object.entries(record[kind])) {
            if(entry.source?.length>limits.sourceLength)fail("definition source limit exceeded");
            const formula=entry.source?options.compileFormula(entry.source):null;
            const key=add(`${id}.${kind}.${name}`,()=>kind==='imports'?read(entry.external?externalNodes.get(entry.external):definitionKey(entry.document,'exports',entry.export)):resolve(id,entry,formula),entry.source);
            definitions.set(`${id}\0${kind}\0${name}`,key);
        }
        for(const [id,record] of records) for(const slot of record.slots.values()) slotKey(id,slot.index);
        for(const {id,index} of requested) if(records.has(id)) slotKey(id,index);
        graph.recalculate();
        return {graph,records,slotNodes,labels,definitions,reads,evaluations,elapsedMs:Date.now()-started};
    }
    function replace(next,requested=null) {
        check();if(updating) fail('nested workbook update');updating=true;
        try{
            const spec=parseRixCelWorkbook(next);if(spec.documents.length>limits.documents||JSON.stringify(spec).length>limits.textLength) fail('document/text budget exceeded');
            const demand=requested??[...(current?.slotNodes.values()??[])].filter(({id})=>spec.documents.some(r=>r.document.id===id)).map(({id,slot})=>({id,index:slot.index})).filter(({id,index})=>{const shape=spec.documents.find(r=>r.document.id===id).document.shape;return index.length===shape.length&&index.every((n,a)=>n<=shape[a]);});
            const candidate=options.withEpoch?options.withEpoch(()=>build(spec,demand),limits):build(spec,demand);
            if(candidate?.then) fail('workbook epochs cannot suspend');
            const previousEpoch=epoch;specification=spec;current=candidate;epoch++;
            const event=Object.freeze({type:'workbook:commit',epoch,previousEpoch,documents:Object.freeze(spec.documents.map(r=>r.document.id)),work:Object.freeze({reads:candidate.reads,evaluations:candidate.evaluations,nodes:candidate.graph.nodeCount,elapsedMs:candidate.elapsedMs})});
            // All visible documents are committed; reject reentrant updates during notification.
            notify(event);return api;
        }finally{updating=false;}
    }
    function recordFor(id){check();const record=current.records.get(id);if(!record)fail(`unknown document: ${id}`);return record;}
    function ensure(id,index){const record=recordFor(id);index=indexOf(index,record.document.shape);const key=`${id}\0${index.join(',')}`;if(!current.slotNodes.has(key)) replace(specification,[...[...current.slotNodes.values()].map(({id,slot})=>({id,index:slot.index})),{id,index}]);return current.slotNodes.get(key);}
    const api={
        get epoch(){return epoch;},get disposed(){return disposed;},get work(){check();return Object.freeze({nodes:current.graph.nodeCount,reads:current.reads,evaluations:current.evaluations,elapsedMs:current.elapsedMs});},
        export(){check();return clone(specification);},replace,
        transaction(changes){check();if(!Array.isArray(changes)||changes.length>limits.documents)fail('invalid document transaction');const next=clone(specification),seen=new Set();
            for(const change of changes){const id=identifier(change.id,'document ID');if(seen.has(id))fail(`duplicate transaction document: ${id}`);seen.add(id);const record=next.documents.find(r=>r.document.id===id);if(!record)fail(`unknown document: ${id}`);
                const document=change.document?parseRixCelDocument(change.document):record.document;if(document.id!==id)fail('cannot change document identity');
                const structural=JSON.stringify(record.document.events.slice(0,record.document.cursor).filter(e=>e.type==='axis:insert'))!==JSON.stringify(document.events.slice(0,document.cursor).filter(e=>e.type==='axis:insert'))||JSON.stringify(record.document.shape)!==JSON.stringify(document.shape);
                for(const kind of ['names','exports']) if(change[kind]===undefined&&structural) record[kind]=Object.fromEntries(Object.entries(record[kind]).map(([name,entry])=>{
                    if(entry.index)return [name,{index:remapIndex(entry.index,record.document,document)}];
                    if(entry.source&&tokenize(entry.source).some(t=>t.type==='Identifier'&&['grid','near'].includes(t.value)))fail(`structural edit needs explicit ${id}.${kind}.${name} source update in the same transaction`);
                    return [name,entry];
                }));
                record.document=document;for(const key of ['names','exports','imports'])if(change[key]!==undefined)record[key]=change[key];
            }return replace(next);},
        edit(id,event){const record=recordFor(id);return api.transaction([{id,document:appendRixCelEvent(record.document,event)}]);},
        get(id,name){check();const key=current.definitions.get(`${id}\0exports\0${identifier(name,'export').toLowerCase()}`);if(key===undefined)fail(`missing owned export: ${id}.${name}`);return deepCopyValue(current.graph.get(key));},
        dependencies(id,name){check();const key=current.definitions.get(`${id}\0exports\0${identifier(name,'export').toLowerCase()}`);if(key===undefined)fail('unknown export');return [...current.graph.node(key).dependencies].map(k=>current.labels.get(k));},
        sheet(id){recordFor(id);if(views.has(id))return views.get(id);const view={type:'formula_sheet',id,get shape(){return [...recordFor(id).document.shape];},get rank(){return this.shape.length;},get documentView(){return clone(recordFor(id).view);},get epoch(){check();return epoch;},get materializedSlotCount(){check();return [...current.slotNodes.values()].filter(s=>s.id===id).length;},get(index){const {key}=ensure(id,index);return deepCopyValue(current.graph.get(key));},slot(index){const {key,slot}=ensure(id,index),node=current.graph.node(key);return Object.freeze({...clone(slot),index:[...index],value:deepCopyValue(node.value),lastGoodValue:deepCopyValue(node.value),state:'clean',dependencies:[...node.dependencies].map(k=>current.labels.get(k)),diagnostics:[],diagnosticKind:null,diagnosticSource:null});},materializedSlots(){check();return [...current.slotNodes.values()].filter(s=>s.id===id).map(s=>view.slot(s.slot.index));},subscribe(listener){return api.subscribe(event=>listener({...event,type:'formula:commit',sheet:view,changed:view.materializedSlots().map(s=>s.index)}));},toString(){return `[Workbook sheet ${id}]`;}};views.set(id,view);return view;},
        materialize(id,indices){check();if(!Array.isArray(indices)||indices.length>limits.nodes)fail('materialization budget exceeded');const shape=recordFor(id).document.shape;const missing=indices.map(index=>indexOf(index,shape)).filter(index=>!current.slotNodes.has(`${id}\0${index.join(',')}`));if(missing.length)replace(specification,[...[...current.slotNodes.values()].map(({id,slot})=>({id,index:slot.index})),...missing.map(index=>({id,index}))]);return api.sheet(id);},
        subscribe(listener){check();if(typeof listener!=='function')fail('listener must be callable');listeners.add(listener);return()=>listeners.delete(listener);},
        async refresh(id){check();if(updating)fail('cannot refresh during an epoch');if(!Object.hasOwn(specification.external,id))fail(`unknown external source: ${id}`);const provider=options.providers&&Object.hasOwn(options.providers,id)?options.providers[id]:null;if(typeof provider!=='function')fail(`no explicit refresh provider for ${id}`);if(pending.has(id))fail(`refresh already in progress: ${id}`);if(pending.size>=limits.refreshConcurrent)fail('refresh concurrency budget exceeded');
            const revision=epoch,controller=new AbortController();pending.set(id,controller);let timer;
            try{
                const cancelled=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(controller.signal.reason??new Error('refresh cancelled')),{once:true});timer=setTimeout(()=>controller.abort(new Error('external refresh time budget exceeded')),limits.refreshTimeMs);});
                const result=await Promise.race([Promise.resolve().then(()=>provider({signal:controller.signal,metadata:clone(specification.external[id].metadata)})),cancelled]);
                check();if(revision!==epoch)fail('stale external refresh; workbook changed while waiting');
                const next=clone(specification);next.external[id]={value:encodeMathematicalJSON(result.value),metadata:clone(result.metadata)};replace(next);return api.getExternal(id);
            }finally{clearTimeout(timer);if(pending.get(id)===controller)pending.delete(id);}
        },
        getExternal(id){check();const record=Object.hasOwn(specification.external,id)?specification.external[id]:null;if(!record)fail('unknown external source');return {value:decodeMathematicalJSON(record.value),metadata:clone(record.metadata)};},
        schedule(id,intervalMs){check();if(options.hostPolicy?.allowScheduledRefresh!==true)fail('scheduled refresh requires explicit host policy');if(!Number.isSafeInteger(intervalMs)||intervalMs>2147483647||intervalMs<Math.max(1000,options.hostPolicy.minimumIntervalMs??1000))fail('scheduled interval must meet host minimum and be at most 2147483647ms');if(!Object.hasOwn(specification.external,id)||(!options.providers||!Object.hasOwn(options.providers,id)||typeof options.providers[id]!=='function'))fail('schedule needs an explicit source/provider');if(schedules.size>=32)fail('schedule limit exceeded');const clock=options.clock??globalThis;const timer=clock.setInterval(()=>{if(!disposed&&!pending.has(id))api.refresh(id).catch(error=>notify(Object.freeze({type:'workbook:refresh-error',source:id,message:error.message,epoch})));},intervalMs);const cancel=()=>{clock.clearInterval(timer);schedules.delete(cancel);};schedules.add(cancel);return cancel;},
        dispose(){if(disposed)return;disposed=true;for(const cancel of [...schedules])cancel();for(const controller of pending.values())controller.abort(new Error('workbook disposed'));pending.clear();listeners.clear();views.clear();current=null;specification=null;},
    };
    replace(input,[]);return api;
}
