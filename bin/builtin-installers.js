/** Explicit first-party host providers shared by runner and publication workers. */
import { install as installFloatPlugin } from "../plugins/float/float.plugin.rix.js";
import { install as installArrayJsExample } from "../examples/plugins/example-array-js/array-js.plugin.rix.js";
import { install as installDrawPlugin } from "../plugins/draw/draw.plugin.rix.js";
import { install as installFracfunPlugin } from "../plugins/fracfun/fracfun.plugin.rix.js";
import { install as installDataPlugin } from "../plugins/data/data.plugin.rix.js";
import { install as installDocumentPlugin } from "../plugins/document/document.plugin.rix.js";
import { install as installTerminalAsciiPlugin } from "../plugins/render-terminal-ascii/terminal-ascii.plugin.rix.js";
import { install as installSvgPlugin } from "../plugins/render-svg/svg.plugin.rix.js";
import { install as installCanvasPlugin } from "../plugins/render-canvas/canvas.plugin.rix.js";
import { install as installWebglPlugin } from "../plugins/render-webgl/webgl.plugin.rix.js";
import { install as installTikzPlugin } from "../plugins/render-tikz/tikz.plugin.rix.js";
import { install as installMarkdownPlugin } from "../plugins/render-markdown/markdown.plugin.rix.js";
import { install as installHtmlPlugin } from "../plugins/render-html/html.plugin.rix.js";
import { install as installQuartoPlugin } from "../plugins/render-quarto/quarto.plugin.rix.js";
import { install as installLatexPlugin } from "../plugins/render-latex/latex.plugin.rix.js";
import { install as installPngPlugin } from "../plugins/render-png/png.plugin.rix.js";
import { install as installPdfPlugin } from "../plugins/render-pdf/pdf.plugin.rix.js";
import { install as installGltfPlugin } from "../plugins/render-gltf/gltf.plugin.rix.js";
import { install as installCsvPlugin } from "../plugins/render-csv/csv.plugin.rix.js";
import { install as installGifPlugin } from "../plugins/render-gif/gif.plugin.rix.js";
import { compileLatex, encodeGifFrames, rasterizeSvg } from "./node-renderer-tools.js";

export function registerBuiltPluginInstallers(pluginCatalog) {
    // Discovery finds the metadata before createDefaultSystemContext has a
    // chance to register bundled implementations, so approve these explicit
    // first-party installers in the CLI host.
    pluginCatalog.registerInstaller("float", installFloatPlugin);
    pluginCatalog.registerInstaller("example-array-js", installArrayJsExample);
    pluginCatalog.registerInstaller("draw", ({ systemContext }) => installDrawPlugin({ systemContext }));
    pluginCatalog.registerInstaller("fracfun", installFracfunPlugin);
    pluginCatalog.registerInstaller("data", ({ systemContext }) => installDataPlugin({ systemContext }));
    pluginCatalog.registerInstaller("document", ({ systemContext }) => installDocumentPlugin({ systemContext }));
    pluginCatalog.registerInstaller("terminal-ascii", installTerminalAsciiPlugin);
    pluginCatalog.registerInstaller("svg", installSvgPlugin);
    pluginCatalog.registerInstaller("canvas", installCanvasPlugin);
    pluginCatalog.registerInstaller("webgl", installWebglPlugin);
    pluginCatalog.registerInstaller("tikz", installTikzPlugin);
    pluginCatalog.registerInstaller("markdown", installMarkdownPlugin);
    pluginCatalog.registerInstaller("html", installHtmlPlugin);
    pluginCatalog.registerInstaller("quarto", installQuartoPlugin);
    pluginCatalog.registerInstaller("latex", installLatexPlugin);
    pluginCatalog.registerInstaller("png", (api) => installPngPlugin({ ...api, rasterizeSvg }));
    pluginCatalog.registerInstaller("pdf", (api) => installPdfPlugin({ ...api, compileLatex }));
    pluginCatalog.registerInstaller("gltf", installGltfPlugin);
    pluginCatalog.registerInstaller("csv", installCsvPlugin);
    pluginCatalog.registerInstaller("gif", (api) => installGifPlugin({ ...api, encodeGif: encodeGifFrames }));
}
