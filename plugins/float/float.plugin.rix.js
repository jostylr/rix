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

import { install as installBrowserSafeFloat } from "./browser-installer.js";

/** Portable installer used by Node and browser hosts. */
export function install(options) {
    return installBrowserSafeFloat(options);
}
