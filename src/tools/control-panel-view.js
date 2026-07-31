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

function dispatchPanelEvent(panel, name, detail) {
    const EventConstructor = panel.ownerDocument?.defaultView?.CustomEvent;
    if (typeof EventConstructor !== "function") return;
    panel.dispatchEvent(new EventConstructor(name, { bubbles: true, detail }));
}

function enhancePanel(panel, options) {
    if (panel.dataset.rixControlPanelEnhanced === "true") return;
    panel.dataset.rixControlPanelEnhanced = "true";
    const status = panel.querySelector(".rix-output-control-status");
    const controls = [...panel.querySelectorAll("[data-rix-control-target]")];
    if (controls.length === 0 || typeof options.onSet !== "function") return;
    const stagedMode = panel.dataset.rixControlMode === "staged";
    const submit = panel.querySelector("[data-rix-control-submit]");
    const discard = panel.querySelector("[data-rix-control-discard]");
    const stagedTargets = new Set();
    const restoreControls = [];
    const acceptControls = [];
    const updateActions = () => {
        const disabled = stagedTargets.size === 0;
        if (submit) submit.disabled = disabled;
        if (discard) discard.disabled = disabled;
    };

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
        let committedText = value?.textContent ?? "";
        acceptControls.push(() => {
            committed = inputs.length > 1 ? inputs.map((item) => item.value) : input.value;
            committedChecked = Boolean(input.checked);
            committedText = value?.textContent ?? "";
        });
        restoreControls.push(() => {
            if (inputs.length > 1) inputs.forEach((item, index) => { item.value = committed[index]; });
            else input.value = committed;
            input.checked = committedChecked;
            if (value) value.textContent = committedText;
        });

        const commit = (detail, sourceInput = input) => {
            try {
                const result = options.onSet(Object.freeze(detail), sourceInput, panel);
                if (result?.type === "error") throw new Error(result.text);
                if (!result?.staged) {
                    committed = inputs.length > 1 ? inputs.map((item) => item.value) : input.value;
                    committedChecked = Boolean(input.checked);
                    if (result?.text !== undefined) committedText = String(result.text);
                } else {
                    stagedTargets.add(detail.targetId);
                    updateActions();
                }
                if (value && result?.text !== undefined) value.textContent = result.text;
                if (status) status.textContent = result?.staged
                    ? `${label} staged as ${result?.text ?? input.value}`
                    : `${label} set to ${result?.text ?? input.value}`;
                if (result?.staged) {
                    dispatchPanelEvent(panel, "rix-control-stage", { ...detail, revision: result?.revision ?? null });
                    options.onStaged?.(detail, result, sourceInput, panel);
                } else {
                    dispatchControlEvent(panel, { ...detail, revision: result?.revision ?? null });
                    options.onSetCommitted?.(detail, result, sourceInput, panel);
                }
            } catch (error) {
                if (inputs.length > 1) inputs.forEach((item, index) => { item.value = committed[index]; });
                else input.value = committed;
                input.checked = committedChecked;
                if (value) value.textContent = committedText;
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
                    endpoint: endpoint.dataset?.rixControlEndpoint ?? null,
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

    if (stagedMode && submit && typeof options.onSubmit === "function") {
        submit.addEventListener("click", () => {
            try {
                const result = options.onSubmit(panel);
                if (result?.type === "error") throw new Error(result.text);
                const count = stagedTargets.size;
                for (const accept of acceptControls) accept();
                stagedTargets.clear();
                updateActions();
                if (status) status.textContent = `${count} staged ${count === 1 ? "change" : "changes"} applied atomically`;
                dispatchPanelEvent(panel, "rix-control-commit", {
                    count,
                    revision: result?.revision ?? null,
                });
                options.onSubmitted?.(result, panel);
            } catch (error) {
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        });
    }
    if (stagedMode && discard && typeof options.onDiscard === "function") {
        discard.addEventListener("click", () => {
            try {
                const result = options.onDiscard(panel);
                if (result?.type === "error") throw new Error(result.text);
                for (const restore of restoreControls) restore();
                stagedTargets.clear();
                updateActions();
                if (status) status.textContent = "Staged changes discarded";
                dispatchPanelEvent(panel, "rix-control-discard", {});
                options.onDiscarded?.(result, panel);
            } catch (error) {
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        });
    }
}

export function enhanceControlPanelViews(root, options = {}) {
    for (const panel of panelRoots(root)) enhancePanel(panel, options);
    return root;
}
