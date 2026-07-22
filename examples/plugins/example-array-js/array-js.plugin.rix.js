/**
id: example-array-js
description: Teaching JavaScript plugin demonstrating array sum, summary text, and reversal.
kind: host
mount: arrayJs
exports: [Sum, Describe, Reverse]
groups: [Examples]
permissions: []
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";

function valuesFrom(value) {
    if (!value || !Array.isArray(value.values)) {
        throw new Error("arrayJs expects an array or sequence");
    }
    return value.values;
}

function integerFrom(value) {
    if (value instanceof Integer) return value.value;
    if (typeof value === "bigint") return value;
    throw new Error("arrayJs.Sum expects Integer values");
}

function sum(value) {
    return new Integer(valuesFrom(value).reduce((total, item) => total + integerFrom(item), 0n));
}

function describe(value) {
    const values = valuesFrom(value);
    return { type: "string", value: `count ${values.length}; sum ${sum(value).value}` };
}

function reverse(value) {
    return { type: "sequence", values: [...valuesFrom(value)].reverse() };
}

function collection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of [["Sum", sum], ["Describe", describe], ["Reverse", reverse]]) {
        entries.set(name, helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => helper(args[1]),
        });
    }
    return { type: "map", entries, _ext: extension };
}

/** Host-approved installer; hosts choose whether this JavaScript is trusted. */
export function install({ systemContext }) {
    const value = collection();
    systemContext.registerHostCallableValue("arrayJs", value, {
        impl(args) { return sum(args[0]); },
    }, {
        doc: "Example JavaScript array plugin",
        groups: ["Examples"],
    });
    return value;
}
