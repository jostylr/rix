/** Host-side playback, scrubbing, comparison, and exact inspection for Timeline outputs. */

import { formatOutputText } from "../runtime/output.js";

function finiteExact(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value?.value === "bigint" || typeof value?.value === "number") return Number(value.value);
    if (typeof value?.numerator === "bigint" && typeof value?.denominator === "bigint") {
        return Number(value.numerator) / Number(value.denominator);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, low, high) {
    return Math.min(high, Math.max(low, Math.round(finiteExact(value, low))));
}

function safeEasing(value) {
    const easing = String(value || "linear").toLowerCase();
    return new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).has(easing)
        ? easing
        : "linear";
}

function reducedMotionPreference() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/** Create or normalize persistent playback state for a retained Timeline. */
export function createTimelineViewState(timeline, target = {}, options = {}) {
    if (timeline?.kind !== "timeline" || !Array.isArray(timeline.frames) || timeline.frames.length === 0) {
        throw new Error("Timeline view requires a non-empty Timeline.Sequence value");
    }
    const length = timeline.frames.length;
    const oldStart = target.range?.start ?? 1;
    const oldEnd = target.range?.end ?? length;
    const start = clamp(oldStart, 1, length);
    const end = clamp(oldEnd, start, length);
    target.schema = "rix.timeline-view@1";
    target.length = length;
    target.range = { start, end };
    target.frame = clamp(target.frame ?? start, start, end);
    target.speed = [0.25, 0.5, 1, 2, 4].includes(Number(target.speed)) ? Number(target.speed) : 1;
    target.loop = Boolean(target.loop);
    target.compareMode = ["none", "previous", "frame", "onion"].includes(target.compareMode)
        ? target.compareMode
        : (target.compare ? "previous" : "none");
    target.compareFrame = clamp(target.compareFrame ?? 1, 1, length);
    target.recording = Array.isArray(target.recording) ? target.recording.filter((frame) => Number.isInteger(frame) && frame >= 1 && frame <= length) : [];
    target.playing = Boolean(target.playing);
    target.reducedMotion = options.reducedMotion ?? target.reducedMotion ?? reducedMotionPreference();
    target.transition = timeline.transition?.schema === "rix.timeline-transition@1"
        ? timeline.transition
        : { schema: "rix.timeline-transition@1", mode: "discrete", duration: null, properties: [] };
    return target;
}

export function timelineFrameInterval(state, timeline) {
    const perFrame = timeline.frameDurations?.[state.frame - 1];
    if (perFrame !== null && perFrame !== undefined) {
        return Math.max(16, finiteExact(perFrame, 1) * 1000 / state.speed);
    }
    const totalSeconds = timeline.duration === null || timeline.duration === undefined
        ? timeline.frames.length
        : finiteExact(timeline.duration, timeline.frames.length);
    return Math.max(16, (totalSeconds * 1000) / timeline.frames.length / state.speed);
}

export function setTimelineFrame(state, frame) {
    state.frame = clamp(frame, state.range.start, state.range.end);
    return state;
}

/** Step within the active range. Returns false when playback reaches a non-looping end. */
export function stepTimelineFrame(state, delta) {
    const direction = Math.sign(finiteExact(delta, 1)) || 1;
    const next = state.frame + direction;
    if (next > state.range.end) {
        if (!state.loop) return false;
        state.frame = state.range.start;
    } else if (next < state.range.start) {
        if (!state.loop) return false;
        state.frame = state.range.end;
    } else {
        state.frame = next;
    }
    return true;
}

function exactText(value, format) {
    try {
        return String(format(value));
    } catch {
        return String(value);
    }
}

function originText(frame) {
    const entries = frame?.origin?.entries;
    if (!(entries instanceof Map)) return "unavailable";
    const integer = (key) => finiteExact(entries.get(key), 0);
    const label = entries.get("label");
    return `entry ${integer("entry")}, state ${integer("state")}, ordinal ${integer("ordinal")}${label ? `, label ${exactText(label, String)}` : ""}`;
}

function renderedTimelineRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-timeline")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-timeline"));
    return [...new Set(roots)];
}

function identitySet(frameRoot) {
    return new Set([...(frameRoot?.querySelectorAll?.("[data-rix-semantic-id]") || [])]
        .map((node) => node.dataset.rixSemanticId)
        .filter(Boolean));
}

