/** Register bundled opt-in plugins with a host catalog. */

import oracleSource from "./oracle/oracle.plugin.rix" with { type: "text" };
import numericsSource from "./numerics/numerics.plugin.rix" with { type: "text" };
import cauchySource from "./cauchy/cauchy.plugin.rix" with { type: "text" };
import ballSource from "./ball/ball.plugin.rix" with { type: "text" };
import continuedFractionSource from "./continued-fraction/continued-fraction.plugin.rix" with { type: "text" };
import algebraicRealSource from "./algebraic-real/algebraic-real.plugin.rix" with { type: "text" };
import polySource from "./poly/poly.plugin.rix" with { type: "text" };
import algebraSource from "./algebra/algebra.plugin.rix" with { type: "text" };
import sternBrocotSource from "./stern-brocot/stern-brocot.plugin.rix" with { type: "text" };
import radixSource from "./radix/radix.plugin.rix" with { type: "text" };
import exactAlgebrasSource from "./exact-algebras/exact-algebras.plugin.rix" with { type: "text" };
import fractionSource from "./fraction/fraction.plugin.rix" with { type: "text" };
import ratfunSource from "./ratfun/ratfun.plugin.rix" with { type: "text" };
import symbolicSource from "./symbolic/symbolic.plugin.rix" with { type: "text" };
import statsSource from "./stats/stats.plugin.rix" with { type: "text" };
import complexVizSource from "./complex-visualization/complex-viz.plugin.rix" with { type: "text" };
import { readPluginHeader } from "../src/runtime/plugin-catalog.js";
import { install as installDrawPlugin } from "./draw/draw.plugin.rix.js";
import { install as installFracfunPlugin } from "./fracfun/fracfun.plugin.rix.js";
import { install as installPlotPlugin } from "./plot/plot.plugin.rix.js";
import { install as installScene3DPlugin } from "./scene3d/scene3d.plugin.rix.js";
import { install as installNdPlugin } from "./nd/nd.plugin.rix.js";
import { install as installGeometryPlugin } from "./geometry/geometry.plugin.rix.js";
import { install as installDataPlugin } from "./data/data.plugin.rix.js";
import { install as installDocumentPlugin } from "./document/document.plugin.rix.js";
import { install as installTerminalAsciiPlugin } from "./render-terminal-ascii/terminal-ascii.plugin.rix.js";
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
import { install as installGifPlugin } from "./render-gif/gif.plugin.rix.js";

const BUNDLED_PLUGINS = [
    {
        metadata: readPluginHeader(sternBrocotSource, "stern-brocot.plugin.rix"),
        source: sternBrocotSource,
        sourcePath: "bundled:stern-brocot.plugin.rix",
    },
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
        metadata: readPluginHeader(ballSource, "ball.plugin.rix"),
        source: ballSource,
        sourcePath: "bundled:ball.plugin.rix",
    },
    {
        metadata: readPluginHeader(cauchySource, "cauchy.plugin.rix"),
        source: cauchySource,
        sourcePath: "bundled:cauchy.plugin.rix",
    },
    {
        metadata: readPluginHeader(continuedFractionSource, "continued-fraction.plugin.rix"),
        source: continuedFractionSource,
        sourcePath: "bundled:continued-fraction.plugin.rix",
    },
    {
        metadata: readPluginHeader(algebraicRealSource, "algebraic-real.plugin.rix"),
        source: algebraicRealSource,
        sourcePath: "bundled:algebraic-real.plugin.rix",
    },
    { metadata: readPluginHeader(radixSource, "radix.plugin.rix"), source: radixSource, sourcePath: "bundled:radix.plugin.rix" },
    { metadata: readPluginHeader(exactAlgebrasSource, "exact-algebras.plugin.rix"), source: exactAlgebrasSource, sourcePath: "bundled:exact-algebras.plugin.rix" },
    { metadata: readPluginHeader(fractionSource, "fraction.plugin.rix"), source: fractionSource, sourcePath: "bundled:fraction.plugin.rix" },
    {
        metadata: readPluginHeader(polySource, "poly.plugin.rix"),
        source: polySource,
        sourcePath: "bundled:poly.plugin.rix",
    },
    { metadata: readPluginHeader(ratfunSource, "ratfun.plugin.rix"), source: ratfunSource, sourcePath: "bundled:ratfun.plugin.rix" },
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
    { metadata: readPluginHeader(symbolicSource, "symbolic.plugin.rix"), source: symbolicSource, sourcePath: "bundled:symbolic.plugin.rix" },
    { metadata: readPluginHeader(statsSource, "stats.plugin.rix"), source: statsSource, sourcePath: "bundled:stats.plugin.rix" },
    { metadata: readPluginHeader(complexVizSource, "complex-viz.plugin.rix"), source: complexVizSource, sourcePath: "bundled:complex-viz.plugin.rix" },
    {
        metadata: readPluginHeader(algebraSource, "algebra.plugin.rix"),
        source: algebraSource,
        sourcePath: "bundled:algebra.plugin.rix",
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
            id: "scene3d", description: "Exact retained 3D scenes with deterministic wireframe and lit Graphics snapshots.",
            kind: "host", mount: "scene3d",
            exports: ["Scene", "Group", "Transform", "Mesh", "Polyline", "PointCloud", "Material", "AmbientLight", "DirectionalLight", "PointLight", "PerspectiveCamera", "OrthographicCamera", "Snapshot"],
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
        ["gif", "Deterministic animated GIF rendering from Slides, Timelines, or Snapshots through PNG frames.", "gif", ["Render"], ["process", "files"], installGifPlugin, "image/gif", true, [], ["Renderers"], ["rix.renderer.png@1"]],
    ].map(([id, description, mount, exports, permissions, install, mime, deterministic, aliases = [], groups = ["Renderers"], requires = []]) => ({
        metadata: {
            id,
            description,
            kind: "host",
            mount,
            exports,
            groups,
            permissions,
            requires,
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
