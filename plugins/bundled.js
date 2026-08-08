/** Register bundled opt-in plugins with a host catalog. */

import oracleSource from "./oracle/oracle.plugin.rix" with { type: "text" };
import numericsSource from "./numerics/numerics.plugin.rix" with { type: "text" };
import { readPluginHeader } from "../src/runtime/plugin-catalog.js";
import { install as installDrawPlugin } from "./draw/draw.plugin.rix.js";
import { install as installFractionPlugin } from "./fraction/fraction.plugin.rix.js";
import { install as installFracfunPlugin } from "./fracfun/fracfun.plugin.rix.js";
import { install as installPolyPlugin } from "./poly/poly.plugin.rix.js";
import { install as installRatfunPlugin } from "./ratfun/ratfun.plugin.rix.js";
import { install as installSymbolicPlugin } from "./symbolic/symbolic.plugin.rix.js";
import { install as installAlgebraPlugin } from "./algebra/algebra.plugin.rix.js";
import { install as installExactAlgebrasPlugin } from "./exact-algebras/exact-algebras.plugin.rix.js";
import { install as installPlotPlugin } from "./plot/plot.plugin.rix.js";
import { install as installScene3DPlugin } from "./scene3d/scene3d.plugin.rix.js";
import { install as installNdPlugin } from "./nd/nd.plugin.rix.js";
import { install as installGeometryPlugin } from "./geometry/geometry.plugin.rix.js";
import { install as installDataPlugin } from "./data/data.plugin.rix.js";
import { install as installDocumentPlugin } from "./document/document.plugin.rix.js";
import { install as installTerminalAsciiPlugin } from "./render-terminal-ascii/terminal-ascii.plugin.rix.js";
import { install as installRadixPlugin } from "./radix/radix.plugin.rix.js";
import { install as installSvgPlugin } from "./render-svg/svg.plugin.rix.js";
import { install as installCanvasPlugin } from "./render-canvas/canvas.plugin.rix.js";
import { install as installTikzPlugin } from "./render-tikz/tikz.plugin.rix.js";
import { install as installMarkdownPlugin } from "./render-markdown/markdown.plugin.rix.js";
import { install as installHtmlPlugin } from "./render-html/html.plugin.rix.js";
import { install as installQuartoPlugin } from "./render-quarto/quarto.plugin.rix.js";
import { install as installLatexPlugin } from "./render-latex/latex.plugin.rix.js";
import { install as installPngPlugin } from "./render-png/png.plugin.rix.js";
import { install as installPdfPlugin } from "./render-pdf/pdf.plugin.rix.js";
import { install as installGltfPlugin } from "./render-gltf/gltf.plugin.rix.js";
import { install as installCsvPlugin } from "./render-csv/csv.plugin.rix.js";

