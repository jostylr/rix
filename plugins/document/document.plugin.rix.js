/**
id: document
description: Portable report templates with citations, assets, numbering policies, and safe target-specific nodes.
kind: host
mount: document
exports: [Report, Label, Ref, Theme, References, Bibliography, Citation, AssetManifest, Asset, Numbering, Header, Footer, Template, ApplyTemplate, TargetMarkup, Snapshot, EncodeJSON, DecodeJSON]
groups: [Documents]
permissions: []
provides: [rix.document.report@1, rix.document.report@2, rix.document.template@1, rix.document.assets@1, rix.output.document@1]
schemas: [rix.document.report@1, rix.document.theme@1, rix.document.bibliography@1, rix.document.citation@1, rix.document.assets@1, rix.document.numbering@1, rix.document.template@1, rix.document.target-markup@1, rix.output.document@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { encodeOutputJSON, decodeOutputJSON, snapshotOutputDocument } from "../../src/runtime/output-json.js";
import { Integer } from "@ratmath/core";
import {
    createDocumentReference,
    createDocumentReport,
    createDocumentTheme,
    createDocumentBibliography,
    createDocumentCitation,
    createDocumentAssetManifest,
    documentAsset,
    createDocumentNumbering,
    createDocumentHeader,
    createDocumentFooter,
    createDocumentTemplate,
    applyDocumentTemplate,
    createDocumentTargetMarkup,
    documentReferences,
    labelDocumentValue,
} from "./document.js";

function persistenceOptions(value) {
    if (value === undefined || value === null) return {};
    if (value.type !== "map" || !(value.entries instanceof Map)) throw new Error("Document JSON options must be a map");
    const names = { unknowntags: "unknownTags", maxbytes: "maxBytes", maxnodes: "maxNodes", maxedges: "maxEdges", maxdepth: "maxDepth", maxdigits: "maxDigits" };
    return Object.fromEntries([...value.entries].map(([key, item]) => {
        const name=names[String(key).toLowerCase()];
        if (!name) throw new Error(`Unknown Document JSON option ${key}`);
        return [name,item?.type === "string" ? item.value : item instanceof Integer ? Number(item.value) : item];
    }));
}
function decodeDocument([source, options]) {
    const result=decodeOutputJSON(source?.type === "string" ? source.value : source,persistenceOptions(options));
    return { type:"map", entries:new Map([
        ["value",result.value], ["schema",{type:"string",value:result.schema}],
        ["diagnostics",{type:"sequence",values:result.diagnostics.map(d => ({type:"map",entries:new Map(Object.entries(d).map(([k,v])=>[k,{type:"string",value:v}]))}))}],
    ]) };
}
const HELPERS = new Map([
    ["Snapshot", ([value]) => snapshotOutputDocument(value)],
    ["EncodeJSON", ([value, options]) => ({type:"string",value:encodeOutputJSON(value,persistenceOptions(options))})],
    ["DecodeJSON", decodeDocument],
    ["Report", createDocumentReport],
    ["Label", labelDocumentValue],
    ["Ref", createDocumentReference],
    ["Theme", createDocumentTheme],
    ["References", documentReferences],
    ["Bibliography", createDocumentBibliography],
    ["Citation", createDocumentCitation],
    ["AssetManifest", createDocumentAssetManifest],
    ["Asset", documentAsset],
    ["Numbering", createDocumentNumbering],
    ["Header", createDocumentHeader],
    ["Footer", createDocumentFooter],
    ["Template", createDocumentTemplate],
    ["ApplyTemplate", applyDocumentTemplate],
    ["TargetMarkup", createDocumentTargetMarkup],
]);

export function createDocumentPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => helper(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createDocumentPluginCollection();
    systemContext.registerHostValue("document", collection, {
        doc: "Numbered portable reports with deterministic cross-references",
        groups: ["Documents"],
    });
    return collection;
}
