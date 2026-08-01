import { parse } from "../../parser/parser.js";
import { lower } from "../lower.js";
import { formatValue } from "../format.js";
import { Integer } from "@ratmath/core";
import { createAsset, createAudio, createCallout, createCode, createCodeBlock, createControlPanel, createEmphasis, createFigure, createFragment, createGrid, createHeading, createImage, createLineBreak, createLink, createList, createListItem, createMath, createMathBlock, createParagraph, createQuote, createSection, createSheet, createSlide, createSlides, createStrong, createTable, createText, createVideo, isInlineOutput, isOutputValue } from "../../runtime/output.js";
import { createBinding } from "../../runtime/binding.js";
import { createLiveView } from "../../runtime/reactive-view.js";
import { isReactiveNode, REACTIVE_READ_ENV } from "../../runtime/reactive-graph.js";

const capability = (impl, doc) => ({ impl: (args) => impl(args), pure: true, doc });

function evaluateTemplateSource(source, context, evaluate) {
    const nodes = lower(parse(source));
    let result = null;
    for (const node of nodes) result = evaluate(node);
    return result;
}

function readHole(source, start) {
    if (!source.startsWith("@{", start)) return null;
    let depth = 1;
    let quote = null;
    let index = start + 2;
    for (; index < source.length && depth > 0; index += 1) {
        const character = source[index];
        if (quote) {
            if (character === "\\") index += 1;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === "`") quote = character;
        else if (character === "{") depth += 1;
        else if (character === "}") depth -= 1;
    }
    if (depth !== 0) throw new Error("Unclosed @{...} interpolation in template");
    return { end: index, source: source.slice(start + 2, index - 1) };
}

function interpolatedLiteral(body, context, evaluate, { output = "format" } = {}) {
    let result = "";
    for (let index = 0; index < body.length;) {
        if (body.startsWith("@@{", index)) {
            result += "@{";
            index += 3;
            continue;
        }
        if (!body.startsWith("@{", index)) {
            result += body[index];
            index += 1;
            continue;
        }
        const hole = readHole(body, index);
        const value = evaluateTemplateSource(hole.source, context, evaluate);
        if (output === "reject" && isOutputValue(value)) {
            throw new Error("Code and math interpolations require a raw RiX value, not an output value");
        }
        result += formatValue(value, { context, evaluate });
        index = hole.end;
    }
    return result;
}

function standaloneInterpolation(body, context, evaluate) {
    const source = body.trim();
    if (source.startsWith("@@{")) return { matched: false, value: null };
    const hole = source.startsWith("@{") ? readHole(source, 0) : null;
    return hole && hole.end === source.length
        ? { matched: true, value: evaluateTemplateSource(hole.source, context, evaluate) }
        : { matched: false, value: null };
}

function textValue(text) {
    return { type: "string", value: text };
}

function outputMap(fields) {
    return { type: "map", entries: new Map(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null)) };
}

function literalValue(value) {
    return { type: "string", value };
}

