/**
id: ball
description: Certified rational midpoint-radius balls and nested square-root refinement.
kind: host
mount: ball
exports: [Ball, Interval, Sqrt, Midpoint, Radius, Lower, Upper, Contains, RoundOut, Record]
groups: [Numerics, Exact]
permissions: []
provides: [rix.ball@1, rix.enclosable-real@1]
schemas: [rix.ball@1, rix.ball.nested-real@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { installBallPlugin } from "./ball.js";

export function install(options) {
    return installBallPlugin(options);
}
