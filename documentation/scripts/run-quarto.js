#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rixRoot = resolve(here, "../..");
const cacheRoot = resolve(rixRoot, "tmp/quarto-home");
const mode = process.argv[2] || "render";

if (!new Set(["render", "preview"]).has(mode)) {
  console.error("Usage: bun documentation/scripts/run-quarto.js <render|preview> [quarto options]");
  process.exit(2);
}

mkdirSync(resolve(cacheRoot, ".cache"), { recursive: true });
mkdirSync(resolve(cacheRoot, "quarto-cache"), { recursive: true });
mkdirSync(resolve(cacheRoot, "deno"), { recursive: true });

const child = Bun.spawn(
  ["quarto", mode, "./documentation", ...process.argv.slice(3)],
  {
    cwd: rixRoot,
    env: {
      ...process.env,
      HOME: cacheRoot,
      XDG_CACHE_HOME: resolve(cacheRoot, ".cache"),
      QUARTO_CACHE_DIR: resolve(cacheRoot, "quarto-cache"),
      DENO_DIR: resolve(cacheRoot, "deno"),
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

const exitCode = await child.exited;
if (exitCode === 0 && mode === "render") {
  const stagedSite = resolve(rixRoot, "documentation/_site");
  const pagesSite = resolve(rixRoot, "docs");

  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else files.push(entryPath);
    }
  };
  walk(stagedSite);

  const broken = [];
  let localLinkCount = 0;
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const original = match[1];
      if (/^(?:[a-z]+:|#|\/\/|data:)/i.test(original)) continue;
      const ref = original.split("#")[0].split("?")[0];
      if (!ref) continue;
      localLinkCount += 1;
      let target = ref.startsWith("/")
        ? resolve(stagedSite, `.${ref}`)
        : resolve(dirname(file), ref);
      if (existsSync(target) && statSync(target).isDirectory()) {
        target = resolve(target, "index.html");
      }
      if (!existsSync(target)) {
        broken.push(`${file.slice(stagedSite.length + 1)} -> ${original}`);
      }
    }
  }
  if (broken.length > 0) {
    console.error(`Broken local documentation links:\n${broken.join("\n")}`);
    process.exit(1);
  }
  console.log(`Validated ${htmlFiles.length} HTML pages and ${localLinkCount} local asset/link references`);

  rmSync(pagesSite, { recursive: true, force: true });
  cpSync(stagedSite, pagesSite, { recursive: true });
  console.log(`Published documentation to ${pagesSite}`);
}

process.exit(exitCode);
