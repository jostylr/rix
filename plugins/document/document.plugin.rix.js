/**
id: document
description: Portable report templates with citations, assets, numbering policies, and safe target-specific nodes.
kind: host
mount: document
exports: [Report, Label, Ref, Theme, References, Bibliography, Citation, AssetManifest, Asset, Numbering, Header, Footer, Template, ApplyTemplate, TargetMarkup]
groups: [Documents]
permissions: []
provides: [rix.document.report@1, rix.document.report@2, rix.document.template@1, rix.document.assets@1]
schemas: [rix.document.report@1, rix.document.theme@1, rix.document.bibliography@1, rix.document.citation@1, rix.document.assets@1, rix.document.numbering@1, rix.document.template@1, rix.document.target-markup@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

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

const HELPERS = new Map([
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
