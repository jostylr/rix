/**
id: float
description: JavaScript IEEE-754 Float conversion and optional approximate math.
kind: host
mount: float
exports: [Float, Interval, Round, Floor, Ceiling, Abs, Sqrt, Sin, Cos, Tan, Log, Exp]
groups: [ApproximateMath, Float]
permissions: []
defaultEnabled: false
**/

import { loadFloatPlugin } from "./node-installer.js";

/** Host-approved installer used by the CLI or another embedding host. */
export function install({ systemContext, registry, metadata, options }) {
    return loadFloatPlugin(systemContext, registry, {
        pluginId: metadata?.id || "float",
        mount: options?.as || metadata?.mount || "float",
    });
}