function matchedIdentities(left, right) {
    const first = identitySet(left);
    const second = identitySet(right);
    return [...first].filter((id) => second.has(id));
}

function semanticElements(root) {
    return new Map([...(root?.querySelectorAll?.("[data-rix-semantic-id]") || [])]
        .map((node) => [node.dataset.rixSemanticId, node])
        .filter(([id]) => Boolean(id)));
}

/** Diagnose semantic identity changes before applying any presentation-only transition. */
export function timelineTransitionDiagnostics(previousRoot, currentRoot, properties = []) {
    const previous = semanticElements(previousRoot);
    const current = semanticElements(currentRoot);
    const records = [];
    for (const [id, node] of previous) {
        const next = current.get(id);
        if (!next) records.push({ id, status: "disappeared", previousKind: node.tagName?.toLowerCase?.() || "object", currentKind: null });
        else if (node.tagName !== next.tagName) records.push({ id, status: "kind_changed", previousKind: node.tagName?.toLowerCase?.(), currentKind: next.tagName?.toLowerCase?.() });
        else records.push({ id, status: "matched", previousKind: node.tagName?.toLowerCase?.(), currentKind: next.tagName?.toLowerCase?.(), properties: [...properties] });
    }
    for (const [id, node] of current) {
        if (!previous.has(id)) records.push({ id, status: "appeared", previousKind: null, currentKind: node.tagName?.toLowerCase?.() || "object" });
    }
    return Object.freeze(records.map(Object.freeze));
}

function animateSemanticTransitions(previousRoot, currentRoot, state, duration, easing) {
    if (!previousRoot || !currentRoot || state.reducedMotion) return;
    const previous = semanticElements(previousRoot);
    const current = semanticElements(currentRoot);
    const properties = new Set(state.transition.properties || []);
    for (const [id, node] of current) {
        const before = previous.get(id);
        if (!before || before.tagName !== node.tagName || typeof node.animate !== "function") continue;
        const from = {};
        const to = {};
        if (properties.has("position")) {
            const first = before.getBoundingClientRect?.();
            const second = node.getBoundingClientRect?.();
            if (first && second) {
                from.transform = `translate(${first.left - second.left}px, ${first.top - second.top}px)`;
                to.transform = "translate(0px, 0px)";
            }
        }
        const beforeStyle = globalThis.getComputedStyle?.(before);
        const afterStyle = globalThis.getComputedStyle?.(node);
        if (properties.has("fill") && beforeStyle && afterStyle) {
            from.fill = beforeStyle.fill;
            to.fill = afterStyle.fill;
        }
        if (properties.has("stroke") && beforeStyle && afterStyle) {
            from.stroke = beforeStyle.stroke;
            to.stroke = afterStyle.stroke;
        }
        if (Object.keys(from).length) node.animate([from, to], { duration, easing });
    }
}

/** Enhance every Timeline output below root. Returns one disposer. */
export function enhanceTimelineViews(root, options = {}) {
    const timelineValues = Array.isArray(options.timelines) ? options.timelines : [options.timeline].filter(Boolean);
    const timelineRoots = renderedTimelineRoots(root);
    const disposers = [];
    for (const [index, timeline] of timelineValues.entries()) {
        const timelineRoot = timelineRoots[index];
        if (!timelineRoot) continue;
        disposers.push(enhanceTimelineView(timelineRoot, {
            ...options,
            timeline,
            state: options.states?.[index] || options.state || {},
        }));
    }
    return () => {
        for (const dispose of disposers.splice(0)) dispose();
    };
}

