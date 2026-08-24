import { expect, test } from "bun:test";
import {
    createTimelineViewState,
    setTimelineFrame,
    stepTimelineFrame,
    timelineFrameInterval,
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
