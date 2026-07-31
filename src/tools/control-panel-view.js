/** Host-side interaction for reactive ControlPanel values. */

function panelRoots(root) {
    if (!root) return [];
    const roots = [];
    if (root.matches?.(".rix-output-control-panel")) roots.push(root);
    if (root.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-control-panel"));
    return roots;
}

function dispatchControlEvent(panel, detail) {
    const EventConstructor = panel.ownerDocument?.defaultView?.CustomEvent;
    if (typeof EventConstructor !== "function") return;
    panel.dispatchEvent(new EventConstructor("rix-control-set", { bubbles: true, detail }));
}

function enhancePanel(panel, options) {
    if (panel.dataset.rixControlPanelEnhanced === "true") return;
    panel.dataset.rixControlPanelEnhanced = "true";
    const status = panel.querySelector(".rix-output-control-status");
    const controls = [...panel.querySelectorAll("[data-rix-control-target]")];
    if (controls.length === 0 || typeof options.onSet !== "function") return;

    for (const control of controls) {
        const input = control.querySelector("[data-rix-control-input]");
        const value = control.querySelector("[data-rix-control-value]");
        if (!input) continue;
        let committedIndex = Number(input.value);

        input.addEventListener("input", () => {
            if (status) status.textContent = `${input.getAttribute("aria-label") || "Control"}: position ${input.value}`;
        });
        input.addEventListener("change", () => {
            const detail = Object.freeze({
                type: "control:set",
                targetId: control.dataset.rixControlTarget,
                index: Number(input.value),
                source: "range",
            });
            try {
                const result = options.onSet(detail, input, panel);
                if (result?.type === "error") throw new Error(result.text);
                committedIndex = Number(input.value);
                if (value && result?.text !== undefined) value.textContent = result.text;
                if (status) status.textContent = `${input.getAttribute("aria-label") || "Control"} set to ${result?.text ?? input.value}`;
                dispatchControlEvent(panel, {
                    ...detail,
                    revision: result?.revision ?? null,
                });
                options.onSetCommitted?.(detail, result, input, panel);
            } catch (error) {
                input.value = String(committedIndex);
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        });
    }
}

export function enhanceControlPanelViews(root, options = {}) {
    for (const panel of panelRoots(root)) enhancePanel(panel, options);
    return root;
}
