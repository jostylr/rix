import { expect, test } from 'bun:test';
import { appendRixCelEvent as append, createRixCelDocument as create, materializeRixCelDocument as snapshot, parseRixCelDocument, setRixCelCursor, parseAndEvaluate, formatValue, stringifyRixCelDocument, Context } from '../../src/index.js';
const set=(doc,index,source)=>append(doc,{type:'slot:set',index,source,assignmentMode:':=',view:{}});
const insert=(doc,axis,coordinate,count=1)=>append(doc,{type:'axis:insert',axis,coordinate,count});
const runtime=doc=>{const context=new Context();context.setFresh("hosttext",{type:"string",value:stringifyRixCelDocument(doc)});return {context}};
const model=doc=>parseAndEvaluate(`.RiXCelImport(hosttext)`,runtime(doc));

test('axis insertion retains exact formulas, reference targets, identities and complete undo/redo history',()=>{
 let d=create({id:'structure',shape:[2,3],view:{axisLabels:[['A','B'],['a','b','c']]}});
 d=set(d,[1,1],'2/3');d=set(d,[2,2],'grid[1,1]+near[-1,-1]');
 const before=d; const beforeModel=model(before); const id=beforeModel.slot([2,2]).id;
 d=insert(d,1,2,2);d=insert(d,2,1);
 const after=model(d);expect(d.shape).toEqual([4,4]);expect(before.shape).toEqual([2,3]);
 expect(after.slot([4,3]).source).toBe('grid[1,2]+near[-3,-1]');
 expect(after.slot([4,3]).id).toBe(id);expect(formatValue(after.get([4,3]))).toBe('1..1/3');
 expect(after.slot([2,3]).id).not.toBe(id);
 expect(after.documentView.axisLabels).toEqual([['A',null,null,'B'],[null,'a','b','c']]);
 const undone=setRixCelCursor(d,before.cursor);expect(undone.shape).toEqual([2,3]);expect(model(undone).slot([2,2]).id).toBe(id);
 const redone=setRixCelCursor(parseRixCelDocument(JSON.stringify(undone)),d.events.length);
 expect(snapshot(redone)).toEqual(snapshot(d));
 const changed=set(d,[4,3],'9');expect(model(changed).slot([4,3]).id).toBe(id);
 const fork=set(undone,[1,3],'8');expect(fork.shape).toEqual([2,3]);expect(fork.events.some(e=>e.type==='axis:insert')).toBe(false);
});
test('rank-N insertion is sparse and implicit cell identities also follow their old coordinates',()=>{
 let d=create({id:'huge',shape:[1000000,1000000,2],view:{viewAxes:[1,2],slice:[null,null,2]}});
 d=set(d,[1000000,1000000,2],'7/11');const old=model(d);const oldId=old.slot([5,5,2]).id;
 d=insert(d,3,1);const next=model(d);
 expect(next.shape).toEqual([1000000,1000000,3]);expect(next.materializedSlotCount).toBe(1);
 expect(next.slot([5,5,3]).id).toBe(oldId);expect(next.documentView.slice).toEqual([null,null,3]);
 expect(stringifyRixCelDocument(d).length).toBeLessThan(2000);
 expect(formatValue(next.get([1000000,1000000,3]))).toBe('7/11');
});
test('structural changes reject dynamic references atomically, including aliases, and preserve literal/comment text',()=>{
 for(const source of ['r:=1;grid[r,1]','g:=grid;g[1,1]','near[1+0,0]']){
  const d=set(create({shape:[2,2]}),[1,2],source);const saved=JSON.stringify(d);
  expect(()=>insert(d,1,1)).toThrow('dynamic reference');expect(JSON.stringify(d)).toBe(saved);
 }
 const d=set(create({shape:[2,2]}),[2,2],'grid[1,1] + 0 ### grid[2,2]\n');
 expect(snapshot(insert(d,1,1)).slots.find(s=>s.index.join()==='3,2').source).toBe('grid[2,1] + 0 ### grid[2,2]\n');
 expect(()=>insert(create({shape:[2,2],defaultSlot:{source:'grid[1,1]',assignmentMode:':='}}),1,1)).toThrow('implicit default');
 expect(()=>insert(d,3,1)).toThrow('axis');expect(()=>insert(d,1,4)).toThrow('coordinate');
});
test('canonical insertion commands return a new sheet, preserve history on export and leave the old sheet untouched',()=>{
 let d=set(create({id:'command',shape:[2,2]}),[1,1],'3/7');const insertion=insert(d,1,1).events.at(-1);
 const result=parseAndEvaluate(`document := .RiXCelImport(hosttext);old:=document;${insertion.command};document.SetSource(2,2,"grid[2,1]*2",":=");[old,document,.RiXCelExport(document)];`,runtime(d)).values;
 expect(result[0].shape).toEqual([2,2]);expect(result[1].shape).toEqual([3,2]);expect(formatValue(result[1].get([2,2]))).toBe('6/7');
 const saved=parseRixCelDocument(result[2].value);expect(saved.events.filter(e=>e.type==='axis:insert')).toHaveLength(1);
 expect(model(saved).slot([2,1]).id).toBe(result[0].slot([1,1]).id);
 expect(setRixCelCursor(saved,1).shape).toEqual([2,2]);
});
test('v2 imports migrate to v3 and forged active shape is rejected',()=>{
 const d=create({shape:[2,3]});const {initialShape,...v2}=d;expect(parseRixCelDocument({...v2,version:2}).initialShape).toEqual([2,3]);
 const inserted=insert(d,1,1);expect(()=>parseRixCelDocument({...inserted,shape:[20,3]})).toThrow('active history shape');
});
test('canonical source commands preserve quoted strings, newlines and null header labels',()=>{
 const d=append(create({id:'quoted',shape:[1,1]}),{type:'slot:set',index:[1,1],source:'"hello" ### ignored\n',assignmentMode:':='});
 const header=append(d,{type:'view:axis-label',axis:1,coordinate:1,label:null});
 const ctx=runtime(create({id:'quoted',shape:[1,1]}));
 const out=parseAndEvaluate(`document := .RiXCelImport(hosttext);${d.events[0].command};${header.events[1].command};document[1,1];`,ctx);
 expect(out.value).toBe('hello');
});
