/** Portable, bounded publication profiles. Host operations are injected separately. */
import { createPublicationPlan, safePublicationPath } from "./publication-plan.js";
export const PUBLICATION_BUILD_SCHEMA = "rix.publication-build@1";
export const PUBLICATION_MANIFEST_SCHEMA = "rix.publication-artifacts@1";
export const PUBLICATION_TARGETS = Object.freeze({html:"html",markdown:"md",quarto:"qmd",latex:"tex",pdf:"pdf",svg:"svg",png:"png",tikz:"tikz",gif:"gif","gif-frames":"frames.json",canvas:"canvas.json",gltf:"gltf",text:"txt",bundle:"rix-output.json"});
export const PUBLICATION_LIMITS = Object.freeze({maxDocuments:32,maxJobs:256,maxTargets:8,maxSourceBytes:2_000_000,maxOutputBytes:64_000_000,maxJobMs:30_000,maxBuildMs:300_000,maxDependencies:256,debounceMs:150,pollMs:250});
const fail=message=>{throw new Error(`Publication workflow: ${message}`);};
const record=(value,label)=>{if(!value || Object.getPrototypeOf(value)!==Object.prototype)fail(`${label} must be a record`);return value;};
export function publicationName(value,label="name") {if(typeof value!=="string"||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value))fail(`invalid ${label}`);return value;}
function list(value,label,max,check=entry=>typeof entry==="string") {if(!Array.isArray(value)||value.length>max||value.some(entry=>!check(entry)))fail(`invalid ${label}`);return [...new Set(value)];}
function inputs(value={default:""}) {
    record(value,"inputs"); const entries=Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0);
    if(!entries.length||entries.length>16)fail("requires 1…16 named inputs");
    return Object.freeze(Object.fromEntries(entries.map(([name,source])=>{publicationName(name,"input name");if(typeof source!=="string"||source.length>100_000)fail("invalid input source");return[name,source];})));
}
export function createPublicationProfile(value={},name="default") {
    record(value,"profile");publicationName(name,"profile name");
    const known=new Set(["name","targets","plugins","live","plan","inputs",...Object.keys(PUBLICATION_LIMITS)]);
    for(const key of Object.keys(value))if(!known.has(key))fail(`unknown profile field ${key}`);
    const targets=list(value.targets??["html","markdown","quarto"],"targets",16,entry=>Object.hasOwn(PUBLICATION_TARGETS,entry));
    if(!targets.length)fail("requires at least one target");
    const limits={...PUBLICATION_LIMITS};
    for(const key of Object.keys(limits)){if(value[key]!==undefined)limits[key]=value[key];if(!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>PUBLICATION_LIMITS[key]*16)fail(`invalid ${key}`);}
    if(targets.length>limits.maxTargets)fail("target budget exceeded");
    const live=value.live??false;if(typeof live!=="boolean")fail("live must be boolean");
    const plan=record(value.plan??{},"plan");createPublicationPlan(plan);
    return Object.freeze({name,targets:Object.freeze(targets),plugins:Object.freeze(list(value.plugins??[],"plugins",64,entry=>typeof entry==="string"&&/^[a-z0-9][a-z0-9_-]*$/i.test(entry))),live,plan:Object.freeze({...plan}),inputs:inputs(value.inputs),...limits});
}
export function createPublicationBuild(value,profileName=null) {
    record(value,"build");for(const key of Object.keys(value))if(!["schema","profiles","defaultProfile","documents","out"].includes(key))fail(`unknown build field ${key}`);if(value.schema!==PUBLICATION_BUILD_SCHEMA)fail("unsupported build schema");
    const profiles=record(value.profiles??{default:{}},"profiles");if(!Object.keys(profiles).length||Object.keys(profiles).length>32)fail("profile count budget exceeded");
    const selected=profileName??value.defaultProfile??Object.keys(profiles).sort()[0];
    if(!Object.hasOwn(profiles,selected))fail(`unknown profile ${selected}`);
    const profile=createPublicationProfile(profiles[selected],selected);
    if(!Array.isArray(value.documents)||!value.documents.length||value.documents.length>profile.maxDocuments)fail("document budget exceeded");
    const names=new Set();
    const documents=value.documents.map(doc=>{
        record(doc,"document");for(const key of Object.keys(doc))if(!["id","source","title","dependencies","assetRoots","assetPackages","inputs"].includes(key))fail(`unknown document field ${key}`); const id=publicationName(doc.id,"document id");if(names.has(id))fail(`duplicate document ${id}`);names.add(id);
        const source=safePublicationPath(doc.source);if(!/\.(rix|md|markdown)$/.test(source))fail("document source must be RiX or Markdown");
        const dependencies=list(doc.dependencies??[],"dependencies",profile.maxDependencies,entry=>typeof entry==="string").map(safePublicationPath);
        const assetRoots=list(doc.assetRoots??[],"asset roots",32,entry=>typeof entry==="string").map(entry=>entry==="."?entry:safePublicationPath(entry));
        if(doc.title!==undefined&&(typeof doc.title!=="string"||doc.title.length>1000))fail("invalid document title");
        const packageEntries=Object.entries(record(doc.assetPackages??{},"asset packages"));if(packageEntries.length>32)fail("asset package count budget exceeded");
        const packages=Object.fromEntries(packageEntries.map(([id,root])=>[publicationName(id,"asset package"),root==="."?root:safePublicationPath(root)]));
        return Object.freeze({id,source,title:typeof doc.title==="string"?doc.title:id,dependencies,assetRoots,assetPackages:packages,inputs:doc.inputs?inputs(doc.inputs):profile.inputs});
    });
    const jobs=documents.flatMap(doc=>Object.entries(doc.inputs).map(([input,source])=>({id:`${doc.id}/${input}`,document:doc,input,inputSource:source})));
    if(jobs.length*profile.targets.length>profile.maxJobs)fail("document/input/target matrix exceeds job budget");
    return Object.freeze({schema:PUBLICATION_BUILD_SCHEMA,profile,documents,jobs,out:safePublicationPath(value.out??"publication")});
}

