/** Register the bundled, opt-in output authoring plugins with a host catalog. */

import { install as installDrawPlugin } from "./draw/draw.plugin.rix.js";
import { install as installPlotPlugin } from "./plot/plot.plugin.rix.js";

const BUNDLED_PLUGINS = [
    {
        metadata: {
            id: "draw",
            description: "Convenient 2D drawing helpers that produce core Graphics nodes.",
            kind: "host",
            mount: "draw",
            exports: ["Line", "Polygon", "Label", "Box", "Circle"],
            groups: ["Draw"],
            permissions: [],
            defaultEnabled: false,
        },
        install: ({ systemContext }) => installDrawPlugin({ systemContext }),
    },
    {
        metadata: {
            id: "plot",
            description: "Portable plotting helpers that produce core Graphics scenes.",
            kind: "host",
            mount: "plot",
            exports: ["Polynomial"],
            groups: ["Plot"],
            permissions: [],
            defaultEnabled: false,
        },
        install: ({ systemContext }) => installPlotPlugin({ systemContext }),
    },
];

/**
 * Built-ins use the same catalog and host-approval path as third-party host
 * plugins. A caller may supply a custom installer before creating the system
 * context; it is deliberately not overwritten here.
 */
export function installBundledPlugins(catalog) {
    for (const { metadata, install } of BUNDLED_PLUGINS) {
        // An embedding host may deliberately supply a plugin with this ID.
        // Do not silently pair its metadata with the bundled implementation.
        if (catalog.info(metadata.id)) continue;
        catalog.addMetadata(metadata, { kind: "host" });
        catalog.registerInstaller(metadata.id, install);
    }
    return catalog;
}
