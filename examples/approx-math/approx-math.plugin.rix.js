/**
id: approx-math-js
description: JavaScript IEEE-754 Float conversion and optional approximate math.
kind: host
mount: float
exports: [Float, Interval, Round, Floor, Ceiling, Abs, Sqrt, Sin, Cos, Tan, Log, Exp]
groups: [ApproximateMath, Float]
permissions: []
defaultEnabled: false
**/

import { loadApproxMathPlugin } from "./approx-math-plugin.js";

/** Host-approved installer used by the CLI or another embedding host. */
export function install({ systemContext, registry }) {
    return loadApproxMathPlugin(systemContext, registry);
}
