#!/usr/bin/env bun
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {parseAndEvaluate,renderOutputHtml,formatValue} from '../src/index-node.js';
const root=path.resolve(import.meta.dir,'..'),artifacts=path.resolve(root,'../tmp/r4-plot-browser');await mkdir(artifacts,{recursive:true});
const value=parseAndEvaluate(await readFile(path.join(root,'examples/plot/bounded-inputs.rix'),'utf8'));
const css=await readFile(path.join(root,'styles/output-widgets.css'),'utf8');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Bounded plotting</title><style>${css}body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem;overflow-wrap:anywhere}svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Bounded stream and heat map</h1>${renderOutputHtml(value,formatValue)}</html>`;
await Bun.write(path.join(artifacts,'plots.html'),html);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(html,{headers:{'content-type':'text/html'}})});let browser;
try{const {chromium}=await import(process.env.RIX_PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launchPersistentContext(path.join(artifacts,"profile-"+Date.now()),{headless:true,...(process.env.RIX_CHROME_EXECUTABLE?{executablePath:process.env.RIX_CHROME_EXECUTABLE}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
assert.equal(await page.locator('svg').count(),2);
assert.match(await page.locator('svg').first().getAttribute('aria-label'),/Stream dropped 2 older samples/);
assert.match(await page.locator('svg').last().getAttribute('aria-label'),/exact mean, minimum, maximum and source bounds/);
assert.ok(await page.locator('svg [data-rix-semantic-id^="heatmap-source-"]').count()>0);
await page.screenshot({path:path.join(artifacts,'plots.png'),fullPage:true});
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
console.log('Bounded stream/heatmap static SVG, exact disclosure, semantic IDs and narrow layout passed');
}finally{await browser?.close();server.stop(true);}
