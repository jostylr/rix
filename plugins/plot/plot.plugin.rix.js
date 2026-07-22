/**
id: plot
description: Portable plotting helpers that produce core Graphics scenes.
kind: host
mount: plot
exports: [Polynomial]
groups: [Plot]
permissions: []
defaultEnabled: false
**/

/** Bundled first-party plot plugin that lowers plots into core Graphics. */

import { createPlotOutputCollection } from "../../src/runtime/output.js";

export function install({ systemContext }) {
    const plot = createPlotOutputCollection();
    systemContext.registerHostValue("plot", plot, { doc: "Portable plotting helpers that produce intrinsic Graphics scenes" });
    return plot;
}

export const installPlotPlugin = (systemContext) => install({ systemContext });
