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
            const submit = () => commit(control.dataset.rixControlInputMode === "text"
                ? {
                    ...identity(),
                    rawText: input.value,
                    source: "text",
                }
                : {
                    ...identity(),
                    sourceText: input.value,
                    source: "expression",
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

        if (kind === "action") {
            input.addEventListener("click", () => commit({
                ...identity(),
                type: "control:action",
                source: "action",
            }));
            continue;
        }

        if (kind === "hold") {
            input.addEventListener("click", () => commit({
                ...identity(),
                index: 1,
                source: "hold-keydown",
            }));
            control.querySelector("[data-rix-control-hold-release]")?.addEventListener("click", () => commit({
                ...identity(),
                index: 0,
                source: "hold-keyup",
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

function editableTarget(target) {
    const tag = String(target?.tagName || "").toLowerCase();
    return Boolean(target?.isContentEditable || ["input", "select", "textarea"].includes(tag));
}

const shortcutRouters = new WeakMap();

function shortcutCandidates(root, key) {
    return [...(root.querySelectorAll?.("[data-rix-control-shortcut]") || [])]
        .filter((control) => control.dataset.rixControlShortcut === key
            && control.dataset.rixControlDisabled !== "true"
            && control.dataset.rixControlReadOnly !== "true");
}

function holdCandidates(root, key, { interactive = true } = {}) {
    return [...(root.querySelectorAll?.("[data-rix-control-hold]") || [])]
        .filter((control) => control.dataset.rixControlHold === key
            && (!interactive || (control.dataset.rixControlDisabled !== "true"
                && control.dataset.rixControlReadOnly !== "true")));
}

function scopedChoices(router, document, event, candidates) {
    const scopes = [...router.scopes].filter((scope) => scope.isConnected !== false);
    const focused = scopes.find((scope) => scope.contains?.(event.target) || scope.contains?.(document.activeElement));
    return focused
        ? [{ root: focused, candidates: candidates(focused) }]
        : scopes.map((scope) => ({ root: scope, candidates: candidates(scope) }))
            .filter((choice) => choice.candidates.length > 0);
}

function preferredControl(document, candidates) {
    const activePanel = document.activeElement?.closest?.(".rix-output-control-panel");
    return candidates.find((candidate) => activePanel && candidate.closest?.(".rix-output-control-panel") === activePanel)
        || candidates[0];
}

/**
 * Install one root-scoped declarative shortcut router.
 *
 * Rendered action controls opt in with data-rix-control-shortcut. The router
 * clicks the current rendered button, so ordinary ControlPanel dispatch and
 * live-view focus restoration remain the single mutation path.
 */
export function enhanceControlShortcuts(root) {
    const document = root?.ownerDocument;
    if (!document?.addEventListener) return () => {};
    let router = shortcutRouters.get(document);
    if (!router) {
        router = { scopes: new Set(), activeHolds: new Map(), onKeydown: null, onKeyup: null };
        router.onKeydown = (event) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || editableTarget(event.target)) return;
            const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
            if (!key) return;
            const holdChoices = scopedChoices(router, document, event, (scope) => holdCandidates(scope, key));
            if (holdChoices.length === 1 && holdChoices[0].candidates.length > 0) {
                event.preventDefault?.();
                if (router.activeHolds.has(key)) return;
                const control = preferredControl(document, holdChoices[0].candidates);
                const button = control.querySelector?.("[data-rix-control-hold-press]");
                if (!button || button.disabled) return;
                router.activeHolds.set(key, {
                    root: holdChoices[0].root,
                    controlId: control.dataset.rixControlId,
                    targetId: control.dataset.rixControlTarget,
                });
                button.click?.();
                return;
            }
            const choices = scopedChoices(router, document, event, (scope) => shortcutCandidates(scope, key));
            if (choices.length !== 1 || choices[0].candidates.length === 0) return;
            const { candidates } = choices[0];
            const control = preferredControl(document, candidates);
            const button = control.querySelector?.("[data-rix-control-input]");
            if (!button || button.disabled) return;
            event.preventDefault?.();
            button.click?.();
        };
        router.onKeyup = (event) => {
            const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
            const active = router.activeHolds.get(key);
            if (!active) return;
            router.activeHolds.delete(key);
            const control = holdCandidates(active.root, key, { interactive: false })
                .find((candidate) => candidate.dataset.rixControlId === active.controlId
                    && candidate.dataset.rixControlTarget === active.targetId);
            const button = control?.querySelector?.("[data-rix-control-hold-release]");
            if (!button || button.disabled) return;
            event.preventDefault?.();
            button.click?.();
        };
        shortcutRouters.set(document, router);
        document.addEventListener("keydown", router.onKeydown);
        document.addEventListener("keyup", router.onKeyup);
    }
    router.scopes.add(root);
    return () => {
        router.scopes.delete(root);
        if (router.scopes.size > 0) return;
        document.removeEventListener?.("keydown", router.onKeydown);
        document.removeEventListener?.("keyup", router.onKeyup);
        shortcutRouters.delete(document);
    };
}