function inlineText(value, context, evaluate, { literal = false } = {}) {
    const children = [];
    let buffer = "";
    const append = (value) => { buffer += value; };
    const flush = () => {
        if (buffer) children.push(textValue(buffer));
        buffer = "";
    };
    const valueChild = (value) => {
        flush();
        if (isOutputValue(value)) {
            if (!isInlineOutput(value)) throw new Error(`Inline template content cannot contain block output ${value.kind}`);
            children.push(value);
        } else {
            append(formatValue(value, { context, evaluate }));
        }
    };
    const closing = (source, delimiter, start) => {
        for (let index = start; index < source.length; index += 1) {
            if (!literal && source[index] === "\\") {
                index += 1;
                continue;
            }
            if (source.startsWith(delimiter, index)) return index;
        }
        return -1;
    };
    for (let index = 0; index < value.length;) {
        if (value.startsWith("@@{", index)) {
            append("@{");
            index += 3;
            continue;
        }
        if (value.startsWith("@{", index)) {
            const hole = readHole(value, index);
            valueChild(evaluateTemplateSource(hole.source, context, evaluate));
            index = hole.end;
            continue;
        }
        const character = value[index];
        if (!literal && character === "\\") {
            const escaped = value[index + 1];
            if (escaped && "\\*`$[]()".includes(escaped)) {
                append(escaped);
                index += 2;
                continue;
            }
        }
        if (!literal && value.startsWith("****", index)) {
            throw new Error("Runs of four or more asterisks are not document-template delimiters; nest *...* and **...** explicitly");
        }
        if (!literal && value.startsWith("***", index)) {
            const end = closing(value, "***", index + 3);
            if (end < 0) throw new Error("Unclosed ***strong emphasis*** delimiter in document template");
            flush();
            children.push(createStrong([[createEmphasis([inlineText(value.slice(index + 3, end), context, evaluate)])]]));
            index = end + 3;
            continue;
        }
        if (!literal && value.startsWith("**", index)) {
            const end = closing(value, "**", index + 2);
            if (end < 0) throw new Error("Unclosed **strong** delimiter in document template");
            flush();
            children.push(createStrong([inlineText(value.slice(index + 2, end), context, evaluate)]));
            index = end + 2;
            continue;
        }
        if (!literal && character === "*") {
            const end = closing(value, "*", index + 1);
            if (end < 0) throw new Error("Unclosed *emphasis* delimiter in document template");
            flush();
            children.push(createEmphasis([inlineText(value.slice(index + 1, end), context, evaluate)]));
            index = end + 1;
            continue;
        }
        if (!literal && (character === "`" || character === "$")) {
            const end = closing(value, character, index + 1);
            if (end < 0) throw new Error(`Unclosed ${character} delimiter in document template`);
            const literalSource = interpolatedLiteral(value.slice(index + 1, end), context, evaluate, { output: "reject" });
            flush();
            children.push(character === "`" ? createCode([literalValue(literalSource)]) : createMath([literalValue(literalSource)]));
            index = end + 1;
            continue;
        }
        if (!literal && character === "[") {
            const labelEnd = closing(value, "](", index + 1);
            if (labelEnd < 0) throw new Error("Unclosed [label](...) link delimiter in document template");
            let end = labelEnd + 2;
            let braces = 0;
            let quote = null;
            for (; end < value.length; end += 1) {
                const part = value[end];
                if (quote) {
                    if (part === "\\") end += 1;
                    else if (part === quote) quote = null;
                    continue;
                }
                if (part === '"' || part === "'") quote = part;
                else if (part === "{") braces += 1;
                else if (part === "}") braces -= 1;
                else if (part === ")" && braces === 0) break;
            }
            if (end >= value.length) throw new Error("Unclosed [label](...) link destination in document template");
            const label = value.slice(index + 1, labelEnd);
            const target = value.slice(labelEnd + 2, end).trim();
            const descriptor = parseAssetDescriptor(target, context, evaluate);
            flush();
            if (descriptor.type === "link") {
                for (const name of Object.keys(descriptor.attributes)) {
                    if (name !== "title") throw new Error(`Unknown link attribute: ${name}`);
                }
                children.push(createLink([outputMap({ href: literalValue(descriptor.primary), children: inlineText(label, context, evaluate), title: descriptor.attributes.title ? literalValue(descriptor.attributes.title) : null })]));
            } else if (descriptor.type === "image") {
                children.push(mediaOutput("image", descriptor, inlinePlainText(label, context, evaluate), context, evaluate));
            } else {
                throw new Error(`Inline ${descriptor.type} assets are not supported; use a block directive`);
            }
            index = end + 1;
            continue;
        }
        if (character === "\n") {
            flush();
            children.push(createLineBreak([]));
            index += 1;
            continue;
        }
        append(character);
        index += 1;
    }
    flush();
    return children;
}

function inlinePlainText(source, context, evaluate) {
    return inlineText(source, context, evaluate).map((item) => formatValue(item, { context, evaluate })).join("");
}

