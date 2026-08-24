/** Web Audio host for renderer-neutral rix.audio-trace@1 plans. */

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value)));
}

/** Logarithmic pitch mapping across a retained y range. */
export function audioTraceFrequency(value, range, frequency = { minimum: 220, maximum: 880 }) {
    const low = Number(frequency.minimum);
    const high = Number(frequency.maximum);
    const span = Number(range?.maximum) - Number(range?.minimum);
    const unit = span > 0 ? clamp((Number(value) - Number(range.minimum)) / span, 0, 1) : 0.5;
    return low * ((high / low) ** unit);
}

export function createAudioTraceState(plan, target = {}) {
    target.schema = "rix.audio-trace-state@1";
    target.seriesIndex = clamp(target.seriesIndex ?? 0, 0, Math.max(0, plan.series.length - 1));
    target.overview = Boolean(target.overview);
    target.sampleIndex = Math.max(0, Number(target.sampleIndex) || 0);
    target.startIndex = Math.max(0, Number(target.startIndex) || 0);
    target.endIndex = Number.isFinite(Number(target.endIndex)) ? Number(target.endIndex) : Math.max(0, (plan.series[target.seriesIndex]?.samples.length || 1) - 1);
    target.speed = [0.5, 1, 2, 4].includes(Number(target.speed)) ? Number(target.speed) : plan.defaults.speed;
    target.waveform = target.waveform || plan.defaults.waveform;
    target.direction = target.direction === "reverse" ? "reverse" : "forward";
    target.stereo = target.stereo !== false;
    target.muted = Boolean(target.muted);
    target.playing = false;
    return target;
}

function activeSeries(plan, state) {
    return plan.series[state.seriesIndex];
}

function normalizeRange(plan, state) {
    const last = Math.max(0, (activeSeries(plan, state)?.samples.length || 1) - 1);
    state.startIndex = clamp(state.startIndex, 0, last);
    state.endIndex = clamp(state.endIndex, state.startIndex, last);
    state.sampleIndex = clamp(state.sampleIndex, state.startIndex, state.endIndex);
    return last;
}

export function stepAudioTrace(plan, state, amount = 1) {
    normalizeRange(plan, state);
    state.sampleIndex = clamp(state.sampleIndex + Number(amount), state.startIndex, state.endIndex);
    return activeSeries(plan, state)?.samples[state.sampleIndex] || null;
}

function eventAt(plan, series, index) {
    return plan.events.filter((event) => event.sampleIndex === index && (!event.seriesId || event.seriesId === series?.id));
}

function cueFrequency(event) {
    if (event.exactness === "exact") return 1320;
    if (event.exactness === "certified-enclosure") return 1100;
    if (event.exactness === "unresolved") return 150;
    if (event.type === "sampled-extremum") return 990;
    if (event.type.includes("axis-crossing")) return 660;
    return 440;
}

function roots(root) {
    const values = [];
    if (root?.matches?.(".rix-output-audio-trace")) values.push(root);
    if (root?.querySelectorAll) values.push(...root.querySelectorAll(".rix-output-audio-trace"));
    return values;
}

