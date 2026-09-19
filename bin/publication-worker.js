/** One isolated document/input evaluation. The parent bounds runtime and replaces output. */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync, drainBackgroundTasks, tokenize, formatValue, readSourceHeader, mergeOperatorDefinitions, extractOperatorDeclarationsFromSource } from "../src/index-node.js";
import { NodePluginCatalog } from "../src/runtime/plugin-catalog-node.js";
import { createNodeHostAdapter } from "../src/runtime/host-adapter-node.js";
import { createNodeAssetStore } from "../src/runtime/output-assets-node.js";
import { bundleOutputDocument, encodeOutputBundle } from "../src/runtime/output-assets.js";
import { withPublicationPlan, safePublicationPath } from "../src/runtime/publication-plan.js";
import { PUBLICATION_TARGETS } from "../src/runtime/publication-workflow.js";
import { registerBuiltPluginInstallers } from "./builtin-installers.js";
import { install as installPdfPlugin } from "../plugins/render-pdf/pdf.plugin.rix.js";
import { compileLatex } from "./node-renderer-tools.js";
const sourceRoot=path.resolve(import.meta.dir,"..");
const request=JSON.parse(readFileSync(process.argv[2],"utf8"));
const {root,job,profile,resultPath}=request;
const dependencies=new Set([path.resolve(root,job.document.source),...job.document.dependencies.map(name=>path.resolve(root,name))]);
const diagnostics=[];const files=new Map();
const encode=content=>Buffer.from(typeof content==="string"?new TextEncoder().encode(content):content).toString("base64");
const message=error=>String(error.message||error).replaceAll(root+path.sep,"").replaceAll(sourceRoot+path.sep,"<rix>/");
let outputBytes=0;
function put(name,content){safePublicationPath(name);const data=typeof content==="string"?new TextEncoder().encode(content):content;if(!(data instanceof Uint8Array))throw new Error("Renderer must return text or bytes");const encoded=encode(data);if(files.has(name)){if(files.get(name)!==encoded)throw new Error(`Artifact collision: ${name}`);return;}if(data.length+outputBytes>profile.maxOutputBytes)throw new Error("Publication output byte budget exceeded");outputBytes+=data.length;files.set(name,encoded);}
function readText(filename){dependencies.add(path.resolve(filename));if(statSync(filename).size>profile.maxSourceBytes)throw new Error("Source byte budget exceeded");return readFileSync(filename,"utf8");}
async function evaluate(source,runtime){const tokens=tokenize(source);return tokens.some(token=>["{$","{$$","|>_","|>!"].includes(token.value))||/\.(?:ForEach|Reduce|Collect|First|Find|Count|Close|Retry)\s*\(/i.test(source)?parseAndEvaluateAsync(source,runtime):parseAndEvaluate(source,runtime);}
try {
    if(!job.document.source.endsWith(".rix"))throw new Error("CLI publication builds require .rix sources; Markdown notebooks use the Notebook workflow");
    const source=readText(path.resolve(root,job.document.source));
    const pluginRoots=[path.join(root,"plugins"),path.join(sourceRoot,"plugins")];
    const catalog=new NodePluginCatalog({roots:pluginRoots}).scan();registerBuiltPluginInstallers(catalog);
    let assetFiles=[];
    catalog.registerInstaller("pdf",api=>installPdfPlugin({...api,compileLatex:(source,options,assets)=>compileLatex(source,options,[...assetFiles,...assets])}));
    const context=new Context(), registry=createDefaultRegistry(),systemContext=createDefaultSystemContext({pluginCatalog:catalog});
    const host={...createNodeHostAdapter(),readTextSync:readText};
    const runtime={context,registry,systemContext,hostAdapter:host,file:job.document.source};
    context.setEnv("scriptBaseDir",path.dirname(path.resolve(root,job.document.source)));
    context.setEnv("__output_sink__",()=>{});parseAndEvaluate("",runtime);
    const header=readSourceHeader(source,job.document.source);
    for(const id of [...new Set([...profile.plugins,...header.plugins,"svg","tikz","markdown","html","quarto","latex","png","pdf","gif","canvas","gltf"])])catalog.load(id,{context,registry,systemContext,loadRix:context.getEnv("__plugin_load_rix__")});
    const operators=header.operatorFiles.map(name=>{const filename=path.resolve(root,path.dirname(job.document.source),name);return extractOperatorDeclarationsFromSource(readText(filename),{label:name});});
    if(operators.length)runtime.operatorDefinitions=mergeOperatorDefinitions(...operators);
    if(job.inputSource)await evaluate(job.inputSource,{...runtime,file:`<input:${job.input}>`});
    let value=await evaluate(source,runtime);
    await drainBackgroundTasks(context);
    if(value?.type==="output"&&Object.keys(profile.plan).length)value=withPublicationPlan(value,{...value.publicationPlan,...profile.plan});
    const liveValue=value;
    const originalAssetRefs=[];
    const seenAssets=new Set();
    const collectAssetRefs=node=>{if(!node||typeof node!=="object"||seenAssets.has(node))return;seenAssets.add(node);if(node.type==="output"&&node.kind==="asset")originalAssetRefs.push(node.ref);if(Array.isArray(node))node.forEach(collectAssetRefs);else if(node.type==="output"||Object.getPrototypeOf(node)===Object.prototype)Object.values(node).forEach(collectAssetRefs);};
    collectAssetRefs(value);
    const roots=job.document.assetRoots.map(name=>path.resolve(root,name));
    const packages=Object.fromEntries(Object.entries(job.document.assetPackages).map(([id,name])=>[id,path.resolve(root,name)]));
    const assetStore=createNodeAssetStore({roots,packages});
    const trackedStore={async readAsset(ref,limits){const match=/^package:([^/]+)\/(.+)$/.exec(ref);for(const base of match?[packages[match[1]]].filter(Boolean):roots)dependencies.add(path.resolve(base,match?match[2]:ref));return assetStore.readAsset(ref,limits);}};
    const bundle=await bundleOutputDocument(value,{store:trackedStore,maxTotalBytes:Math.min(profile.maxOutputBytes,64_000_000)});
    value=bundle.document;diagnostics.push(...bundle.manifest.diagnostics);
    for(const [name,content]of bundle.files)put(name,content);
    const bundleText=encodeOutputBundle(bundle);put("source.rix-output.json",bundleText);
    assetFiles=[...bundle.files].map(([name,content])=>({path:name,content}));
    const format=item=>formatValue(item,{context,evaluate:null});
    for(const target of profile.targets){
        const filename=`document.${PUBLICATION_TARGETS[target]}`;
        try{
            if(target==="bundle"){put(filename,bundleText);continue;}
            if(target==="text"){put(filename,`${format(value)}\n`);continue;}
            if(target==="html"&&profile.live){
                const {buildLivePublication}=await import("../src/runtime/live-publication-node.js");
                const rendered=await buildLivePublication({value:liveValue,source:`${job.inputSource}\n${source}`,sourcePath:job.document.source,assetPaths:Object.fromEntries(bundle.manifest.entries.flatMap((entry,index)=>entry.status==="resolved"&&originalAssetRefs[index]?[[originalAssetRefs[index],entry.ref]]:[])),plugins:[...profile.plugins,...header.plugins],title:job.document.title,format});
                put(filename,rendered.content);for(const[name,content]of rendered.assets)put(name,content);diagnostics.push(...rendered.diagnostics);continue;
            }
            const rendered=systemContext._rendererRegistry.render(value,target,{title:job.document.title,assetDir:"assets",stylePolicy:"external",rawMarkup:"fallback"},{format});
            put(filename,rendered.content);for(const asset of rendered.assets)put(asset.path,asset.content);
            diagnostics.push(...rendered.diagnostics.map(entry=>({...entry,target})));
        }catch(error){const reason=message(error);diagnostics.push({level:"warning",code:error.code||"publication-target-unavailable",target,message:reason});put(`${filename}.unavailable.txt`,`${target} output unavailable: ${reason}\n\n${format(value)}\n`);}
    }
    for(const [id,entry]of catalog.loaded){const filename=entry.metadata.sourcePath;if(filename&&!filename.startsWith("<"))dependencies.add(path.resolve(filename));}
    let bytes=0;for(const content of files.values())bytes+=Buffer.from(content,"base64").length;
    if(bytes>profile.maxOutputBytes)throw new Error("Publication output byte budget exceeded");
    if(dependencies.size>profile.maxDependencies)throw new Error("Publication dependency budget exceeded");
    writeFileSync(resultPath,JSON.stringify({ok:true,files:[...files],diagnostics,dependencies:[...dependencies].sort()}));
}catch(error){writeFileSync(resultPath,JSON.stringify({ok:false,files:[],diagnostics:[{level:"error",code:"publication-document-failed",message:message(error)}],dependencies:[...dependencies].sort()}));process.exitCode=1;}
