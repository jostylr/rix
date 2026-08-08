/**
id: data
description: Immutable typed relations with deterministic projection, filtering, sorting, and Table views.
kind: host
mount: data
exports: [Relation, Project, Filter, Sort, TableView, Schema, Rows]
groups: [Data]
permissions: []
provides: [rix.data.relation@1]
schemas: [rix.data.relation@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    createRelation,
    filterRelation,
    projectRelation,
    relationRows,
    relationSchema,
    relationTableView,
    sortRelation,
} from "./data.js";

const HELPERS = new Map([
    ["Relation", createRelation],
    ["Project", projectRelation],
    ["Filter", filterRelation],
    ["Sort", sortRelation],
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
