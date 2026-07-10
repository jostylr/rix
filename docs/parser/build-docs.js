#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join, basename, extname } from "path";
import { marked } from "marked";

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: true,
  mangle: false,
  sanitize: false,
});

// Read the template
const templatePath = join(process.cwd(), "docs", "template.html");
let template = readFileSync(templatePath, "utf-8");

// Make sure template uses relative paths
template = template
  .replace(/href="\/rix-lang-parser\//g, 'href="../')
  .replace(/src="\/rix-lang-parser\//g, 'src="../');

// Get all markdown files in the docs directory
const docsDir = join(process.cwd(), "docs");
const markdownFiles = readdirSync(docsDir).filter(
  (file) => file.endsWith(".md") && file !== "README.md",
);

// Process each markdown file
markdownFiles.forEach((file) => {
  const inputPath = join(docsDir, file);
  const outputName = basename(file, ".md") + ".html";
  const outputPath = join(docsDir, outputName);

  console.log(`Processing ${file} -> ${outputName}`);

  // Read markdown content
  const markdown = readFileSync(inputPath, "utf-8");

  // Convert markdown to HTML
  const htmlContent = marked(markdown);

  // Extract title from first H1 or use filename
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : basename(file, ".md");

  // Replace placeholders in template
  let html = template
    .replace(
      /<title>.*<\/title>/,
      `<title>${title} - RiX Language Parser</title>`,
    )
    .replace(
      /<div id="markdown-content">[\s\S]*?<\/div>/,
      `<div id="markdown-content">${htmlContent}</div>`,
    )
    .replace(
      /<h1>Loading...<\/h1>\s*<p>Please wait while the content is being loaded.<\/p>/,
      "",
    );

  // Update active sidebar link
  const currentPath = `./${outputName}`;
  html = html.replace(
    new RegExp(
      `(<a href="${currentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}")`,
      "g",
    ),
    '$1 class="active"',
  );

  // Write the HTML file
  writeFileSync(outputPath, html);
});

console.log(`\nProcessed ${markdownFiles.length} markdown files.`);
console.log("Documentation build complete!");

// Also create a simple docs index if it doesn't exist
const docsIndexPath = join(docsDir, "index.md");
if (!existsSync(docsIndexPath)) {
  const indexContent = `# RiX Language Parser Documentation

Welcome to the RiX Language Parser documentation. This comprehensive guide covers all aspects of the parser, from basic usage to advanced features.

## Getting Started

- [Architecture](./architecture.html) - Learn about the parser's architecture and design
- [Parsing Guide](./parsing.html) - Understand how the parser works
- [AST Structure](./AST-brief.html) - Explore the Abstract Syntax Tree

## Features

- [Three-Tier System](./three-tier-system.html) - Advanced parsing system
- [Array Generators](./array-generators-implementation.html) - Array and set comprehensions
- [Functions](./function-definitions-summary.html) - Function definitions and calls
- [Matrix & Tensor](./matrix-tensor-implementation.html) - Matrix and tensor support
- [Brace Containers](./brace-containers-README.html) - Container syntax
- [Embedded Parsing](./embedded-parsing.html) - Embedded expression parsing
- [Ternary Operator](./ternary-operator.html) - Conditional expressions
- [Unit Notation](./unit-notation-migration.html) - Unit notation system

## Interactive Demo

Try out the parser in real-time with our [interactive demo](/demo.html).
`;

  writeFileSync(docsIndexPath, indexContent);
  console.log("Created docs/index.md");
}
