import { getBuiltinProto } from "../runtime/methods.js";

const REPL_COMMANDS = ["help", "exit", "load", "vars", "fns", "reset", "ast", "tokens"];

const METHOD_HELP = {
    LEN: [".Len() → integer", "number of items"],
    ISEMPTY: [".IsEmpty() → truthy/null", "whether the collection has no items"],
    GET: [".Get(indexOrKey) → value", "read an item or map value"],
    FIRST: [".First() → value", "first item"],
    LAST: [".Last() → value", "last item"],
    HAS: [".Has(key) → truthy/null", "whether a map has a key"],
    HASAT: [".HasAt(index) → truthy/null", "whether an index exists"],
    KEYS: [".Keys() → sequence", "map keys"],
    VALUES: [".Values() → sequence", "collection values"],
    ENTRIES: [".Entries() → sequence", "map key/value entries"],
    SET: [".Set(key, value) → collection", "copy with one value replaced"],
    "SET!": [".Set!(key, value) → value", "replace a value in place"],
    PUSH: [".Push(...values) → sequence", "copy with values appended"],
    "PUSH!": [".Push!(...values) → sequence", "append values in place"],
    POP: [".Pop() → value", "remove and return the final item"],
    "POP!": [".Pop!() → value", "remove and return the final item in place"],
    SLICE: [".Slice(start, end) → collection", "selected range"],
    MAP: [".Map(fn) → collection", "transform each value"],
    FILTER: [".Filter(fn) → collection", "keep values matching a predicate"],
    REDUCE: [".Reduce(fn, initial?) → value", "combine values into one result"],
    FIND: [".Find(fn) → value", "first value matching a predicate"],
    FINDINDEX: [".FindIndex(fn) → integer", "index of the first matching value"],
    COUNT: [".Count(fn) → integer", "number of matching values"],
    ANY: [".Any(fn) → value/null", "first truthy predicate result"],
    ALL: [".All(fn) → value/null", "last result when every value matches"],
    MERGE: [".Merge(other) → map", "copy with another map combined"],
    "MERGE!": [".Merge!(other) → map", "combine another map in place"],
    REMOVE: [".Remove(key) → collection", "copy without a key or value"],
    "REMOVE!": [".Remove!(key) → collection", "remove a key or value in place"],
    UPDATE: [".Update(key, fn) → map", "copy with a key transformed"],
    "UPDATE!": [".Update!(key, fn) → map", "transform a key in place"],
    SORT: [".Sort() → collection", "sorted copy"],
    "SORT!": [".Sort!() → collection", "sort in place"],
    REVERSE: [".Reverse() → collection", "reversed copy"],
    "REVERSE!": [".Reverse!() → collection", "reverse in place"],
    DISTINCT: [".Distinct() → collection", "copy with duplicates removed"],
    CONCAT: [".Concat(...others) → collection", "append collections"],
    JOIN: [".Join(separator) → string", "combine string items"],
};

function preview(value, formatValue) {
    if (value === undefined) return "";
    try {
        const text = formatValue ? formatValue(value) : String(value);
        return text.length > 72 ? `${text.slice(0, 69)}…` : text;
    } catch {
        return "";
    }
}

function propertyValue(target, name) {
    if (!target || typeof target !== "object") return undefined;
    if (name === "_proto") return getBuiltinProto(target);
    return target._ext instanceof Map ? target._ext.get(name) : undefined;
}

function resolveReceiver(path, context) {
    const names = path.split(".");
    let value = context.get(names.shift());
    if (value === undefined) return undefined;
    for (const name of names) {
        value = propertyValue(value, name);
        if (value === undefined) return undefined;
    }
    return value;
}

