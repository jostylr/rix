import { parse } from "../../parser/parser.js";
import { lower } from "../lower.js";
import { formatValue } from "../format.js";
import { Integer } from "@ratmath/core";
import { createFigure, createFragment, createGraphic, createGrid, createHeading, createParagraph, createSlide, createSlides, createTable, createText } from "../../runtime/output.js";

const capability = (impl, doc) => ({ impl: (args) => impl(args), pure: true, doc });

function evaluateTemplateSource(source, context, evaluate) {
    const nodes = lower(parse(source));
    let result = null;
    for (const node of nodes) result = evaluate(node);
    return result;
}

function interpolationRanges(body) {
    const ranges = [];
    let cursor = 0;
    while (cursor < body.length) {
        const start = body.indexOf("@{", cursor);
        if (start === -1) break;
        let depth = 1;
        let quote = null;
        let index = start + 2;
        for (; index < body.length && depth > 0; index += 1) {
            const character = body[index];
            if (quote) {
                if (character === "\\") index += 1;
                else if (character === quote) quote = null;
                continue;
            }
            if (character === '"' || character === "`") {
                quote = character;
            } else if (character === "{") {
                depth += 1;
            } else if (character === "}") {
                depth -= 1;
            }
        }
        if (depth !== 0) throw new Error("Unclosed @{...} interpolation in template");
        ranges.push({ start, end: index, source: body.slice(start + 2, index - 1) });
        cursor = index;
    }
    return ranges;
}

function interpolateText(body, context, evaluate) {
    const ranges = interpolationRanges(body);
    let result = "";
    let cursor = 0;
    for (const range of ranges) {
        result += body.slice(cursor, range.start);
        const value = evaluateTemplateSource(range.source, context, evaluate);
        result += formatValue(value, { context, evaluate });
        cursor = range.end;
    }
    return result + body.slice(cursor);
}

function standaloneInterpolation(body, context, evaluate) {
    const ranges = interpolationRanges(body.trim());
    return ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === body.trim().length
        ? evaluateTemplateSource(ranges[0].source, context, evaluate)
        : null;
}

function textValue(text) {
    return { type: "string", value: text };
}

function documentTemplate(body, context, evaluate) {
    const normalized = body.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
    if (!normalized.trim()) return createFragment([[/* empty */]]);
    const children = normalized.split(/\n\s*\n/).map((block) => {
        const source = block.trim();
        const standalone = standaloneInterpolation(source, context, evaluate);
        if (standalone !== null) return standalone;
        const heading = source.match(/^h([1-6]):\s*([\s\S]*)$/i);
        if (heading) return createHeading([new Integer(BigInt(heading[1])), textValue(interpolateText(heading[2], context, evaluate))]);
        const directive = source.match(/^(fig|figure|table):\s*([^\n]*)(?:\n([\s\S]*))?$/i);
        if (directive) {
            const [, kind, captionSource, contentSource = ""] = directive;
            const content = standaloneInterpolation(contentSource.trim(), context, evaluate)
                ?? createParagraph([[textValue(interpolateText(contentSource.trim(), context, evaluate))]]);
            const caption = captionSource.replace(/\s+#[-\w:.]+\s*$/, "").trim();
            const label = (captionSource.match(/\s+(#[-\w:.]+)\s*$/) || [])[1]?.slice(1) || null;
            return createFigure([content, caption ? textValue(interpolateText(caption, context, evaluate)) : null, label ? textValue(label) : null]);
        }
        const paragraph = source.match(/^p:\s*([\s\S]*)$/i);
        return createParagraph([[textValue(interpolateText(paragraph ? paragraph[1] : source, context, evaluate))]]);
    });
    return createFragment([children]);
}

const templateText = {
    lazy: true,
    pure: false,
    doc: "Create interpolated text with @{expression} insertions",
    impl: (args, context, evaluate) => textValue(interpolateText(args[0], context, evaluate)),
};

const documentTemplateFunction = {
    lazy: true,
    pure: false,
    doc: "Create a Fragment from an @\"\"\" document template",
    impl: (args, context, evaluate) => documentTemplate(args[0], context, evaluate),
};

export const outputFunctions = {
    TEXT: capability(createText, "Create a portable text output node"),
    PARAGRAPH: capability(createParagraph, "Create a portable paragraph output node"),
    HEADING: capability(createHeading, "Create a portable document heading"),
    FRAGMENT: capability(createFragment, "Compose portable output values"),
    TABLE: capability(createTable, "Create a structured output table"),
    GRID: capability(createGrid, "Create a mathematical layout grid"),
    GRAPHIC: capability(createGraphic, "Create a portable 2D scene"),
    FIGURE: capability(createFigure, "Wrap output with figure metadata"),
    SLIDE: capability(createSlide, "Create a presentation slide"),
    SLIDES: capability(createSlides, "Create a sequential presentation deck"),
    TEMPLATE_TEXT: templateText,
    DOCUMENT_TEMPLATE: documentTemplateFunction,
};
