import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { createPublicationBuild, createPublicationProfile, createPublicationRebuilder, parsePublicationProfiles, serializePublicationProfiles } from "../../src/runtime/publication-workflow.js";
import { buildPublication, commitPublication, watchPublication } from "../../bin/publication-build.js";
const tmp=path.resolve(import.meta.dir,"../../tmp");mkdirSync(tmp,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=8000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error("Timed out awaiting publication update");await delay(40);}}
function fixture(profile={}){const root=mkdtempSync(path.join(tmp,"publication-test-"));writeFileSync(path.join(root,"one.rix"),'.Paragraph(["exact", 1/3]);');writeFileSync(path.join(root,"two.rix"),'.Paragraph(["second", n]);');writeFileSync(path.join(root,"dependency.txt"),"a");const configPath=path.join(root,"build.json");const config={schema:"rix.publication-build@1",out:"output",defaultProfile:"review",profiles:{review:{plugins:["document"],targets:["html","markdown","bundle"],inputs:{base:"n := 3;"},...profile}},documents:[{id:"one",source:"one.rix",dependencies:["dependency.txt"]},{id:"two",source:"two.rix"}]};writeFileSync(configPath,JSON.stringify(config));return{root,config,configPath};}
test("profile tables round trip structured plans and input source; bounds reject ambiguous unsafe builds",()=>{
 const setting={defaultExportProfile:"print",exportProfiles:{print:{targets:["latex","pdf"],inputs:{small:'n := 3; # "quoted"'},plan:{pageSize:"a4paper",index:[{term:"n",label:"sample"}]}}}};
 const parsed=parsePublicationProfiles(serializePublicationProfiles(setting));expect(parsed.exportProfiles.print.plan).toEqual(setting.exportProfiles.print.plan);expect(parsed.exportProfiles.print.inputs).toEqual(setting.exportProfiles.print.inputs);
 expect(()=>parsePublicationProfiles('[export_profiles.x]\nlive=true\nlive=false')).toThrow("duplicate");expect(()=>parsePublicationProfiles('[export_profiles.x]\n[export_profiles.x]')).toThrow("duplicate");
 expect(()=>createPublicationProfile({maxJobs:0})).toThrow();expect(()=>createPublicationBuild({schema:"rix.publication-build@1",documents:[{id:"x",source:"../secret.rix"}]})).toThrow();
 expect(()=>createPublicationBuild({schema:"rix.publication-build@1",profiles:{a:{targets:["html","text"],maxJobs:1}},documents:[{id:"x",source:"a.rix"}]})).toThrow("matrix");
});
test("batch produces exact artifacts, deterministic manifest, dependency reuse and complete replacements",async()=>{
 const f=fixture();const cache=new Map();try{
 const first=await buildPublication({...f,cache});expect(first.ok).toBe(true);expect(new TextDecoder().decode(first.files.get("one/base/document.html"))).toContain("1/3");expect(new TextDecoder().decode(first.files.get("two/base/document.html"))).toContain("3");commitPublication(first);
 const statuses=[];const second=await buildPublication({...f,cache,onProgress:e=>statuses.push(e)});expect(second.manifest).toEqual(first.manifest);expect(statuses.map(e=>e.status)).toEqual(["reused","reused"]);
 await delay(5);writeFileSync(path.join(f.root,"dependency.txt"),"different");statuses.length=0;const third=await buildPublication({...f,cache,onProgress:e=>statuses.push(e)});expect(statuses.map(e=>e.status)).toEqual(["building","reused"]);
 writeFileSync(path.join(f.root,"output/stale.txt"),"old");expect(()=>commitPublication(third,{beforeReplace:()=>{throw new Error("interrupted");}})).toThrow("interrupted");expect(existsSync(path.join(f.root,"output/stale.txt"))).toBe(true);commitPublication(third);expect(existsSync(path.join(f.root,"output/stale.txt"))).toBe(false);
 writeFileSync(path.join(f.root,"two.rix"),"!!!");const failure=await buildPublication({...f,cache});expect(failure.ok).toBe(false);expect(()=>commitPublication(failure)).toThrow("retained");expect(JSON.parse(readFileSync(path.join(f.root,"output/manifest.json"))).documents.every(doc=>doc.status==="built")).toBe(true);
 }finally{rmSync(f.root,{recursive:true,force:true});}
},30000);
test("job budgets terminate computation and source budgets report document diagnostics",async()=>{
 const f=fixture({maxJobMs:20});try{writeFileSync(path.join(f.root,"one.rix"),"f := x -> f(x+1); f(0);");const result=await buildPublication(f);expect(result.ok).toBe(false);expect(result.manifest.diagnostics.some(item=>/exceeded|call stack/i.test(item.message))).toBe(true);f.config.profiles.review.maxSourceBytes=3;writeFileSync(f.configPath,JSON.stringify(f.config));const bounded=await buildPublication(f);expect(bounded.ok).toBe(false);expect(bounded.manifest.diagnostics.length).toBeGreaterThan(0);}finally{rmSync(f.root,{recursive:true,force:true});}
},10000);
test("watch retains last good output after errors and recovers on next edit",async()=>{
 const f=fixture({pollMs:30,debounceMs:20});const builds=[],errors=[];let watcher;try{
 watcher=await watchPublication({...f,onBuild:r=>builds.push(r),onError:e=>errors.push(e)});expect(builds).toHaveLength(1);
 writeFileSync(path.join(f.root,"two.rix"),"!!!");await until(()=>errors.length);expect(builds).toHaveLength(1);expect(existsSync(path.join(f.root,"output/two/base/document.html"))).toBe(true);
 writeFileSync(path.join(f.root,"two.rix"),'.Paragraph(["recovered"]);');await until(()=>builds.length===2);expect(readFileSync(path.join(f.root,"output/two/base/document.html"),"utf8")).toContain("recovered");
 }finally{await watcher?.close();rmSync(f.root,{recursive:true,force:true});}
},20000);
test("revision controller cancels superseded work, commits only latest and joins work on close",async()=>{
 const finishes=[],commits=[];const rebuilder=createPublicationRebuilder({debounceMs:1,build:async({revision,signal})=>{await delay(revision===1?50:5);finishes.push({revision,aborted:signal.aborted});return revision;},commit:async value=>commits.push(value)});
 const first=rebuilder.flush();await delay(2);await rebuilder.flush();await first;expect(commits).toEqual([2]);expect(finishes.find(x=>x.revision===1).aborted).toBe(true);const closing=rebuilder.flush();await rebuilder.close();await closing;expect(commits).toEqual([2]);
});
