import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { documentationNavigation, navigationManifest, navigationPages } from "../../documentation/navigation.js";

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
  expect(manifest.find(({ section }) => section === "Language reference")?.contents.length).toBe(6);
});