function tomlLiteral(value) {
    if(Array.isArray(value))return `[${value.map(tomlLiteral).join(", ")}]`;
    if(value && typeof value==="object")return `{ ${Object.entries(value).map(([key,entry])=>`${JSON.stringify(key)} = ${tomlLiteral(entry)}`).join(", ")} }`;
    return JSON.stringify(value);
}
function parseTomlLiteral(source,depth=0) {
    if(depth>16)fail("profile literal depth exceeded");
    const split=text=>{const items=[];let start=0,level=0,quote=null,escape=false;for(let index=0;index<text.length;index++){const char=text[index];if(escape){escape=false;continue;}if(quote){if(char===quote)quote=null;else if(quote==='"'&&char==="\\")escape=true;continue;}if(char==='"'||char==="'"){quote=char;continue;}if(char==='['||char==='{')level++;else if(char===']'||char==='}')level--;else if(char===','&&level===0){items.push(text.slice(start,index));start=index+1;}}if(quote||level!==0)fail("unclosed profile literal");items.push(text.slice(start));return items.filter(item=>item.trim()).map(item=>item.trim());};
    const text=source.trim();
    if(text.startsWith("[")){if(!text.endsWith("]"))fail("invalid array literal");return split(text.slice(1,-1)).map(item=>parseTomlLiteral(item,depth+1));}
    if(text.startsWith("{")){if(!text.endsWith("}"))fail("invalid table literal");const result={};for(const item of split(text.slice(1,-1))){const match=/^("(?:[^"\\]|\\.)*"|[A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(item);if(!match)fail("invalid inline table");const key=match[1].startsWith('"')?JSON.parse(match[1]):match[1];if(Object.hasOwn(result,key)||["__proto__","prototype","constructor"].includes(key))fail("invalid inline table key");result[key]=parseTomlLiteral(match[2],depth+1);}return result;}
    return /^'[^']*'$/.test(text)?text.slice(1,-1):JSON.parse(text);
}

