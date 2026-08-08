/**
id: document
description: Numbered portable reports with labels, forward references, captions, and small semantic themes.
kind: host
mount: document
exports: [Report, Label, Ref, Theme, References]
groups: [Documents]
permissions: []
provides: [rix.document.report@1]
schemas: [rix.document.report@1, rix.document.theme@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    createDocumentReference,
    createDocumentReport,
    createDocumentTheme,
    documentReferences,
    labelDocumentValue,
} from "./document.js";

const HELPERS = new Map([
    ["Report", createDocumentReport],
    ["Label", labelDocumentValue],
    ["Ref", createDocumentReference],
    ["Theme", createDocumentTheme],
    ["References", documentReferences],
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
