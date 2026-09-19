import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dir,"../..");
const directories = [];
function directory() { mkdirSync(path.join(root,"tmp"),{recursive:true}); const dir=mkdtempSync(path.join(root,"tmp","static-export-")); directories.push(dir); return dir; }
function available(command) { return spawnSync(command,["--version"]).status === 0; }
function runExample(name,dir) {
    const result=spawnSync("bun",[path.join(root,"bin/rix.js"),`--out=${dir}`,path.join(root,"examples/renderers",name)],{cwd:root,encoding:"utf8"});
    expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
}
afterEach(() => { while(directories.length) rmSync(directories.pop(),{recursive:true,force:true}); });

describe("retained static export fixtures", () => {
    test("lit Scene3D and exact trajectory contact sheets export and compile with TeX", () => {
        const dir=directory(); runExample("static-scene-animation.rix",dir);
        const sheet=readFileSync(path.join(dir,"trajectory-frames.html"),"utf8");
        expect(sheet).toContain("Exact retained trajectory");
        const bundle=readdirSync(dir).find((entry) => entry.startsWith("animation-"));
        const manifest=JSON.parse(readFileSync(path.join(dir,bundle,"manifest.json"),"utf8"));
        expect(manifest.frames.map(({state}) => state)).toEqual(["0","1/3","2/3","1"]);
        expect(manifest.frames.map(({delay}) => delay)).toEqual([25,50,50,75]);
        if (available("pdflatex")) for(const name of ["lit-scene","trajectory-frame"]) {
            const compiled=spawnSync("pdflatex",["-interaction=nonstopmode","-halt-on-error",`${name}.tikz`],{cwd:dir,encoding:"utf8"});
            expect(compiled.status,compiled.stdout.slice(-5000)+compiled.stderr).toBe(0);
            expect(readFileSync(path.join(dir,`${name}.pdf`)).subarray(0,4).toString()).toBe("%PDF");
        }
        if (available("rsvg-convert")) {
            const image=spawnSync("rsvg-convert",[path.join(dir,bundle,"frame-0002.svg")]);
            expect(image.status).toBe(0);
            expect(image.stdout.subarray(1,4).toString()).toBe("PNG");
        }
    },30000);

    test("the derivation GIF writes readable retained frame assets and correct delays", () => {
        if (!available("magick") || !available("rsvg-convert")) return;
        const dir=directory();runExample("two-frame-derivation.rix",dir);
        const bundle=readdirSync(dir).find((entry) => entry.startsWith("animation-"));
        const manifest=JSON.parse(readFileSync(path.join(dir,bundle,"manifest.json"),"utf8"));
        expect(manifest.frames).toHaveLength(2);
        expect(manifest.frames[0].graphics.children[1].text.value ?? manifest.frames[0].graphics.children[1].text).toContain("x² - 1");
        expect(readFileSync(path.join(dir,bundle,"captions.txt"),"utf8")).toContain("Frame 2");
        expect(readFileSync(path.join(dir,bundle,"contact-sheet.html"),"utf8")).toContain('src="frame-0002.svg"');
        const identified=spawnSync("magick",["identify","-format","%n %T\\n",path.join(dir,"two-frame-derivation.gif")],{encoding:"utf8"});
        expect(identified.stdout.trim().split("\n")).toEqual(["2 100","2 100"]);
    },30000);
});
