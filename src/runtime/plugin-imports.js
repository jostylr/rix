const pluginNamespaces = new WeakMap();
const pluginMounts = new Map();

function canTrack(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function registerPluginNamespace(value, metadata) {
    const info = Object.freeze({
        pluginId: metadata.pluginId,
        mount: metadata.mount || null,
        exports: Object.freeze([...(metadata.exports || [])]),
        loaded: metadata.loaded === true,
        namespaceAvailable: metadata.namespaceAvailable === true,
    });
    if (canTrack(value)) pluginNamespaces.set(value, info);
    if (info.mount) pluginMounts.set(String(info.mount).toLowerCase(), info);
    return value;
}

export function pluginNamespaceInfo(value) {
    if (canTrack(value)) {
        const direct = pluginNamespaces.get(value);
        if (direct) return direct;
    }
    if (value?.type === "sysref" && value.name) {
        return pluginMounts.get(String(value.name).toLowerCase()) || null;
    }
    return null;
}

export function createBoundPluginMethod(target, methodName, pluginId) {
    return Object.freeze({
        type: "bound_method",
        target,
        methodName,
        pluginId,
    });
}
