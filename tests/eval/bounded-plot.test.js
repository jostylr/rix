import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,formatValue,renderOutputHtml} from '../../src/index.js';
import {createGraphicsTextPlan} from '../../src/tools/graphic-accessibility.js';
const field=(v,k)=>v.entries.get(k.toLowerCase());
const meta=v=>v.metadata.get('plot');
const run=(s)=>parseAndEvaluate('.Plugin.Load("plot");'+s,{context:new Context()});
const rows='[[1,0],[2,9],[3,-7],[4,2],[5,0],[6,1],[7,-3],[8,1],[9,4],[10,0]]';
test('bounded min/max sampling preserves exact endpoints, bucket extrema and original identities',()=>{
 const result=run(`.plot.Downsample(${rows},{= maxPoints=6 })`);
 expect(field(result,'data').values.map(p=>p.values.map(String))).toEqual([['1','0'],['2','9'],['3','-7'],['7','-3'],['9','4'],['10','0']]);
 expect(field(result,'records').values.map(p=>field(p,'id').value)).toEqual(['sample-1','sample-2','sample-3','sample-7','sample-9','sample-10']);
 const sampling=field(result,'sampling');expect(String(field(sampling,'omittedCount'))).toBe('4');expect(field(sampling,'reconstruction').value).toBe('uncertified');
 const passthrough=run('.plot.Downsample([[1,1/3],[2,7/11]],{= maxPoints=4 })');expect(formatValue(field(passthrough,'data'))).toBe('[[1, 1/3], [2, 7/11]]');
});
test('bounded lines retain sampling disclosures in portable SVG and accessibility',()=>{
 const graphic=run(`.plot.BoundedLine(${rows},{= maxPoints=6,title="bounded" })`);
 const sampling=field(meta(graphic),'sampling');expect(String(field(sampling,'retainedCount'))).toBe('6');
 expect(field(meta(graphic),'records').values).toHaveLength(6);
 expect(createGraphicsTextPlan(graphic,formatValue).summary).toContain('omitted 4');
 const html=renderOutputHtml(graphic,formatValue);expect(html).toContain('<svg');expect(html).toContain('bounded-line');expect(html).toContain('connecting lines do not certify');
});
test('immutable stream tails retain monotonic source IDs, drop counts and exact values',()=>{
 const results=run(`initial:=.plot.Stream(4);one:=.plot.StreamAppend(initial,[[1,1/3],[2,2/3],[3,1]]);two:=.plot.StreamAppend(one,[[4,4/3],[5,5/3],[6,2]]);[initial,one,two,.plot.StreamLine(two,{= maxPoints=4 })]`).values;
 expect(field(results[0],'data').values).toHaveLength(0);expect(field(results[1],'data').values).toHaveLength(3);expect(field(results[2],'data').values).toHaveLength(4);
 expect(String(field(results[2],'dropped'))).toBe('2');expect(String(field(results[2],'nextIndex'))).toBe('7');
 expect(field(meta(results[3]),'records').values.map(r=>field(r,'id').value)).toEqual(['sample-3','sample-4','sample-5','sample-6']);
 const textPlan=createGraphicsTextPlan(results[3],formatValue);expect(textPlan.summary).toContain('Stream dropped 2');expect(textPlan.series[0].samples.map(s=>s.id)).toEqual(['sample-3','sample-4','sample-5','sample-6']);
 expect(()=>run('s:=.plot.StreamAppend(.plot.Stream(),[[1,2]]);.plot.StreamAppend(s,[[1,3]])')).toThrow('increase across batches');
 expect(()=>run('.plot.StreamLine(.plot.Stream())')).toThrow('at least two');
});
test('finite heatmap blocks retain exact means/extrema/source bounds and stable hit IDs',()=>{
 const graphic=run('.plot.HeatMapData([[1,2,3],[4,5,6]],[0,3],[0,2],{= maxCells=2 })');const m=meta(graphic);const records=field(m,'records').values;
 expect(records).toHaveLength(2);expect(records.map(r=>String(field(r,'value')))).toEqual(['3','9/2']);
 expect(records.map(r=>String(field(r,'minimum')))).toEqual(['1','3']);expect(records.map(r=>String(field(r,'maximum')))).toEqual(['5','6']);
 expect(formatValue(field(records[0],'sourceBounds'))).toBe('[[1, 1], [2, 2]]');
 expect(field(m,'status').value).toBe('aggregated');expect(graphic.children.filter(c=>c.kind==='rectangle')).toHaveLength(2);
 const text=createGraphicsTextPlan(graphic,formatValue);expect(text.summary).toContain('2 blocks for 6 exact grid cells');expect(text.fieldEvidence[0].label).toContain('exact mean 3 of 4');
 expect(renderOutputHtml(graphic,formatValue)).toContain('heatmap-source-1-1-2-2');
 const single=run('.plot.HeatMapData([[2/3]],[0,1],[0,1],{= maxCells=1 })');expect(field(meta(single),'status').value).toBe('exact');
});
test('bounded inputs reject oversized, ragged, nonexact and unordered data before rendering',()=>{
 for(const source of ['.plot.Downsample([[1,2],[2,3]],{= maxPoints=3 })','.plot.Downsample([[2,2],[1,3]])','.Plugin.Load("float");.plot.Downsample([[1,2],[2,.float.Float(1/3)]])','.plot.Stream(4097)','.plot.HeatMapData([[1],[2,3]],[0,1],[0,1])','.plot.HeatMapData([[1]],[0,1],[0,1],{= maxCells=0 })']) expect(()=>run(source)).toThrow();
 const context=new Context();context.setFresh('oversized',{type:'sequence',values:Array(4097).fill(null)});
 expect(()=>parseAndEvaluate('.Plugin.Load("plot");.plot.Downsample(oversized)',{context})).toThrow('4096 rows');
 const context2=new Context();context2.setFresh('oversized',{type:'sequence',values:Array(4097).fill(null)});
 expect(()=>parseAndEvaluate('.Plugin.Load("plot");.plot.HeatMapData(oversized,[0,1],[0,1])',{context:context2})).toThrow('4096 cells');
});
test('async bounded plots preserve the sync semantic scene',async()=>{
 const source='.Plugin.Load("plot");.plot.HeatMapData([[1/3,2/3],[1,4/3]],[0,1],[0,1],{= maxCells=1 })';
 const sync=parseAndEvaluate(source),asyncResult=await parseAndEvaluateAsync(source);
 expect(formatValue(meta(asyncResult))).toBe(formatValue(meta(sync)));expect(renderOutputHtml(asyncResult,formatValue)).toBe(renderOutputHtml(sync,formatValue));
},30000);
