import {describe,expect,test} from 'bun:test';
import {Context,parseAndEvaluate,formatValue,renderOutputHtml} from '../../src/index.js';
import {portableFrameValue} from '../../plugins/renderers/static-frames.js';
import {linkedGraphicSelectionIds} from '../../src/tools/graphic-view.js';
const run=source=>parseAndEvaluate('.Plugin.Load("nd");.Plugin.Load("complex-viz");.Plugin.Load("calculus");x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);z:=.calculus.Variable(:z);w:=.calculus.Variable(:w);'+source,{context:new Context()});
const f=(v,k)=>v.entries.get(k.toLowerCase());
describe('higher-dimensional implicit and complex graph views',()=>{
 test('ND sections are checked parameter-domain covers; projection retains full interval images',()=>{
  const result=run(`slice:=.nd.AffineSlice([0,0,0,2],[[1,0,0,0],[0,1,0,0]]);
   section:=.nd.ImplicitSlice(x^2+y^2+z^2+w^2-1,[:x,:y,:z,:w],slice,{= u=(-1):1,v=(-1):1 });
   r:=.nd.ImplicitRegion(x+y+z+w,{= x=(-1):1,y=(-1):1,z=(-1):1,w=(-1):1 },{= maxCells=1 });
   p:=.nd.ProjectRegion(r,.nd.Projection([[1,2,0,0],[0,0,1,-1]],[1/3,0]));scene:=.nd.RegionScene(p,{= maxVisibleCells=1 });
   linked:=.nd.LinkedRegions(r,[.nd.CoordinateProjection(4,[1,2,3]),.nd.CoordinateProjection(4,[1,3,4])],{= maxVisibleCells=1,size=[160,120] });[section,p,scene,linked];`);
  const [section,p,scene,linked]=result.values;expect(f(section,'excluded').values).toHaveLength(1);expect(f(f(section,'checker'),'accepted').value).toBe(1n);
  expect(f(p,'topology').value).toBe('unproved');expect(f(p,'possibleoverlap').value).toBe(1n);expect(f(p,'projectionaddsrootexistence')).toBeNull();
  const first=f(p,'cells').values[0];expect(f(first,'bounds').values.map(String)).toEqual(['-8/3:7/3','-2:2']);
  expect(f(f(f(scene,'metadata'),'work'),'omittedcells').value).toBe(1n);expect(linkedGraphicSelectionIds(linked,'panel.1.region.r.0')).toEqual(['panel.1.region.r.0','panel.2.region.r.0']);
  expect(renderOutputHtml(linked,formatValue)).toContain('Projected cell cover');
 });
 test('four-dimensional graph samples retain poles and link only located output objects',()=>{
  const result=run(`F:=.complexViz.RationalFunction((z)->.Complex.FromParts(1,0),(z)->z);
   graph:=.complexViz.Graph4D({= fn=F,points=[[0,0],[1,0],[0,1]] });
   input:=.complexViz.Project4D(graph,.nd.CoordinateProjection(4,[1,2]));output:=.complexViz.Project4D(graph,.nd.CoordinateProjection(4,[3,4]));
   [graph,input,output,.complexViz.Linked4D(graph,{= size=[160,120] })];`);
  const [graph,input,output,linked]=result.values;expect(f(graph,'coverage').value).toBe('sampledInputsOnly');expect(f(graph,'unsampledcertified')).toBeNull();
  const samples=f(graph,'samples').values;expect(samples.map(v=>f(v,'status').value)).toEqual(['pole','value','value']);expect(f(samples[2],'output').values.map(String)).toEqual(['0','-1']);
  expect(f(f(input,'realized'),'primitives').values).toHaveLength(4);expect(f(f(output,'realized'),'primitives').values).toHaveLength(3);
  expect(f(f(output,'metadata'),'uncertainty').values).toHaveLength(1);expect(f(f(f(output,'metadata'),'records').values[0],'known')).toBeNull();
  expect(linkedGraphicSelectionIds(linked,'panel.1.complex.sample.2')).toEqual(['panel.1.complex.sample.2','panel.2.complex.sample.2']);
  expect(linkedGraphicSelectionIds(linked,'panel.1.complex.sample.1')).toEqual(['panel.1.complex.sample.1']);
  expect(renderOutputHtml(linked,formatValue)).toContain('Finite samples only');
 });
 test('affine input slices and source enclosures keep exact four-coordinate bounds',()=>{
  const result=run(`slice:=.nd.AffineSlice([1/3,0],[[0,1]]);graph:=.complexViz.Slice4D({= fn=z->z*z },slice,[[-1],[0],[1]]);
   .Plugin.Load("ball");enclosure:=.complex.FromParts(.ball.Sqrt(2),1).Refine({= absoluteWidth=1/100,maxWork=100 });
   bounded:=.complexViz.Graph4D({= fn=z->enclosure,points=[[0,0]] });scene:=.complexViz.Project4D(bounded,.nd.CoordinateProjection(4,[3,4]));[graph,bounded,scene];`);
  const [graph,bounded,scene]=result.values;expect(f(f(graph,'source'),'inputslice')).toBeTruthy();const samples=f(graph,'samples').values;
  expect(f(samples[0],'input').values.map(String)).toEqual(['1/3','-1']);expect(f(samples[0],'output').values.map(String)).toEqual(['-8/9','-2/3']);
  expect(f(f(bounded,'samples').values[0],'status').value).toBe('enclosure');const primitive=f(f(scene,'realized'),'primitives').values[0];expect(f(primitive,'kind').value).toBe('mesh');expect(portableFrameValue(f(primitive,'metadata')).projectionaddscertification).toBeNull();
 });
 test('bounded samples, projections, omissions and quaternion facade adapters reject unsupported inputs',()=>{
  expect(()=>run('.complexViz.DomainColoring({= fn=z->z,resolution=[129,129] });')).toThrow('budget');
  expect(()=>run('.complexViz.Surface({= fn=z->z,resolution=[1,2] });')).toThrow('two rows');
  expect(()=>run('.complexViz.Graph4D({= fn=z->z,resolution=[65,65] });')).toThrow('maxSamples');
  expect(()=>run('.complexViz.Graph4D({= fn=z->z,resolution=[1,2] });')).toThrow('two rows');
  expect(()=>run('.complexViz.Graph4D({= fn=z->z,points=[[0,0],[1,1]],maxSamples=1 });')).toThrow('budget');
  const result=run(`g:=.complexViz.Graph4D({= fn=z->z,points=[[0,0],[1,1]] });scene:=.complexViz.Project4D(g,.nd.CoordinateProjection(4,[1,2]),{= maxVisibleSamples=1 });
   .Plugin.Load("quaternion");q:=.quaternion.Quaternion(3/5,0,0,4/5);[scene,.scene3d.UnitQuaternion(q)];`);
  expect(f(f(result.values[0],'metadata'),'omitted').values).toHaveLength(1);expect(f(result.values[1],'components').values.map(String)).toEqual(['3/5','0','0','4/5']);
  expect(()=>run('r:=.nd.ImplicitRegion(x,{= x=(-1):1 },{= maxCells=0 });.nd.RegionScene(.nd.ProjectRegion(r,.nd.Projection([[1]])));')).toThrow('two or three');
 });
});
