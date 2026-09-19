/** Renderer-neutral panel composition; linking selects retained objects without changing claims. */
import { Integer,Rational } from '@ratmath/core';
import { createGraphic,createTransform,outputValueKind } from './output.js';
import { createFrameSerializer } from '../../plugins/renderers/static-frames.js';
const str=value=>({type:'string',value});const seq=values=>({type:'sequence',values});const map=entries=>({type:'map',entries:new Map(entries)});
const text=v=>typeof v==='string'?v:v?.type==='string'?v.value:null;
const values=v=>Array.isArray(v)?v:v?.values;
const entries=v=>v instanceof Map?v:v?.entries;
function field(value,key,fallback=null){const all=entries(value);if(all)for(const[k,v]of all)if(String(k).toLowerCase()===key.toLowerCase())return v;return value?.[key]??fallback;}
function exact(v,label){const result=v instanceof Integer?new Rational(v.value):v instanceof Rational?v:typeof v==='number'&&Number.isSafeInteger(v)?new Rational(v):null;if(!result||result.denominator===0n)throw new Error(`${label}RequiresExactRational`);if(result.numerator.toString().length>4096||result.denominator.toString().length>4096)throw new Error('linkedViewsRationalBudgetExceeded');return result;}
function limit(v,fallback,max,label){const n=v===null?new Rational(fallback):exact(v,label);if(n.denominator!==1n||n.numerator<1n||n.numerator>BigInt(max))throw new Error(`${label}OutOfRange`);return Number(n.numerator);}
function normalize(view){if(outputValueKind(view)==='graphic')return {graphic:view,snapshot:null};if(text(field(view,'schema'))==='rix.scene3d.snapshot@1'&&outputValueKind(field(view,'value'))==='graphic')return {graphic:field(view,'value'),snapshot:view};throw new Error('LinkedViews accepts Graphics, Plot graphics, and Scene3D snapshots');}
export function createLinkedViews(source,links,options={}){
    const views=values(source),groups=values(links);if(!views||views.length<1||views.length>16||!groups||groups.length>4096)throw new Error('linkedViewsPanelOrGroupBudgetExceeded');
    const columns=limit(field(options,'columns'),views.length,16,'linkedColumns');const gap=exact(field(options,'gap',new Integer(16n)),'linkedGap');if(gap.lessThan(Rational.zero))throw new Error('linkedGapMustBeNonnegative');
    const input=views.map(normalize);const serialize=createFrameSerializer();
    // Only retain snapshot provenance; projected geometry already lives in each Graphic.
    const snapshotMetadata=snapshot=>snapshot?map(['schema','source','uncertainty','diagnostics'].map(key=>[key,field(snapshot,key)])):null;
    for(const {graphic,snapshot} of input){serialize(graphic);serialize(snapshotMetadata(snapshot));}
    serialize(links);
    let visited=0;const maps=input.map(()=>new Map()),allIds=new Map();
    const clone=(node,panel,path,depth=0)=>{
        if(++visited>100000||depth>64)throw new Error('linkedViewsNodeBudgetExceeded');
        if(!node||node.type!=='output')throw new Error('LinkedViews requires core Graphics nodes');
        const style=new Map(node.style||[]);const original=text(field(style,'hitid',field(style,'id',field(node.metadata,'id'))))||node.id||node.targetId||path.replace(/[^A-Za-z0-9:_.-]+/g,'-');
        const id=`panel.${panel+1}.${original}`;style.delete('id');style.delete('hitId');style.set('hitid',str(id));
        maps[panel].set(original,id);const matches=allIds.get(original)||new Set();matches.add(id);allIds.set(original,matches);
        return {...node,style,...(node.children?{children:node.children.map((child,i)=>clone(child,panel,`${path}.${i+1}`,depth+1))}:{})};
    };
    const trees=input.map(({graphic},panel)=>graphic.children.map((node,i)=>clone(node,panel,`graphic[${i+1}]`)));
    const resolve=selector=>{
        const simple=text(selector);if(simple){const matches=allIds.get(simple);if(matches?.size!==1)throw new Error(`LinkedViews selector '${simple}' is missing or ambiguous; specify panel and id`);return [...matches][0];}
        const panel=limit(field(selector,'panel'),0,views.length,'linkedPanel')-1,id=text(field(selector,'id'));const found=maps[panel].get(id);if(!found)throw new Error('LinkedViews selector does not identify a retained object');return found;
    };
    const parent=new Map();const root=id=>{if(!parent.has(id))parent.set(id,id);let p=id;while(parent.get(p)!==p)p=parent.get(p);return p;};
    let count=0;for(const group of groups){const selectors=values(group);if(!selectors||selectors.length<1||selectors.length>256)throw new Error('linkedViewsGroupSizeExceeded');if((count+=selectors.length)>4096)throw new Error('linkedViewsLinkBudgetExceeded');const ids=selectors.map(resolve);for(const id of ids)parent.set(root(id),root(ids[0]));}
    const connected=new Map();for(const id of parent.keys()){const key=root(id),group=connected.get(key)||[];group.push(id);connected.set(key,group);}
    const sizes=input.map(({graphic})=>graphic.size.map(v=>exact(v,'linkedPanelSize')));if(sizes.some(size=>size.some(v=>!v.greaterThan(Rational.zero))))throw new Error('linkedPanelSizeMustBePositive');
    const maximum=axis=>sizes.reduce((largest,size)=>size[axis].greaterThan(largest)?size[axis]:largest,Rational.zero);const width=maximum(0),height=maximum(1);
    const children=trees.map((tree,i)=>{
        const offset=[width.add(gap).multiply(new Rational(i%columns)),height.add(gap).multiply(new Rational(Math.floor(i/columns)))];
        return createTransform([seq(tree),map([['translate',seq(offset)]]),map([['stroke',str('none')]])]);
    });
    const panels=input.map(({graphic,snapshot},i)=>map([['panel',new Integer(BigInt(i+1))],['ids',map([...maps[i]].map(([original,id])=>[original,str(id)]))],['sourceMetadata',map(graphic.metadata||[])],['snapshot',snapshotMetadata(snapshot)]]));
    const metadata=map([['schema',str('rix.graphics.linked-views@1')],['linkedSelection',seq([...connected.values()].map(ids=>seq(ids.map(str))))],['panels',seq(panels)],['selectionMeaning',str('explicitSharedRetainedObjects')],['displayAddsCertification',null]]);
    const result = createGraphic([seq([width.add(gap).multiply(new Rational(Math.min(columns,views.length))).subtract(gap),height.add(gap).multiply(new Rational(Math.ceil(views.length/columns))).subtract(gap)]),seq(children),metadata]);
    serialize(result);
    return result;
}