const BUNDLED_PLUGINS = [
    {
        metadata: readPluginHeader(numericsSource, "numerics.plugin.rix"),
        source: numericsSource,
        sourcePath: "bundled:numerics.plugin.rix",
    },
    {
        metadata: readPluginHeader(oracleSource, "oracle.plugin.rix"),
        source: oracleSource,
        sourcePath: "bundled:oracle.plugin.rix",
    },
    {
        metadata: {
            id: "radix",
            description: "Bounded exact positional expansions and repeating-period analysis for rational values.",
            kind: "host",
            mount: "radix",
            exports: ["Expansion", "Digits", "PeriodLength", "PeriodInfo", "ToString"],
            groups: ["Exact", "Radix"],
            permissions: [],
            deterministic: true,
            defaultEnabled: false,
        },
        install: installRadixPlugin,
    },
    {
        metadata: {
            id: "exact-algebras",
            description: "Exact rational quaternion and octonion values.",
            kind: "host",
            mount: "exactAlgebras",
            exports: ["Quaternion", "Octonion", "Components", "Conjugate", "NormSquared", "Inverse"],
            groups: ["Exact"],
            permissions: [],
            defaultEnabled: false,
        },
        install: ({ systemContext, registry }) => installExactAlgebrasPlugin({ systemContext, registry }),
    },
    {
        metadata: {
            id: "fraction",
            description: "Representation-sensitive unreduced integer fractions with mediant and classroom addition policies.",
            kind: "host", mount: "fraction", aliases: ["frac", "f"],
            exports: ["Fraction", "Parse"], groups: ["Algebra", "Exact", "Symbolic"], permissions: [],
            provides: ["rix.fraction@1"], schemas: ["rix.fraction@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: installFractionPlugin,
    },
    {
        metadata: {
            id: "poly",
            description: "Semantic callable univariate polynomials with structural and symbolic entry forms.",
            kind: "host",
            mount: "poly",
            aliases: ["polynomial", "p"],
            exports: ["Polynomial", "Parse", "Var", "Fun"],
            groups: ["Algebra", "Exact", "Symbolic"],
            permissions: [],
            provides: ["rix.polynomial@1"],
            schemas: ["rix.polynomial@1"],
            snapshot: false,
            deterministic: true,
            defaultEnabled: false,
        },
        install: installPolyPlugin,
    },
    {
        metadata: {
            id: "ratfun",
            description: "Canonical callable univariate rational functions with exact cancellation and Polynomial interoperability.",
            kind: "host",
            mount: "ratfun",
            aliases: ["rationalFunction", "rf"],
            exports: ["RationalFunction", "Parse", "Var", "Fun"],
            groups: ["Algebra", "Exact", "Symbolic"],
            permissions: [],
            requires: ["rix.polynomial@1"],
            provides: ["rix.rational-function@1"],
            schemas: ["rix.rational-function@1"],
            snapshot: false,
            deterministic: true,
            defaultEnabled: false,
        },
        install: installRatfunPlugin,
    },
    {
        metadata: {
            id: "fracfun",
            description: "Form-preserving callable polynomial and rational expressions with explicit transformations and canonical projections.",
            kind: "host", mount: "fracfun", aliases: ["fractionFunction", "ff"],
            exports: ["FractionFunction", "Parse", "Var", "Fun"], groups: ["Algebra", "Exact", "Symbolic"], permissions: [],
            requires: ["rix.fraction@1", "rix.rational-function@1"],
            provides: ["rix.fraction-function@1"], schemas: ["rix.fraction-function@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: installFracfunPlugin,
    },
    {
        metadata: {
            id: "symbolic",
            description: "Meta-plugin loading RiX representation-sensitive Fraction and FractionFunction workspaces.",
            kind: "host", mount: "symbolic",
            exports: ["Fraction", "FractionFunction", "Services"], groups: ["Algebra", "Exact", "Symbolic"], permissions: [],
            requires: ["rix.fraction-function@1"], provides: ["rix.symbolic.formal@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: installSymbolicPlugin,
    },
    {
        metadata: {
            id: "algebra", description: "Canonical exact univariate polynomials with verified division and portable synthetic-division Grids.",
            kind: "host", mount: "algebra",
            exports: ["Polynomial", "Coefficients", "Record", "Evaluate", "Equal", "Divide", "SyntheticDivide", "Quotient", "Remainder", "IsFactor", "Grid"],
            groups: ["Algebra", "Exact"], permissions: [],
            requires: ["rix.rational-function@1"],
            provides: ["rix.algebra.division@1"], schemas: ["rix.algebra.division@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: installAlgebraPlugin,
    },
    {
        metadata: {
            id: "draw",
            description: "Convenient 2D drawing helpers that produce core Graphics nodes.",
            kind: "host",
            mount: "draw",
            exports: ["Line", "Polygon", "Label", "Box", "Circle"],
            groups: ["Draw"],
            permissions: [],
            defaultEnabled: false,
        },
        install: ({ systemContext }) => installDrawPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "plot",
            description: "Portable plotting helpers that produce core Graphics scenes.",
            kind: "host",
            mount: "plot",
            exports: ["Polynomial"],
            groups: ["Plot"],
            permissions: [],
            defaultEnabled: false,
        },
        install: ({ systemContext }) => installPlotPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "scene3d", description: "Exact retained 3D scenes with deterministic wireframe Graphics snapshots.",
            kind: "host", mount: "scene3d",
            exports: ["Scene", "Group", "Transform", "Mesh", "Polyline", "PointCloud", "Material", "PerspectiveCamera", "OrthographicCamera", "Snapshot"],
            groups: ["Scene3D", "Graphics"], permissions: [], provides: ["rix.scene3d@1"], schemas: ["rix.scene3d@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installScene3DPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "nd", description: "Exact n-dimensional geometry with explicit affine and Cayley projection records.",
            kind: "host", mount: "nd",
            exports: ["Point", "Polyline", "Polytope", "Hypercube", "Projection", "CoordinateProjection", "CayleyRotation", "Compose", "Project", "ToScene3D"],
            groups: ["Geometry", "Scene3D", "Exact"], permissions: [], requires: ["rix.scene3d@1"],
            provides: ["rix.nd@1", "rix.nd.projection@1"], schemas: ["rix.nd@1", "rix.nd.projection@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installNdPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "geometry", description: "Exact ruler-and-compass geometry with explicit intersections and portable Graphics snapshots.",
            kind: "host", mount: "geometry",
            exports: ["Point", "Line", "Circle", "Midpoint", "PerpendicularBisector", "Circumcircle", "Intersect", "Points", "Status", "Draw"],
            groups: ["Geometry", "Graphics", "Exact"], permissions: [],
            provides: ["rix.geometry@1", "rix.geometry.intersection@1"], schemas: ["rix.geometry@1", "rix.geometry.intersection@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installGeometryPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "data", description: "Immutable typed relations with deterministic projection, filtering, sorting, and Table views.",
            kind: "host", mount: "data",
            exports: ["Relation", "Project", "Filter", "Sort", "TableView", "Schema", "Rows"],
            groups: ["Data"], permissions: [], provides: ["rix.data.relation@1"], schemas: ["rix.data.relation@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installDataPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "document", description: "Numbered portable reports with labels, forward references, captions, and small semantic themes.",
            kind: "host", mount: "document",
            exports: ["Report", "Label", "Ref", "Theme", "References"],
            groups: ["Documents"], permissions: [], provides: ["rix.document.report@1"],
            schemas: ["rix.document.report@1", "rix.document.theme@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installDocumentPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "terminal-ascii", description: "Deterministic strict-ASCII fallback for tables, grids, fragments, and simple Graphics.",
            kind: "host", mount: "terminalAscii", exports: ["Render"], groups: ["Renderers"], permissions: [],
            provides: ["rix.renderer.terminal-ascii@1"], targets: ["terminal-ascii", "terminal", "ascii", "txt", "text/plain"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: installTerminalAsciiPlugin,
    },
    ...[
        ["svg", "Portable SVG renderer for core Graphics scenes.", "svg", ["Render"], [], installSvgPlugin, "image/svg+xml", true],
        ["canvas", "Serializable Canvas 2D drawing plans for core Graphics scenes.", "canvas", ["Render"], [], installCanvasPlugin, "application/vnd.rix.canvas+json", true],
        ["tikz", "Editable TikZ/PGF source renderer for core Graphics scenes.", "tikz", ["Render"], [], installTikzPlugin, "text/x-tikz", true],
        ["markdown", "CommonMark-oriented renderer for portable RiX documents.", "markdown", ["Render"], [], installMarkdownPlugin, "text/markdown", true],
        ["html", "Standalone semantic HTML renderer for portable RiX output trees.", "html", ["Render"], [], installHtmlPlugin, "text/html", true],
        ["quarto", "Quarto Markdown renderer with front matter and portable figure lowering.", "quarto", ["Render"], [], installQuartoPlugin, "text/x-quarto", true],
        ["latex", "Standalone LaTeX renderer for portable RiX documents and figures.", "latex", ["Render"], [], installLatexPlugin, "text/x-tex", true],
        ["png", "PNG snapshot renderer for core Graphics through a host rasterizer.", "png", ["Render"], ["process"], installPngPlugin, "image/png", true],
        ["pdf", "PDF document and figure renderer orchestrated through LaTeX.", "pdf", ["Render"], ["process", "files"], installPdfPlugin, "application/pdf", false],
        ["gltf", "Browser-safe glTF 2.0 JSON exporter for retained Scene3D values.", "gltf", ["Render"], [], installGltfPlugin, "model/gltf+json", true],
        ["csv", "Deterministic CSV and TSV export for portable Tables and typed data Relations.", "csv", ["Render"], [], installCsvPlugin, "text/csv", true, ["tsv", "text/tab-separated-values"], ["Renderers", "Data"]],
    ].map(([id, description, mount, exports, permissions, install, mime, deterministic, aliases = [], groups = ["Renderers"]]) => ({
        metadata: {
            id,
            description,
            kind: "host",
            mount,
            exports,
            groups,
            permissions,
            provides: [`rix.renderer.${id}@1`],
            targets: [id, mime, ...aliases],
            snapshot: true,
            deterministic,
            defaultEnabled: false,
        },
        install,
    })),
];

/**
 * Built-ins use the same catalog and host-approval path as third-party host
 * plugins. A caller may supply a custom installer before creating the system
 * context; it is deliberately not overwritten here.
 */
export function installBundledPlugins(catalog) {
    for (const { metadata, install, source, sourcePath } of BUNDLED_PLUGINS) {
        // An embedding host may deliberately supply a plugin with this ID.
        // Do not silently pair its metadata with the bundled implementation.
        if (catalog.info(metadata.id)) continue;
        if (source) {
            catalog.addMetadata(metadata, { kind: "rix", source, sourcePath });
        } else {
            catalog.addMetadata(metadata, { kind: "host" });
            catalog.registerInstaller(metadata.id, install);
        }
    }
    return catalog;
}
