/**
id: data
description: Immutable typed relations with exact aggregation, bounded row sources, and deterministic tagged JSONL interchange.
kind: host
mount: data
exports: [Relation, Project, Rename, Distinct, Filter, Sort, Join, Group, Aggregate, Frequency, Contingency, Calculate, Missing, RowSource, ParseJSONL, RenderJSONL, Collect, TableView, Schema, Rows, EncodeJSON, DecodeJSON, RenderJSONLDocument, ParseJSONLDocument, RenderCSV, ParseCSV]
groups: [Data]
permissions: []
provides: [rix.data.relation@1, rix.data.groups@1, rix.data.contingency@1, rix.data.row-source@1, rix.data.relation-document@1]
schemas: [rix.data.relation@1, rix.data.groups@1, rix.data.contingency@1, rix.data.row-source@1, rix.data.relation-document@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    encodeRelationJson, decodeRelationJson, renderRelationJsonl, parseRelationJsonl, renderRelationCsv, parseRelationCsv,
    aggregateGroups,
    calculateRelation,
    collectRowSource,
    contingencyRelation,
    createRelation,
    createRowSource,
    distinctRelation,
    filterRelation,
    frequencyRelation,
    groupRelation,
    joinRelations,
    missingRelation,
    parseJsonlSource,
    projectRelation,
    relationRows,
    relationSchema,
    relationTableView,
    renderJsonl,
    renameRelation,
    sortRelation,
} from "./data.js";

const HELPERS = new Map([
    ["EncodeJSON",encodeRelationJson],["DecodeJSON",decodeRelationJson],
    ["RenderJSONLDocument",renderRelationJsonl],["ParseJSONLDocument",parseRelationJsonl],
    ["RenderCSV",renderRelationCsv],["ParseCSV",parseRelationCsv],
    ["Relation", createRelation],
    ["Project", projectRelation],
    ["Rename", renameRelation],
    ["Distinct", distinctRelation],
    ["Filter", filterRelation],
    ["Sort", sortRelation],
    ["Join", joinRelations],
    ["Group", groupRelation],
    ["Aggregate", aggregateGroups],
    ["Frequency", frequencyRelation],
    ["Contingency", contingencyRelation],
    ["Calculate", calculateRelation],
    ["Missing", missingRelation],
    ["RowSource", createRowSource],
    ["ParseJSONL", parseJsonlSource],
    ["RenderJSONL", renderJsonl],
    ["Collect", collectRowSource],
    ["TableView", relationTableView],
    ["Schema", relationSchema],
    ["Rows", relationRows],
]);

export function createDataPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => helper(args.slice(1), { context, evaluate, invoke }),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createDataPluginCollection();
    systemContext.registerHostValue("data", collection, {
        doc: "Immutable typed relations and portable Table views",
        groups: ["Data"],
    });
    return collection;
}
