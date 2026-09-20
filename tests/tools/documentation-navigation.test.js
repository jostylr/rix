import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  documentationNavigation,
  navigationManifest,
  navigationPages,
  staticNavigationProfile,
} from "../../documentation/navigation.js";

import { checkSearchIndex, renderedSources } from "../../documentation/scripts/check-search-index.js";

const rixRoot = resolve(import.meta.dir, "../..");

test("documentation navigation has existing, uniquely rendered source pages", async () => {
  const pages = navigationPages();
  expect(new Set(pages.map(({ source }) => source)).size).toBe(pages.length);
  for (const { source } of pages) {
    expect(existsSync(resolve(rixRoot, "documentation", source)), source).toBe(true);
  }

  const config = await Bun.file(resolve(rixRoot, "documentation/_quarto.yml")).text();
  const renderBlock = config.match(/  render:\n([\s\S]*?)\n\nfilters:/)?.[1] || "";
  const renderTargets = new Set([...renderBlock.matchAll(/^    - (.+)$/gm)].map((match) => match[1]));
  for (const { source } of pages) expect(renderTargets.has(source), source).toBe(true);
});

test("the published documentation manifest omits build-only source paths", () => {
  const manifest = navigationManifest(documentationNavigation);
  expect(JSON.stringify(manifest)).not.toContain('"source"');
  expect(manifest[0]).toEqual({ text: "Overview", href: "index.html" });
  const languageReference = manifest.find(({ section }) => section === "Language reference");
  expect(languageReference?.contents.length).toBe(9);
  expect(languageReference?.contents.find(({ section }) => section === "Object methods")?.contents.length).toBe(17);
});

test("the renderer reference covers every first-party target and host boundary", async () => {
  const guide = await Bun.file(resolve(rixRoot, "documentation/eval/renderer-guide.md")).text();
  for (const target of [
    "terminal-ascii", "svg", "canvas", "tikz", "png", "markdown", "html",
    "quarto", "latex", "pdf", "gif", "gltf", "csv",
  ]) {
    expect(guide, target).toContain(`| \`${target}\` |`);
    expect(guide, target).toContain(`/plugin-${target}.html`);
  }
  expect(guide).toContain("png-rasterizer-unavailable");
  expect(guide).toContain("pdf-toolchain-unavailable");
  expect(guide).toContain("The example and its binary outputs are exercised by the CLI renderer tests.");
});

test("dynamic and static documentation modes share one navigation catalog", async () => {
  const profile = staticNavigationProfile();
  expect(profile).toContain('section: "Start here"');
  expect(profile).toContain('href: "getting-started.qmd"');
  expect(profile).toContain("bread-crumbs: true");
  expect(profile).toContain("page-navigation: true");

  const config = await Bun.file(resolve(rixRoot, "documentation/_quarto.yml")).text();
  const dynamic = await Bun.file(resolve(rixRoot, "documentation/_quarto-dynamic.yml")).text();
  expect(config).toContain("- [dynamic, static]");
  expect(dynamic).toContain("include-after-body: _includes/dynamic-navigation.html");
  expect(dynamic).toContain("page-navigation: false");
});


test("current guides are rendered while historical records are excluded from search", () => {
  const root = resolve(rixRoot, "documentation");
  const sources = new Set(renderedSources(readFileSync(resolve(root, "_quarto.yml"), "utf8")));
  for (const file of readdirSync(resolve(root, "eval"))) {
    if (file.endsWith(".md")) expect(sources.has(`eval/${file}`), file).toBe(true);
  }
  const historical = [
    "design/parser/spec.md", "design/parser/questions.md", "report-2026-04-02.md",
    "design/eval/ir-format.md", "design/eval/document-output-todo.md",
    "design/eval/rixcel-todo.md", "design/eval/structural-arithmetic-todo.md",
    "design/eval/control-panel-todo.md", "design/plugins.md",
  ];
  const history = readFileSync(resolve(root, "history.qmd"), "utf8");
  for (const source of historical) {
    expect(sources.has(source), source).toBe(true);
    expect(readFileSync(resolve(root, source), "utf8"), source).toMatch(/^---\nsearch: false\n---/);
    expect(history).toContain(`](${source})`);
    expect(navigationPages().some((page) => page.source === source), source).toBe(false);
  }
  for (const source of ["design/eval/runtime-performance.md", "design/eval/async-concurrency.md", "design/eval/rixcel-format.md"]) {
    expect(readFileSync(resolve(root, source), "utf8"), source).not.toMatch(/^search: false$/m);
    expect(navigationPages().some((page) => page.source === source), source).toBe(true);
  }
});


test("generated search validation rejects historical leaks, stale entries, and missing current guides", () => {
  mkdirSync(resolve(rixRoot, "tmp"), { recursive: true });
  const root = mkdtempSync(resolve(rixRoot, "tmp/documentation-search-"));
  try {
    writeFileSync(resolve(root, "_quarto.yml"), "project:\n  render:\n    - guide.md\n    - old.md\n\nfilters: []\n");
    writeFileSync(resolve(root, "guide.md"), "# Current guide\n");
    writeFileSync(resolve(root, "old.md"), "---\nsearch: false\n---\n# History\n");
    const index = (hrefs) => writeFileSync(resolve(root, "search.json"), JSON.stringify(hrefs.map((href) => ({ href }))));
    index(["guide.html", "guide.html#examples"]);
    expect(checkSearchIndex(root, root)).toEqual({ pages: 1, records: 2 });
    index(["guide.html", "old.html#old-api"]);
    expect(() => checkSearchIndex(root, root)).toThrow("historical page is indexed");
    index(["guide.html", "removed.html"]);
    expect(() => checkSearchIndex(root, root)).toThrow("stale or unlisted page is indexed");
    index([]);
    expect(() => checkSearchIndex(root, root)).toThrow("current page is missing from search");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
