const page = (source, text, href = source.replace(/\.(?:qmd|md)$/, ".html")) => ({ source, text, href });

export const documentationNavigation = [
  page("index.qmd", "Overview"),
  {
    section: "Start here",
    contents: [
      page("getting-started.qmd", "Getting started"),
      page("language-at-a-glance.qmd", "RiX at a glance"),
      page("highlights.md", "RiX highlights"),
      page("status.qmd", "Implementation status"),
    ],
  },
  {
    section: "Learn RiX",
    contents: [
      page("introduction.md", "Complete introduction"),
      { text: "Interactive tutorials (RiX Web)", href: "https://rix.ratmath.com/tutorial/", external: true },
      page("eval/sheet-guide.md", "Sheet views"),
    ],
  },
  {
    section: "Language reference",
    contents: [
      page("eval/syntax-guide.md", "Syntax and functions"),
      page("eval/methods-guide.md", "Methods"),
      {
        section: "Object methods",
        contents: [
          page("eval/objects/integer.md", "Integer"),
          page("eval/objects/rational.md", "Rational"),
          page("eval/objects/rational-interval.md", "RationalInterval"),
          page("eval/objects/array.md", "Array"),
          page("eval/objects/lazy-sequence.md", "LazySequence"),
          page("eval/objects/async-stream.md", "AsyncStream"),
          page("eval/objects/iterator.md", "Iterator"),
          page("eval/objects/map.md", "Map"),
          page("eval/objects/set.md", "Set"),
          page("eval/objects/string.md", "String"),
          page("eval/objects/tuple.md", "Tuple"),
          page("eval/objects/tensor.md", "Tensor"),
          page("eval/objects/deferred.md", "Deferred"),
          page("eval/objects/structural-values.md", "Structural values"),
          page("eval/objects/exact-cartesian.md", "Exact Cartesian values"),
          page("eval/objects/cayley.md", "Cayley"),
        ],
      },
      page("eval/output-guide.md", "Structured output and graphics"),
      page("eval/renderer-guide.md", "Renderer plugins"),
      page("eval/scene3d-guide.md", "3D scenes and n-dimensional projection"),
      page("eval/controls-guide.md", "Reactive controls"),
      page("eval/types-and-traits-guide.md", "Types and traits"),
      page("reference/system-reference.md", "Generated runtime catalog"),
    ],
  },
  {
    section: "Developer guide",
    contents: [
      page("developer-guide.qmd", "Developer guide"),
      page("plugin-catalog.md", "Plugin catalog and loading"),
      page("eval/README.md", "Evaluator overview"),
      page("parser/architecture.md", "Parser architecture"),
      page("parser/parsing.md", "Parsing and precedence"),
      page("parser/custom-operators.md", "Custom operators"),
      page("parser/AST-brief.md", "AST reference"),
      page("design/eval/ir-format.md", "IR design snapshot"),
      page("parser/array-generators-implementation.md", "Array generators"),
      page("parser/embedded-parsing.md", "Embedded parsing"),
      page("parser/matrix-tensor-implementation.md", "Matrices and tensors"),
    ],
  },
  {
    section: "Runtime design",
    contents: [
      page("design/eval/cells-assignments.md", "Cells and assignment"),
      page("design/eval/async-concurrency.md", "Async, concurrency, and background tasks"),
      page("design/eval/units-and-exact-generators.md", "Units and exact generators"),
      page("design/eval/cayley-polar.md", "Cayley polar complex values"),
      page("design/eval/symbolic-calculus.md", "Symbolic specs and calculus"),
      page("design/eval/transformation-reference.md", "Symbolic transformations"),
      page("design/eval/output-model.md", "Structured output, documents, and graphics"),
      page("design/eval/document-output-todo.md", "Document blocks, inline content, and assets"),
      page("design/interactive-output-plugins.md", "Interactive output extension contracts"),
      page("design/editor-tooling.md", "Editor, language-server, and AI tooling"),
      page("design/eval/rixcel-architecture.md", "RiXCel architecture"),
      page("design/eval/rixcel-format.md", "RiXCel document format"),
      page("design/eval/rixcel-todo.md", "RiXCel implementation checklist"),
      page("design/plugins.md", "Plugin roadmap and rendering contracts"),
    ],
  },
  {
    section: "Design and history",
    contents: [
      page("rix-rationales.md", "Design rationales"),
      page("design/parser/spec.md", "Early language specification"),
      page("design/parser/questions.md", "Open design areas"),
      page("report-2026-04-02.md", "April 2026 review (historical)"),
    ],
  },
];

export function navigationPages(items = documentationNavigation) {
  return items.flatMap((item) => item.contents ? navigationPages(item.contents) : item.source ? [item] : []);
}

export function navigationManifest(items = documentationNavigation) {
  return items.map(({ source: _source, ...item }) => ({
    ...item,
    ...(item.contents ? { contents: navigationManifest(item.contents) } : {}),
  }));
}

function yamlString(value) {
  return JSON.stringify(value);
}

function staticSidebarYaml(items, indent = 6) {
  const padding = " ".repeat(indent);
  return items.flatMap((item) => {
    if (item.contents) {
      return [
        `${padding}- section: ${yamlString(item.section)}`,
        `${padding}  contents:`,
        staticSidebarYaml(item.contents, indent + 4),
      ];
    }
    return [
      `${padding}- text: ${yamlString(item.text)}`,
      `${padding}  href: ${yamlString(item.source || item.href)}`,
    ];
  }).flat().join("\n");
}

export function staticNavigationProfile(items = documentationNavigation) {
  return `# Generated from navigation.js by scripts/run-quarto.js. Do not edit.\nwebsite:\n  sidebar:\n    contents:\n${staticSidebarYaml(items)}\n  bread-crumbs: true\n  page-navigation: true\n`;
}
