/**
id: float
description: Configurable IEEE-754 binary32/binary64 conversion, diagnostics, and optional approximate math.
kind: host
mount: float
exports: [Float, Binary32, Binary64, Format, Classify, Diagnostics, NextUp, NextDown, NextAfter, Interval, Round, Floor, Ceiling, Abs, Sqrt, Sin, Cos, Tan, Asin, Acos, Atan, Atan2, Log, Ln, Log10, Exp]
groups: [ApproximateMath, Float]
provides: [rix.float@2]
schemas: [rix.float.classification@1]
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
