/**
 * Parser-facing view of a SystemContext.
 *
 * The evaluator remains the authority for capability dispatch. This manifest
 * records only declarations known before evaluation: root capability kinds and
 * explicitly installed members of system object values. It lets the parser
 * apply RiX's casing/callability convention to a known path while leaving
 * dynamically-created host plugin paths open.
 */

import { normalizeCapabilityName } from "./system-context.js";
import { getBuiltinProto } from "./methods.js";

function memberDescriptor(name, value) {
    return {
        kind: value?.type === "method_builtin" ? "function" : "value",
        displayName: value?.name || name,
        members: null,
    };
}

function valueMembers(value) {
    const extension = value?._ext instanceof Map ? value._ext : new Map();
    const prototype = getBuiltinProto(value)?.entries instanceof Map
        ? getBuiltinProto(value).entries
        : new Map();
    if (extension.size === 0 && prototype.size === 0) return null;
    const members = new Map();
    for (const [name, member] of [...prototype, ...extension]) {
        // Internal metadata such as `_mutable` is not a public system member.
        if (String(name).startsWith("_")) continue;
        const descriptor = memberDescriptor(name, member);
        members.set(normalizeCapabilityName(descriptor.displayName), descriptor);
    }
    return members;
}

function rootDescriptor(entry) {
    const value = entry.kind === "function" ? null : entry.value;
    return {
        kind: entry.kind,
        displayName: entry.displayName,
        members: valueMembers(value),
    };
}

/**
 * Build a manifest from the current system context. Arbitrary map keys are
 * intentionally excluded: dotted access is method/meta access, while map data
 * continues to use bracket/key syntax.
 */
export function createSystemManifest(systemContext) {
    const roots = new Map();
    for (const entry of systemContext?.getAllEntries?.() || []) {
        roots.set(normalizeCapabilityName(entry.displayName), rootDescriptor(entry));
    }

    return {
        resolveRoot(name) {
            return roots.get(normalizeCapabilityName(name)) || null;
        },

        resolveMember(parent, name) {
            if (!parent?.members) return { state: "not-object", parent };
            const member = parent.members.get(normalizeCapabilityName(name));
            return member ? { state: "resolved", member } : { state: "unknown-member", parent };
        },
    };
}

/** Decorate an existing identifier lookup with system-object path resolution. */
export function createSystemLookup(systemContext, identifierLookup = () => ({ type: "identifier" })) {
    const manifest = createSystemManifest(systemContext);
    const lookup = (name) => identifierLookup(name);
    lookup.resolveSystemRoot = (name) => manifest.resolveRoot(name);
    lookup.resolveSystemMember = (parent, name) => manifest.resolveMember(parent, name);
    return lookup;
}
