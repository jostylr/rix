import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decodeOutputJSON } from "../../src/runtime/output-json.js";

const root=path.resolve(import.meta.dir,"../..");
const hasLatex=spawnSync("pdflatex",["--version"]).status===0;
test.skipIf(!hasLatex)("one retained report/deck compiles to article/Beamer with exact sidecars and repeated multipage headers",()=>{
    mkdirSync(path.join(root,"tmp"),{recursive:true});
    const directory=mkdtempSync(path.join(root,"tmp/publication-export-"));
    const run=(file)=>spawnSync("bun",[path.join(root,"bin/rix.js"),`--out=${directory}`,file],{cwd:root,encoding:"utf8",timeout:60000});
    try {
        const exported=run(path.join(root,"examples/renderers/publication-plan.rix"));
        expect(exported.status,exported.stderr).toBe(0);
        for(const name of ["article","deck"]) {
            const restored=decodeOutputJSON(readFileSync(path.join(directory,`${name}-source.txt`),"utf8")).value;
            expect(restored.publicationPlan.profile).toBe(name==="deck"?"slides":"article");
            expect(readFileSync(path.join(directory,`${name}.pdf`)).subarray(0,5).toString()).toBe("%PDF-");
            expect(readFileSync(path.join(directory,`${name}.html`),"utf8")).toContain('data-rix-publication="rix.publication-plan@1"');
            expect(readFileSync(path.join(directory,`${name}.qmd`),"utf8")).toContain(name==="deck"?'format: "revealjs"':'[]{#values}');
        }
        const deck=spawnSync("pdftotext",[path.join(directory,"deck.pdf"),"-"],{encoding:"utf8"});
        expect(deck.status).toBe(0);expect(deck.stdout).toContain("Retained geometry");
        const article=spawnSync("pdftotext",[path.join(directory,"article.pdf"),"-"],{encoding:"utf8"});
        expect(article.status).toBe(0);expect(article.stdout).not.toContain("??");
        expect(article.stdout).toContain("RiX publication");expect(article.stdout).toContain("Exact sources retained");
        const source=`/**\nplugins: [document,pdf]\n**/\n.Plugin.Load("document");table := .Table(["REPEATED COLUMN","Exact fraction"],[${Array.from({length:150},(_,i)=>`[${i+1},${i+1}/7]`).join(",")}]);doc := .document.Publish(.Fragment([table]),{= longTableRows=20 });.Out("long.pdf",doc);0;`;
        writeFileSync(path.join(directory,"long.rix"),source);
        const long=run(path.join(directory,"long.rix"));expect(long.status,long.stderr).toBe(0);
        const extracted=spawnSync("pdftotext",[path.join(directory,"long.pdf"),"-"],{encoding:"utf8"});
        expect(extracted.status).toBe(0);
        const pages=extracted.stdout.split("\f").filter(page=>page.trim());
        expect(pages.length).toBeGreaterThan(2);
        for(const page of pages) expect(page).toContain("REPEATED COLUMN");
        expect(pages.at(-1)).toContain("150");
    } finally { rmSync(directory,{recursive:true,force:true}); }
},120000);
