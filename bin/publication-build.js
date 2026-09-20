import { findExecutable } from "./find-executable.js";
import { fileURLToPath } from "node:url";
/** Bounded document/input/target builds, dependency-aware watch, and staged replacement. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, renameSync, lstatSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { createPublicationBuild, createPublicationRebuilder, PUBLICATION_MANIFEST_SCHEMA } from "../src/runtime/publication-workflow.js";
import { safePublicationPath } from "../src/runtime/publication-plan.js";
const hash=value=>createHash("sha256").update(value).digest("hex");
const fingerprint=files=>JSON.stringify([...new Set(files)].sort().map(file=>{try{const stat=statSync(file,{bigint:true});return[file,String(stat.size),String(stat.mtimeNs)];}catch{return[file,"missing"];}}));
function temporaryDirectory(){const root=path.resolve(process.cwd(),"tmp");mkdirSync(root,{recursive:true});return mkdtempSync(path.join(root,"rix-publication-"));}
function readConfig(filename){if(statSync(filename).size>1_000_000)throw new Error("Publication manifest exceeds one million bytes");return JSON.parse(readFileSync(filename,"utf8"));}
function runWorker(request,{signal,timeoutMs,maxBytes,scratch}) {
    return new Promise((resolve,reject)=>{
        signal?.throwIfAborted();const requestPath=path.join(scratch,"request.json"),resultPath=path.join(scratch,"result.json");
        writeFileSync(requestPath,JSON.stringify({...request,resultPath}));
        const child=spawn(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),"publication-worker.js"),requestPath],{cwd:request.root,detached:process.platform!=="win32",stdio:["ignore","ignore","pipe"]});
        let finished=false,stderr="";
        const kill=()=>{try{process.platform!=="win32"?process.kill(-child.pid,"SIGKILL"):child.kill("SIGKILL");}catch{}};
        const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener("abort",abort);error?reject(error):resolve(value);};
        const abort=()=>{kill();finish(signal.reason||new Error("Publication build cancelled"));};
        const timer=setTimeout(()=>{kill();finish(new Error(`Publication job exceeded ${timeoutMs} ms`));},timeoutMs);
        signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
        child.stderr.on("data",chunk=>{if(stderr.length<4096)stderr+=String(chunk).slice(0,4096-stderr.length);});
        child.on("error",error=>finish(error));
        child.on("exit",()=>{if(finished)return;try{if(!existsSync(resultPath))throw new Error(stderr||"Publication worker exited without a result");if(statSync(resultPath).size>maxBytes*2+4_000_000)throw new Error("Publication worker result exceeded byte budget");finish(null,JSON.parse(readFileSync(resultPath,"utf8")));}catch(error){finish(error);}});
    });
}
function describeDependency(filename,root){const relative=path.relative(root,filename).replaceAll(path.sep,"/");return relative.startsWith("../")?`<installed>/${path.basename(filename)}`:relative;}
export async function buildPublication({configPath,profileName=null,outDir=null,signal=null,cache=new Map(),onProgress=()=>{}}) {
    const absolute=path.resolve(configPath),root=path.dirname(absolute),raw=readConfig(absolute),spec=createPublicationBuild(raw,profileName);
    const signature=hash(JSON.stringify(spec.profile));const files=new Map(),documents=[],diagnostics=[],dependencies=new Set([absolute]);
    const scratch=temporaryDirectory();const started=Date.now();
    let bytes=0;
    try{
        for(const [index,job]of spec.jobs.entries()){
            signal?.throwIfAborted();if(Date.now()-started>spec.profile.maxBuildMs)throw new Error("Publication build time budget exceeded");
            const requestSignature=hash(JSON.stringify({signature,job}));let result;
            const previous=cache.get(job.id);
            if(previous?.signature===requestSignature&&previous.fingerprint===fingerprint(previous.result.dependencies)){result=previous.result;onProgress({id:job.id,status:"reused"});}
            else {
                const jobRoot=path.join(scratch,String(index));mkdirSync(jobRoot);
                onProgress({id:job.id,status:"building"});
                try{result=await runWorker({root,job,profile:spec.profile},{signal,timeoutMs:Math.min(spec.profile.maxJobMs,spec.profile.maxBuildMs-(Date.now()-started)),maxBytes:spec.profile.maxOutputBytes,scratch:jobRoot});}
                catch(error){signal?.throwIfAborted();result={ok:false,files:[],dependencies:[path.resolve(root,job.document.source),...job.document.dependencies.map(name=>path.resolve(root,name))],diagnostics:[{level:"error",code:"publication-job-failed",message:String(error.message).replaceAll(root+path.sep,"")}]};}
                if(result.ok)cache.set(job.id,{signature:requestSignature,fingerprint:fingerprint(result.dependencies),result});
            }
            for(const filename of result.dependencies||[])dependencies.add(filename);
            if(dependencies.size>spec.profile.maxDependencies)throw new Error("Batch dependency count budget exceeded");
            const artifacts=[];
            for(const[name,encoded]of result.files||[]){safePublicationPath(name);const relative=`${job.id}/${name}`,data=new Uint8Array(Buffer.from(encoded,"base64"));bytes+=data.length;if(bytes>spec.profile.maxOutputBytes)throw new Error("Batch output byte budget exceeded");files.set(relative,data);artifacts.push({path:relative,bytes:data.length,sha256:hash(data)});}
            const jobDiagnostics=(result.diagnostics||[]).map(entry=>({...entry,document:job.document.id,input:job.input,source:entry.source||job.document.source}));diagnostics.push(...jobDiagnostics);
            documents.push({id:job.document.id,input:job.input,source:job.document.source,status:result.ok?"built":"failed",targets:spec.profile.targets,artifacts:artifacts.sort((a,b)=>a.path.localeCompare(b.path)),diagnostics:jobDiagnostics});
        }
        let dependencyBytes=0;
        const dependencyRecords=[...dependencies].sort().map(filename=>{
            let digest=null;
            if(existsSync(filename)&&statSync(filename).isFile()) {
                dependencyBytes+=statSync(filename).size;
                if(dependencyBytes>spec.profile.maxOutputBytes+spec.profile.maxSourceBytes)throw new Error("Batch dependency byte budget exceeded");
                digest=hash(readFileSync(filename));
            }
            return {path:describeDependency(filename,root),sha256:digest};
        });
        const manifest={schema:PUBLICATION_MANIFEST_SCHEMA,profile:spec.profile.name,documents,diagnostics,dependencies:dependencyRecords};
        return {ok:documents.every(doc=>doc.status==="built"),manifest,files,dependencies:[...dependencies],outDir:outDir?path.resolve(outDir):path.resolve(root,spec.out),configPath:absolute,profile:spec.profile};
    }finally{rmSync(scratch,{recursive:true,force:true});}
}

/** Publish complete files from a staging directory; on any replacement failure restore the old tree. */
export function commitPublication(result,{signal=null,beforeReplace=null}={}) {
    if(!result.ok)throw Object.assign(new Error("Publication failed; previous output was retained"),{manifest:result.manifest});
    signal?.throwIfAborted();const out=result.outDir;
    if(existsSync(out)){
        if(lstatSync(out).isSymbolicLink()||!lstatSync(out).isDirectory())throw new Error("Publication output must be an owned directory, not a link or file");
        const marker=path.join(out,"manifest.json");
        if(!existsSync(marker)||JSON.parse(readFileSync(marker,"utf8")).schema!==PUBLICATION_MANIFEST_SCHEMA)throw new Error("Refusing to replace a directory not owned by a publication build");
    }
    const scratch=temporaryDirectory(),stage=path.join(scratch,"stage"),backup=path.join(scratch,"previous");mkdirSync(stage);
    let replaced=false,movedPrevious=false;
    try{
        for(const[relative,content]of result.files){safePublicationPath(relative);const target=path.join(stage,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,content);}
        writeFileSync(path.join(stage,"manifest.json"),JSON.stringify(result.manifest,null,2)+"\n");
        signal?.throwIfAborted();beforeReplace?.();signal?.throwIfAborted();mkdirSync(path.dirname(out),{recursive:true});
        if(existsSync(out)){renameSync(out,backup);movedPrevious=true;}
        try{renameSync(stage,out);replaced=true;}catch(error){if(movedPrevious)renameSync(backup,out);throw error;}
        return result.manifest;
    }finally{if(!replaced&&movedPrevious&&existsSync(backup)&&!existsSync(out))renameSync(backup,out);rmSync(scratch,{recursive:true,force:true});}
}
export function publicationCapabilities(){return{schema:"rix.publication-capabilities@1",sourceTargets:["html","markdown","quarto","latex","svg","tikz","canvas","gltf","text","bundle"],binaryTargets:{png:Boolean(findExecutable("rsvg-convert")||findExecutable("magick")),pdf:Boolean(findExecutable("pdflatex")),gif:Boolean(findExecutable("magick"))},network:"No remote runtime dependencies are added",conformance:"PDF/A, tagged PDF and embedded fonts are unverified"};}
export async function watchPublication(options){
    const cache=new Map();let dependencies=[path.resolve(options.configPath)],stamp=fingerprint(dependencies),closed=false;
    const raw=readConfig(options.configPath),profile=createPublicationBuild(raw,options.profileName).profile;
    const rebuilder=createPublicationRebuilder({debounceMs:profile.debounceMs,build:async({signal})=>{const result=await buildPublication({...options,signal,cache});dependencies=result.dependencies;stamp=fingerprint(dependencies);if(!result.ok)throw Object.assign(new Error("Publication failed; previous output was retained"),{manifest:result.manifest});return result;},commit:(result,context)=>{commitPublication(result,context);options.onBuild?.(result);},onError:error=>options.onError?.(error)});
    await rebuilder.flush();
    const timer=setInterval(()=>{if(closed)return;const next=fingerprint(dependencies);if(next!==stamp){stamp=next;rebuilder.invalidate();}},profile.pollMs);
    return {async close(){closed=true;clearInterval(timer);await rebuilder.close();}};
}
export async function runPublicationCli(args){
    if(args.includes("--help")||args.length===0){console.log("rix publish build.json [--profile=NAME] [--out=DIR] [--json] [--watch] [--watch-for=MS]\nrix publish --capabilities");return;}
    if(args.includes("--capabilities")){console.log(JSON.stringify(publicationCapabilities(),null,2));return;}
    if(args.filter(arg=>!arg.startsWith("--")).length>1)throw new Error("Publication accepts one build manifest");
    const configPath=args.find(arg=>!arg.startsWith("--"));if(!configPath)throw new Error("Publication requires a build manifest");
    for(const arg of args)if(arg.startsWith("--")&&!/^(--json|--watch|--profile=.+|--out=.+|--watch-for=\d+)$/.test(arg))throw new Error(`Unknown publication option ${arg}`);
    const value=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
    const json=args.includes("--json"),options={configPath,profileName:value("profile"),outDir:value("out")};
    const report=result=>console.log(json?JSON.stringify(result.manifest):`Published ${result.manifest.documents.length} document/input build(s) to ${result.outDir}`);
    const failure=error=>{console.error(json?JSON.stringify(error.manifest||{error:error.message}):error.message);};
    if(args.includes("--watch")){
        const duration=value("watch-for");if(duration&&(!Number.isSafeInteger(Number(duration))||Number(duration)<1||Number(duration)>3_600_000))throw new Error("watch-for must be 1…3600000 ms");
        const watcher=await watchPublication({...options,onBuild:report,onError:failure});
        await new Promise(resolve=>{let timer;const stop=()=>{clearTimeout(timer);process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);resolve();};process.once("SIGINT",stop);process.once("SIGTERM",stop);if(duration)timer=setTimeout(stop,Number(duration));});await watcher.close();return;
    }
    const result=await buildPublication(options);if(!result.ok){failure(Object.assign(new Error("Publication failed; previous output was retained"),{manifest:result.manifest}));process.exitCode=1;return;}
    commitPublication(result);report(result);
}