function enhance(root, options) {
    if (root.dataset.rixAudioEnhanced === "true") return () => {};
    root.dataset.rixAudioEnhanced = "true";
    const plan = options.plan;
    if (!plan?.supported) return () => {};
    const state = createAudioTraceState(plan, options.state || {});
    const query = (selector) => root.querySelector(selector);
    const play = query('[data-rix-audio-action="play"]');
    const previous = query('[data-rix-audio-action="previous"]');
    const next = query('[data-rix-audio-action="next"]');
    const mute = query('[data-rix-audio-action="mute"]');
    const seriesSelect = query("[data-rix-audio-series]");
    const seek = query("[data-rix-audio-seek]");
    const start = query("[data-rix-audio-start]");
    const end = query("[data-rix-audio-end]");
    const speed = query("[data-rix-audio-speed]");
    const waveform = query("[data-rix-audio-waveform]");
    const direction = query("[data-rix-audio-direction]");
    const stereo = query("[data-rix-audio-stereo]");
    const status = query("[data-rix-audio-status]");
    const listeners = [];
    let timer = null;
    let context = null;
    let oscillator = null;
    let gain = null;
    let panner = null;

    const listen = (element, name, handler) => {
        element?.addEventListener?.(name, handler);
        if (element) listeners.push(() => element.removeEventListener?.(name, handler));
    };
    const setStatus = (text) => { if (status) status.textContent = text; };
    const current = () => activeSeries(plan, state)?.samples[state.sampleIndex] || null;
    const waveformName = () => state.waveform === "series" ? activeSeries(plan, state)?.waveform || "sine" : state.waveform;
    const sync = () => {
        const last = normalizeRange(plan, state);
        if (seek) { seek.max = String(last); seek.value = String(state.sampleIndex); }
        if (start) { start.max = String(last + 1); start.value = String(state.startIndex + 1); }
        if (end) { end.max = String(last + 1); end.value = String(state.endIndex + 1); }
        if (play) play.textContent = state.playing ? "Pause" : "Play";
        mute?.setAttribute?.("aria-pressed", String(state.muted));
        if (mute) mute.textContent = state.muted ? "Unmute" : "Mute";
    };
    const ensureAudio = async () => {
        if (context) return true;
        const Window = root.ownerDocument?.defaultView || globalThis;
        const AudioContext = options.audioContextFactory || Window.AudioContext || Window.webkitAudioContext;
        if (typeof AudioContext !== "function") {
            setStatus("Audio is unavailable in this browser. The complete text alternative remains available.");
            return false;
        }
        context = options.audioContextFactory ? AudioContext() : new AudioContext();
        await context.resume?.();
        oscillator = context.createOscillator();
        gain = context.createGain();
        panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
        oscillator.connect(gain);
        if (panner) { gain.connect(panner); panner.connect(context.destination); } else gain.connect(context.destination);
        gain.gain.value = 0;
        oscillator.start();
        return true;
    };
    const cue = (events) => {
        if (!events.length || !context || state.muted || typeof context.createOscillator !== "function") return;
        const tone = context.createOscillator();
        const volume = context.createGain();
        tone.frequency.value = cueFrequency(events[0]);
        tone.type = events[0].exactness === "unresolved" ? "sawtooth" : "sine";
        volume.gain.setValueAtTime?.(0.035, context.currentTime);
        volume.gain.exponentialRampToValueAtTime?.(0.0001, context.currentTime + 0.06);
        tone.connect(volume); volume.connect(context.destination); tone.start(); tone.stop(context.currentTime + 0.065);
    };
    const renderSample = () => {
        sync();
        const series = activeSeries(plan, state);
        const sample = current();
        if (!series || !sample) return;
        const frequency = audioTraceFrequency(sample.y, plan.range, plan.defaults.frequency);
        if (oscillator) { oscillator.type = waveformName(); oscillator.frequency.setValueAtTime?.(frequency, context.currentTime); }
        if (gain) gain.gain.setValueAtTime?.(state.muted || !state.playing ? 0 : 0.08, context.currentTime);
        if (panner) panner.pan.setValueAtTime?.(state.stereo ? series.stereoPosition : 0, context.currentTime);
        const events = eventAt(plan, series, state.sampleIndex);
        cue(events);
        setStatus(`${series.label}, sample ${state.sampleIndex + 1} of ${series.samples.length}: x ${sample.xText}, y ${sample.yText}; ${sample.exactness.replace("-", " ")}${events.length ? `. ${events.map((event) => event.label).join(" ")}` : ""}`);
    };
    const pause = () => {
        state.playing = false;
        clearTimeout(timer); timer = null;
        if (gain && context) gain.gain.setValueAtTime?.(0, context.currentTime);
        sync();
    };
    const advance = () => {
        if (!state.playing) return;
        const delta = state.direction === "reverse" ? -1 : 1;
        const boundary = delta > 0 ? state.endIndex : state.startIndex;
        if (state.sampleIndex === boundary) {
            if (state.overview && ((delta > 0 && state.seriesIndex < plan.series.length - 1) || (delta < 0 && state.seriesIndex > 0))) {
                state.seriesIndex += delta;
                normalizeRange(plan, state);
                state.sampleIndex = delta > 0 ? state.startIndex : state.endIndex;
            } else { pause(); setStatus(`Audio trace finished. ${status?.textContent || ""}`); return; }
        } else state.sampleIndex += delta;
        renderSample();
        timer = setTimeout(advance, 1000 / (plan.defaults.tempo * state.speed));
    };
    const togglePlay = async () => {
        if (state.playing) { pause(); setStatus(`Audio trace paused. ${status?.textContent || ""}`); return; }
        if (!await ensureAudio()) return;
        state.playing = true;
        if (state.direction === "forward" && state.sampleIndex >= state.endIndex) state.sampleIndex = state.startIndex;
        if (state.direction === "reverse" && state.sampleIndex <= state.startIndex) state.sampleIndex = state.endIndex;
        renderSample();
        timer = setTimeout(advance, 1000 / (plan.defaults.tempo * state.speed));
    };
    const chooseSeries = () => {
        state.overview = seriesSelect?.value === "overview";
        state.seriesIndex = state.overview ? 0 : clamp(seriesSelect?.value, 0, plan.series.length - 1);
        state.startIndex = 0;
        state.endIndex = activeSeries(plan, state).samples.length - 1;
        state.sampleIndex = state.direction === "reverse" ? state.endIndex : state.startIndex;
        renderSample();
    };
    listen(play, "click", togglePlay);
    listen(previous, "click", () => { pause(); stepAudioTrace(plan, state, -1); renderSample(); });
    listen(next, "click", () => { pause(); stepAudioTrace(plan, state, 1); renderSample(); });
    listen(mute, "click", () => { state.muted = !state.muted; renderSample(); });
    listen(seriesSelect, "change", chooseSeries);
    listen(seek, "input", () => { state.sampleIndex = Number(seek.value); renderSample(); });
    listen(start, "change", () => { state.startIndex = Number(start.value) - 1; normalizeRange(plan, state); renderSample(); });
    listen(end, "change", () => { state.endIndex = Number(end.value) - 1; normalizeRange(plan, state); renderSample(); });
    listen(speed, "change", () => { state.speed = Number(speed.value); });
    listen(waveform, "change", () => { state.waveform = waveform.value; renderSample(); });
    listen(direction, "change", () => { state.direction = direction.value; });
    listen(stereo, "change", () => { state.stereo = stereo.checked; renderSample(); });
    listen(root, "keydown", (event) => {
        if (["INPUT", "SELECT", "BUTTON"].includes(event.target?.tagName) && event.key !== "Escape") return;
        if (event.key === " ") togglePlay();
        else if (event.key === "ArrowLeft") { pause(); stepAudioTrace(plan, state, -1); renderSample(); }
        else if (event.key === "ArrowRight") { pause(); stepAudioTrace(plan, state, 1); renderSample(); }
        else if (event.key === "Home") { pause(); state.sampleIndex = state.startIndex; renderSample(); }
        else if (event.key === "End") { pause(); state.sampleIndex = state.endIndex; renderSample(); }
        else if (event.key.toLowerCase() === "m") { state.muted = !state.muted; renderSample(); }
        else return;
        event.preventDefault?.();
    });
    sync();
    return () => {
        pause();
        for (const remove of listeners) remove();
        try { oscillator?.stop(); } catch { /* already stopped */ }
        context?.close?.();
    };
}

export function enhanceAudioTraceView(root, options = {}) {
    const disposers = roots(root).map((trace) => enhance(trace, options));
    return () => disposers.forEach((dispose) => dispose());
}
