import { normalizeAssetReference, isExternalAssetReference } from "../../src/runtime/output-assets.js";
import { numericFormatter, numericFormatterPolicy } from "../../src/runtime/numeric-presentation.js";
import { resolvePublicationPlan, validatePublicationTree, publicationDiagnostics, visitPublicationTree } from "../../src/runtime/publication-plan.js";
/** Structured document lowering shared by Markdown, Quarto, and LaTeX. */

import { formatOutputText, isInlineOutput, isOutputValue, renderGraphicSvg } from "../../src/runtime/output.js";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { renderGraphicTikz } from "../render-tikz/tikz-renderer.js";
import { diagnostic, field, numberValue, outputKind, rixString, textValue } from "./common.js";

function markdownEscape(value) {
    return String(value).replace(/([\\`*{}[\]()#+.!_>-])/g, "\\$1");
}

function localMediaReference(ref) {
    try { return !ref.includes(":") && normalizeAssetReference(ref) === ref; } catch { return false; }
}
function markdownMediaLink(ref, label) {
    return localMediaReference(ref) || isExternalAssetReference(ref)
        ? `[${markdownEscape(label)}](<${ref.replaceAll(">", "%3E").replaceAll("<", "%3C")}>)`
        : markdownEscape(`${label} (asset unavailable)`);
}
function latexMediaLink(ref, label) {
    return localMediaReference(ref) || isExternalAssetReference(ref)
        ? `\\href{${texEscape(ref)}}{${texEscape(label)}}`
        : texEscape(`${label} (asset unavailable)`);
}

function inlineMarkdown(value, state) {
    if (value?.numericPolicy) {
        const previous = state.format;
        state.format = numericFormatter(previous, value.numericPolicy);
        try { return inlineMarkdown({ ...value, numericPolicy: null }, state); } finally { state.format = previous; }
    }
    if (!isOutputValue(value)) return markdownEscape(state.format(value));
    if (value.documentTargetMarkup) {
        const { target, content } = value.documentTargetMarkup;
        if (target === state.target && state.rawMarkup === "allow") {
            state.diagnostics.push(diagnostic("document-target-markup", `Emitted explicit ${target} target markup`, "info"));
            return content;
        }
        if (target === state.target && state.rawMarkup === "deny") throw new Error(`${state.target} rawMarkup policy denies explicit target markup`);
    }
    if (value.kind === "text") return markdownEscape(textValue(value.value, state.format));
    if (value.kind === "emphasis") return `*${value.children.map((child) => inlineMarkdown(child, state)).join("")}*`;
    if (value.kind === "strong") return `**${value.children.map((child) => inlineMarkdown(child, state)).join("")}**`;
    if (value.kind === "code") {
        const fence = value.code.includes("`") ? "``" : "`";
        return `${fence}${value.code}${fence}`;
    }
    if (value.kind === "math") return `$${value.source}$`;
    if (value.kind === "link") return `[${value.children.map((child) => inlineMarkdown(child, state)).join("")}](${value.href}${value.title ? ` \"${value.title.replaceAll('"', '\\"')}\"` : ""})`;
    if (value.kind === "image") {
        if (!localMediaReference(value.asset.ref)) {
            state.diagnostics.push(diagnostic("markdown-image-reference", "Image remains an inert reference or unavailable placeholder", "info"));
            return markdownMediaLink(value.asset.ref, value.alt);
        }
        return `![${markdownEscape(value.alt)}](<${value.asset.ref.replaceAll(">", "%3E").replaceAll("<", "%3C")}>)`;
    }
    if (value.kind === "line_break") return "  \n";
    return markdownEscape(formatOutputText(value, state.format));
}

function markdownTable(value, state) {
    const escapeCell = (entry) => state.format(entry).replaceAll("|", "\\|").replaceAll("\n", "<br>");
    const align = (column) => column.align === "right" ? "---:" : column.align === "center" ? ":---:" : ":---";
    return [
        `| ${value.columns.map(({ label }) => label.replaceAll("|", "\\|")).join(" | ")} |`,
        `| ${value.columns.map(align).join(" | ")} |`,
        ...value.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    ].join("\n");
}

function graphicMarkdown(value, state) {
    if (typeof state.graphic === "function") return state.graphic(value, state);
    try {
        return state.render(value, "svg", { alt: state.figureAlt || "", numericPolicy: numericFormatterPolicy(state.format) }).content;
    } catch (error) {
        if (!(error instanceof UnsupportedRenderError)) throw error;
        state.diagnostics.push(diagnostic("markdown-core-svg-fallback", "SVG plugin unavailable; used the core compatibility SVG adapter", "info"));
        return renderGraphicSvg(value, state.format);
    }
}

function blockMarkdown(value, state, depth = 0) {
    if (value?.numericPolicy) {
        const previous = state.format;
        state.format = numericFormatter(previous, value.numericPolicy);
        try { return blockMarkdown({ ...value, numericPolicy: null }, state, depth); } finally { state.format = previous; }
    }
    if (!isOutputValue(value)) return state.format(value);
    if (isInlineOutput(value)) return inlineMarkdown(value, state);
    if (value.kind === "live_view") return blockMarkdown(value.current, state, depth);
    if (value.kind === "paragraph") return value.children.map((child) => inlineMarkdown(child, state)).join("");
    if (value.kind === "heading") {
        const content = Array.isArray(value.content) ? value.content : [value.content];
        return `${"#".repeat(value.level)} ${content.map((child) => inlineMarkdown(child, state)).join("")}${value.id ? ` {#${value.id}}` : ""}`;
    }
    if (value.kind === "section") {
        const heading = `${"#".repeat(value.level)} ${value.title.map((child) => inlineMarkdown(child, state)).join("")}${value.id ? ` {#${value.id}}` : ""}`;
        return [heading, ...value.children.map((child) => blockMarkdown(child, state, depth))].join("\n\n");
    }
    if (value.kind === "list") {
        return value.items.map((item, index) => {
            const marker = value.ordered ? `${(value.start ?? 1) + index}.` : "-";
            const body = item.children.map((child) => blockMarkdown(child, state, depth + 1)).join("\n\n");
            return `${marker} ${body.replaceAll("\n", "\n   ")}`;
        }).join("\n");
    }
    if (value.kind === "list_item") return value.children.map((child) => blockMarkdown(child, state, depth)).join("\n\n");
    if (value.kind === "quote") {
        const body = value.children.map((child) => blockMarkdown(child, state, depth)).join("\n\n");
        const attribution = value.attribution ? `\n\n— ${value.attribution.map((child) => inlineMarkdown(child, state)).join("")}` : "";
        return `${body}${attribution}`.split("\n").map((line) => `> ${line}`).join("\n");
    }
    if (value.kind === "callout") {
        const title = value.title?.map((child) => inlineMarkdown(child, state)).join("") || value.variant;
        const body = value.children.map((child) => blockMarkdown(child, state, depth)).join("\n\n");
        if (state.quarto) return `::: {.callout-${value.variant}${value.id ? ` #${value.id}` : ""} title=\"${title.replaceAll('"', '\\"')}\"}\n${body}\n:::`;
        return `> **${title}**\n>\n${body.split("\n").map((line) => `> ${line}`).join("\n")}`;
    }
    if (value.kind === "code_block") {
        const fence = value.code.includes("```") ? "````" : "```";
        const attributes = state.quarto && (value.id || value.lineNumbers)
            ? ` {#${value.id || ""}${value.lineNumbers ? " code-line-numbers=true" : ""}}`
            : "";
        return `${value.caption ? `${value.caption.map((child) => inlineMarkdown(child, state)).join("")}\n\n` : ""}${fence}${value.language}${attributes}\n${value.code}\n${fence}`;
    }
    if (value.kind === "math_block") return `$$\n${value.source}\n$$${value.label ? ` {#eq-${value.label.replace(/^eq-/, "")}}` : ""}`;
    if (value.kind === "asset") return markdownMediaLink(value.ref, `${value.mime} asset`);
    if (value.kind === "image") return inlineMarkdown(value, state) + (value.caption ? `\n\n*${value.caption.map((child) => inlineMarkdown(child, state)).join("")}*` : "");
    if (value.kind === "audio" || value.kind === "video") {
        state.diagnostics.push(diagnostic("markdown-media-link", `${value.kind} is represented as a portable asset link`, "info"));
        return [markdownMediaLink(value.asset.ref, value.title || value.kind), value.transcript ? `Transcript: ${value.transcript.map((child) => inlineMarkdown(child, state)).join("")}` : null, value.caption ? `*${value.caption.map((child) => inlineMarkdown(child, state)).join("")}*` : null].filter(Boolean).join("\n\n");
    }
    if (value.kind === "fragment") return value.children.map((child) => blockMarkdown(child, state, depth)).join("\n\n");
    if (value.kind === "snapshots") return [value.title ? `## ${markdownEscape(value.title)}` : null, ...value.snapshots.map((snapshot) => blockMarkdown(snapshot.content, state, depth)), value.caption ? `*${markdownEscape(value.caption)}*` : null].filter(Boolean).join("\n\n");
    if (value.kind === "timeline_render") return blockMarkdown(value.content, state, depth);
    if (value.kind === "timeline") {
        state.diagnostics.push(diagnostic("markdown-timeline-summary", "Markdown cannot play a Timeline; emitted a summary", "warning"));
        return `*Timeline: ${value.frames.length} frames*`;
    }
    if (value.kind.startsWith("control_") || value.kind === "control_panel") {
        state.diagnostics.push(diagnostic("markdown-static-control", "Interactive controls were lowered to their static text representation", "warning"));
        return formatOutputText(value, state.format);
    }
    if (value.kind === "table") {
        const body = [value.caption ? `**${markdownEscape(value.caption)}**` : null, markdownTable(value, state)].filter(Boolean).join("\n\n");
        if (!value.label) return body;
        return state.quarto
            ? `${value.label.startsWith("tbl-")?"":`[]{#${value.label}}\n\n`}::: {#tbl-${value.label.replace(/^tbl-/, "")}}\n${body}\n:::`
            : `<a id="${value.label.replaceAll('"', '&quot;')}"></a>\n\n${body}`;
    }
    if (value.kind === "grid" || value.kind === "sheet") {
        state.diagnostics.push(diagnostic("markdown-fixed-width-layout", `${value.kind} was lowered to a fixed-width static text block`, "info"));
        return `\`\`\`text\n${formatOutputText(value, state.format)}\n\`\`\``;
    }
    if (value.kind === "figure") {
        const previousAlt = state.figureAlt;
        state.figureAlt = value.alt;
        const body = blockMarkdown(value.content, state, depth);
        state.figureAlt = previousAlt;
        const caption = value.caption ? `*${markdownEscape(value.caption)}*` : "";
        if (state.quarto && value.label) return `${value.label.startsWith("fig-")?"":`[]{#${value.label}}\n\n`}::: {#fig-${value.label.replace(/^fig-/, "")}}\n${body}\n\n${caption}\n:::`;
        return [value.label?`<a id="${value.label.replaceAll('"', '&quot;')}"></a>`:null,body, caption].filter(Boolean).join("\n\n");
    }
    if (value.kind === "graphic") return graphicMarkdown(value, state);
    if (value.kind === "slide") return [`## ${markdownEscape(value.title || "Slide")}`, blockMarkdown(value.content, state, depth)].join("\n\n");
    if (value.kind === "slides") return [value.title ? `# ${markdownEscape(value.title)}` : null, ...value.slides.map((slide) => blockMarkdown(slide, state, depth))].filter(Boolean).join(state.quarto ? "\n\n---\n\n" : "\n\n");
    state.diagnostics.push(diagnostic("markdown-text-fallback", `Used text fallback for output kind '${value.kind}'`, "warning"));
    return formatOutputText(value, state.format);
}

export function renderMarkdown(value, { format, render, quarto = false, graphic = null, rawMarkup = "fallback", publicationPlan = null } = {}) {
    if (!["allow", "fallback", "deny"].includes(rawMarkup)) throw new Error("rawMarkup must be allow, fallback, or deny");
    const plan=resolvePublicationPlan(value,publicationPlan?{publicationPlan}:{});
    validatePublicationTree(value,plan);
    const state = { format, render, quarto, graphic, rawMarkup, target: quarto ? "quarto" : "markdown", diagnostics: publicationDiagnostics(plan,quarto?"quarto":"markdown"), figureAlt: null };
    let content=blockMarkdown(value,state).trim();
    if (quarto && plan.columns>1 && plan.profile==="article") content=`::: {.rix-publication-columns style="column-count:${plan.columns};column-gap:2em"}\n${content}\n:::`;
    if (plan.index.length) content+=`\n\n## Index\n\n${plan.index.map(entry=>`- [${markdownEscape(entry.term)}](#${entry.label})`).join("\n")}`;
    if (plan.runningRegions && value.publicationPlan) state.diagnostics.push(diagnostic("publication-running-region-flow", "Markdown/Quarto retain report headers and footers in document flow; repeated page regions depend on the target", "info"));
    return { content: `${content}\n`, diagnostics: state.diagnostics, metadata:{publicationPlan:plan} };
}

function texEscape(value) {
    return String(value).replace(/[\\{}%$&#_^~≈]/g, (character) => ({
        "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$", "&": "\\&",
        "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}", "≈": "\\ensuremath{\\approx}",
    })[character]);
}

function inlineLatex(value, state) {
    if (value?.numericPolicy) {
        const previous = state.format;
        state.format = numericFormatter(previous, value.numericPolicy);
        try { return inlineLatex({ ...value, numericPolicy: null }, state); } finally { state.format = previous; }
    }
    if (!isOutputValue(value)) return texEscape(state.format(value));
    if (value.documentTargetMarkup) {
        const { target, content } = value.documentTargetMarkup;
        if ((target === "latex" || target === "tex") && state.rawMarkup === "allow") {
            state.diagnostics.push(diagnostic("document-target-markup", "Emitted explicit latex target markup", "info"));
            return content;
        }
        if ((target === "latex" || target === "tex") && state.rawMarkup === "deny") throw new Error("latex rawMarkup policy denies explicit target markup");
    }
    if (value.kind === "text") return texEscape(textValue(value.value, state.format));
    if (value.kind === "emphasis") return `\\emph{${value.children.map((child) => inlineLatex(child, state)).join("")}}`;
    if (value.kind === "strong") return `\\textbf{${value.children.map((child) => inlineLatex(child, state)).join("")}}`;
    if (value.kind === "code") return `\\texttt{${texEscape(value.code)}}`;
    if (value.kind === "math") return `$${value.source}$`;
    if (value.kind === "link") return `\\href{${value.href}}{${value.children.map((child) => inlineLatex(child, state)).join("")}}`;
    if (value.kind === "image") {
        if (!localMediaReference(value.asset.ref) || !["image/png", "image/jpeg", "application/pdf"].includes(value.asset.mime)) {
            state.diagnostics.push(diagnostic("latex-image-reference", "Image format/reference is unsupported by portable LaTeX; retained accessible link", "warning"));
            return latexMediaLink(value.asset.ref, value.alt);
        }
        return `\\includegraphics${value.width ? `[width=${value.width}pt]` : ""}{${texEscape(value.asset.ref)}}`;
    }
    if (value.kind === "line_break") return "\\\\\n";
    return texEscape(formatOutputText(value, state.format));
}

function latexRows(rows, state) {
    return rows.map((row) => `${row.map((cell) => texEscape(state.format(cell))).join(" & ")} \\\\`).join("\n");
}

function gridRule(value, kind, boundary) {
    const fieldName = kind === "vertical" ? "afterColumn" : "aboveRow";
    return value.rules.some((rule) => {
        const ruleKind = rixString(field(rule, "kind")) || field(rule, "kind");
        const position = field(rule, fieldName);
        return ruleKind === kind && position !== null && numberValue(position, `Grid ${fieldName}`) === boundary;
    });
}

function latexGrid(value, state) {
    const columns = value.columns.map((_column, index) => `${gridRule(value, "vertical", index + 1) ? "|" : ""}r`).join("");
    const rows = [];
    value.rows.forEach((row, index) => {
        if (gridRule(value, "horizontal", index + 1)) rows.push("\\hline");
        rows.push(`${row.map((cell) => texEscape(state.format(cell))).join(" & ")} \\\\`);
    });
    return `\\begin{tabular}{${columns}}\n${rows.join("\n")}\n\\end{tabular}`;
}

function longTableInside(value, state) {
    let found = false;
    visitPublicationTree(value, node => { if (node.kind === "table" && node.rows.length >= state.plan.longTableRows) found = true; });
    return found;
}
function latexChildren(children, state) {
    if (!state.layoutActive || state.plan.columns === 1 || state.inColumns || state.slides) return children.map(child => blockLatex(child, state)).join("\n\n");
    const parts = [], run = [];
    const flush = () => {
        if (!run.length) return;
        state.packages.add("multicol"); state.inColumns = true;
        try { parts.push(`\\begin{multicols}{${state.plan.columns}}\n${run.map(child => blockLatex(child, state)).join("\n\n")}\n\\end{multicols}`); }
        finally { state.inColumns = false; run.length = 0; }
    };
    for (const child of children) {
        if (child?.documentRegion || longTableInside(child, state)) { flush(); parts.push(blockLatex(child, state)); }
        else run.push(child);
    }
    flush(); return parts.join("\n\n");
}
function publicationLatexTable(value, state) {
    const columns = value.columns.map(column => column.align === "right" ? "r" : column.align === "center" ? "c" : "l").join("");
    const header = `${value.columns.map(({label})=>texEscape(label)).join(" & ")} \\\\\n\\midrule`;
    const caption = value.caption ? `\\textbf{${texEscape(value.caption)}}\n\n` : "";
    const anchor = value.label ? `\\phantomsection\\label{${texEscape(value.label)}}\\hypertarget{${texEscape(value.label)}}{}\n` : "";
    if (state.slides) {
        const chunks = [];
        for (let start=0;start<value.rows.length || start===0;start+=state.plan.longTableRows) {
            const rows=value.rows.slice(start,start+state.plan.longTableRows);
            chunks.push(`${start===0?anchor:""}${caption}\\begin{tabular}{${columns}}\n\\toprule\n${header}\n${latexRows(rows,state)}\n\\bottomrule\n\\end{tabular}`);
        }
        return chunks.join("\n\\framebreak\n");
    }
    if (value.rows.length >= state.plan.longTableRows) {
        state.packages.add("longtable");
        const first = value.caption ? `\\caption*{${texEscape(value.caption)}}\\\\\n` : "";
        state.packages.add("caption");
        return `${anchor}\\begin{longtable}{${columns}}\n${first}\\toprule\n${header}\n\\endfirsthead\n${state.plan.repeatTableHeaders?`\\toprule\n${header}\n`:""}\\endhead\n\\bottomrule\n\\endfoot\n${latexRows(value.rows,state)}\n\\end{longtable}`;
    }
    const table=`${anchor}${caption}\\begin{tabular}{${columns}}\n\\toprule\n${header}\n${latexRows(value.rows,state)}\n\\bottomrule\n\\end{tabular}`;
    if (state.plan.floats === "inline") return table;
    const position={top:"t",bottom:"b",page:"p"}[state.plan.floats];
    return `\\begin{table}[${position}]\n\\centering\n${table}\n\\end{table}`;
}

function publicationLatexIndex(state) {
    if (!state.plan.index.length) return "";
    const entries=state.plan.index.map(entry=>`\\item[${texEscape(entry.term)}] \\hyperref[${texEscape(entry.label)}]{page \\pageref*{${texEscape(entry.label)}}}`).join("\n");
    const content=`\\begin{description}\n${entries}\n\\end{description}`;
    return state.slides ? `\n\\begin{frame}[fragile,allowframebreaks]{Index}\n${content}\n\\end{frame}` : `\n\\section*{Index}\n${content}`;
}

function blockLatex(value, state) {
    if (value?.numericPolicy) {
        const previous = state.format;
        state.format = numericFormatter(previous, value.numericPolicy);
        try { return blockLatex({ ...value, numericPolicy: null }, state); } finally { state.format = previous; }
    }
    if (!isOutputValue(value)) return texEscape(state.format(value));
    if (state.layoutActive && state.plan.runningRegions && value.documentRegion) return "";
    if (isInlineOutput(value)) return inlineLatex(value, state);
    if (value.kind === "live_view") return blockLatex(value.current, state);
    if (value.kind === "paragraph") return `${value.children.map((child) => inlineLatex(child, state)).join("")}\n`;
    if (value.kind === "heading") {
        const commands = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
        const content = (Array.isArray(value.content) ? value.content : [value.content]).map((child) => inlineLatex(child, state)).join("");
        return `\\${commands[value.level - 1]}${state.preNumbered ? "*" : ""}{${content}}${value.id ? `\\label{${texEscape(value.id)}}` : ""}`;
    }
    if (value.kind === "section") {
        const commands = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
        return `\\${commands[value.level - 1]}${state.preNumbered ? "*" : ""}{${value.title.map((child) => inlineLatex(child, state)).join("")}}${value.id ? `\\label{${texEscape(value.id)}}` : ""}\n${latexChildren(value.children,state)}`;
    }
    if (value.kind === "list") {
        const environment = value.ordered ? "enumerate" : "itemize";
        return `\\begin{${environment}}\n${value.items.map((item) => `\\item ${item.children.map((child) => blockLatex(child, state)).join("\n\n")}`).join("\n")}\n\\end{${environment}}`;
    }
    if (value.kind === "list_item") return value.children.map((child) => blockLatex(child, state)).join("\n\n");
    if (value.kind === "quote") return `\\begin{quote}\n${value.children.map((child) => blockLatex(child, state)).join("\n\n")}${value.attribution ? `\n\\hfill---${value.attribution.map((child) => inlineLatex(child, state)).join("")}` : ""}\n\\end{quote}`;
    if (value.kind === "callout") return `\\begin{quote}\n\\textbf{${value.title ? value.title.map((child) => inlineLatex(child, state)).join("") : texEscape(value.variant)}}\\par\n${value.children.map((child) => blockLatex(child, state)).join("\n\n")}\n\\end{quote}`;
    if (value.kind === "code_block") return `${value.caption ? `\\textbf{${value.caption.map((child) => inlineLatex(child, state)).join("")}}\n` : ""}\\begin{verbatim}\n${value.code}\n\\end{verbatim}`;
    if (value.kind === "math_block") return `\\begin{equation}${value.label ? `\\label{${texEscape(value.label)}}` : ""}\n${value.source}\n\\end{equation}`;
    if (value.kind === "asset") return latexMediaLink(value.ref, value.filename || value.mime);
    if (value.kind === "image") return inlineLatex(value, state) + (value.caption ? `\n\n\\emph{${value.caption.map((child) => inlineLatex(child, state)).join("")}}` : "");
    if (value.kind === "audio" || value.kind === "video") {
        state.diagnostics.push(diagnostic("latex-media-link", `${value.kind} cannot be embedded in static LaTeX; emitted a URL`, "warning"));
        return [latexMediaLink(value.asset.ref, value.title || value.kind), value.transcript ? `Transcript: ${value.transcript.map((child) => inlineLatex(child, state)).join("")}` : null, value.caption ? `\\emph{${value.caption.map((child) => inlineLatex(child, state)).join("")}}` : null].filter(Boolean).join("\n\n");
    }
    if (value.kind === "fragment") return latexChildren(value.children,state);
    if (value.kind === "snapshots") return [value.title ? `\\section*{${texEscape(value.title)}}` : null, ...value.snapshots.map((snapshot) => blockLatex(snapshot.content, state)), value.caption ? `\\emph{${texEscape(value.caption)}}` : null].filter(Boolean).join("\n\n");
    if (value.kind === "timeline_render") return blockLatex(value.content, state);
    if (value.kind === "timeline") {
        state.diagnostics.push(diagnostic("latex-timeline-summary", "LaTeX cannot play a Timeline; emitted a summary", "warning"));
        return `\\emph{Timeline: ${value.frames.length} frames}`;
    }
    if (value.kind.startsWith("control_") || value.kind === "control_panel") {
        state.diagnostics.push(diagnostic("latex-static-control", "Interactive controls were lowered to static text", "warning"));
        return `\\begin{verbatim}\n${formatOutputText(value, state.format)}\n\\end{verbatim}`;
    }
    if (value.kind === "table" && state.layoutActive) return publicationLatexTable(value,state);
    if (value.kind === "table" && value.label) {
        return `\\hypertarget{${texEscape(value.label)}}{}\n${blockLatex({ ...value, label: null }, state)}`;
    }
    if (value.kind === "table") {
        const columns = value.columns.map((column) => column.align === "right" ? "r" : column.align === "center" ? "c" : "l").join("");
        return `${value.caption ? `\\begin{table}[htbp]\n\\centering\n\\caption{${texEscape(value.caption)}}\n` : ""}\\begin{tabular}{${columns}}\n\\toprule\n${value.columns.map(({ label }) => texEscape(label)).join(" & ")} \\\\\n\\midrule\n${latexRows(value.rows, state)}\n\\bottomrule\n\\end{tabular}${value.caption ? "\n\\end{table}" : ""}`;
    }
    if (value.kind === "grid") return latexGrid(value, state);
    if (value.kind === "sheet") {
        state.diagnostics.push(diagnostic("latex-sheet-text", "Sheet was lowered to its selected static text plane", "info"));
        return `\\begin{verbatim}\n${formatOutputText(value, state.format)}\n\\end{verbatim}`;
    }
    if (value.kind === "figure") {
        if (state.layoutActive && state.plan.floats === "inline" && !state.slides) {
            state.packages.add("caption");
            return `\\par\\noindent\\begin{minipage}{\\linewidth}\\centering\n${blockLatex(value.content,state)}${value.caption?`\n\\captionof*{figure}{${texEscape(value.caption)}}`:""}${value.label?`\n\\phantomsection\\label{${texEscape(value.label)}}`:""}\n\\end{minipage}\\par`;
        }
        return `\\begin{figure}[htbp]\n\\centering\n${blockLatex(value.content, state)}${value.caption ? `\n\\caption{${texEscape(value.caption)}}` : ""}${value.label ? `\n\\label{${texEscape(value.label)}}` : ""}\n\\end{figure}`;
    }
    if (value.kind === "graphic") {
        if (state.figureAsset !== "tikz") {
            if (typeof state.render !== "function") throw new Error(`LaTeX ${state.figureAsset} figure delegation requires a renderer registry`);
            state.figure += 1;
            const rendered = state.render(value, state.figureAsset, { numericPolicy: numericFormatterPolicy(state.format) });
            const path = `${state.assetDir}/figure-${state.figure}.${rendered.extension}`;
            state.assets.push({ path, mime: rendered.mime, content: rendered.content });
            state.diagnostics.push(...rendered.diagnostics);
            state.packages.add(state.figureAsset === "svg" ? "svg" : "graphicx");
            return state.figureAsset === "svg" ? `\\includesvg{${texEscape(path)}}` : `\\includegraphics{${texEscape(path)}}`;
        }
        const rendered = renderGraphicTikz(value, state.format);
        state.diagnostics.push(...rendered.diagnostics);
        return rendered.content.trim();
    }
    if (value.kind === "slide") return state.slides ? `\\begin{frame}[fragile,allowframebreaks]{${texEscape(value.title || "Slide")}}\n${blockLatex(value.content,state)}\n\\end{frame}` : `\\section*{${texEscape(value.title || "Slide")}}\n${blockLatex(value.content, state)}`;
    if (value.kind === "slides") return value.slides.map((slide) => blockLatex(slide, state)).join(state.slides ? "\n" : "\n\\clearpage\n");
    throw new UnsupportedRenderError(`LaTeX renderer does not support output kind '${outputKind(value)}'`, { target: "latex" });
}

export function renderLatex(value, {
    format, standalone = true, title = null, render = null, rawMarkup = "fallback",
    figureAsset = "tikz", assetDir = "assets", pageSize = "letterpaper", placement = "htbp", bookmarks = true, metadata = null,
    publicationPlan = null, outputTarget = "latex",
} = {}) {
    if (!["allow", "fallback", "deny"].includes(rawMarkup)) throw new Error("LaTeX rawMarkup must be allow, fallback, or deny");
    if (!["tikz", "svg", "png"].includes(figureAsset)) throw new Error("LaTeX figureAsset must be tikz, svg, or png");
    if (!/^[htbp!]+$/.test(placement)) throw new Error("LaTeX placement must contain only h, t, b, p, or !");
    if (!/^[a-z0-9]+paper$/i.test(pageSize)) throw new Error("LaTeX pageSize must be a paper name such as letterpaper or a4paper");
    if (!assetDir || assetDir.startsWith("/") || assetDir.split("/").includes("..")) throw new Error("LaTeX assetDir must be a safe relative directory");
    const plan = resolvePublicationPlan(value,publicationPlan ? {publicationPlan} : {});
    const layoutActive = Boolean(publicationPlan || value?.publicationPlan || value?.kind === "slides" || value?.kind === "slide");
    const slides = layoutActive && plan.profile === "slides";
    if (slides && !["slide","slides"].includes(value.kind)) throw new Error("Slides publication requires explicit Slide/Slides content");
    const { regions } = validatePublicationTree(value,plan);
    if (layoutActive) {
        pageSize=plan.pageSize;
        if (plan.floats !== "inline") placement={top:"t",bottom:"b",page:"p"}[plan.floats];
    }
    const state = {
        format, render, rawMarkup, figureAsset, assetDir, diagnostics: publicationDiagnostics(plan,outputTarget), assets: [], figure: 0,
        packages: new Set(["amsmath", "amssymb", "booktabs", "graphicx", "hyperref", "xcolor", ...(figureAsset === "tikz" ? ["tikz"] : [])]),
        preNumbered: value?.documentSchema === "rix.document.report@1", plan, layoutActive, slides, inColumns:false,
    };
    const body = (blockLatex(value, state) + publicationLatexIndex(state))
        .replaceAll("\\begin{table}[htbp]", `\\begin{table}[${placement}]`)
        .replaceAll("\\begin{figure}[htbp]", `\\begin{figure}[${placement}]`);
    let regionsPreamble="";
    if (layoutActive && plan.runningRegions && (regions.header.length || regions.footer.length)) {
        const regionText = nodes => {
            const text=nodes.map(node=>formatOutputText(node,format)).join(" — ");
            if (text.length>512) state.diagnostics.push(diagnostic("publication-running-region-truncated","Running header/footer is limited to 512 characters; full content remains in the source tree"));
            return texEscape(text.slice(0,512));
        };
        if (slides) state.diagnostics.push(diagnostic("publication-running-region-fallback","Slides use frame titles and page navigation instead of running report regions"));
        else {
            state.packages.add("fancyhdr");
            regionsPreamble=`\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[L]{${regionText(regions.header)}}\n\\fancyfoot[L]{${regionText(regions.footer)}}\n\\fancyfoot[R]{\\thepage}\n\\setlength{\\headheight}{24pt}\n`;
        }
    }
    const renderMetadata = { schema: "rix.latex.render@2", packages: [...state.packages].sort(), pageSize:slides?null:pageSize, slideSize:slides?plan.slideSize:null, figureAsset, placement, publicationPlan:plan, documentClass:slides?"beamer":"article" };
    if (!standalone) return { content: `${body.trim()}\n`, diagnostics: state.diagnostics, assets: state.assets, metadata: renderMetadata };
    const heading = title ? `\\title{${texEscape(title)}}\n\\date{}\n` : "";
    const makeTitle = title ? slides?"\\begin{frame}\\titlepage\\end{frame}\n":`\\maketitle\n${regionsPreamble?"\\thispagestyle{fancy}\n":""}` : "";
    const pdfTitle = metadata?.title || title || "RiX document";
    const pdfAuthor = metadata?.author || "";
    const themeAccent = value?.documentTheme?.entries?.get("accent")?.value || (plan.theme === "compact"?"#174c3b":"#275dad");
    const themePreamble = /^#[0-9a-f]{6}$/i.test(themeAccent)
        ? `\\definecolor{rixaccent}{HTML}{${themeAccent.slice(1).toUpperCase()}}\n` + (slides?"\\setbeamercolor{structure}{fg=rixaccent}\n":"") : "";
    const documentClass = slides ? `\\documentclass[aspectratio=${plan.slideSize==="wide"?"169":"43"}]{beamer}\n`
        : `\\documentclass[${pageSize}]{article}\n\\usepackage[margin=1in]{geometry}\n`;
    const density = plan.theme === "compact" ? "\\setlength{\\parskip}{2pt}\n" : "";
    return {
        content: `${documentClass}${[...state.packages].sort().map((name) => `\\usepackage{${name}}`).join("\n")}\n\\DeclareUnicodeCharacter{2248}{\\ensuremath{\\approx}}\n${themePreamble}${density}\\hypersetup{pdftitle={${texEscape(pdfTitle)}},pdfauthor={${texEscape(pdfAuthor)}},bookmarks=${bookmarks ? "true" : "false"}}\n${heading}${regionsPreamble}\\begin{document}\n${makeTitle}${body.trim()}\n\\end{document}\n`,
        diagnostics: state.diagnostics, assets: state.assets, metadata: renderMetadata,
    };
}

export function quartoFrontMatter(options) {
    const metadata = field(options, "metadata", options);
    const keys = ["title", "author", "date", "format", "theme", "bibliography"];
    const lines = [];
    for (const key of keys) {
        const value = field(metadata, key);
        const text = rixString(value) ?? (typeof value === "string" ? value : null);
        if (text !== null) lines.push(`${key}: ${JSON.stringify(text)}`);
    }
    if (!lines.some((line) => line.startsWith("format:"))) lines.push("format: html");
    return `---\n${lines.join("\n")}\n---\n\n`;
}
