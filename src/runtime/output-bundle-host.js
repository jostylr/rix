/** Shared inert publication boundary for Web, Notebook, and RiXCel. */
import { bundleOutputDocument, createMemoryAssetStore, encodeOutputBundle, decodeOutputBundle } from "./output-assets.js";
import { renderOutputHtml, formatOutputText } from "./output.js";

export function createOutputBundleHost({ assetStore = createMemoryAssetStore(), format = String, authorizeExternal = null } = {}) {
    const present = (bundle) => ({ ...bundle, html: renderOutputHtml(bundle.document, format), text: formatOutputText(bundle.document, format) });
    return Object.freeze({
        async exportOutputBundle(value, options = {}) {
            const bundle = await bundleOutputDocument(value, { ...options, store: assetStore, authorizeExternal });
            return { ...present(bundle), json: encodeOutputBundle(bundle, options) };
        },
        async importOutputBundle(source, options = {}) {
            // Import never invokes assetStore/authorization or evaluates retained source.
            return present(await decodeOutputBundle(source, options));
        },
    });
}
