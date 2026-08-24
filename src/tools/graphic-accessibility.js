/** Renderer-neutral text and audio projections for retained Graphics values. */

const TEXT_SCHEMA = "rix.graphics.text@1";
const AUDIO_SCHEMA = "rix.audio-trace@1";

function sequenceValue(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    return [];
}

function mapField(value, key) {
    if (value instanceof Map) return value.get(key) ?? value.get(String(key).toLowerCase()) ?? null;
    if (value?.type === "map" && value.entries instanceof Map) return mapField(value.entries, key);
    return value?.[key] ?? value?.[String(key).toLowerCase()] ?? null;
}

function stringValue(value) {
    if (typeof value === "string") return value;
    if (value?.type === "string" || value?.type === "symbol") return String(value.value);
    return null;
}

function finiteNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value?.value === "number" || typeof value?.value === "bigint") return Number(value.value);
    if (typeof value?.numerator === "bigint" && typeof value?.denominator === "bigint") {
        return Number(value.numerator) / Number(value.denominator);
    }
    if (typeof value === "string" && /^[-+]?\d+\/\d+$/.test(value.trim())) {
        const [numerator, denominator] = value.split("/").map(Number);
        return denominator === 0 ? null : numerator / denominator;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function valueText(value, format) {
    try {
        return String(format(value));
    } catch {
        return String(value);
    }
}

/** Classify the epistemic status retained by a value, never by its pixels. */
export function graphicValueExactness(value) {
    if (value === null || value === undefined) return "unresolved";
    if (typeof value === "bigint") return "exact";
    if (typeof value === "string" && /^[-+]?(?:\d+|\d+\/\d+)$/.test(value.trim())) return "exact";
    const type = String(value?.type || value?.constructor?.name || "").toLowerCase();
    if (type.includes("interval") || type.includes("enclosure") || type.includes("certified")) return "certified-enclosure";
    if (type === "integer" || type === "rational" || type.includes("biginteger")) return "exact";
    if (typeof value?.numerator === "bigint" && typeof value?.denominator === "bigint") return "exact";
    if (typeof value === "number" || type.includes("decimal") || type.includes("float")) return "approximate";
    if (type.includes("conject")) return "conjectural";
    return finiteNumber(value) === null ? "unresolved" : "approximate";
}

function combinedExactness(values) {
    const statuses = values.map(graphicValueExactness);
    for (const status of ["unresolved", "conjectural", "approximate", "certified-enclosure"]) {
        if (statuses.includes(status)) return status;
    }
    return "exact";
}

function semanticId(node, path) {
    return stringValue(mapField(node?.style, "hitId"))
        || stringValue(mapField(node?.style, "id"))
        || stringValue(mapField(node?.metadata, "id"))
        || node?.id
        || node?.targetId
        || path.replace(/[^A-Za-z0-9:_.-]+/g, "-");
}

function describeNode(node, format) {
    const point = (value) => {
        const values = sequenceValue(value);
        return values.length >= 2 ? `(${valueText(values[0], format)}, ${valueText(values[1], format)})` : "unknown";
    };
    if (node.kind === "path") return `Path with ${(node.commands || node.points || []).length} retained ${node.commands ? "commands" : "points"}`;
    if (node.kind === "rectangle") return `Rectangle at ${point(node.origin)}, size ${point(node.size)}`;
    if (node.kind === "circle") return `Circle centered at ${point(node.center)}, radius ${valueText(node.radius, format)}`;
    if (node.kind === "drag_point") return `${node.label || "Draggable point"} at ${point(node.center)}`;
    if (node.kind === "text_mark") return `Text ${valueText(node.text, format)} at ${point(node.position)}`;
    if (node.kind === "graphic_action") return `${node.label || "Graphic action"}, action ${node.id}`;
    if (node.kind === "group" || node.kind === "transform" || node.kind === "clip") {
        return `${node.kind.replace("_", " ")} containing ${(node.children || []).length} objects`;
    }
    return `Graphic ${node.kind || "object"}`;
}

function sceneObjects(graphic, format) {
    const objects = [];
    const visit = (node, path, group = null) => {
        if (!node || node.type !== "output") return;
        const id = String(semanticId(node, path));
        objects.push(Object.freeze({
            id,
            role: node.kind || "object",
            group,
            label: node.label ? valueText(node.label, format) : null,
            description: describeNode(node, format),
        }));
        for (const [index, child] of (node.children || []).entries()) {
            visit(child, `${path}.${node.kind}[${index + 1}]`, id);
        }
    };
    for (const [index, child] of (graphic?.children || []).entries()) visit(child, `graphic[${index + 1}]`);
    return Object.freeze(objects);
}

function sampleEvents(samples) {
    if (!samples.length) return Object.freeze([]);
    const events = [
        Object.freeze({ type: "domain-boundary", boundary: "start", sampleIndex: 0, exactness: samples[0].exactness, label: `Domain starts at x ${samples[0].xText}` }),
        Object.freeze({ type: "domain-boundary", boundary: "end", sampleIndex: samples.length - 1, exactness: samples.at(-1).exactness, label: `Domain ends at x ${samples.at(-1).xText}` }),
    ];
    for (let index = 0; index < samples.length; index += 1) {
        const current = samples[index];
        if (current.y === 0) {
            const exact = current.exactness === "exact";
            events.push(Object.freeze({
                type: exact ? "axis-crossing" : "sampled-axis-crossing",
                sampleIndex: index,
                exactness: current.exactness,
                label: exact
                    ? `Exact retained point on the horizontal axis at x ${current.xText}`
                    : `Stored approximate sample lies on the horizontal axis near x ${current.xText}; this is not a certified root`,
            }));
        } else if (index > 0 && samples[index - 1].y * current.y < 0) {
            events.push(Object.freeze({
                type: "sampled-axis-crossing",
                sampleIndex: index,
                exactness: "approximate",
                label: `Sampled sign change between x ${samples[index - 1].xText} and ${current.xText}; this is not a certified root`,
            }));
        }
        if (index > 0 && index < samples.length - 1) {
            const before = samples[index - 1].y;
            const after = samples[index + 1].y;
            if ((current.y > before && current.y > after) || (current.y < before && current.y < after)) {
                events.push(Object.freeze({
                    type: "sampled-extremum",
                    sampleIndex: index,
                    exactness: "approximate",
                    label: `Sampled local ${current.y > before ? "maximum" : "minimum"} near (${current.xText}, ${current.yText}); this is not a certified extremum`,
                }));
            }
        }
    }
    return Object.freeze(events.sort((first, second) => first.sampleIndex - second.sampleIndex));
}

function seriesPlans(plot, format) {
    return Object.freeze(sequenceValue(mapField(plot, "series")).map((entry, seriesIndex) => {
        const lowered = sequenceValue(mapField(entry, "data"));
        const original = sequenceValue(mapField(entry, "originalData"));
        const samples = lowered.map((pointValue, index) => {
            const point = sequenceValue(pointValue);
            const retained = sequenceValue(original[index]);
            if (point.length < 2) return null;
            const x = finiteNumber(point[0]);
            const y = finiteNumber(point[1]);
            if (x === null || y === null) return null;
            const source = retained.length >= 2 ? retained : point;
            return Object.freeze({
                index,
                x,
                y,
                xText: valueText(source[0], format),
                yText: valueText(source[1], format),
                exactness: combinedExactness(source.slice(0, 2)),
            });
        }).filter(Boolean);
        const label = stringValue(mapField(entry, "label")) || `Series ${seriesIndex + 1}`;
        const normalizedExactness = samples.some((sample) => sample.exactness === "unresolved") ? "unresolved"
            : samples.some((sample) => sample.exactness === "conjectural") ? "conjectural"
                : samples.some((sample) => sample.exactness === "approximate") ? "approximate"
                    : samples.some((sample) => sample.exactness === "certified-enclosure") ? "certified-enclosure"
                        : "exact";
        return Object.freeze({
            id: stringValue(mapField(entry, "id")) || `series-${seriesIndex + 1}`,
            kind: stringValue(mapField(entry, "kind")) || "series",
            label,
            exactness: normalizedExactness,
            samples: Object.freeze(samples),
            events: sampleEvents(samples),
            summary: `${label}: ${samples.length} stored sample${samples.length === 1 ? "" : "s"}; ${normalizedExactness.replace("-", " ")} values`,
        });
    }));
}

function rangeRecord(view, axis, format) {
    const minimum = mapField(view, `${axis}min`);
    const maximum = mapField(view, `${axis}max`);
    if (minimum === null || maximum === null) return null;
    return Object.freeze({
        minimum: finiteNumber(minimum),
        maximum: finiteNumber(maximum),
        minimumText: valueText(minimum, format),
        maximumText: valueText(maximum, format),
        exactness: combinedExactness([minimum, maximum]),
    });
}

function regionDescriptions(value, format, noun) {
    return Object.freeze(sequenceValue(value).map((region, index) => {
        const bounds = sequenceValue(mapField(region, "bounds"));
        return bounds.length
            ? `${noun} ${index + 1}: ${bounds.map((bound) => valueText(bound, format)).join(", ")}`
            : `${noun} ${index + 1}: ${valueText(region, format)}`;
    }));
}

function retainedMarkEvents(plot, series, format) {
    return Object.freeze(sequenceValue(mapField(plot, "marks")).map((entry, index) => {
        const point = sequenceValue(mapField(entry, "point"));
        if (point.length < 2) return null;
        const x = finiteNumber(point[0]);
        const y = finiteNumber(point[1]);
        const reference = series[0];
        let sampleIndex = 0;
        if (reference?.samples.length && x !== null) {
            sampleIndex = reference.samples.reduce((best, sample, candidate) => (
                Math.abs(sample.x - x) < Math.abs(reference.samples[best].x - x) ? candidate : best
            ), 0);
        }
        const label = stringValue(mapField(entry, "label")) || `Mark ${index + 1}`;
        const exactness = combinedExactness(point.slice(0, 2));
        return Object.freeze({
            type: "selected-mark",
            sampleIndex,
            seriesId: reference?.id || null,
            exactness,
            label: `${label} at (${valueText(point[0], format)}, ${valueText(point[1], format)}); ${exactness.replace("-", " ")}`,
        });
    }).filter(Boolean));
}

function retainedIntersectionEvents(series) {
    const events = [];
    for (let firstIndex = 0; firstIndex < series.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < series.length; secondIndex += 1) {
            const first = series[firstIndex];
            const second = series[secondIndex];
            const count = Math.min(first.samples.length, second.samples.length);
            let previous = null;
            for (let index = 0; index < count; index += 1) {
                const left = first.samples[index];
                const right = second.samples[index];
                if (Math.abs(left.x - right.x) > Number.EPSILON * Math.max(1, Math.abs(left.x), Math.abs(right.x))) continue;
                const difference = left.y - right.y;
                const exact = difference === 0 && left.exactness === "exact" && right.exactness === "exact";
                const sampled = (difference === 0 && previous?.difference !== 0) || (previous && previous.difference * difference < 0);
                if (sampled) {
                    events.push(Object.freeze({
                        type: exact ? "intersection" : "sampled-intersection",
                        sampleIndex: index,
                        seriesId: first.id,
                        relatedSeriesId: second.id,
                        exactness: exact ? "exact" : "approximate",
                        label: exact
                            ? `Exact retained intersection of ${first.label} and ${second.label} at (${left.xText}, ${left.yText})`
                            : `Sampled intersection evidence for ${first.label} and ${second.label} near x ${left.xText}; this is not a certified intersection`,
                    }));
                }
                previous = { difference };
            }
        }
    }
    return Object.freeze(events);
}