function propertyCandidates(receiver, query, formatValue) {
    if (!receiver || typeof receiver !== "object") return [];
    const entries = new Map();
    if (receiver._ext instanceof Map) {
        for (const [name, value] of receiver._ext) {
            entries.set(name, { kind: "property", value, detail: "metadata property" });
        }
    }
    const proto = getBuiltinProto(receiver);
    if (proto?.entries instanceof Map) {
        for (const [name, value] of proto.entries) {
            if (!entries.has(name)) {
                const [signature, meaning] = METHOD_HELP[name] ?? [`.${name}(...)`, `built-in ${receiver.type ?? "value"} operation`];
                entries.set(name, { kind: "method", value, detail: `${signature} — ${meaning}` });
            }
        }
    }
    if (!entries.has("_proto")) entries.set("_proto", { kind: "property", value: proto, detail: "method prototype" });
    return [...entries].map(([insertText, entry]) => ({
        insertText,
        kind: entry.kind,
        detail: entry.detail,
        preview: entry.kind === "property" ? preview(entry.value, formatValue) : "",
    }));
}

function mapKeyCandidates(receiver, query, formatValue) {
    if (receiver?.type !== "map" || !(receiver.entries instanceof Map)) return [];
    return [...receiver.entries].map(([key, value]) => {
        const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
        return {
            insertText: simple ? `:${key}` : JSON.stringify(key),
            matchText: key,
            kind: "map key",
            detail: "map entry",
            preview: preview(value, formatValue),
        };
    });
}

function filterAndSort(candidates, query) {
    const folded = query.toLowerCase();
    return candidates
        .filter((candidate) => (candidate.matchText ?? candidate.insertText.replace(/^@_/, "").replace(/^\./, "")).toLowerCase().startsWith(folded))
        .sort((a, b) => {
            return a.insertText.localeCompare(b.insertText);
        });
}

/**
 * Return side-effect-free completion candidates for the identifier at cursor.
 * The receiver resolver deliberately only follows existing metadata properties;
 * it never parses or evaluates the surrounding expression.
 */
export function complete(source, cursor, { context, systemContext, formatValue } = {}) {
    const before = String(source).slice(0, cursor);
    const mapKeyMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*)\[\s*:(?<key>[A-Za-z0-9_]*)$/);
    if (mapKeyMatch) {
        const query = mapKeyMatch.groups.key;
        const from = cursor - query.length - 1;
        return {
            from,
            to: cursor,
            query,
            candidates: filterAndSort(mapKeyCandidates(context.get(mapKeyMatch[1]), query, formatValue), query),
        };
    }
    let token = before.match(/[@.]?[A-Za-z_][A-Za-z0-9_]*$|[@.]?$/)?.[0] ?? "";
    // A trailing dot belongs to its receiver ("value."), not to the token.
    // A lone dot remains the system-capability prefix.
    if (token === "." && before.length > 1) token = "";
    const from = cursor - token.length;
    const query = token.replace(/^@_?/, "").replace(/^\./, "");
    const prior = before.slice(0, from);
    let candidates = [];

    if (token.startsWith("@_") || prior.endsWith("@_")) {
        const prefix = token.startsWith("@_") ? "@_" : "@_";
        candidates = systemContext.getAllNames().map((name) => ({
            insertText: `${prefix}${name}`,
            kind: "system function",
            detail: systemContext.get(name)?.doc || "system capability",
            preview: "",
        }));
    } else if (prior.endsWith(".")) {
        const receiverMatch = prior.slice(0, -1).match(/([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/);
        if (receiverMatch) {
            candidates = propertyCandidates(resolveReceiver(receiverMatch[1], context), query, formatValue);
        } else {
            candidates = systemContext.getAllNames().map((name) => ({
                insertText: name,
                kind: "system function",
                detail: systemContext.get(name)?.doc || "system capability",
                preview: "",
            }));
        }
    } else if (token.startsWith(".")) {
        candidates = systemContext.getAllNames().map((name) => ({
            insertText: `.${name}`,
            kind: "system function",
            detail: systemContext.get(name)?.doc || "system capability",
            preview: "",
        }));
    } else if (prior.length === 0 || /[\s(\[{,;=:+\-*/?]/.test(prior.at(-1))) {
        candidates = [
            ...context.getAllNames().map((name) => ({
                insertText: name,
                kind: "binding",
                detail: "current session binding",
                preview: preview(context.get(name), formatValue),
            })),
            ...REPL_COMMANDS.map((name) => ({ insertText: `.${name}`, kind: "command", detail: "REPL command", preview: "" })),
        ];
    }

    return { from, to: cursor, query, candidates: filterAndSort(candidates, query) };
}

export { REPL_COMMANDS };
