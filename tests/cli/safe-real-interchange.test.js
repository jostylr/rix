import {test,expect} from 'bun:test';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeOutputJSON} from '../../src/runtime/output-json.js';
test('CLI selects async refinement and exports the same exact static evidence',()=>{
 const root=path.resolve(import.meta.dir,'../..'),temp=path.join(root,'tmp');mkdirSync(temp,{recursive:true});const directory=mkdtempSync(path.join(temp,'real-interchange-'));
 try{
  const run=spawnSync('bun',[path.join(root,'bin/rix.js'),'--no-config',`--out=${directory}`,path.join(root,'examples/eval/safe-real-interchange.rix')],{cwd:root,encoding:'utf8',timeout:20000});
  expect(run.status,run.stderr).toBe(0);const html=readFileSync(path.join(directory,'interchange.html'),'utf8');expect(html).toContain('unavailable');expect(html).toContain('providerChecked');
  const view=decodeOutputJSON(readFileSync(path.join(directory,'interchange.rixdoc.json'),'utf8')).value;expect(String(view.rows[0][2])).toBe('1:2');expect(view.rows[1][1].value).toBe('providerChecked');expect(view.rows[1][2].low.lessThan(view.rows[1][2].high)).toBe(true);
 }finally{rmSync(directory,{recursive:true,force:true});}
},30000);