function parseAssetDescriptor(source, context, evaluate) {
    const match = source.match(/^([a-z][\w-]*)\s*:\s*/i);
    if (!match) throw new Error("Asset/link syntax requires a type: primary descriptor");
    const type = match[1].toLowerCase();
    let rest = source.slice(match[0].length).trim();
    let attributes = {};
    let attrStart = -1;
    for (let index = 0; index < rest.length; index += 1) {
        if (rest[index] === "{" && rest[index - 1] !== "@") {
            attrStart = index;
            break;
        }
    }
    if (attrStart >= 0) {
        if (!rest.endsWith("}")) throw new Error("Asset attributes must end with }");
        attributes = parseAttributes(rest.slice(attrStart + 1, -1), context, evaluate);
        rest = rest.slice(0, attrStart).trim();
    }
    if ((rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'"))) rest = rest.slice(1, -1);
    if (!rest) throw new Error("Asset/link syntax requires a primary descriptor");
    return { type, primary: interpolatedLiteral(rest, context, evaluate), attributes };
}

function parseAttributes(source, context, evaluate) {
    const attributes = {};
    for (const entry of source.split(",").map((part) => part.trim()).filter(Boolean)) {
        const match = entry.match(/^([a-z][\w-]*)\s*=\s*([\s\S]+)$/i);
        if (!match) throw new Error(`Invalid asset attribute: ${entry}`);
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        value = interpolatedLiteral(value, context, evaluate);
        attributes[match[1].toLowerCase()] = /^\d+$/.test(value) ? Number(value) : value;
    }
    return attributes;
}

function mediaOutput(type, descriptor, label, context, evaluate) {
    const attributes = descriptor.attributes;
    const allowed = new Set(["mime", "width", "height", "filename", "title", "caption", "id", "alt", "transcript"]);
    for (const name of Object.keys(attributes)) {
        if (!allowed.has(name)) throw new Error(`Unknown ${type} asset attribute: ${name}`);
    }
    const mime = attributes.mime;
    if (!mime) throw new Error(`${type} asset requires a mime attribute`);
    const asset = createAsset([outputMap({
        ref: literalValue(descriptor.primary), mime: literalValue(mime), width: attributes.width,
        height: attributes.height, filename: attributes.filename ? literalValue(attributes.filename) : null,
    })]);
    const common = {
        asset,
        width: attributes.width,
        height: attributes.height,
        title: attributes.title ? literalValue(attributes.title) : null,
        caption: attributes.caption ? inlineText(attributes.caption, context, evaluate) : null,
        id: attributes.id ? literalValue(attributes.id) : null,
    };
    if (type === "image") return createImage([outputMap({ ...common, alt: literalValue(label || attributes.alt || "") })]);
    if (type === "audio") return createAudio([outputMap({ ...common, transcript: attributes.transcript ? inlineText(attributes.transcript, context, evaluate) : null })]);
    if (type === "video") return createVideo([outputMap({ ...common, transcript: attributes.transcript ? inlineText(attributes.transcript, context, evaluate) : null })]);
    return asset;
}

function headerLabel(source) {
    const match = source.match(/^(.*?)(?:\s+#([-\w:.]+))?\s*$/);
    return { text: match[1].trim(), id: match[2] || null };
}

function sectionize(entries, parentLevel = 0) {
    const children = [];
    for (let index = 0; index < entries.length;) {
        const entry = entries[index];
        if (!entry?.templateHeading) {
            children.push(entry);
            index += 1;
            continue;
        }
        const { level, title, id } = entry;
        if (level > parentLevel + 1) throw new Error(`Heading h${level}: skips a section level after h${parentLevel}:`);
        index += 1;
        const body = [];
        while (index < entries.length) {
            const following = entries[index];
            if (following?.templateHeading && following.level <= level) break;
            body.push(following);
            index += 1;
        }
        children.push(createSection([outputMap({ level: new Integer(BigInt(level)), title, children: sectionize(body, level), id: id ? literalValue(id) : null })]));
    }
    return children;
}

class DocumentTemplateParser {
    constructor(source, context, evaluate) {
        this.lines = source.split("\n");
        this.context = context;
        this.evaluate = evaluate;
    }

    indentation(line) {
        if (/\t/.test(line)) throw new Error("Tabs are not allowed for document-template indentation");
        return (line.match(/^ */) || [""])[0].length;
    }

    bodyEnd(index, indent, end) {
        let cursor = index + 1;
        while (cursor < end) {
            if (!this.lines[cursor].trim()) {
                let probe = cursor + 1;
                while (probe < end && !this.lines[probe].trim()) probe += 1;
                if (probe >= end || this.indentation(this.lines[probe]) <= indent) break;
                cursor = probe;
                continue;
            }
            if (this.indentation(this.lines[cursor]) <= indent) break;
            cursor += 1;
        }
        return cursor;
    }

    bodyLines(index, end, indent) {
        return this.lines.slice(index, end).map((line) => {
            if (!line.trim()) return "";
            const actual = this.indentation(line);
            if (actual < indent + 4) throw new Error("Document-template bodies must be indented by four spaces");
            return line.slice(indent + 4);
        });
    }

    parseBlocks(start = 0, end = this.lines.length, indent = 0) {
        const blocks = [];
        for (let index = start; index < end;) {
            const line = this.lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }
            if (this.indentation(line) !== indent) throw new Error("Unexpected document-template indentation");
            const source = line.slice(indent);
            const standalone = standaloneInterpolation(source, this.context, this.evaluate);
            if (standalone.matched) {
                blocks.push(isOutputValue(standalone.value)
                    ? standalone.value
                    : createParagraph([[textValue(formatValue(standalone.value, { context: this.context, evaluate: this.evaluate }))]]));
                index += 1;
                continue;
            }
            const directive = source.match(/^([a-z][\w-]*):(?:\s*(.*))?$/i);
            const name = directive?.[1].toLowerCase();
            const supported = new Set(["p", "fig", "figure", "table", "quote", "callout", "code", "math", "ul", "ol", "section", "asset", "image", "audio", "video"]);
            const heading = source.match(/^h([1-6]):\s*(.*)$/i);
            if (heading) {
                const header = headerLabel(heading[2]);
                blocks.push({ templateHeading: true, level: Number(heading[1]), title: inlineText(header.text, this.context, this.evaluate), id: header.id });
                index += 1;
                continue;
            }
            if (directive && supported.has(name)) {
                const bodyEnd = this.bodyEnd(index, indent, end);
                const body = this.bodyLines(index + 1, bodyEnd, indent);
                blocks.push(this.directive(name, directive[2] || "", body, indent));
                index = bodyEnd;
                continue;
            }
            const paragraph = [source];
            index += 1;
            while (index < end && this.lines[index].trim() && this.indentation(this.lines[index]) === indent) {
                const candidate = this.lines[index].slice(indent);
                if (/^(?:h[1-6]|p|fig|figure|table|quote|callout|code|math|ul|ol|section|asset|image|audio|video):/i.test(candidate) || standaloneInterpolation(candidate, this.context, this.evaluate).matched) break;
                paragraph.push(candidate);
                index += 1;
            }
            blocks.push(createParagraph([inlineText(paragraph.join("\n"), this.context, this.evaluate)]));
        }
        return sectionize(blocks);
    }

    directive(name, header, body, indent) {
        const bodySource = body.join("\n");
        const nested = () => new DocumentTemplateParser(bodySource, this.context, this.evaluate).parseBlocks();
        if (name === "p") return createParagraph([inlineText([header, bodySource].filter(Boolean).join(bodySource ? "\n" : ""), this.context, this.evaluate)]);
        if (name === "code") return createCodeBlock([outputMap({ code: literalValue(interpolatedLiteral(bodySource, this.context, this.evaluate, { output: "reject" })), language: literalValue(header || "text") })]);
        if (name === "math") return createMathBlock([outputMap({ source: literalValue(interpolatedLiteral(bodySource || header, this.context, this.evaluate, { output: "reject" })) })]);
        if (name === "quote") return createQuote([outputMap({ children: nested(), attribution: header ? inlineText(header, this.context, this.evaluate) : null })]);
        if (name === "callout") {
            const match = header.match(/^(note|tip|warning|caution|important)(?:\s+—\s*(.*))?$/i);
            if (!match) throw new Error("Callout header must be VARIANT or VARIANT — TITLE");
            return createCallout([outputMap({ variant: literalValue(match[1]), title: match[2] ? inlineText(match[2], this.context, this.evaluate) : null, children: nested() })]);
        }
        if (name === "ul" || name === "ol") return this.list(body, name === "ol");
        if (name === "section") {
            const match = header.match(/^([1-6])\s+(.+)$/);
            if (!match) throw new Error("Section header must be LEVEL TITLE");
            const sectionHeader = headerLabel(match[2]);
            return createSection([outputMap({ level: new Integer(BigInt(match[1])), title: inlineText(sectionHeader.text, this.context, this.evaluate), children: nested(), id: sectionHeader.id ? literalValue(sectionHeader.id) : null })]);
        }
        if (["asset", "image", "audio", "video"].includes(name)) {
            const descriptor = parseAssetDescriptor(`${name}: ${header}`, this.context, this.evaluate);
            if (name === "asset") {
                if (!descriptor.attributes.mime) throw new Error("asset: requires a mime attribute");
                return createAsset([outputMap({
                    ref: literalValue(descriptor.primary), mime: literalValue(descriptor.attributes.mime),
                    width: descriptor.attributes.width, height: descriptor.attributes.height,
                    filename: descriptor.attributes.filename ? literalValue(descriptor.attributes.filename) : null,
                })]);
            }
            return mediaOutput(name, descriptor, descriptor.attributes.alt || "", this.context, this.evaluate);
        }
        if (["fig", "figure", "table"].includes(name)) {
            const label = headerLabel(header);
            const standalone = standaloneInterpolation(bodySource, this.context, this.evaluate);
            const content = standalone.matched
                ? standalone.value
                : createParagraph([inlineText(bodySource, this.context, this.evaluate)]);
            return createFigure([content, label.text ? literalValue(inlinePlainText(label.text, this.context, this.evaluate)) : null, label.id ? literalValue(label.id) : null]);
        }
        throw new Error(`Unsupported document-template directive: ${name}`);
    }

    list(lines, ordered) {
        const items = [];
        for (let index = 0; index < lines.length;) {
            if (!lines[index].trim()) {
                index += 1;
                continue;
            }
            if (!lines[index].startsWith("- ")) throw new Error("List bodies require '- ' item markers");
            const first = lines[index].slice(2);
            index += 1;
            const child = [];
            while (index < lines.length && (!lines[index].trim() || lines[index].startsWith("    "))) {
                child.push(lines[index].trim() ? lines[index].slice(4) : "");
                index += 1;
            }
            const children = [createParagraph([inlineText(first, this.context, this.evaluate)])];
            if (child.some((line) => line.trim())) children.push(...new DocumentTemplateParser(child.join("\n"), this.context, this.evaluate).parseBlocks());
            items.push(createListItem([children]));
        }
        return createList([[...items], ordered ? new Integer(1n) : new Integer(0n)]);
    }
}

function documentTemplate(body, context, evaluate) {
    const trimmed = body.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
    const indents = trimmed.split("\n").filter((line) => line.trim()).map((line) => (line.match(/^ */) || [""])[0].length);
    const commonIndent = indents.length ? Math.min(...indents) : 0;
    const normalized = trimmed.split("\n").map((line) => line.trim() ? line.slice(commonIndent) : "").join("\n");
    if (!normalized.trim()) return createFragment([[/* empty */]]);
    return createFragment([new DocumentTemplateParser(normalized, context, evaluate).parseBlocks()]);
}

const templateText = {
    lazy: true,
    pure: false,
    doc: "Create interpolated text with @{expression} insertions",
    impl: (args, context, evaluate) => textValue(interpolatedLiteral(args[0], context, evaluate)),
};

const documentTemplateFunction = {
    lazy: true,
    pure: false,
    doc: "Create a Fragment from an @\"\"\" document template",
    impl: (args, context, evaluate) => documentTemplate(args[0], context, evaluate),
};

const bindFunction = {
    lazy: true,
    pure: false,
    doc: "Capture a live Binding to a RiX variable",
    impl(args, context) {
        if (args.length !== 1) throw new Error(".Bind expects exactly one variable");
        const target = args[0];
        if (!target || target.fn !== "RETRIEVE") {
            throw new Error(".Bind currently requires a variable name; use .Bind(value).At(...) for indexed lenses");
        }
        const name = target.args[0];
        const cell = context.getCell(name);
        if (!cell) throw new Error(`Cannot bind undefined variable: ${name}`);
        return createBinding(cell, { name });
    },
};

const liveViewFunction = {
    pure: false,
    doc: "Deprecated compatibility wrapper for a reactive output derived from a subscribable source; prefer a named $$ output and final $ read",
    impl(args, context, evaluate) {
        if (args.length !== 2) throw new Error(".LiveView expects an observable source and one deferred body");
        const [source, deferred] = args;
        if (!deferred || deferred.fn !== "DEFER") {
            throw new Error(".LiveView derivation must use deferred syntax @{ ... }");
        }
        const derive = () => {
            const sourceGraph = isReactiveNode(source)
                ? source.graph
                : source?.graph?.type === "reactive_graph"
                    ? source.graph
                    : source;
            const bindings = typeof sourceGraph.bindings === "function" ? sourceGraph.bindings() : new Map();
            bindings.set("source", source);
            const previousRead = context.getEnv(REACTIVE_READ_ENV, undefined);
            context.push(bindings, {
                isolated: true,
                callableBoundary: true,
            });
            context.setEnv(REACTIVE_READ_ENV, (value) => {
                if (isReactiveNode(value) && value.graph === sourceGraph) return value.get();
                return typeof previousRead === "function" ? previousRead(value) : value;
            });
            try {
                return context.withSharedBody(deferred.args[0], () => evaluate(deferred.args[0]));
            } finally {
                context.setEnv(REACTIVE_READ_ENV, previousRead);
                context.pop();
            }
        };
        return createLiveView(source, derive);
    },
};

export const outputFunctions = {
    BIND: bindFunction,
    LIVEVIEW: liveViewFunction,
    TEXT: capability(createText, "Create a portable text output node"),
    PARAGRAPH: capability(createParagraph, "Create a portable paragraph output node"),
    HEADING: capability(createHeading, "Create a portable document heading"),
    FRAGMENT: capability(createFragment, "Compose portable output values"),
    EMPHASIS: capability(createEmphasis, "Create semantic inline emphasis"),
    STRONG: capability(createStrong, "Create semantic inline strong content"),
    CODE: capability(createCode, "Create literal inline code"),
    MATH: capability(createMath, "Create portable inline TeX math"),
    LINK: capability(createLink, "Create a portable link"),
    LINEBREAK: capability(createLineBreak, "Create an intentional inline line break"),
    SECTION: capability(createSection, "Create a structural document section"),
    LIST: capability(createList, "Create an ordered or unordered document list"),
    LISTITEM: capability(createListItem, "Create a document list item"),
    QUOTE: capability(createQuote, "Create a document quotation block"),
    CALLOUT: capability(createCallout, "Create a semantic document callout"),
    CODEBLOCK: capability(createCodeBlock, "Create a literal source-code block"),
    MATHBLOCK: capability(createMathBlock, "Create a display TeX math block"),
    ASSET: capability(createAsset, "Create a portable asset reference"),
    IMAGE: capability(createImage, "Create a portable image asset"),
    AUDIO: capability(createAudio, "Create a portable audio asset"),
    VIDEO: capability(createVideo, "Create a portable video asset"),
    TABLE: capability(createTable, "Create a structured output table"),
    GRID: capability(createGrid, "Create a mathematical layout grid"),
    CONTROLPANEL: capability(createControlPanel, "Group reactive controls in a portable output panel"),
    SHEET: capability(createSheet, "Create a portable sheet view of indexable data"),
    FIGURE: capability(createFigure, "Wrap output with figure metadata"),
    SLIDE: capability(createSlide, "Create a presentation slide"),
    SLIDES: capability(createSlides, "Create a sequential presentation deck"),
    TEMPLATE_TEXT: templateText,
    DOCUMENT_TEMPLATE: documentTemplateFunction,
};
