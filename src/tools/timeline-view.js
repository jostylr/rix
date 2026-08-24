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
    target.compare = Boolean(target.compare);
    target.playing = Boolean(target.playing);
    target.reducedMotion = options.reducedMotion ?? target.reducedMotion ?? reducedMotionPreference();
    target.transition = timeline.transition?.schema === "rix.timeline-transition@1"
        ? timeline.transition
        : { schema: "rix.timeline-transition@1", mode: "discrete", duration: null, properties: [] };
    return target;
}

export function timelineFrameInterval(state, timeline) {
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
    const state = createTimelineViewState(timeline, options.state || {}, options);
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
    const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    const cancel = options.cancel || ((handle) => clearTimeout(handle));
    let timer = null;
    let disposed = false;

    root.dataset.rixReducedMotion = String(state.reducedMotion);

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
        const compared = state.compare && previousRoot && previousRoot !== currentRoot;
        for (const [frameIndex, frameRoot] of frames.entries()) {
            const current = frameIndex === currentIndex;
            const comparison = compared && frameIndex === previousIndex;
            frameRoot.hidden = !(current || comparison);
            frameRoot.toggleAttribute("aria-hidden", !(current || comparison));
            frameRoot.toggleAttribute("data-rix-timeline-current", current);
            frameRoot.toggleAttribute("data-rix-timeline-comparison", Boolean(comparison));
        }
        for (const [frameIndex, item] of textFrames.entries()) {
            item.toggleAttribute("aria-current", frameIndex === currentIndex);
        }
        const frame = timeline.frames[currentIndex];
        const matched = matchedIdentities(previousRoot, currentRoot);
        root.dataset.rixTimelineFrame = String(state.frame);
        root.dataset.rixTimelineMatches = String(matched.length);
        root.dataset.rixTimelineComparing = String(Boolean(compared));
        if (scrubber) scrubber.value = String(state.frame);
        if (speed) speed.value = String(state.speed);
        if (loop) loop.checked = state.loop;
        if (start) start.value = String(state.range.start);
        if (end) end.value = String(state.range.end);
        if (compare) compare.checked = state.compare;
        const stateText = exactText(frame.state, format);
        if (exactState) exactState.textContent = stateText;
        if (exactOrigin) exactOrigin.textContent = originText(frame);
        if (exactTextOutput) exactTextOutput.textContent = formatOutputText(frame.content, format);
        const identityText = matched.length === 0
            ? "no semantic objects matched from the previous frame"
            : `${matched.length} semantic object${matched.length === 1 ? "" : "s"} matched from the previous frame`;
        const changeText = state.transition.mode === "crossfade" && !state.reducedMotion
            ? "declared opacity crossfade; exact values remain discrete"
            : "discrete exact values";
        if (status) status.textContent = `Frame ${state.frame} of ${state.length} · exact state ${stateText} · ${identityText} · ${changeText}${state.playing ? " · playing" : " · paused"}`;
        if (transitioned && currentRoot?.animate && state.transition.mode === "crossfade" && !state.reducedMotion && !compared) {
            const duration = state.transition.duration === null
                ? Math.min(250, timelineFrameInterval(state, timeline) / 3)
                : finiteExact(state.transition.duration, 0.2) * 1000;
            currentRoot.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration,
                easing: safeEasing(timeline.easing),
            });
        }
        options.onFrame?.({ frame: state.frame, snapshot: frame, state, matchedIdentities: matched });
    }

    function changeFrame(frame) {
        pause(false);
        setTimelineFrame(state, frame);
        renderState(true);
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
            state.compare = Boolean(target.checked);
            renderState(false);
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