/** Build a deterministic structured-language projection from retained semantics. */
export function createGraphicsTextPlan(graphic, format = String) {
    const plot = mapField(graphic?.metadata, "plot");
    const kind = (stringValue(mapField(plot, "kind")) || stringValue(mapField(graphic?.metadata, "kind")) || "mathematical").replaceAll("_", " ");
    const title = stringValue(mapField(plot, "title")) || `${kind[0]?.toUpperCase() || "M"}${kind.slice(1)} graphic`;
    const view = mapField(plot, "view") || mapField(graphic?.metadata, "view");
    const x = view ? rangeRecord(view, "x", format) : null;
    const y = view ? rangeRecord(view, "y", format) : null;
    const series = plot ? seriesPlans(plot, format) : Object.freeze([]);
    const objects = sceneObjects(graphic, format);
    const unresolved = plot ? regionDescriptions(mapField(plot, "unresolvedRegions"), format, "Unresolved region") : Object.freeze([]);
    const ambiguous = plot ? regionDescriptions(mapField(plot, "ambiguousRegions"), format, "Sampled boundary region") : Object.freeze([]);
    const marks = plot ? retainedMarkEvents(plot, series, format) : Object.freeze([]);
    const intersections = retainedIntersectionEvents(series);
    const pointsOfInterest = Object.freeze([...series.flatMap((entry) => entry.events), ...marks, ...intersections]);
    const domainSummary = x && y ? ` Domain x ${x.minimumText} to ${x.maximumText}; range y ${y.minimumText} to ${y.maximumText}.` : "";
    const summary = `${title}. ${series.length ? `${series.length} series and ` : ""}${objects.length} retained scene object${objects.length === 1 ? "" : "s"}.${domainSummary} ${unresolved.length} unresolved region${unresolved.length === 1 ? "" : "s"}.`;
    const axes = Object.freeze([
        x && Object.freeze({ axis: "x", label: stringValue(mapField(plot, "xLabel")) || "x", scale: stringValue(mapField(graphic?.metadata, "xScale")) || "linear", range: x }),
        y && Object.freeze({ axis: "y", label: stringValue(mapField(plot, "yLabel")) || "y", scale: stringValue(mapField(graphic?.metadata, "yScale")) || "linear", range: y }),
    ].filter(Boolean));
    return Object.freeze({
        schema: TEXT_SCHEMA,
        title,
        kind,
        summary,
        domain: Object.freeze({ x, y }),
        axes,
        series,
        objects,
        pointsOfInterest,
        marks,
        intersections,
        uncertainty: ambiguous,
        unresolved,
    });
}

const WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];

/** Build a renderer-neutral single-trace/sequential-overview sonification plan. */
export function createAudioTracePlan(graphic, format = String) {
    const textPlan = createGraphicsTextPlan(graphic, format);
    const series = Object.freeze(textPlan.series.filter((entry) => entry.samples.length > 0).map((entry, index) => Object.freeze({
        ...entry,
        waveform: WAVEFORMS[index % WAVEFORMS.length],
        stereoPosition: textPlan.series.length === 1 ? 0 : -1 + (2 * index / Math.max(1, textPlan.series.length - 1)),
    })));
    const allY = series.flatMap((entry) => entry.samples.map((sample) => sample.y));
    const yMinimum = textPlan.domain.y?.minimum ?? (allY.length ? Math.min(...allY) : null);
    const yMaximum = textPlan.domain.y?.maximum ?? (allY.length ? Math.max(...allY) : null);
    const supported = series.length > 0 && yMinimum !== null && yMaximum !== null;
    return Object.freeze({
        schema: AUDIO_SCHEMA,
        title: textPlan.title,
        supported,
        reason: supported ? null : "Audio trace requires retained two-dimensional series samples",
        domain: textPlan.domain.x,
        range: yMinimum === null ? null : Object.freeze({ minimum: yMinimum, maximum: yMaximum }),
        defaults: Object.freeze({ tempo: 12, speed: 1, waveform: "series", direction: "forward", stereo: true, frequency: Object.freeze({ minimum: 220, maximum: 880 }) }),
        series,
        events: Object.freeze([
            ...series.flatMap((entry) => entry.events.map((event) => Object.freeze({ ...event, seriesId: entry.id, seriesLabel: entry.label }))),
            ...textPlan.marks,
            ...textPlan.intersections,
        ]),
        diagnostics: Object.freeze(supported ? [] : [textPlan.summary, "The complete structured text projection remains available."]),
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function sampleRows(series) {
    const samples = series.samples;
    if (samples.length <= 32) return samples;
    const indexes = new Set([0, samples.length - 1]);
    for (let index = 1; index < 15; index += 1) indexes.add(Math.round(index * (samples.length - 1) / 15));
    return [...indexes].sort((a, b) => a - b).map((index) => samples[index]);
}

/** Static HTML alternative and audio transport. Hosts progressively enhance it. */
export function renderGraphicAccessibilityHtml(graphic, format = String) {
    const textPlan = createGraphicsTextPlan(graphic, format);
    const audioPlan = createAudioTracePlan(graphic, format);
    const axes = textPlan.axes.length ? `<dl class="rix-output-graphic-text-axes">${textPlan.axes.map((axis) => `<div><dt>${escapeHtml(axis.label)} axis</dt><dd>${escapeHtml(axis.scale)}; ${escapeHtml(axis.range.minimumText)} to ${escapeHtml(axis.range.maximumText)}; ${escapeHtml(axis.range.exactness.replace("-", " "))}</dd></div>`).join("")}</dl>` : "";
    const series = textPlan.series.map((entry) => {
        const rows = sampleRows(entry);
        const omitted = entry.samples.length - rows.length;
        return `<details class="rix-output-graphic-series"><summary>${escapeHtml(entry.summary)}</summary><table><caption>${escapeHtml(entry.label)} retained data${omitted ? `; ${omitted} intermediate samples omitted from this concise view` : ""}</caption><thead><tr><th scope="col">Sample</th><th scope="col">x</th><th scope="col">y</th><th scope="col">Status</th></tr></thead><tbody>${rows.map((sample) => `<tr><th scope="row">${sample.index + 1}</th><td>${escapeHtml(sample.xText)}</td><td>${escapeHtml(sample.yText)}</td><td>${escapeHtml(sample.exactness.replace("-", " "))}</td></tr>`).join("")}</tbody></table>${entry.events.length ? `<ul>${entry.events.map((event) => `<li>${escapeHtml(event.label)}</li>`).join("")}</ul>` : ""}</details>`;
    }).join("");
    const regions = [...textPlan.unresolved, ...textPlan.uncertainty];
    const semanticPoints = [...textPlan.marks, ...textPlan.intersections];
    const objects = `<details class="rix-output-graphic-objects"><summary>${textPlan.objects.length} semantic object${textPlan.objects.length === 1 ? "" : "s"}</summary><ol>${textPlan.objects.map((object) => `<li data-rix-graphics-text-object="${escapeHtml(object.id)}"${object.group ? ` data-rix-graphics-text-group="${escapeHtml(object.group)}"` : ""}><strong>${escapeHtml(object.label || object.role.replaceAll("_", " "))}</strong>: ${escapeHtml(object.description)}</li>`).join("")}</ol></details>`;
    const text = `<details class="rix-output-graphic-text" data-rix-graphics-text-schema="${TEXT_SCHEMA}"><summary>Text alternative: ${escapeHtml(textPlan.title)}</summary><p>${escapeHtml(textPlan.summary)}</p>${axes}${series}${semanticPoints.length ? `<section><h4>Semantic points of interest</h4><ul>${semanticPoints.map((event) => `<li>${escapeHtml(event.label)}</li>`).join("")}</ul></section>` : ""}${regions.length ? `<section><h4>Uncertainty and unresolved areas</h4><ul>${regions.map((region) => `<li>${escapeHtml(region)}</li>`).join("")}</ul></section>` : ""}${objects}</details>`;
    if (!audioPlan.supported) return text;
    const longest = Math.max(...audioPlan.series.map((entry) => entry.samples.length));
    const seriesOptions = `${audioPlan.series.map((entry, index) => `<option value="${index}">${escapeHtml(entry.label)}</option>`).join("")}${audioPlan.series.length > 1 ? '<option value="overview">Overview (sequential)</option>' : ""}`;
    const audio = `<section class="rix-output-audio-trace" data-rix-audio-trace-schema="${AUDIO_SCHEMA}" tabindex="0" aria-label="Audio trace controls for ${escapeHtml(audioPlan.title)}"><div class="rix-output-audio-toolbar" role="toolbar" aria-label="Audio trace transport"><button type="button" data-rix-audio-action="play" aria-label="Play audio trace">Play</button><button type="button" data-rix-audio-action="previous" aria-label="Previous sample">Previous</button><button type="button" data-rix-audio-action="next" aria-label="Next sample">Next</button><button type="button" data-rix-audio-action="mute" aria-pressed="false">Mute</button></div><div class="rix-output-audio-options"><label>Series <select data-rix-audio-series>${seriesOptions}</select></label><label>Seek <input data-rix-audio-seek type="range" min="0" max="${longest - 1}" value="0"></label><label>Domain start <input data-rix-audio-start type="number" min="1" max="${longest}" value="1"></label><label>Domain end <input data-rix-audio-end type="number" min="1" max="${longest}" value="${longest}"></label><label>Speed <select data-rix-audio-speed><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label>Waveform <select data-rix-audio-waveform><option value="series">Per series</option>${WAVEFORMS.map((waveform) => `<option value="${waveform}">${waveform}</option>`).join("")}</select></label><label>Direction <select data-rix-audio-direction><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label><label><input data-rix-audio-stereo type="checkbox" checked> Stereo position</label></div><output class="rix-output-audio-status" data-rix-audio-status aria-live="polite">Audio trace ready. No audio plays until Play is pressed.</output><small>Keyboard: Space play/pause, Left/Right step, Home/End seek, M mute.</small></section>`;
    return `${text}${audio}`;
}
