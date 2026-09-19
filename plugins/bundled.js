/** Register bundled opt-in plugins with a host catalog. */

import oracleSource from "./oracle/oracle.plugin.rix" with { type: "text" };
import numericsSource from "./numerics/numerics.plugin.rix" with { type: "text" };
import besselSource from "./bessel/bessel.plugin.rix" with { type: "text" };
import cauchySource from "./cauchy/cauchy.plugin.rix" with { type: "text" };
import ballSource from "./ball/ball.plugin.rix" with { type: "text" };
import continuedFractionSource from "./continued-fraction/continued-fraction.plugin.rix" with { type: "text" };
import algebraicRealSource from "./algebraic-real/algebraic-real.plugin.rix" with { type: "text" };
import complexSource from "./complex/complex.plugin.rix" with { type: "text" };
import cayleySource from "./cayley/cayley.plugin.rix" with { type: "text" };
import quaternionSource from "./quaternion/quaternion.plugin.rix" with { type: "text" };
import octonionSource from "./octonion/octonion.plugin.rix" with { type: "text" };
import polySource from "./poly/poly.plugin.rix" with { type: "text" };
import algebraSource from "./algebra/algebra.plugin.rix" with { type: "text" };
import sternBrocotSource from "./stern-brocot/stern-brocot.plugin.rix" with { type: "text" };
import radixSource from "./radix/radix.plugin.rix" with { type: "text" };
import exactAlgebrasSource from "./exact-algebras/exact-algebras.plugin.rix" with { type: "text" };
import fractionSource from "./fraction/fraction.plugin.rix" with { type: "text" };
import ratfunSource from "./ratfun/ratfun.plugin.rix" with { type: "text" };
import symbolicSource from "./symbolic/symbolic.plugin.rix" with { type: "text" };
import casSource from "./cas/cas.plugin.rix" with { type: "text" };
import logicSource from "./logic/logic.plugin.rix" with { type: "text" };
import calculusSource from "./calculus/calculus.plugin.rix" with { type: "text" };
import analysisSource from "./analysis/analysis.plugin.rix" with { type: "text" };
import odeSource from "./ode/ode.plugin.rix" with { type: "text" };
import statsSource from "./stats/stats.plugin.rix" with { type: "text" };
import probabilitySource from "./probability/probability.plugin.rix" with { type: "text" };
import complexVizSource from "./complex-visualization/complex-viz.plugin.rix" with { type: "text" };
import fractalsSource from "./fractals/fractals.plugin.rix" with { type: "text" };
import graphSource from "./graph/graph.plugin.rix" with { type: "text" };
import combinatoricsSource from "./combinatorics/combinatorics.plugin.rix" with { type: "text" };
import optimizeSource from "./optimize/optimize.plugin.rix" with { type: "text" };
import linalgSource from "./linalg/linalg.plugin.rix" with { type: "text" };
import solveSource from "./solve/solve.plugin.rix" with { type: "text" };
import geometrySource from "./geometry/geometry.plugin.rix" with { type: "text" };
import plotSource from "./plot/plot.plugin.rix" with { type: "text" };
import scene3dSource from "./scene3d/scene3d.plugin.rix" with { type: "text" };
import ndSource from "./nd/nd.plugin.rix" with { type: "text" };
import { readPluginHeader } from "../src/runtime/plugin-catalog.js";
import { install as installDrawPlugin } from "./draw/draw.plugin.rix.js";
import { install as installFloatPlugin } from "./float/float.plugin.rix.js";
import { install as installFracfunPlugin } from "./fracfun/fracfun.plugin.rix.js";
import { install as installDataPlugin } from "./data/data.plugin.rix.js";
import { install as installDocumentPlugin } from "./document/document.plugin.rix.js";
import { install as installTerminalAsciiPlugin } from "./render-terminal-ascii/terminal-ascii.plugin.rix.js";
import { install as installSvgPlugin } from "./render-svg/svg.plugin.rix.js";
import { install as installCanvasPlugin } from "./render-canvas/canvas.plugin.rix.js";
import { install as installWebglPlugin } from "./render-webgl/webgl.plugin.rix.js";
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
        metadata: readPluginHeader(besselSource, "bessel.plugin.rix"),
        source: besselSource,
        sourcePath: "bundled:bessel.plugin.rix",
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
    {
        metadata: readPluginHeader(complexSource, "complex.plugin.rix"),
        source: complexSource,
        sourcePath: "bundled:complex.plugin.rix",
    },
    {
        metadata: {
            id: "float", description: "Configurable IEEE-754 binary32/binary64 conversion, diagnostics, and optional approximate math.",
            kind: "host", mount: "float",
            exports: ["Float", "Binary32", "Binary64", "Format", "Classify", "Diagnostics", "NextUp", "NextDown", "NextAfter", "Interval", "Round", "Floor", "Ceiling", "Abs", "Sqrt", "Sin", "Cos", "Tan", "Asin", "Acos", "Atan", "Atan2", "Log", "Ln", "Log10", "Exp", "Sum", "Dot", "Complex", "ComplexAdd", "ComplexSub", "ComplexMul", "ComplexDiv", "ComplexConjugate", "ComplexAbs"],
            groups: ["ApproximateMath", "Float"], permissions: [], provides: ["rix.float@2"], schemas: ["rix.float.classification@1", "rix.float.algorithm-result@1", "rix.float.error-estimate@1", "rix.float.complex@1"], defaultEnabled: false,
        },
        install: installFloatPlugin,
    },
    { metadata: readPluginHeader(cayleySource, "cayley.plugin.rix"), source: cayleySource, sourcePath: "bundled:cayley.plugin.rix" },
    { metadata: readPluginHeader(quaternionSource, "quaternion.plugin.rix"), source: quaternionSource, sourcePath: "bundled:quaternion.plugin.rix" },
    { metadata: readPluginHeader(octonionSource, "octonion.plugin.rix"), source: octonionSource, sourcePath: "bundled:octonion.plugin.rix" },
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
            exports: ["FractionFunction", "Parse", "Var", "Fun", "Factor", "SquareFree", "PartialFractions", "PoleZeroEvidence", "RemovableHoleEvidence", "TransformationGrid"], groups: ["Algebra", "Exact", "Symbolic"], permissions: [],
            requires: ["rix.fraction@1", "rix.rational-function@1"],
            provides: ["rix.fraction-function@1", "rix.fraction-function.presentation@1", "rix.fraction-function.divisor-evidence@1", "rix.fraction-function.removable-hole-evidence@1"],
            schemas: ["rix.fraction-function@1", "rix.fraction-function.presentation@1", "rix.fraction-function.square-free-pair@1", "rix.fraction-function.divisor-evidence@1", "rix.fraction-function.removable-hole-evidence@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: installFracfunPlugin,
    },
    { metadata: readPluginHeader(symbolicSource, "symbolic.plugin.rix"), source: symbolicSource, sourcePath: "bundled:symbolic.plugin.rix" },
    { metadata: readPluginHeader(casSource, "cas.plugin.rix"), source: casSource, sourcePath: "bundled:cas.plugin.rix" },
    { metadata: readPluginHeader(logicSource, "logic.plugin.rix"), source: logicSource, sourcePath: "bundled:logic.plugin.rix" },
    { metadata: readPluginHeader(calculusSource, "calculus.plugin.rix"), source: calculusSource, sourcePath: "bundled:calculus.plugin.rix" },
    { metadata: readPluginHeader(analysisSource, "analysis.plugin.rix"), source: analysisSource, sourcePath: "bundled:analysis.plugin.rix" },
    { metadata: readPluginHeader(odeSource, "ode.plugin.rix"), source: odeSource, sourcePath: "bundled:ode.plugin.rix" },
    { metadata: readPluginHeader(statsSource, "stats.plugin.rix"), source: statsSource, sourcePath: "bundled:stats.plugin.rix" },
    { metadata: readPluginHeader(probabilitySource, "probability.plugin.rix"), source: probabilitySource, sourcePath: "bundled:probability.plugin.rix" },
    { metadata: readPluginHeader(complexVizSource, "complex-viz.plugin.rix"), source: complexVizSource, sourcePath: "bundled:complex-viz.plugin.rix" },
    { metadata: readPluginHeader(fractalsSource, "fractals.plugin.rix"), source: fractalsSource, sourcePath: "bundled:fractals.plugin.rix" },
    { metadata: readPluginHeader(graphSource, "graph.plugin.rix"), source: graphSource, sourcePath: "bundled:graph.plugin.rix" },
    { metadata: readPluginHeader(combinatoricsSource, "combinatorics.plugin.rix"), source: combinatoricsSource, sourcePath: "bundled:combinatorics.plugin.rix" },
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
            exports: [
                "Line", "Polyline", "Polygon", "Arrow", "Arc", "Ellipse", "Dimension", "Grid",
                "Label", "Box", "Circle", "Style", "Viewport", "ViewportPoint", "Bounds", "Anchor",
                "From", "Trim", "Marker", "Symbol", "UseSymbol", "PlaceLabels",
            ],
            groups: ["Draw"],
            permissions: [],
            provides: ["rix.draw@1", "rix.draw.drawable@1"],
            schemas: ["rix.draw.symbol@1", "rix.draw.adapter-result@1", "rix.draw.label-layout@1"],
            snapshot: true,
            deterministic: true,
            defaultEnabled: false,
        },
        install: ({ systemContext }) => installDrawPlugin({ systemContext }),
    },
    { metadata: readPluginHeader(plotSource, "plot.plugin.rix"), source: plotSource, sourcePath: "bundled:plot.plugin.rix" },
    { metadata: readPluginHeader(scene3dSource, "scene3d.plugin.rix"), source: scene3dSource, sourcePath: "bundled:scene3d.plugin.rix" },
    { metadata: readPluginHeader(ndSource, "nd.plugin.rix"), source: ndSource, sourcePath: "bundled:nd.plugin.rix" },
    { metadata: readPluginHeader(geometrySource, "geometry.plugin.rix"), source: geometrySource, sourcePath: "bundled:geometry.plugin.rix" },
    {
        metadata: {
            id: "data", description: "Immutable typed relations with joins, grouping, exact aggregation, missing-data policy, and bounded row sources.",
            kind: "host", mount: "data",
            exports: ["Relation", "Project", "Rename", "Distinct", "Filter", "Sort", "Join", "Group", "Aggregate", "Frequency", "Contingency", "Calculate", "Missing", "RowSource", "ParseJSONL", "RenderJSONL", "Collect", "TableView", "Schema", "Rows"],
            groups: ["Data"], permissions: [],
            provides: ["rix.data.relation@1", "rix.data.groups@1", "rix.data.contingency@1", "rix.data.row-source@1"],
            schemas: ["rix.data.relation@1", "rix.data.groups@1", "rix.data.contingency@1", "rix.data.row-source@1"],
            snapshot: false, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installDataPlugin({ systemContext }),
    },
    { metadata: readPluginHeader(linalgSource, "linalg.plugin.rix"), source: linalgSource, sourcePath: "bundled:linalg.plugin.rix" },
    { metadata: readPluginHeader(optimizeSource, "optimize.plugin.rix"), source: optimizeSource, sourcePath: "bundled:optimize.plugin.rix" },
    { metadata: readPluginHeader(solveSource, "solve.plugin.rix"), source: solveSource, sourcePath: "bundled:solve.plugin.rix" },
    {
        metadata: {
            id: "document", description: "Portable report templates with citations, assets, numbering policies, and safe target-specific nodes.",
            kind: "host", mount: "document",
            exports: ["Report", "Label", "Ref", "Theme", "References", "Bibliography", "Citation", "AssetManifest", "Asset", "Numbering", "Header", "Footer", "Template", "ApplyTemplate", "TargetMarkup", "Snapshot", "EncodeJSON", "DecodeJSON", "NumericPolicy", "Present", "PublicationPlan", "Publish", "Project"],
            groups: ["Documents"], permissions: [], provides: ["rix.document.report@1", "rix.document.report@2", "rix.document.template@1", "rix.document.assets@1", "rix.output.document@1"],
            schemas: ["rix.document.report@1", "rix.document.theme@1", "rix.document.bibliography@1", "rix.document.citation@1", "rix.document.assets@1", "rix.document.numbering@1", "rix.document.template@1", "rix.document.target-markup@1", "rix.output.document@1", "rix.numeric-presentation@1", "rix.publication-plan@1", "rix.publication-project@1"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: ({ systemContext }) => installDocumentPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "terminal-ascii", description: "Deterministic terminal rendering with strict ASCII and explicit Unicode/ANSI profiles.",
            kind: "host", mount: "terminalAscii", exports: ["Render"], groups: ["Renderers"], permissions: [],
            provides: ["rix.renderer.terminal-ascii@1", "rix.renderer.terminal-rich@1"], targets: ["terminal-ascii", "terminal", "ascii", "txt", "text/plain"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: installTerminalAsciiPlugin,
    },
    {
        metadata: {
            id: "svg", description: "Portable SVG renderer with outward-safe exact-coordinate lowering.",
            kind: "host", mount: "svg", exports: ["Render"], groups: ["Renderers"], permissions: [],
            provides: ["rix.renderer.svg@1", "rix.renderer.svg@2", "rix.svg.coordinate-lowering@1", "rix.svg.optimization@1", "rix.viewport@1", "rix.selection@1"],
            schemas: ["rix.svg.coordinate-lowering@1", "rix.svg.optimization@1", "rix.viewport@1", "rix.selection@1"], targets: ["svg", "image/svg+xml"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: installSvgPlugin,
    },
    {
        metadata: {
            id: "webgl", description: "Executable WebGL drawing plans for retained Scene3D values.",
            kind: "host", mount: "webgl", exports: ["Render"], groups: ["Renderers", "Scene3D"], permissions: [],
            requires: ["rix.scene3d@1"], provides: ["rix.renderer.webgl@1", "rix.webgl-plan@1"],
            schemas: ["rix.webgl-plan@1"], targets: ["webgl", "application/vnd.rix.webgl+json"],
            snapshot: true, deterministic: true, defaultEnabled: false,
        },
        install: installWebglPlugin,
    },
    {
        metadata: {
            id: "csv",
            description: "Schema-aware CSV/TSV import and export with exact numeric, sidecar, and streaming-row policies.",
            kind: "host",
            mount: "csv",
            exports: ["Render", "Parse", "ParseStream", "Collect", "Sidecar"],
            groups: ["Renderers", "Data"],
            permissions: [],
            requires: [],
            provides: ["rix.renderer.csv@1", "rix.renderer.csv@2", "rix.csv.import@1", "rix.csv.sidecar@1"],
            schemas: ["rix.csv.import@1", "rix.csv.sidecar@1", "rix.data.relation@1", "rix.data.row-source@1"],
            targets: ["csv", "text/csv", "tsv", "text/tab-separated-values"],
            snapshot: false,
            deterministic: true,
            defaultEnabled: false,
        },
        install: installCsvPlugin,
    },
    ...[
        ["canvas", "Serializable Canvas 2D drawing plans for core Graphics scenes.", "canvas", ["Render"], [], installCanvasPlugin, "application/vnd.rix.canvas+json", true],
        ["tikz", "Editable TikZ/PGF source renderer for core Graphics scenes.", "tikz", ["Render"], [], installTikzPlugin, "text/x-tikz", true],
        ["markdown", "CommonMark-oriented renderer for portable RiX documents.", "markdown", ["Render"], [], installMarkdownPlugin, "text/markdown", true],
        ["html", "Standalone semantic HTML renderer for portable RiX output trees.", "html", ["Render"], [], installHtmlPlugin, "text/html", true],
        ["quarto", "Quarto Markdown renderer with front matter and portable figure lowering.", "quarto", ["Render"], [], installQuartoPlugin, "text/x-quarto", true],
        ["latex", "Standalone LaTeX renderer for portable RiX documents and figures.", "latex", ["Render"], [], installLatexPlugin, "text/x-tex", true],
        ["png", "PNG snapshot renderer for core Graphics through a host rasterizer.", "png", ["Render"], ["process"], installPngPlugin, "image/png", true],
        ["pdf", "PDF document and figure renderer orchestrated through LaTeX.", "pdf", ["Render"], ["process", "files"], installPdfPlugin, "application/pdf", false],
        ["gltf", "Browser-safe glTF 2.0 JSON exporter for retained Scene3D values.", "gltf", ["Render"], [], installGltfPlugin, "model/gltf+json", true],
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
            provides: id === "canvas"
                ? ["rix.renderer.canvas@1", "rix.renderer.canvas@2", "rix.viewport@1", "rix.selection@1"]
                : id === "gif" ? ["rix.renderer.gif@1", "rix.renderer.gif@2", "rix.renderer.gif-frames@1"]
                : ["markdown", "html", "quarto", "latex", "pdf"].includes(id)
                    ? [`rix.renderer.${id}@1`, `rix.renderer.${id}@2`]
                    : [`rix.renderer.${id}@1`],
            schemas: id === "canvas"
                ? ["rix.canvas-plan@1", "rix.canvas-accessibility@1", "rix.viewport@1", "rix.selection@1"]
                : id === "markdown" ? ["rix.markdown.render@2"]
                    : id === "html" ? ["rix.html.render@2"]
                        : id === "quarto" ? ["rix.quarto.project@1", "rix.quarto.render@2"]
                            : id === "latex" ? ["rix.latex.render@2"]
                                : id === "pdf" ? ["rix.pdf.render@2"]
                                    : id === "gif" ? ["rix.gif.render@1", "rix.gif.render@2", "rix.animation-export@1"]
                                        : [],
            targets: [id, mime, ...aliases, ...(id === "gif" ? ["gif-frames"] : [])],
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
