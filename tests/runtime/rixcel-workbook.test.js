import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {parseRixCelWorkbook,createRixCelWorkbookDocument,createRixCelDocument} from '../../src/index.js';
const document=createRixCelDocument({id:'data',shape:[2,2]});
test('workbook parsing is inert, rejects accessors and requires dense portable data',()=>{
 let called=0;const input={format:'rixcel-workbook',version:1,get documents(){called++;return[];}};
 expect(()=>parseRixCelWorkbook(input)).toThrow('accessors');expect(called).toBe(0);
 expect(()=>createRixCelWorkbookDocument(Array(2))).toThrow('dense');
 expect(()=>createRixCelWorkbookDocument([{document,names:{bad:{source:()=>{called++;}}}}])).toThrow('JSON data');expect(called).toBe(0);
});
test('owned definitions canonicalize names, reject ambiguities and do not implicitly import documents',()=>{
 const record=createRixCelWorkbookDocument([{document,names:{Rate:{source:'1/3'}},exports:{Value:{name:'RATE'}}}]);
 expect(record.documents[0].names.rate.source).toBe('1/3');expect(record.documents[0].exports.value.name).toBe('rate');
 expect(()=>createRixCelWorkbookDocument([{document,names:{Tax:{source:'1'},tax:{source:'2'}}}])).toThrow('duplicate');
 expect(()=>createRixCelWorkbookDocument([{document,exports:{x:{source:'1',index:[1,1]}}}])).toThrow('exactly one');
 expect(()=>createRixCelWorkbookDocument([{document,imports:{x:{document:'elsewhere',export:'x'}}}])).toThrow('missing owned export');
 expect(()=>createRixCelWorkbookDocument([{document,exports:{['bad\0name']:{source:'1'}}}])).toThrow('string');
});
test('the shipped workbook example is canonical and its schema identifies the same protocol',()=>{
 const source=readFileSync(new URL('../../examples/rixcel/cross-sheet.rixbook',import.meta.url),'utf8');
 const record=parseRixCelWorkbook(source);expect(record).toEqual(JSON.parse(source));expect(record.documents).toHaveLength(2);
 const schema=JSON.parse(readFileSync(new URL('../../schemas/rixcel-workbook-v1.schema.json',import.meta.url),'utf8'));
 expect(schema.properties.format.const).toBe(record.format);expect(schema.properties.version.const).toBe(record.version);
});
