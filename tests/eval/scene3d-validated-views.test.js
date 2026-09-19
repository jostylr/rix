import {describe,expect,test} from 'bun:test';
import {Rational} from '@ratmath/core';
import {Context,parseAndEvaluate,formatValue,renderOutputHtml,encodeOutputJSON,decodeOutputJSON,snapshotOutputDocument} from '../../src/index.js';
import {createLinkedViews} from '../../src/runtime/linked-views.js';
import {linkedGraphicSelectionIds,applyLinkedGraphicSelection} from '../../src/tools/graphic-view.js';
import {definition as svg} from '../../plugins/render-svg/svg.plugin.rix.js';
import {definition as tikz} from '../../plugins/render-tikz/tikz.plugin.rix.js';
import {definition as canvas} from '../../plugins/render-canvas/canvas.plugin.rix.js';
import {createWebGLPlan} from '../../plugins/render-webgl/webgl-plan.js';
import {portableFrameValue} from '../../plugins/renderers/static-frames.js';
const f=(v,k)=>v.entries.get(k.toLowerCase());const n=(v,k)=>Number(f(v,k)?.value);
const run=source=>parseAndEvaluate('.Plugin.Load("scene3d");'+source,{context:new Context()});
const math='.Plugin.Load("calculus");x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);z:=.calculus.Variable(:z);w:=.calculus.Variable(:w);';
const linked='a:=.Graphics.Graphic([100,80],[.Graphics.Circle([20,20],4,{= hitId="point",fill="red" })]);b:=.Graphics.Graphic([100,80],[.Graphics.Circle([30,30],4,{= hitId="point",fill="blue" })]);';
// Coordinate entries must remain exact source data; lowerers may approximate only the picture.
describe('bounded scenes, trajectories and linked evidence',()=>{
 test('region masks, omitted covers, degenerate volume slices and refinement retain uncertainty',()=>{
  const result=run(math+`r:=.ImplicitRegion(x+y+z,{= x=(-1):1,y=(-1):1,z=(-1):1 },{= maxCells=7 });
   scene:=.scene3d.RegionView(r,{= maxVisibleCells=2 });v:=.scene3d.Volume(x+y+z,{= x=(-1):1,y=(-1):1,z=(-1):1 },{= maxCells=1 });
   section:=.scene3d.Slice(v,:z,0,{= maxCells=1 });snapshot:=.scene3d.Snapshot(.scene3d.RegionView(section[:region],{= maxVisibleCells=1 }),{= size=[180,120],mode="lit" });[scene,section,snapshot];`);
  const [scene,section,snapshot]=result.values;const metadata=f(scene,'metadata');expect(n(f(metadata,'work'),'visiblecells')).toBe(2);expect(n(f(metadata,'work'),'omittedcells')).toBe(6);
  const primitives=f(f(scene,'realized'),'primitives').values;expect(primitives).toHaveLength(4);expect(f(primitives[2],'metadata').entries.get('classification').value).toBe('omittedCover');
  expect(String(f(f(f(section,'region'),'inputbox'),'axes').entries.get('z'))).toBe('[0,0]');expect(f(snapshot,'resolved')).toBeNull();expect(f(snapshot,'uncertainty').values.length).toBeGreaterThan(0);
  expect(f(snapshot,'diagnostics').values.map(d=>f(d,'code').value)).toContain('scene3d-unresolved-source');
  expect(()=>run(math+'.scene3d.ImplicitSurface(x,{= x=0:1,y=0:1,z=0:1 },{= maxVisibleCells=257 });')).toThrow('work budget');
 });
 test('validated, approximate, backward, incomplete and event trajectories preserve source distinctions',()=>{
  const result=run(`.Plugin.Load("ode");y:=.calculus.Variable(:y);p:=.ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[.ode.Event(y-1/2,{= name=:half })] });
   a:=p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 });b:=p.DormandPrince({= initialSteps=2,maxAttempts=1 });
   back:=.ode.IVP(.calculus.Constant(1),1,1,1:0).ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 });
   events:=a.IsolateEvents();[a,.scene3d.Trajectory(a,{= maxSegments=1 }),.scene3d.Trajectory(b),.scene3d.Trajectory(back),.scene3d.EventTrajectory(events[1]),events[1]];`);
  const [source,limited,approx,back,eventScene,event]=result.values;expect(f(f(limited,'metadata'),'omitted').values).toHaveLength(1);
  expect(f(f(limited,'metadata'),'records').values.map(r=>f(r,'classification').value)).toEqual(['certifiedTube','certifiedTube']);
  const a=f(approx,'metadata');expect(f(a,'records').values.map(r=>f(r,'classification').value)).toEqual(['approximatePath']);expect(f(a,'uncertainty').values.map(r=>f(r,'classification').value)).toContain('unresolvedTimeSuffix');
  expect(String(f(f(a,'uncertainty').values[0],'interval'))).toBe('1/2:1');expect(f(f(a,'uncertainty').values[0],'spatialbound')).toBeNull();
  expect(String(f(f(f(back,'metadata'),'records').values[0],'interval'))).toBe('1:0');
  const overlays=f(f(eventScene,'realized'),'primitives').values.filter(v=>f(v,'pickid')?.value.includes('.event.'));expect(overlays.length).toBeGreaterThan(0);expect(f(f(overlays[0],'metadata'),'displayaddscertification')).toBeNull();
  expect(f(f(limited,'metadata'),'source')).toBeTruthy();expect(portableFrameValue(f(f(limited,'metadata'),'source')).schema).toBe('rix.ode.solution@1');
  expect(()=>run(`.Plugin.Load("ode");y:=.calculus.Variable(:y);s:=.ode.IVP(.calculus.Constant(1),0,0,0:1).ValidatedTaylor({= steps=1,order=3 });e:=s.IsolateEvents(.ode.Event(y-1/2))[1];fake:=e.Merge({= candidates=[e[:candidates][1],e[:candidates][1]] });.scene3d.EventTrajectory(fake,{= maxEvents=1 });`)).toThrow('overlay budget');
  // A provided source claim is retained, not independently promoted to a new trajectory proof.
  expect(f(f(limited,'metadata'),'displayaddscertification')).toBeNull();
 });
 test('quaternion rotations are exact, preserve endpoint representatives and diagnose the Cayley pole',()=>{
  const result=run(`a:=.scene3d.UnitQuaternion([3/5,0,0,4/5]);b:=.scene3d.UnitQuaternion([0,0,1,0]);
   first:=.scene3d.QuaternionBlend(a,b,0);last:=.scene3d.QuaternionBlend(a,b,1);middle:=.scene3d.QuaternionBlend(a,b,1/3);
   node:=.scene3d.QuaternionTransform([.scene3d.PointCloud([[1,0,0]],{= id="rotated" })],[0,0,0,1],{= translate=[1/3,0,0] });scene:=.scene3d.Scene([node]);
   [first,last,middle,.scene3d.QuaternionBlend([1,0,0,0],[-1,0,0,0],1/2),node,scene,.scene3d.Snapshot(scene,{= size=[120,120] })];`);
  const [first,last,middle,pole,node,scene,snapshot]=result.values;
  expect(f(first,'components').values.map(String)).toEqual(['3/5','0','0','4/5']);expect(f(last,'components').values.map(String)).toEqual(['0','0','1','0']);
  const c=f(middle,'components').values;expect(c.reduce((sum,x)=>sum.add(x.multiply(x)),Rational.zero).toString()).toBe('1');expect(f(middle,'constantangularspeed')).toBeNull();
  expect(f(pole,'reason').value).toBe('antipodalCayleyPole');expect(f(pole,'certified')).toBeNull();
  const matrix=f(node,'matrix').values;for(let i=0;i<3;i++)for(let j=0;j<3;j++){const sum=[0,1,2].reduce((a,k)=>a.add(matrix[i*4+k].multiply(matrix[j*4+k])),Rational.zero);expect(String(sum)).toBe(i===j?'1':'0');}
  const primitive=f(f(scene,'realized'),'primitives').values[0];expect(f(primitive,'points').values[0].values.map(String)).toEqual(['-2/3','0','0']);expect(f(primitive,'transformprovenance').values).toHaveLength(1);
  expect(portableFrameValue(f(snapshot,'picking')).rotated.transformprovenance[0].metadata.meaning).toBe('exactRigidTransform');
  expect(()=>run('.scene3d.UnitQuaternion([1,1,0,0]);')).toThrow('exact unit norm');expect(()=>run('.scene3d.QuaternionBlend([1,0,0,0],[0,1,0,0],2);')).toThrow('zero through one');
 });
 test('linked panels namespace stable IDs, merge overlapping groups, preserve snapshots and reject ambiguous selectors',()=>{
  const result=run(linked+`.LinkedViews([a,b,a],[[{= panel=1,id="point" },{= panel=2,id="point" }],[{= panel=2,id="point" },{= panel=3,id="point" }]],{= columns=2,gap=10 });`);
  expect(result.size.map(String)).toEqual(['210','170']);expect(linkedGraphicSelectionIds(result,'panel.1.point')).toEqual(['panel.1.point','panel.2.point','panel.3.point']);
  const elements=['panel.1.point','panel.2.point','unrelated'].map(id=>{const selected=new Set();return {dataset:{rixSemanticId:id},selected,classList:{add:x=>selected.add(x),remove:x=>selected.delete(x)}};});
  applyLinkedGraphicSelection(elements,result,'panel.1.point');expect(elements.map(el=>el.selected.has('rix-output-semantic-selected'))).toEqual([true,true,false]);
  const html=renderOutputHtml(result,formatValue);expect(html).toContain('panel.1.point');expect(html).toContain('panel.3.point');
  const restored=decodeOutputJSON(encodeOutputJSON(snapshotOutputDocument(result))).value;expect(linkedGraphicSelectionIds(restored,'panel.2.point')).toHaveLength(3);
  expect(()=>run(linked+'.LinkedViews([a,b],[["point"]]);')).toThrow('ambiguous');expect(()=>run(linked+'.LinkedViews([a,b],[[{= panel=1,id="missing" }]]);')).toThrow('retained object');
  expect(()=>createLinkedViews([],[])).toThrow('BudgetExceeded');expect(()=>createLinkedViews(Array(17).fill(result),[])).toThrow('BudgetExceeded');
  const cycle={};cycle.loop=cycle;const graphic={...result,metadata:new Map([['bad',cycle]])};expect(()=>createLinkedViews([graphic],[])).toThrow('cycles');
 });
 test('clipped retained objects keep selectable identity without invented screen positions',()=>{
  const result=run(`scene:=.scene3d.Scene([.scene3d.PointCloud([[0,0,1001]],{= id="far" })],{= camera=.scene3d.OrthographicCamera([0,0,10],[0,0,0],{= up=[0,1,0] }) });
   [.scene3d.Snapshot(scene),.scene3d.LinkedViews([scene,scene],[[{= panel=1,id="far" },{= panel=2,id="far" }]])];`);
  const [snapshot,linked]=result.values;const graphic=f(snapshot,'value');expect(graphic.children).toHaveLength(1);expect(graphic.children[0].kind).toBe('group');expect(graphic.children[0].children).toHaveLength(0);
  expect(linkedGraphicSelectionIds(linked,'panel.1.far')).toEqual(['panel.1.far','panel.2.far']);
 });
 test('SVG, Canvas, WebGL, TikZ and saved snapshots disclose and preserve uncertainty within bounded evidence',()=>{
  const result=run(math+`r:=.ImplicitRegion(x+y+z,{= x=(-1):1,y=(-1):1,z=(-1):1 },{= maxCells=1 });scene:=.scene3d.RegionView(r,{= maxVisibleCells=1 });[scene,.scene3d.Snapshot(scene,{= size=[180,120] })];`);
  const [scene,snapshot]=result.values,graphic=f(snapshot,'value');
  const svgOut=svg.render({value:graphic,options:{optimize:true},format:formatValue});expect(svgOut.content).toContain('data-rix-source-evidence');expect(svgOut.content).toContain('completeInputCover');expect(svgOut.content).toContain('unresolved');expect(svgOut.content).toContain('data-rix-semantic-id="region.r.0"');
  const canvasOut=canvas.render({value:snapshot,format:formatValue});const cp=JSON.parse(canvasOut.content);expect(cp.sourceMetadata.scenemetadata.source.coverage).toBe('completeInputCover');expect(cp.scene3d.uncertainty.length).toBeGreaterThan(0);expect(cp.projectionAddsCertification).toBe(false);
  const wp=createWebGLPlan(scene);expect(wp.sourceMetadata.source.topology).toBe('unproved');expect(wp.picking['region.r.0'].metadata.classification).toBe('unprocessed');expect(wp.projectionAddsCertification).toBe(false);
  const tex=tikz.render({value:snapshot,format:formatValue});expect(tex.content).toContain('tikzpicture');expect(tex.metadata.staticFrame.metadata.graphicSource.scenemetadata.source.topology).toBe('unproved');expect(tex.metadata.staticFrame.metadata.snapshot.uncertainty.length).toBeGreaterThan(0);
  const restored=decodeOutputJSON(encodeOutputJSON(snapshotOutputDocument(graphic))).value;expect(svg.render({value:restored,format:formatValue}).content).toContain('completeInputCover');
  const cyclic={};cyclic.self=cyclic;const bad={...graphic,metadata:new Map([['evidence',cyclic]])};expect(()=>svg.render({value:bad,format:formatValue})).toThrow('cycles');expect(()=>canvas.render({value:bad,format:formatValue})).toThrow('cycles');expect(()=>tikz.render({value:bad,format:formatValue})).toThrow('cycles');
  const hostile={...graphic,metadata:new Map([['evidence','</metadata><script>bad()</script>']])};
  const escaped=svg.render({value:hostile,format:formatValue}).content;expect(escaped).toContain('&lt;script&gt;');expect(escaped).not.toContain('<script>bad()');
  const badScene={...scene,entries:new Map(scene.entries)};badScene.entries.set('metadata',{type:'map',entries:new Map([['cycle',cyclic]])});expect(()=>createWebGLPlan(badScene)).toThrow('cycles');
  const huge={...graphic,metadata:new Map([['evidence','x'.repeat(4000001)]])};expect(()=>svg.render({value:huge,format:formatValue})).toThrow('characters');
 });
});
