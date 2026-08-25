import { expect, test } from "bun:test";
import {
    createTimelineViewState,
    setTimelineFrame,
    stepTimelineFrame,
    timelineFrameInterval,
    timelineTransitionDiagnostics,
} from "../../src/tools/timeline-view.js";
import { parseAndEvaluate } from "../../src/index.js";

function timeline(source = "[0, 1, 2, 3]") {
    return parseAndEvaluate(`
        scene = state -> .Paragraph(@"frame @{state}");
        .Timeline.Sequence({= duration=2, entries=[{: scene, ${source}}] })
    `);
}

test("Timeline view state retains playback range, speed, and reduced-motion policy", () => {
    const value = timeline();
    const state = createTimelineViewState(value, {
        frame: 4,
        range: { start: 2, end: 3 },
        speed: 2,
        loop: true,
    }, { reducedMotion: true });

    expect(state).toMatchObject({
        schema: "rix.timeline-view@1",
        length: 4,
        frame: 3,
        range: { start: 2, end: 3 },
        speed: 2,
        loop: true,
        reducedMotion: true,
    });
    expect(timelineFrameInterval(state, value)).toBe(250);
});

test("Timeline stepping is range-aware and only wraps when loop is enabled", () => {
    const value = timeline();
    const state = createTimelineViewState(value, {}, { reducedMotion: false });

    setTimelineFrame(state, 4);
    expect(stepTimelineFrame(state, 1)).toBe(false);
    expect(state.frame).toBe(4);

    state.loop = true;
    expect(stepTimelineFrame(state, 1)).toBe(true);
    expect(state.frame).toBe(1);
    expect(stepTimelineFrame(state, -1)).toBe(true);
    expect(state.frame).toBe(4);
});

test("Timeline defaults to one second per retained frame when duration is omitted", () => {
    const value = parseAndEvaluate(`
        scene = state -> .Paragraph(@"frame @{state}");
        .Timeline.Sequence([{: scene, [0, 1, 2]}])
    `);
    const state = createTimelineViewState(value, {}, { reducedMotion: false });
    expect(timelineFrameInterval(state, value)).toBe(1000);
});

test("Timeline uses exact per-frame timing and normalizes comparison state", () => {
    const value = parseAndEvaluate(`
        scene = state -> .Paragraph(@"frame @{state}");
        .Timeline.Sequence({= frameDurations=[1/4, 3/2], entries=[{: scene, [0, 1]}] })
    `);
    const state = createTimelineViewState(value, {
        frame: 2,
        speed: 2,
        compareMode: "onion",
        compareFrame: 9,
        recording: [2, 99],
    }, { reducedMotion: false });
    expect(state.compareMode).toBe("onion");
    expect(state.compareFrame).toBe(2);
    expect(state.recording).toEqual([2]);
    expect(timelineFrameInterval(state, value)).toBe(750);
    state.frame = 1;
    expect(timelineFrameInterval(state, value)).toBe(125);
});

test("Timeline transition diagnostics distinguish identity and SVG-kind changes", () => {
    const element = (id, tagName) => ({ dataset: { rixSemanticId: id }, tagName });
    const root = (elements) => ({ querySelectorAll: () => elements });
    const diagnostics = timelineTransitionDiagnostics(
        root([element("fixed", "CIRCLE"), element("gone", "PATH"), element("changed", "RECT")]),
        root([element("fixed", "CIRCLE"), element("new", "TEXT"), element("changed", "PATH")]),
        ["position", "fill"],
    );
    expect(diagnostics.map(({ id, status }) => [id, status])).toEqual([
        ["fixed", "matched"],
        ["gone", "disappeared"],
        ["changed", "kind_changed"],
        ["new", "appeared"],
    ]);
    expect(diagnostics[0].properties).toEqual(["position", "fill"]);
});