/** Enhance one rendered Timeline surface. */
export function enhanceTimelineView(root, options = {}) {
    const timeline = options.timeline;
    const format = options.format || String;
    const storage = options.storage || globalThis.localStorage;
    const stateTarget = options.state || {};
    if (timeline.preferencesKey && !stateTarget.preferencesLoaded) {
        try {
            const saved = JSON.parse(storage?.getItem?.(`rix.timeline:${timeline.preferencesKey}`) || "null");
            if (saved?.schema === "rix.timeline-preferences@1") Object.assign(stateTarget, saved);
        } catch {
            // Corrupt or unavailable host preferences never block exact playback.
        }
        stateTarget.preferencesLoaded = true;
    }
    const state = createTimelineViewState(timeline, stateTarget, options);
    const frames = [...root.querySelectorAll("[data-rix-timeline-frame]")];
    const textFrames = [...root.querySelectorAll("[data-rix-timeline-text-frame]")];
    const status = root.querySelector("[data-rix-timeline-status]");
    const exactState = root.querySelector("[data-rix-timeline-exact-state]");
    const exactOrigin = root.querySelector("[data-rix-timeline-exact-origin]");
    const exactTextOutput = root.querySelector("[data-rix-timeline-exact-text]");
    const playButton = root.querySelector('[data-rix-timeline-action="play"]');
    const scrubber = root.querySelector("[data-rix-timeline-scrubber]");
    const speed = root.querySelector("[data-rix-timeline-speed]");
    const loop = root.querySelector("[data-rix-timeline-loop]");
    const start = root.querySelector("[data-rix-timeline-range-start]");
    const end = root.querySelector("[data-rix-timeline-range-end]");
    const compare = root.querySelector("[data-rix-timeline-compare]");
    const compareFrame = root.querySelector("[data-rix-timeline-compare-frame]");
    const marker = root.querySelector("select[data-rix-timeline-marker]");
    const exported = root.querySelector("[data-rix-timeline-export]");
    const diagnostics = root.querySelector("[data-rix-timeline-diagnostics]");
    const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    const cancel = options.cancel || ((handle) => clearTimeout(handle));
    let timer = null;
    let disposed = false;

    root.dataset.rixReducedMotion = String(state.reducedMotion);

    function savePreferences() {
        if (!timeline.preferencesKey) return;
        const value = {
            schema: "rix.timeline-preferences@1",
            speed: state.speed,
            loop: state.loop,
            range: { ...state.range },
            compareMode: state.compareMode,
            compareFrame: state.compareFrame,
        };
        try { storage?.setItem?.(`rix.timeline:${timeline.preferencesKey}`, JSON.stringify(value)); } catch { /* optional host service */ }
    }

    function pause(announce = true) {
        state.playing = false;
        if (timer !== null) cancel(timer);
        timer = null;
        if (playButton) {
            playButton.textContent = "Play";
            playButton.setAttribute("aria-pressed", "false");
        }
        if (announce) renderState(false);
    }

    function scheduleNext() {
        if (!state.playing || disposed) return;
        timer = schedule(() => {
            timer = null;
            if (!stepTimelineFrame(state, 1)) {
                pause();
                return;
            }
            renderState(true);
            scheduleNext();
        }, timelineFrameInterval(state, timeline));
    }

    function play() {
        if (state.playing) {
            pause();
            return;
        }
        if (state.frame === state.range.end && !state.loop) state.frame = state.range.start;
        state.playing = true;
        if (playButton) {
            playButton.textContent = "Pause";
            playButton.setAttribute("aria-pressed", "true");
        }
        renderState(false);
        scheduleNext();
    }

    function renderState(transitioned = false) {
        const currentIndex = state.frame - 1;
        const previousIndex = currentIndex > 0
            ? currentIndex - 1
            : (state.loop ? state.length - 1 : null);
        const currentRoot = frames[currentIndex];
        const previousRoot = previousIndex === null ? null : frames[previousIndex];
        const comparisonIndices = new Set();
        if (state.compareMode === "previous" && previousIndex !== null) comparisonIndices.add(previousIndex);
        else if (state.compareMode === "frame") comparisonIndices.add(state.compareFrame - 1);
        else if (state.compareMode === "onion") {
            if (currentIndex > 0) comparisonIndices.add(currentIndex - 1);
            if (currentIndex + 1 < state.length) comparisonIndices.add(currentIndex + 1);
        }
        comparisonIndices.delete(currentIndex);
        for (const [frameIndex, frameRoot] of frames.entries()) {
            const current = frameIndex === currentIndex;
            const comparison = comparisonIndices.has(frameIndex);
            frameRoot.hidden = !(current || comparison);
            frameRoot.toggleAttribute("aria-hidden", !(current || comparison));
            frameRoot.toggleAttribute("data-rix-timeline-current", current);
            frameRoot.toggleAttribute("data-rix-timeline-comparison", Boolean(comparison));
            frameRoot.toggleAttribute("data-rix-timeline-onion", state.compareMode === "onion" && comparison);
        }
        for (const [frameIndex, item] of textFrames.entries()) {
            item.toggleAttribute("aria-current", frameIndex === currentIndex);
        }
        const frame = timeline.frames[currentIndex];
        const matched = matchedIdentities(previousRoot, currentRoot);
        const transitionRecords = timelineTransitionDiagnostics(previousRoot, currentRoot, state.transition.properties);
        root.dataset.rixTimelineFrame = String(state.frame);
        root.dataset.rixTimelineMatches = String(matched.length);
        root.dataset.rixTimelineComparing = String(comparisonIndices.size > 0);
        root.dataset.rixTimelineComparisonMode = state.compareMode;
        if (scrubber) scrubber.value = String(state.frame);
        if (speed) speed.value = String(state.speed);
        if (loop) loop.checked = state.loop;
        if (start) start.value = String(state.range.start);
        if (end) end.value = String(state.range.end);
        if (compare) compare.value = state.compareMode;
        if (compareFrame) compareFrame.value = String(state.compareFrame);
        const stateText = exactText(frame.state, format);
        if (exactState) exactState.textContent = stateText;
        if (exactOrigin) exactOrigin.textContent = originText(frame);
        if (exactTextOutput) exactTextOutput.textContent = formatOutputText(frame.content, format);
        const identityText = matched.length === 0
            ? "no semantic objects matched from the previous frame"
            : `${matched.length} semantic object${matched.length === 1 ? "" : "s"} matched from the previous frame`;
        const mismatches = transitionRecords.filter((record) => record.status !== "matched");
        const changeText = state.transition.mode === "crossfade" && !state.reducedMotion
            ? `declared ${state.transition.properties.join(", ") || "opacity"} transition; exact values remain discrete`
            : "discrete exact values";
        const markerLabel = timeline.markers?.find((entry) => entry.frame === state.frame)?.label;
        if (marker) marker.value = markerLabel ? String(state.frame) : "";
        if (status) status.textContent = `Frame ${state.frame} of ${state.length}${markerLabel ? ` · marker ${markerLabel}` : ""} · exact state ${stateText} · ${identityText} · ${mismatches.length} transition mismatch${mismatches.length === 1 ? "" : "es"} · ${state.recording.length} recorded · ${changeText}${state.playing ? " · playing" : " · paused"}`;
        if (diagnostics) {
            diagnostics.textContent = transitionRecords.length
                ? transitionRecords.map((record) => `${record.id}: ${record.status.replaceAll("_", " ")}${record.previousKind || record.currentKind ? ` (${record.previousKind || "none"} → ${record.currentKind || "none"})` : ""}`).join("\n")
                : "No previous frame is available.";
        }
        if (transitioned && currentRoot?.animate && state.transition.mode === "crossfade" && !state.reducedMotion && comparisonIndices.size === 0) {
            const duration = state.transition.duration === null
                ? Math.min(250, timelineFrameInterval(state, timeline) / 3)
                : finiteExact(state.transition.duration, 0.2) * 1000;
            const easing = safeEasing(timeline.easing);
            if (state.transition.properties.includes("opacity")) currentRoot.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
            animateSemanticTransitions(previousRoot, currentRoot, state, duration, easing);
        }
        savePreferences();
        options.onFrame?.({ frame: state.frame, snapshot: frame, state, matchedIdentities: matched, diagnostics: transitionRecords });
    }

    function changeFrame(frame) {
        pause(false);
        setTimelineFrame(state, frame);
        renderState(true);
    }

    function recordCurrentFrame() {
        if (!state.recording.includes(state.frame)) {
            state.recording.push(state.frame);
            state.recording.sort((left, right) => left - right);
        }
        renderState(false);
    }

    function recordingValue() {
        return {
            schema: "rix.timeline-recording@1",
            title: timeline.title || null,
            sourceLength: timeline.frames.length,
            frames: state.recording.map((frameNumber) => {
                const snapshot = timeline.frames[frameNumber - 1];
                return {
                    frame: frameNumber,
                    marker: timeline.markers?.find((entry) => entry.frame === frameNumber)?.label || null,
                    state: exactText(snapshot.state, format),
                    origin: originText(snapshot),
                    text: formatOutputText(snapshot.content, format),
                };
            }),
        };
    }

    function exportRecording() {
        const value = recordingValue();
        const json = JSON.stringify(value, null, 2);
        if (exported) {
            exported.hidden = false;
            exported.textContent = json;
        }
        try { globalThis.navigator?.clipboard?.writeText?.(json); } catch { /* clipboard is optional */ }
        const EventType = globalThis.CustomEvent;
        if (EventType && root.dispatchEvent) root.dispatchEvent(new EventType("rix-timeline-export", { detail: value, bubbles: true }));
        options.onExport?.(value);
        renderState(false);
        return value;
    }

    function nextMarker() {
        const markers = timeline.markers || [];
        if (markers.length === 0) return false;
        const next = markers.find((entry) => entry.frame > state.frame) || markers[0];
        changeFrame(next.frame);
        return true;
    }

    function onClick(event) {
        const action = event.target?.closest?.("[data-rix-timeline-action]")?.dataset.rixTimelineAction;
        const interactive = event.target?.closest?.(".rix-output-timeline-toolbar, .rix-output-timeline-inspector, .rix-output-timeline-text-track");
        if (interactive) event.stopPropagation?.();
        if (!action) return;
        event.preventDefault?.();
        if (action === "play") play();
        else if (action === "previous") {
            pause(false);
            if (!stepTimelineFrame(state, -1)) state.frame = state.range.start;
            renderState(true);
        } else if (action === "next") {
            pause(false);
            if (!stepTimelineFrame(state, 1)) state.frame = state.range.end;
            renderState(true);
        } else if (action === "record") recordCurrentFrame();
        else if (action === "export") exportRecording();
        else if (action === "clear-recording") {
            state.recording = [];
            if (exported) {
                exported.hidden = true;
                exported.textContent = "";
            }
            renderState(false);
        }
    }

    function onInput(event) {
        const target = event.target;
        if (!target) return;
        if (target.matches?.("[data-rix-timeline-scrubber]")) changeFrame(target.value);
        else if (target.matches?.("[data-rix-timeline-speed]")) {
            const nextSpeed = Number(target.value);
            state.speed = [0.25, 0.5, 1, 2, 4].includes(nextSpeed) ? nextSpeed : 1;
            if (state.playing) {
                if (timer !== null) cancel(timer);
                timer = null;
                scheduleNext();
            }
            renderState(false);
        } else if (target.matches?.("[data-rix-timeline-loop]")) {
            state.loop = Boolean(target.checked);
            renderState(false);
        } else if (target.matches?.("[data-rix-timeline-compare]")) {
            state.compareMode = ["none", "previous", "frame", "onion"].includes(target.value) ? target.value : "none";
            renderState(false);
        } else if (target.matches?.("[data-rix-timeline-compare-frame]")) {
            state.compareFrame = clamp(target.value, 1, state.length);
            renderState(false);
        } else if (target.matches?.("select[data-rix-timeline-marker]")) {
            if (target.value !== "") changeFrame(target.value);
            else renderState(false);
        } else if (target.matches?.("[data-rix-timeline-range-start]")) {
            state.range.start = clamp(target.value, 1, state.range.end);
            state.frame = clamp(state.frame, state.range.start, state.range.end);
            renderState(false);
        } else if (target.matches?.("[data-rix-timeline-range-end]")) {
            state.range.end = clamp(target.value, state.range.start, state.length);
            state.frame = clamp(state.frame, state.range.start, state.range.end);
            renderState(false);
        } else return;
        event.stopPropagation?.();
    }

    function onKeyDown(event) {
        if (event.defaultPrevented) return;
        if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(event.target?.tagName)) return;
        let handled = true;
        if (event.key === " " || event.key === "Spacebar") play();
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            pause(false);
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            if (!stepTimelineFrame(state, direction)) {
                state.frame = direction < 0 ? state.range.start : state.range.end;
            }
            renderState(true);
        }
        else if (event.key === "Home") changeFrame(state.range.start);
        else if (event.key === "End") changeFrame(state.range.end);
        else if (String(event.key).toLowerCase() === "l") {
            state.loop = !state.loop;
            renderState(false);
        } else if (String(event.key).toLowerCase() === "m") {
            handled = nextMarker();
        } else if (String(event.key).toLowerCase() === "r") {
            recordCurrentFrame();
        } else handled = false;
        if (handled) {
            event.preventDefault?.();
            event.stopPropagation?.();
        }
    }

    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("keydown", onKeyDown);
    renderState(false);

    return () => {
        disposed = true;
        pause(false);
        root.removeEventListener("click", onClick);
        root.removeEventListener("input", onInput);
        root.removeEventListener("change", onInput);
        root.removeEventListener("keydown", onKeyDown);
    };
}
