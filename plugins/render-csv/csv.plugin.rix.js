/**
id: csv
description: Schema-aware CSV/TSV import and export with exact numeric, sidecar, and streaming-row policies.
kind: host
mount: csv
exports: [Render, Parse, ParseStream, Collect, Sidecar]
groups: [Renderers, Data]
permissions: []
provides: [rix.renderer.csv@1, rix.renderer.csv@2, rix.csv.import@1, rix.csv.sidecar@1]
schemas: [rix.csv.import@1, rix.csv.sidecar@1, rix.data.relation@1, rix.data.row-source@1]
targets: [csv, text/csv, tsv, text/tab-separated-values]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { collectRowSource } from "../data/data.js";
import { installRendererPlugin } from "../renderers/common.js";
import { csvSidecar, parseCsv, parseCsvStream } from "./csv-import.js";
import { renderCsv } from "./csv-renderer.js";

export const definition = {
    target: "csv",
    mime: "text/csv",
    extension: "csv",
    aliases: ["text/csv", "tsv", "text/tab-separated-values"],
    inputKinds: ["table", "data_relation", "data_row_source"],
    deterministic: true,
    description: "Schema-aware CSV/TSV import and deterministic export for Tables, Relations, and RowSources",
    render({ value, options, requestedTarget, runtime }) {
        return renderCsv(value, { options, requestedTarget, runtime });
    },
};

function collectCsv(args, runtime) {
    const relation = collectRowSource(args, runtime);
    return args[0]?.csvSidecar ? Object.freeze({ ...relation, csvSidecar: args[0].csvSidecar }) : relation;
}

const HELPERS = new Map([
    ["Parse", parseCsv],
    ["ParseStream", parseCsvStream],
    ["Collect", collectCsv],
    ["Sidecar", csvSidecar],
]);

export function install(api) {
    const collection = installRendererPlugin({ ...api, definition });
    const render = collection.entries.get("Render");
    collection._ext.set("RENDER", {
        type: "method_builtin",
        name: "Render",
        impl: (args, context, evaluate, invoke) => render(args.slice(1), { context, evaluate, invoke }),
    });
    for (const [name, helper] of HELPERS) {
        collection.entries.set(name, helper);
        collection.entries.set(name.toUpperCase(), helper);
        collection._ext.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => helper(args.slice(1), { context, evaluate, invoke }),
        });
    }
    collection._ext.set("immutable", new Integer(1n));
    return collection;
}
