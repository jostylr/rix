/** Bundled first-party plot plugin that lowers plots into core Graphics. */

import { createPlotOutputCollection } from "../runtime/output.js";

export function installPlotPlugin(systemContext) {
    const plot = createPlotOutputCollection();
    systemContext.registerHostValue("plot", plot, { doc: "Portable plotting helpers that produce intrinsic Graphics scenes" });
    return plot;
}
