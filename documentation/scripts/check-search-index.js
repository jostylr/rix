import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function renderedSources(config) {
  const block = config.match(/^  render:\n([\s\S]*?)(?=^\S|\n\n)/m)?.[1] || "";
  return [...block.matchAll(/^    - (.+)$/gm)].map((match) => match[1]);
}

export function checkSearchIndex(documentationRoot, siteRoot) {
  const config = readFileSync(resolve(documentationRoot, "_quarto.yml"), "utf8");
  const records = JSON.parse(readFileSync(resolve(siteRoot, "search.json"), "utf8"));
  const indexed = new Set(records.map(({ href }) => href.split("#")[0]));
  const errors = [];
  const sources = renderedSources(config);
  const allowed = new Set(sources.map((source) => source.replace(/\.(?:qmd|md)$/, ".html")));
  for (const href of indexed) {
    if (!allowed.has(href)) errors.push(`${href}: stale or unlisted page is indexed`);
  }
  for (const source of sources) {
    const contents = readFileSync(resolve(documentationRoot, source), "utf8");
    const metadata = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
    const excluded = /^search:\s*false\s*$/m.test(metadata);
    const href = source.replace(/\.(?:qmd|md)$/, ".html");
    if (indexed.has(href) === excluded) {
      errors.push(`${source}: ${excluded ? "historical page is indexed" : "current page is missing from search"}`);
    }
  }
  if (errors.length) throw new Error(`Documentation search policy failed:\n${errors.join("\n")}`);
  return { pages: indexed.size, records: records.length };
}
