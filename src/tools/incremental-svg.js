/** Reconcile passive SVG marks; interaction roots are remounted with fresh listeners. */
const PASSIVE = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text"]);

export function replaceOutputHtml(root, html, { incrementalSvg = false, maxMarks = 10000 } = {}) {
    if (!incrementalSvg || !root?.ownerDocument?.createElement || !root.replaceChildren || !Number.isSafeInteger(maxMarks) || maxMarks < 1) {
        root.innerHTML = html;
        return { mode: "replace", reused: 0 };
    }
    const template = root.ownerDocument.createElement("template");
    template.innerHTML = html;
    if (!template.content?.querySelectorAll) { root.innerHTML = html; return { mode: "replace", reused: 0 }; }
    const oldSvgs = [...root.querySelectorAll("svg.rix-output-svg")];
    const newSvgs = [...template.content.querySelectorAll("svg.rix-output-svg")];
    let reused = 0, examined = 0;
    for (const [index, next] of newSvgs.entries()) {
        const previous = oldSvgs[index];
        if (!previous) continue;
        const oldMarks = new Map(), duplicates = new Set();
        for (const mark of previous.querySelectorAll("[data-rix-semantic-id]")) {
            if (++examined > maxMarks) break;
            const id = mark.getAttribute("data-rix-semantic-id");
            if (oldMarks.has(id)) duplicates.add(id);
            oldMarks.set(id, mark);
        }
        if (examined > maxMarks) break;
        const nextMarks = [...next.querySelectorAll("[data-rix-semantic-id]")];
        const nextCounts = new Map();
        for (const mark of nextMarks) { const id = mark.getAttribute("data-rix-semantic-id"); nextCounts.set(id, (nextCounts.get(id) || 0) + 1); }
        for (const mark of nextMarks) {
            const prior = oldMarks.get(mark.getAttribute("data-rix-semantic-id"));
            if (!prior || nextCounts.get(mark.getAttribute("data-rix-semantic-id")) > 1 || duplicates.has(mark.getAttribute("data-rix-semantic-id")) || prior.tagName !== mark.tagName || !PASSIVE.has(mark.localName)) continue;
            // Interactive descendants own closures that must be rebuilt from the new snapshot.
            if (prior.closest("[data-rix-drag-target], [data-rix-graphic-action]") || mark.closest("[data-rix-drag-target], [data-rix-graphic-action]")) continue;
            for (const attribute of [...prior.attributes]) if (!mark.hasAttribute(attribute.name)) prior.removeAttribute(attribute.name);
            for (const attribute of mark.attributes) prior.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
            if (mark.localName === "text") prior.replaceChildren(...[...mark.childNodes].map((child) => child.cloneNode(true)));
            mark.replaceWith(prior);
            oldMarks.delete(mark.getAttribute("data-rix-semantic-id"));
            reused += 1;
        }
    }
    root.replaceChildren(template.content);
    return { mode: "incremental-svg", reused, exhausted: examined > maxMarks };
}
