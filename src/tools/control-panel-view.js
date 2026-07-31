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
        const inputs = [...(control.querySelectorAll?.("[data-rix-control-input]") || [])];
        const input = inputs[0] || control.querySelector("[data-rix-control-input]");
        const value = control.querySelector("[data-rix-control-value]");
        if (!input) continue;
        const kind = control.dataset.rixControlKind || "slider";
        const label = input.getAttribute("aria-label") || "Control";
        if (control.dataset.rixControlDisabled === "true" || control.dataset.rixControlReadOnly === "true") {
            for (const blocked of inputs.length > 0 ? inputs : [input]) {
                blocked.addEventListener("click", (event) => event.preventDefault?.());
                blocked.addEventListener("keydown", (event) => event.preventDefault?.());
            }
            continue;
        }
        const identity = () => ({
            type: "control:set",
            ...(control.dataset.rixControlId ? { controlId: control.dataset.rixControlId } : {}),
            targetId: control.dataset.rixControlTarget,
        });
        let committed = inputs.length > 1 ? inputs.map((item) => item.value) : input.value;
        let committedChecked = Boolean(input.checked);

        const commit = (detail, sourceInput = input) => {
            try {
                const result = options.onSet(Object.freeze(detail), sourceInput, panel);
                if (result?.type === "error") throw new Error(result.text);
                committed = inputs.length > 1 ? inputs.map((item) => item.value) : input.value;
                committedChecked = Boolean(input.checked);
                if (value && result?.text !== undefined) value.textContent = result.text;
                if (status) status.textContent = `${label} set to ${result?.text ?? input.value}`;
                dispatchControlEvent(panel, { ...detail, revision: result?.revision ?? null });
                options.onSetCommitted?.(detail, result, sourceInput, panel);
            } catch (error) {
                if (inputs.length > 1) inputs.forEach((item, index) => { item.value = committed[index]; });
                else input.value = committed;
                input.checked = committedChecked;
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        };

        if (kind === "input") {
            const submit = () => commit({
                ...identity(),
                sourceText: input.value,
                source: "text",
            });
            control.querySelector("[data-rix-control-commit]")?.addEventListener("click", submit);
            input.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault?.();
                submit();
            });
            continue;
        }

        if (kind === "reset") {
            input.addEventListener("click", () => commit({
                ...identity(),
                source: "reset",
            }));
            continue;
        }

        if (kind === "choice") {
            input.addEventListener("change", () => commit({
                ...identity(),
                index: Number(input.value),
                source: "select",
            }));
            continue;
        }

        if (kind === "toggle") {
            input.addEventListener("change", () => commit({
                ...identity(),
                index: input.checked ? 1 : 0,
                source: "checkbox",
            }));
            continue;
        }

        if (kind === "range") {
            const preview = () => {
                if (status) status.textContent = `${label}: positions ${inputs.map((item) => item.value).join(" … ")}`;
            };
            for (const endpoint of inputs) {
                endpoint.addEventListener("input", preview);
                endpoint.addEventListener("change", () => commit({
                    ...identity(),
                    indices: inputs.map((item) => Number(item.value)),
                    source: "range",
                }, endpoint));
            }
            continue;
        }

        input.addEventListener("input", () => {
            if (status) status.textContent = `${label}: position ${input.value}`;
        });
        input.addEventListener("change", () => commit({
            ...identity(),
            index: Number(input.value),
            source: "range",
        }));
    }
}

export function enhanceControlPanelViews(root, options = {}) {
    for (const panel of panelRoots(root)) enhancePanel(panel, options);
    return root;
}