/** Supported TOML tables use one-line primitive values/arrays; RiX input source is an escaped string. */
export function parsePublicationProfiles(source) {
    if(typeof source!=="string"||source.length>1_000_000)fail("manifest byte budget exceeded");
    const profiles=Object.create(null),tables=new Set();let section=null,defaultProfile=null,topLevel=true;
    for(const raw of source.split(/\r?\n/)) {
        let quote=null,escape=false,line="";
        for(const char of raw){if(!quote&&char==="#")break;line+=char;if(escape){escape=false;continue;}if(quote==='"'&&char==="\\"){escape=true;continue;}if(quote===char)quote=null;else if(!quote&&(char==='"'||char==="'"))quote=char;}
        line=line.trim();if(!line)continue;
        if(line.startsWith("[")) {
            topLevel=false;section=null;
            const match=/^\[export_profiles\.([A-Za-z][A-Za-z0-9_-]*)(?:\.(plan)|\.inputs\.([A-Za-z][A-Za-z0-9_-]*))?\]$/.exec(line);
            if(match){if(tables.has(line))fail("duplicate export profile table");tables.add(line);const[,name,plan,input]=match;profiles[name]??={};section=input?(profiles[name].inputs??={}, {kind:"input",profile:profiles[name],name:input}):{kind:plan?"plan":"profile",value:plan?(profiles[name].plan??={}):profiles[name]};}
            else if(line.startsWith("[export_profiles"))fail("unsupported export profile table");
            continue;
        }
        const assignment=/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);if(!assignment) {if(section)fail("invalid export profile assignment");continue;}
        const[,key,text]=assignment;
        if(!section&&(!topLevel||key!=="default_export_profile"))continue;
        let value;try{value=parseTomlLiteral(text);}catch{fail(`invalid profile literal ${key}; use one-line TOML basic strings, numbers, booleans or arrays`);}
        if(!section){if(defaultProfile)fail("duplicate default export profile");defaultProfile=publicationName(value,"default profile");continue;}
        if(section.kind==="input"){if(key!=="source"||typeof value!=="string")fail("input tables require source string");if(Object.hasOwn(section.profile.inputs,section.name))fail("duplicate input source");section.profile.inputs[section.name]=value;}
        else {if(Object.hasOwn(section.value,key))fail(`duplicate profile field ${key}`);section.value[key]=value;}
    }
    if(Object.keys(profiles).length>32)fail("profile count budget exceeded");
    const exportProfiles=Object.fromEntries(Object.entries(profiles).map(([name,value])=>[name,createPublicationProfile(value,name)]));
    return {exportProfiles,defaultExportProfile:defaultProfile};
}
export function serializePublicationProfiles({exportProfiles={},defaultExportProfile=null}={}) {
    let source=defaultExportProfile?`default_export_profile = ${JSON.stringify(publicationName(defaultExportProfile))}\n`:"";
    for(const name of Object.keys(exportProfiles).sort()) {
        const profile=createPublicationProfile(exportProfiles[name],name);
        source+=`\n[export_profiles.${name}]\n`;
        for(const key of ["targets","plugins","live",...Object.keys(PUBLICATION_LIMITS)])source+=`${key} = ${JSON.stringify(profile[key])}\n`;
        if(Object.keys(profile.plan).length){source+=`\n[export_profiles.${name}.plan]\n`;for(const key of Object.keys(profile.plan).sort())source+=`${key} = ${tomlLiteral(profile.plan[key])}\n`;}
        for(const [input,prelude] of Object.entries(profile.inputs))source+=`\n[export_profiles.${name}.inputs.${input}]\nsource = ${JSON.stringify(prelude)}\n`;
    }
    return source;
}

/** Debounced revisions abort old work before replacing the visible artifact set. */
export function createPublicationRebuilder({build,commit,onError=()=>{},debounceMs=150}) {
    let revision=0,timer=null,controller=null,closed=false,commitTail=Promise.resolve();const active=new Set();
    const execute=async id=>{
        controller?.abort();const current=new AbortController();controller=current;
        try{const result=await build({revision:id,signal:current.signal});const turn=commitTail.then(async()=>{if(!closed&&!current.signal.aborted&&id===revision)await commit(result,{revision:id,signal:current.signal});});commitTail=turn.catch(()=>{});await turn;}
        catch(error){if(!current.signal.aborted&&id===revision)onError(error);}
    };
    const start=id=>{const pending=execute(id);active.add(pending);pending.then(()=>active.delete(pending),()=>active.delete(pending));return pending;};
    return Object.freeze({
        invalidate(){if(closed)return;const id=++revision;controller?.abort();clearTimeout(timer);timer=setTimeout(()=>start(id),debounceMs);},
        async flush(){if(closed)return;clearTimeout(timer);const id=++revision;controller?.abort();await start(id);},
        async close(){closed=true;++revision;clearTimeout(timer);controller?.abort();await Promise.allSettled([...active]);},
        get revision(){return revision;},
    });
}
