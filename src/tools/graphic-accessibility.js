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
                xText: valueText(source[0], ["exact", "certified-enclosure"].includes(graphicValueExactness(source[0])) ? String : format),
                yText: valueText(source[1], ["exact", "certified-enclosure"].includes(graphicValueExactness(source[1])) ? String : format),
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

function refinementPlans(plot, format) {
    const raw = mapField(plot, "refinement");
    const entries = sequenceValue(raw).length ? sequenceValue(raw) : raw ? [raw] : [];
    return Object.freeze(entries.map((entry, index) => {
        const level = mapField(entry, "level");
        const maxDepth = finiteNumber(mapField(entry, "maxDepth")) ?? 0;
        const reached = finiteNumber(mapField(entry, "maxDepthReached")) ?? 0;
        const processed = finiteNumber(mapField(entry, "processedCells")) ?? 0;
        const leaves = finiteNumber(mapField(entry, "leafCells")) ?? 0;
        const refined = finiteNumber(mapField(entry, "refinedCells")) ?? 0;
        const pointEvaluations = finiteNumber(mapField(entry, "pointEvaluations")) ?? 0;
        const intervalEvaluations = finiteNumber(mapField(entry, "intervalEvaluations")) ?? 0;
        const certifiedExcluded = finiteNumber(mapField(entry, "certifiedExcludedCells")) ?? 0;
        const certifiedInside = finiteNumber(mapField(entry, "certifiedInsideCells")) ?? 0;
        const certifiedOutside = finiteNumber(mapField(entry, "certifiedOutsideCells")) ?? 0;
        const enclosureCandidates = finiteNumber(mapField(entry, "enclosureCandidateCells")) ?? 0;
        const certifiedClassifications = certifiedExcluded + certifiedInside + certifiedOutside;
        const budgetStops = finiteNumber(mapField(entry, "budgetStops")) ?? 0;
        const prefix = level === null || level === undefined ? "Adaptive refinement" : `Adaptive refinement for level ${valueText(level, format)}`;
        const certification = intervalEvaluations > 0
            ? ` ${intervalEvaluations} certified interval enclosure evaluation${intervalEvaluations === 1 ? "" : "s"}; ${certifiedClassifications} proved whole-cell exclusion or classification and ${enclosureCandidates} remained enclosure candidate${enclosureCandidates === 1 ? "" : "s"}; drawn crossings remain sampled.`
            : " No interval certification was requested; classifications remain sampled.";
        return Object.freeze({
            id: `refinement-${index + 1}`,
            level: level === null || level === undefined ? null : valueText(level, format),
            maxDepth,
            reached,
            processed,
            leaves,
            refined,
            pointEvaluations,
            intervalEvaluations,
            certifiedExcluded,
            certifiedInside,
            certifiedOutside,
            certifiedClassifications,
            enclosureCandidates,
            budgetStops,
            certifiedIntervals: intervalEvaluations > 0,
            summary: `${prefix}: depth ${reached} of ${maxDepth}; ${processed} processed cells, ${leaves} leaves, ${refined} subdivisions, ${budgetStops} budget stops; ${pointEvaluations} rational point evaluations.${certification}`,
        });
    }).filter((entry) => entry.maxDepth > 0 || entry.intervalEvaluations > 0 || entry.refined > 0 || entry.budgetStops > 0));
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

function retainedFieldEvidenceEvents(plot, format) {
    return Object.freeze(sequenceValue(mapField(plot, "records")).map((record, index) => {
        const id = stringValue(mapField(record, "id")) || `field-record-${index + 1}`;
        const status = stringValue(mapField(record, "status")) || "unknown";
        const evidence = stringValue(mapField(record, "evidenceLevel")) || "none";
        const edgeEvidence = stringValue(mapField(record, "edgeExistenceEvidence"));
        const bounds = sequenceValue(mapField(record, "bounds"));
        const level = mapField(record, "level");
        if (edgeEvidence === "proof") {
            return Object.freeze({
                type: "certified-boundary-existence",
                id,
                exactness: "exact",
                label: `Boundary ${id}: continuity and exact endpoint signs prove that level ${valueText(level, format)} occurs on both retained cell edges by the intermediate value theorem; the drawn segment location remains sampled`,
            });
        }
        if (evidence === "proof") {
            const region = bounds.length ? ` over ${bounds.map((bound) => valueText(bound, format)).join(", ")}` : "";
            return Object.freeze({
                type: "certified-region",
                id,
                exactness: "certified-enclosure",
                label: `${id}: ${status.replaceAll("_", " ")} is certified for the retained region${region}`,
            });
        }
        return null;
    }).filter(Boolean));
}

function constructionRelations(graphic, format) {
    const workbench = mapField(graphic?.metadata, "workbench");
    const construction = mapField(workbench, "construction");
    return Object.freeze(sequenceValue(mapField(construction, "nodes")).map((node, index) => {
        const id = stringValue(mapField(node, "id")) || `construction-${index + 1}`;
        const dependencies = Object.freeze(sequenceValue(mapField(node, "dependsOn")).map((dependency) => valueText(dependency, format)));
        const kind = stringValue(mapField(node, "kind")) || (mapField(node, "free") ? "free point" : "derived object");
        const status = stringValue(mapField(node, "status")) || "resolved";
        return Object.freeze({
            id,
            kind,
            status,
            dependencies,
            summary: dependencies.length
                ? `${id}: ${kind.replaceAll("_", " ")}; depends on ${dependencies.join(", ")}; ${status.replaceAll("_", " ")}`
                : `${id}: ${kind.replaceAll("_", " ")}; no construction dependencies; ${status.replaceAll("_", " ")}`,
        });
    }));
}

/** Describe coordinate lowering without treating rounded pixels as exact data. */
export function createGraphicCoordinateDisclosure(graphic, lowering, format = String) {
    const metadata = lowering?.metadata?.coordinateLowering || lowering?.metadata || lowering;
    if (metadata?.schema !== "rix.svg.coordinate-lowering@1") return null;
    const clipping = [];
    const visit = (node, path) => {
        if (node?.kind === "clip") clipping.push(Object.freeze({
            path,
            bounds: Object.freeze(sequenceValue(node.bounds).map((value) => valueText(value, format))),
        }));
        for (const [index, child] of (node?.children || []).entries()) visit(child, `${path}.${node.kind}[${index + 1}]`);
    };
    visit(graphic, "graphic");
    const entries = Object.freeze(metadata.entries.map((entry) => Object.freeze({
        path: entry.path, role: entry.role, exact: entry.exact, lowered: entry.lowered,
        lower: entry.lower, upper: entry.upper, certified: entry.certified,
        approximated: entry.approximated, presentation: entry.presentation ?? null,
        source: entry.source ?? (entry.certified ? "exact-number" : "approximate-number"),
    })));
    const collisions = Object.freeze(metadata.collisions.map((entry) => Object.freeze({
        role: entry.role, lowered: entry.lowered, exact: Object.freeze([...entry.exact]),
    })));
    const retainedSeries = seriesPlans(mapField(graphic?.metadata, "plot"), format);
    const summary = `Coordinates use ${metadata.rounding} rounding at ${metadata.precision} decimal places. `
        + `${metadata.approximated} numeric values were approximated; ${collisions.length} distinct-value collision sets. `
        + `Exact geometry uses outward enclosure with radius ${metadata.enclosureRadius} SVG user units; this guarantee does not certify approximate inputs. `
        + (clipping.length ? `${clipping.length} explicit clip regions can hide geometry; retained coordinates remain inspectable.` : "No explicit clip regions; SVG overflow remains visible.");
    const text = [summary, stringValue(mapField(graphic?.metadata, "explorationText")) || "", ...entries.map((entry) => `${entry.path}: source ${entry.exact}; displayed ${entry.lowered}; `
        + (entry.certified ? `bounds ${entry.lower} to ${entry.upper}` : "approximate input, no certified bounds")
        + (entry.presentation ? `; ${entry.presentation} source order` : "")),
    ...collisions.map((entry) => `Collision (${entry.role}): ${entry.exact.join(", ")} display as ${entry.lowered}`),
    ...clipping.map((entry) => `Clip ${entry.path}: ${entry.bounds.join(", ")}`),
    ...retainedSeries.flatMap((series) => series.samples.map((sample) => `Retained ${series.label}, sample ${sample.index + 1}: (${sample.xText}, ${sample.yText}); ${sample.exactness}`))].join("\n");
    return Object.freeze({ schema: "rix.graphics.coordinate-disclosure@1", precision: metadata.precision,
        rounding: metadata.rounding, guarantee: metadata.guarantee, enclosureRadius: metadata.enclosureRadius,
        entries, collisions, clipping: Object.freeze(clipping), summary, text });
}

export function renderGraphicCoordinateDisclosureHtml(disclosure) {
    if (!disclosure) return "";
    const rows = disclosure.entries.map((entry) => `<tr><th scope="row">${escapeHtml(entry.path)}</th><td>${escapeHtml(entry.exact)}</td><td>${escapeHtml(entry.lowered)}</td><td>${entry.certified ? `${escapeHtml(entry.lower)} to ${escapeHtml(entry.upper)}` : "No certified bounds"}</td><td>${escapeHtml(entry.source)}${entry.presentation ? `; ${escapeHtml(entry.presentation)}` : ""}</td></tr>`).join("");
    const collisions = disclosure.collisions.map((entry) => `<li>${escapeHtml(entry.role)}: ${entry.exact.map(escapeHtml).join(", ")} display as ${escapeHtml(entry.lowered)}</li>`).join("");
    const clips = disclosure.clipping.map((entry) => `<li>${escapeHtml(entry.path)}: ${entry.bounds.map(escapeHtml).join(", ")}</li>`).join("");
    return `<details class="rix-output-graphic-coordinate-disclosure" data-rix-graphic-detail="coordinates"><summary>Coordinate rounding and uncertainty</summary><p>${escapeHtml(disclosure.summary)}</p><div class="rix-output-graphic-table-scroll" tabindex="0" role="region" aria-label="Exact and displayed graphic coordinates"><table><caption>Exact sources and displayed SVG coordinates</caption><thead><tr><th scope="col">Coordinate</th><th scope="col">Source</th><th scope="col">Displayed</th><th scope="col">Outward bounds</th><th scope="col">Status and order</th></tr></thead><tbody>${rows}</tbody></table></div>${collisions ? `<h4>Rounding collisions</h4><ul>${collisions}</ul>` : ""}${clips ? `<h4>Explicit clipping</h4><ul>${clips}</ul>` : ""}</details>`;
}

/** Build a deterministic structured-language projection from retained semantics. */
export function createGraphicsTextPlan(graphic, format = String, lowering = null) {
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
    const refinement = plot ? refinementPlans(plot, format) : Object.freeze([]);
    const marks = plot ? retainedMarkEvents(plot, series, format) : Object.freeze([]);
    const intersections = retainedIntersectionEvents(series);
    const fieldEvidence = plot ? retainedFieldEvidenceEvents(plot, format) : Object.freeze([]);
    const relations = constructionRelations(graphic, format);
    const pointsOfInterest = Object.freeze([...series.flatMap((entry) => entry.events), ...marks, ...intersections, ...fieldEvidence]);
    const domainSummary = x && y ? ` Domain x ${x.minimumText} to ${x.maximumText}; range y ${y.minimumText} to ${y.maximumText}.` : "";
    const summary = `${title}. ${series.length ? `${series.length} series and ` : ""}${objects.length} retained scene object${objects.length === 1 ? "" : "s"}.${domainSummary} ${unresolved.length} unresolved region${unresolved.length === 1 ? "" : "s"}.${refinement.length ? ` ${refinement.map((entry) => entry.summary).join(" ")}` : ""}`;
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
        fieldEvidence,
        relations,
        refinement,
        uncertainty: ambiguous,
        unresolved,
        coordinateDisclosure: createGraphicCoordinateDisclosure(graphic, lowering, format),
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
    const plot = mapField(graphic?.metadata, "plot");
    const settings = mapField(plot, "audio");
    const frequencyValues = sequenceValue(mapField(settings, "frequency"));
    const frequencyMinimum = finiteNumber(frequencyValues[0]);
    const frequencyMaximum = finiteNumber(frequencyValues[1]);
    const frequency = frequencyMinimum !== null && frequencyMaximum !== null && frequencyMinimum >= 20 && frequencyMaximum > frequencyMinimum && frequencyMaximum <= 20000
        ? Object.freeze({ minimum: frequencyMinimum, maximum: frequencyMaximum })
        : Object.freeze({ minimum: 220, maximum: 880 });
    const requestedTempo = finiteNumber(mapField(settings, "tempo"));
    const tempo = requestedTempo !== null ? Math.min(60, Math.max(1, requestedTempo)) : 12;
    const defaultCuePalette = { exact: 1320, certifiedEnclosure: 1100, approximate: 660, unresolved: 150, conjectural: 330, general: 440 };
    const requestedPalette = mapField(settings, "cuePalette");
    const cuePalette = Object.freeze(Object.fromEntries(Object.entries(defaultCuePalette).map(([key, fallback]) => {
        const requested = finiteNumber(mapField(requestedPalette, key));
        return [key, requested !== null && requested >= 20 && requested <= 20000 ? requested : fallback];
    })));
    return Object.freeze({
        schema: AUDIO_SCHEMA,
        title: textPlan.title,
        supported,
        reason: supported ? null : "Audio trace requires retained two-dimensional series samples",
        domain: textPlan.domain.x,
        range: yMinimum === null ? null : Object.freeze({ minimum: yMinimum, maximum: yMaximum }),
        preferencesKey: stringValue(mapField(plot, "preferencesKey")),
        defaults: Object.freeze({ tempo, speed: 1, waveform: "series", direction: "forward", stereo: true, frequency, cuePalette }),
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

/** Static HTML alternative and audio transport. Hosts progressively enhance it. */
export function renderGraphicAccessibilityHtml(graphic, format = String, lowering = null) {
    const textPlan = createGraphicsTextPlan(graphic, format, lowering);
    const audioPlan = createAudioTracePlan(graphic, format);
    const axes = textPlan.axes.length ? `<dl class="rix-output-graphic-text-axes">${textPlan.axes.map((axis) => `<div><dt>${escapeHtml(axis.label)} axis</dt><dd>${escapeHtml(axis.scale)}; ${escapeHtml(axis.range.minimumText)} to ${escapeHtml(axis.range.maximumText)}; ${escapeHtml(axis.range.exactness.replace("-", " "))}</dd></div>`).join("")}</dl>` : "";
    const series = textPlan.series.map((entry) => {
        const rows = entry.samples;
        return `<details class="rix-output-graphic-series" data-rix-graphic-detail="series:${escapeHtml(entry.id)}"><summary>${escapeHtml(entry.summary)}</summary><table><caption>${escapeHtml(entry.label)} retained data</caption><thead><tr><th scope="col">Sample</th><th scope="col">x</th><th scope="col">y</th><th scope="col">Status</th></tr></thead><tbody>${rows.map((sample) => `<tr><th scope="row">${sample.index + 1}</th><td>${escapeHtml(sample.xText)}</td><td>${escapeHtml(sample.yText)}</td><td>${escapeHtml(sample.exactness.replace("-", " "))}</td></tr>`).join("")}</tbody></table>${entry.events.length ? `<ul>${entry.events.map((event) => `<li>${escapeHtml(event.label)}</li>`).join("")}</ul>` : ""}</details>`;
    }).join("");
    const regions = [...textPlan.unresolved, ...textPlan.uncertainty];
    const semanticPoints = [...textPlan.marks, ...textPlan.intersections, ...textPlan.fieldEvidence];
    const objects = `<details class="rix-output-graphic-objects" data-rix-graphic-detail="objects"><summary>${textPlan.objects.length} semantic object${textPlan.objects.length === 1 ? "" : "s"}</summary><ol>${textPlan.objects.map((object) => `<li tabindex="-1" data-rix-graphics-text-object="${escapeHtml(object.id)}"${object.group ? ` data-rix-graphics-text-group="${escapeHtml(object.group)}"` : ""}><strong>${escapeHtml(object.label || object.role.replaceAll("_", " "))}</strong>: ${escapeHtml(object.description)}</li>`).join("")}</ol></details>`;
    const text = `<details class="rix-output-graphic-text" data-rix-graphic-detail="text" data-rix-graphics-text-schema="${TEXT_SCHEMA}"><summary>Text alternative: ${escapeHtml(textPlan.title)}</summary><p>${escapeHtml(textPlan.summary)}</p>${axes}${series}${textPlan.refinement.length ? `<section><h4>Adaptive refinement evidence</h4><ul>${textPlan.refinement.map((entry) => `<li>${escapeHtml(entry.summary)}</li>`).join("")}</ul></section>` : ""}${semanticPoints.length ? `<section><h4>Semantic points of interest</h4><ul>${semanticPoints.map((event) => `<li>${escapeHtml(event.label)}</li>`).join("")}</ul></section>` : ""}${textPlan.relations.length ? `<section><h4>Construction dependencies</h4><ol>${textPlan.relations.map((relation) => `<li data-rix-graphics-relation="${escapeHtml(relation.id)}">${escapeHtml(relation.summary)}</li>`).join("")}</ol></section>` : ""}${renderGraphicCoordinateDisclosureHtml(textPlan.coordinateDisclosure)}${regions.length ? `<section><h4>Uncertainty and unresolved areas</h4><ul>${regions.map((region) => `<li>${escapeHtml(region)}</li>`).join("")}</ul></section>` : ""}${objects}</details>`;
    if (!audioPlan.supported) return text;
    const longest = Math.max(...audioPlan.series.map((entry) => entry.samples.length));
    const seriesOptions = `${audioPlan.series.map((entry, index) => `<option value="${index}">${escapeHtml(entry.label)}</option>`).join("")}${audioPlan.series.length > 1 ? '<option value="overview">Overview (sequential)</option>' : ""}`;
    const audio = `<section class="rix-output-audio-trace" data-rix-audio-trace-schema="${AUDIO_SCHEMA}"${audioPlan.preferencesKey ? ` data-rix-audio-preferences-key="${escapeHtml(audioPlan.preferencesKey)}"` : ""} tabindex="0" aria-label="Audio trace controls for ${escapeHtml(audioPlan.title)}"><div class="rix-output-audio-toolbar" role="toolbar" aria-label="Audio trace transport"><button type="button" data-rix-audio-action="play" aria-label="Play audio trace">Play</button><button type="button" data-rix-audio-action="previous" aria-label="Previous sample">Previous</button><button type="button" data-rix-audio-action="next" aria-label="Next sample">Next</button><button type="button" data-rix-audio-action="mute" aria-pressed="false">Mute</button></div><div class="rix-output-audio-options"><label>Series <select data-rix-audio-series>${seriesOptions}</select></label><label>Seek <input data-rix-audio-seek type="range" min="0" max="${longest - 1}" value="0"></label><label>Domain start <input data-rix-audio-start type="number" min="1" max="${longest}" value="1"></label><label>Domain end <input data-rix-audio-end type="number" min="1" max="${longest}" value="${longest}"></label><label>Speed <select data-rix-audio-speed><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label>Tempo <input data-rix-audio-tempo type="number" min="1" max="60" step="1" value="${audioPlan.defaults.tempo}"></label><label>Low pitch (Hz) <input data-rix-audio-frequency-min type="number" min="20" max="19999" value="${audioPlan.defaults.frequency.minimum}"></label><label>High pitch (Hz) <input data-rix-audio-frequency-max type="number" min="21" max="20000" value="${audioPlan.defaults.frequency.maximum}"></label><label>Cues <select data-rix-audio-cues><option value="detailed">Detailed</option><option value="minimal">Minimal</option><option value="off">Off</option></select></label><label>Waveform <select data-rix-audio-waveform><option value="series">Per series</option>${WAVEFORMS.map((waveform) => `<option value="${waveform}">${waveform}</option>`).join("")}</select></label><label>Direction <select data-rix-audio-direction><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label><label><input data-rix-audio-stereo type="checkbox" checked> Stereo position</label></div><output class="rix-output-audio-status" data-rix-audio-status aria-live="polite">Audio trace ready. No audio plays until Play is pressed.</output><small>Keyboard: Space play/pause, Left/Right step, Home/End seek, M mute.</small></section>`;
    return `${text}${audio}`;
}
