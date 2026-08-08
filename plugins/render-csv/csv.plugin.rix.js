/**
id: csv
description: Deterministic CSV and TSV export for portable Tables and typed data Relations.
kind: host
mount: csv
exports: [Render]
groups: [Renderers, Data]
permissions: []
provides: [rix.renderer.csv@1]
targets: [csv, text/csv, tsv, text/tab-separated-values]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin } from "../renderers/common.js";
import { renderCsv } from "./csv-renderer.js";

export const definition = {
    target: "csv",
    mime: "text/csv",
    extension: "csv",
    aliases: ["text/csv", "tsv", "text/tab-separated-values"],
    inputKinds: ["table", "data_relation"],
    deterministic: true,
    description: "Deterministic CSV and TSV export for portable Tables and typed data Relations",
    render({ value, options, requestedTarget }) {
        return renderCsv(value, { options, requestedTarget });
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
