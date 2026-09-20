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
      page("tutorial/capstones.md", "End-to-end projects"),
      { text: "Interactive tutorials (RiX Web)", href: "https://rix.ratmath.com/tutorial/", external: true },
      page("eval/sheet-guide.md", "Sheet views"),
      page("eval/workbooks.md", "Workbooks and cross-sheet dependencies"),
      page("eval/rixcel-tensors.md", "Tensor spills and rectangular edits"),
      page("eval/rixcel-regions.md", "Plots, drawings, and regional exports"),
      page("eval/function-returns.md", "Diagnostic guards and early returns"),
      page("eval/course-calculus.md", "Course calculus and checked integration"),
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
          page("eval/objects/certified-approximation.md", "Certified approximations"),
          page("eval/objects/array.md", "Array"),
          page("eval/objects/lazy-sequence.md", "LazySequence"),
          page("eval/objects/async-stream.md", "AsyncStream"),
          page("eval/objects/iterator.md", "Iterator"),
          page("eval/objects/map.md", "Map"),
          page("eval/objects/set.md", "Set"),
          page("eval/objects/string.md", "String"),
          page("eval/objects/tuple.md", "Tuple"),
          page("eval/objects/shaped.md", "Shaped"),
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
    section: "Output and publication",
    contents: [
      page("eval/document-persistence.md", "Document persistence"),
      page("eval/safe-interchange.md", "Safe exact-value interchange"),
      page("eval/output-assets.md", "Assets and portable bundles"),
      page("eval/numeric-presentation.md", "Numeric presentation"),
      page("eval/publication-plan.md", "Publication layout"),
      page("eval/graphic-coordinate-disclosure.md", "Exact coordinates and display approximations"),
      page("eval/validated-scene-views.md", "Validated scene projections"),
      page("eval/exact-exploration.md", "Accessible exact exploration"),
      page("eval/live-publication.md", "Live publication"),
      page("eval/publication-workflows.md", "Publication workflows"),
      page("eval/output-widget-hosting.md", "Interactive output hosts"),
    ],
  },
  {
    section: "Mathematics and execution",
    contents: [
      page("eval/number-notation.md", "Exact number notation"),
      page("eval/mathematical-constants.md", "Mathematical constants"),
      page("eval/mathematical-reals.md", "Certified real numbers"),
      page("eval/mathematical-serialization.md", "Mathematical serialization"),
      page("eval/mathematical-localization.md", "Mathematical localization"),
      page("eval/mathematical-contexts.md", "Mathematical contexts"),
      page("eval/scoped-symbols.md", "Scoped symbols"),
      page("eval/scoped-calculus-cas.md", "Scoped calculus and CAS"),
      page("eval/observed-evaluation.md", "Observed evaluation"),
      page("eval/concurrency-safety.md", "Concurrency safety"),
      page("eval/task-workers.md", "CPU task workers"),
      page("eval/linting.md", "Lint diagnostics"),
    ],
  },
  {
    section: "Developer guide",
    contents: [
      page("developer-guide.qmd", "Developer guide"),
      page("editor-and-agent-tooling.md", "Editor and coding-agent tooling"),
      page("plugin-catalog.md", "Plugin catalog and loading"),
      page("eval/README.md", "Evaluator overview"),
      page("parser/architecture.md", "Parser architecture"),
      page("parser/parsing.md", "Parsing and precedence"),
      page("parser/robustness.md", "Source bounds and editor recovery"),
      page("parser/custom-operators.md", "Custom operators"),
      page("parser/AST-brief.md", "AST reference"),
      page("parser/array-generators-implementation.md", "Array generators"),
      page("parser/embedded-parsing.md", "Embedded parsing"),
      page("parser/matrix-tensor-implementation.md", "Shaped literals"),
    ],
  },
  {
    section: "Runtime design",
    contents: [
      page("design/mathematical-json.md", "Mathematical graph JSON format"),
      page("design/eval/cells-assignments.md", "Cells and assignment"),
      page("design/eval/async-concurrency.md", "Async, concurrency, and background tasks"),
      page("design/eval/runtime-performance.md", "Runtime performance measurements"),
      page("design/eval/async-stream-operators.md", "Stream operators, clocks, and adapters"),
      page("design/eval/units-and-exact-generators.md", "Units and exact generators"),
      page("design/eval/cayley-polar.md", "Cayley polar complex values"),
      page("design/eval/symbolic-calculus.md", "Symbolic specs and calculus"),
      page("design/eval/transformation-reference.md", "Symbolic transformations"),
      page("design/eval/output-model.md", "Structured output, documents, and graphics"),
      page("design/interactive-output-plugins.md", "Interactive output extension contracts"),
      page("design/eval/rixcel-architecture.md", "RiXCel architecture"),
      page("design/eval/rixcel-format.md", "RiXCel document format"),
    ],
  },
  {
    section: "Design and history",
    contents: [
      page("rix-rationales.md", "Design rationales"),
      page("history.qmd", "Historical specifications and delivery records"),
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
