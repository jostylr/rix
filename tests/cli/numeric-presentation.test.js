import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decodeOutputJSON } from "../../src/runtime/output-json.js";

test("numeric publication compiles labels, tables and verbatim fallbacks with an exact source sidecar", () => {
    if (spawnSync("pdflatex",["--version"]).status !== 0) return;
    const root=path.resolve(import.meta.dir,"../.."),temp=path.join(root,"tmp");
    mkdirSync(temp,{recursive:true});
    const directory=mkdtempSync(path.join(temp,"numeric-export-"));
    try {
        const run=spawnSync("bun",[path.join(root,"bin/rix.js"),`--out=${directory}`,path.join(root,"examples/renderers/numeric-presentation.rix")],{cwd:root,encoding:"utf8",timeout:60000});
        expect(run.status,run.stderr).toBe(0);
        expect(readFileSync(path.join(directory,"numbers.pdf")).subarray(0,5).toString()).toBe("%PDF-");
        const doc=decodeOutputJSON(readFileSync(path.join(directory,"numbers-source.txt"),"utf8")).value;
        expect(doc.numericPolicy.decimalPlaces).toBe(3);
        expect(doc.children[2].rows[0][0].toString()).toBe("1/3");
        expect(doc.children[2].rows[0][1].start.toString()).toBe("5/3");
        const extract=spawnSync("pdftotext",[path.join(directory,"numbers.pdf"),"-"],{encoding:"utf8"});
        if (!extract.error) { expect(extract.status).toBe(0);expect(extract.stdout).toContain("≈ 0.333");expect(extract.stdout).toContain("≈ 1.667:1.333"); }
    } finally { rmSync(directory,{recursive:true,force:true}); }
});
