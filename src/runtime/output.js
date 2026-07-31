/** Portable structured-output values and host-neutral render helpers. */

import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { isTensor, tensorGetBySelectors } from "./tensor.js";
import { isBinding } from "./binding.js";
import { FORMULA_SHEET_ASSIGNMENT_MODES, isFormulaSheet } from "./formula-sheet.js";
import { coordinateTuple, resolveLabeledCoordinate } from "./sheet-labels.js";
import { isReactiveNode } from "./reactive-graph.js";

const int = (value) => new Integer(BigInt(value));
const isSequence = (value) => value && ["sequence", "tuple", "set", "array"].includes(value.type);
const asString = (value) => value?.type === "string" ? value.value : typeof value === "string" ? value : null;

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (isSequence(value)) return value.values || value.elements || [];
    throw new Error(`${label} must be an array, tuple, or sequence`);
}

function map(value, label) {
    if (value?.type !== "map" || !(value.entries instanceof Map)) throw new Error(`${label} must be a map`);
    return value.entries;
}

function get(entries, name, fallback = null) {
    if (entries.has(name)) return entries.get(name);
    const canonical = String(name).toLowerCase();
    return entries.has(canonical) ? entries.get(canonical) : fallback;
}

function has(entries, name) {
    const canonical = String(name).toLowerCase();
    return [...entries.keys()].some((key) => String(key).toLowerCase() === canonical);
}

function optionalMap(value, label) {
    return value === null || value === undefined ? null : map(value, label);
}

function spec(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map") return map(args[0], `${name} specification`);
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    return new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
}

function output(kind, fields, methods = []) {
    return Object.freeze({
        type: "output",
        kind,
        ...fields,
        _ext: new Map([
            ["_type", { type: "string", value: "output" }],
            ["kind", { type: "string", value: kind }],
            ["immutable", int(1)],
            ...methods,
        ]),
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function sheetMethods() {
    const index = (target, selector, label) => resolveLabeledCoordinate(
        target.shape,
        { axes: target.axes, axisLabels: target.axisLabels },
        selector,
        label,
    );
    const cellAt = (target, coordinate) => {
        for (const plane of target.planes) {
            for (const row of plane.cells) {
                const cell = row.find((candidate) => candidate.index.every(
                    (item, axis) => item === coordinate[axis],
                ));
                if (cell) return cell;
            }
        }
        throw new Error(`Sheet coordinate is unavailable: [${coordinate.join(",")}]`);
    };
    return [
        ["INDEX", method("Index", ([target, selector]) =>
            coordinateTuple(index(target, selector, "Sheet.Index")))],
        ["AT", method("At", ([target, selector]) =>
            cellAt(target, index(target, selector, "Sheet.At")).value)],
    ];
}

function exactInteger(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    throw new Error(`${label} must be an integer`);
}

function exactNumber(value, label) {
    if (value instanceof Integer || value instanceof Rational) return value;
    throw new Error(`${label} must be an exact integer or rational`);
}

function exactRational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value);
    throw new Error(`${label} must be an exact integer or rational`);
}

function positiveCount(value, label) {
    if (!(value instanceof Integer) || value.value <= 0n) {
        throw new Error(`${label} must be a positive integer`);
    }
    const count = Number(value.value);
    if (!Number.isSafeInteger(count) || count > 10000) {
        throw new Error(`${label} must be at most 10000`);
    }
    return count;
}

function reactiveTarget(entry, name) {
    const target = get(entry, "target");
    if (!isReactiveNode(target)) {
        throw new Error(`${name} target must be a reactive $$name identity`);
    }
    return target;
}

function exactScale(interval, stepValue, stepsValue, name) {
    if (!(interval instanceof RationalInterval)) {
        throw new Error(`${name} interval must be a RiX interval such as 0:10`);
    }
    const low = interval.low;
    const high = interval.high;
    const span = high.subtract(low);
    if (span.numerator === 0n) throw new Error(`${name} interval endpoints must differ`);
    if (stepValue !== null && stepsValue !== null) {
        throw new Error(`${name} accepts either step or steps, not both`);
    }
    let steps;
    let step;
    if (stepsValue !== null) {
        steps = positiveCount(stepsValue, `${name} steps`);
        step = span.divide(new Integer(BigInt(steps)));
    } else {
        step = stepValue === null ? span.divide(new Integer(20n)) : exactRational(stepValue, `${name} step`);
        if (step.numerator <= 0n) throw new Error(`${name} step must be positive`);
        const ratio = span.divide(step);
        const count = ratio.numerator / ratio.denominator;
        if (count < 1n || count > 10000n) {
            throw new Error(`${name} step must produce between 1 and 10000 positions`);
        }
        steps = Number(count);
    }
    return { low, high, step, steps };
}

function scaleIndex(value, scale, label) {
    const exact = exactRational(value, label);
    const indexValue = exact.subtract(scale.low).divide(scale.step);
    if (indexValue.denominator !== 1n) {
        const stepKind = label.includes("Slider") ? "slider" : "control";
        throw new Error(`${label} must lie on an exact ${stepKind} step`);
    }
    const index = Number(indexValue.numerator);
    if (!Number.isSafeInteger(index) || index < 0 || index > scale.steps) {
        throw new Error(`${label} must lie within its interval`);
    }
    return index;
}

function controlValuesEqual(left, right) {
    if (left === right) return true;
    if ((left instanceof Integer || left instanceof Rational)
        && (right instanceof Integer || right instanceof Rational)) {
        const a = exactRational(left, "Control value");
        const b = exactRational(right, "Control value");
        return a.numerator === b.numerator && a.denominator === b.denominator;
    }
    if (left instanceof RationalInterval && right instanceof RationalInterval) {
        return controlValuesEqual(left.start, right.start) && controlValuesEqual(left.end, right.end);
    }
    const leftString = asString(left);
    const rightString = asString(right);
    if (leftString !== null || rightString !== null) return leftString === rightString;
    return false;
}

function numericValue(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`${label} must be a finite number`);
}

function normalizeColumns(value) {
    return sequence(value, "Table columns").map((column, index) => {
        const label = asString(column);
        if (label !== null) return { id: `column${index + 1}`, label, align: null, format: null };
        const entry = map(column, `Table column ${index + 1}`);
        const id = asString(get(entry, "id")) || `column${index + 1}`;
        return { id, label: asString(get(entry, "label")) || id, align: asString(get(entry, "align")), format: get(entry, "format") };
    });
}

export function isOutputValue(value) {
    return Boolean(value && value.type === "output" && typeof value.kind === "string");
}

export function createText(args) {
    const entry = spec(args, ["value", "style"], "Text");
    const value = get(entry, "value");
    if (value === null) throw new Error("Text requires a value");
    return output("text", { value, style: optionalMap(get(entry, "style"), "Text style") });
}

export function createParagraph(args) {
    const entry = spec(args, ["children", "style"], "Paragraph");
    const childrenValue = get(entry, "children");
    const children = isSequence(childrenValue) || Array.isArray(childrenValue)
        ? sequence(childrenValue, "Paragraph children")
        : [childrenValue];
    return output("paragraph", { children, style: optionalMap(get(entry, "style"), "Paragraph style") });
}

export function createHeading(args) {
    const entry = spec(args, ["level", "content", "id", "style"], "Heading");
    const level = exactInteger(get(entry, "level"), "Heading level");
    if (level < 1 || level > 6) throw new Error("Heading level must be between 1 and 6");
    const content = get(entry, "content");
    if (content === null) throw new Error("Heading requires content");
    return output("heading", { level, content, id: asString(get(entry, "id")), style: optionalMap(get(entry, "style"), "Heading style") });
}

export function createFragment(args) {
    const entry = spec(args, ["children", "metadata"], "Fragment");
    return output("fragment", { children: sequence(get(entry, "children"), "Fragment children"), metadata: optionalMap(get(entry, "metadata"), "Fragment metadata") });
}

export function createTable(args) {
    const entry = spec(args, ["columns", "rows", "options"], "Table");
    const columns = normalizeColumns(get(entry, "columns"));
    const rows = sequence(get(entry, "rows"), "Table rows").map((row, index) => {
        const cells = sequence(row, `Table row ${index + 1}`);
        if (cells.length !== columns.length) throw new Error(`Table row ${index + 1} has ${cells.length} cells; expected ${columns.length}`);
        return [...cells];
    });
    return output("table", { columns, rows, caption: asString(get(entry, "caption")), options: optionalMap(get(entry, "options"), "Table options") });
}

export function createGrid(args) {
    const entry = spec(args, ["columns", "rows", "rules", "style"], "Grid");
    const columns = sequence(get(entry, "columns"), "Grid columns");
    const rows = sequence(get(entry, "rows"), "Grid rows").map((row, index) => {
        const cells = sequence(row, `Grid row ${index + 1}`);
        if (cells.length !== columns.length) throw new Error(`Grid row ${index + 1} has ${cells.length} cells; expected ${columns.length}`);
        return [...cells];
    });
    return output("grid", {
        columns,
        rows,
        rules: sequence(get(entry, "rules", { type: "sequence", values: [] }), "Grid rules"),
        style: optionalMap(get(entry, "style"), "Grid style"),
    });
}

export function createSliderControl(args) {
    const entry = spec(args, ["target", "interval", "step", "label"], "Controls.Slider");
    const target = reactiveTarget(entry, "Controls.Slider");
    const interval = get(entry, "interval");
    const scale = exactScale(interval, get(entry, "step"), get(entry, "steps"), "Controls.Slider");

    const value = exactRational(target.get(), "Controls.Slider target value");
    const index = scaleIndex(value, scale, "Controls.Slider target value");

    return output("control_slider", {
        id: asString(get(entry, "id")) || `${target.id}:slider`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        ...scale,
        index,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createInputControl(args) {
    const entry = spec(args, ["target", "label", "help", "placeholder"], "Controls.Input");
    const target = reactiveTarget(entry, "Controls.Input");
    return output("control_input", {
        id: asString(get(entry, "id")) || `${target.id}:input`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        placeholder: asString(get(entry, "placeholder")) || "RiX expression",
        target,
        targetId: target.id,
        value: target.get(),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

function normalizeChoiceOptions(value) {
    return sequence(value, "Controls.Choice options").map((option, index) => {
        if (option?.type !== "map") return Object.freeze({ value: option, label: asString(option) });
        const entries = map(option, `Controls.Choice option ${index + 1}`);
        const optionValue = get(entries, "value");
        if (!has(entries, "value")) throw new Error(`Controls.Choice option ${index + 1} requires value`);
        return Object.freeze({ value: optionValue, label: asString(get(entries, "label")) });
    });
}

export function createChoiceControl(args) {
    const entry = spec(args, ["target", "options", "label"], "Controls.Choice");
    const target = reactiveTarget(entry, "Controls.Choice");
    const options = normalizeChoiceOptions(get(entry, "options"));
    if (options.length === 0) throw new Error("Controls.Choice requires at least one option");
    const value = target.get();
    const index = options.findIndex((option) => controlValuesEqual(option.value, value));
    if (index === -1) throw new Error("Controls.Choice target value must match one of its options");
    return output("control_choice", {
        id: asString(get(entry, "id")) || `${target.id}:choice`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        options: Object.freeze(options),
        index,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createToggleControl(args) {
    const entry = spec(args, ["target", "off", "on", "label"], "Controls.Toggle");
    const target = reactiveTarget(entry, "Controls.Toggle");
    const off = get(entry, "off");
    const on = get(entry, "on");
    if (!has(entry, "off") || !has(entry, "on")) throw new Error("Controls.Toggle requires explicit off and on values");
    const value = target.get();
    const index = controlValuesEqual(value, off) ? 0 : controlValuesEqual(value, on) ? 1 : -1;
    if (index === -1) throw new Error("Controls.Toggle target value must match its off or on value");
    return output("control_toggle", {
        id: asString(get(entry, "id")) || `${target.id}:toggle`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        values: Object.freeze([off, on]),
        index,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createRangeControl(args) {
    const entry = spec(args, ["target", "interval", "step", "label"], "Controls.Range");
    const target = reactiveTarget(entry, "Controls.Range");
    const scale = exactScale(get(entry, "interval"), get(entry, "step"), get(entry, "steps"), "Controls.Range");
    const value = target.get();
    if (!(value instanceof RationalInterval)) throw new Error("Controls.Range target value must be an exact RiX interval");
    const indices = Object.freeze([
        scaleIndex(value.low, scale, "Controls.Range lower endpoint"),
        scaleIndex(value.high, scale, "Controls.Range upper endpoint"),
    ]);
    return output("control_range", {
        id: asString(get(entry, "id")) || `${target.id}:range`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        ...scale,
        indices,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createResetControl(args) {
    const entry = spec(args, ["target", "initial", "label"], "Controls.Reset");
    const target = reactiveTarget(entry, "Controls.Reset");
    const initial = get(entry, "initial");
    if (!has(entry, "initial")) throw new Error("Controls.Reset requires an explicit initial value snapshot");
    return output("control_reset", {
        id: asString(get(entry, "id")) || `${target.id}:reset`,
        label: asString(get(entry, "label")) || `Reset ${target.name}`,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value: target.get(),
        initial,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createControlPanel(args) {
    const entry = spec(args, ["controls", "title", "description"], "ControlPanel");
    const controls = sequence(get(entry, "controls"), "ControlPanel controls");
    if (!controls.every((control) => isOutputValue(control) && control.kind.startsWith("control_"))) {
        throw new Error("ControlPanel entries must be values created by .Controls");
    }
    return output("control_panel", {
        controls: Object.freeze([...controls]),
        title: asString(get(entry, "title")),
        description: asString(get(entry, "description")),
        metadata: optionalMap(get(entry, "metadata"), "ControlPanel metadata"),
    });
}

function sheetData(value) {
    const binding = isBinding(value) ? value : null;
    if (binding) value = binding.get();

    if (isFormulaSheet(value)) {
        return {
            kind: "formula_sheet",
            binding: null,
            formulaSheet: value,
            shape: [...value.shape],
            // Failed formulas keep their last committed value available for
            // diagnostic rendering even though direct `get` correctly throws.
            at: (index) => value.slot(index).value,
            formulaSourceAt: (index) => value.slot(index).source,
            formulaMetadataAt: (index) => {
                const slot = value.slot(index);
                return {
                    slotId: slot.id,
                    assignmentMode: slot.assignmentMode,
                    blank: slot.view?.blank === true,
                    state: slot.state,
                    dependencies: slot.dependencies,
                    diagnostics: slot.diagnostics,
                    diagnosticKind: slot.diagnosticKind,
                    diagnosticSource: slot.diagnosticSource,
                };
            },
        };
    }

    if (isTensor(value)) {
        if (value.shape.length === 0) throw new Error("Sheet data must have rank 1 or greater");
        return {
            kind: "tensor",
            binding,
            shape: [...value.shape],
            at: (index) => tensorGetBySelectors(
                value,
                index.map((item) => ({ kind: "index", value: item })),
            ),
        };
    }

    if (value?.type === "matrix" && Array.isArray(value.rows)) {
        const rows = value.rows.map((row, index) => sequence(row, `Sheet matrix row ${index + 1}`));
        const columns = rows[0]?.length ?? 0;
        if (!rows.every((row) => row.length === columns)) throw new Error("Sheet matrix rows must have equal lengths");
        return {
            kind: "matrix",
            binding,
            shape: [rows.length, columns],
            at: ([row, column]) => rows[row - 1][column - 1],
        };
    }

    if (Array.isArray(value) || isSequence(value)) {
        const values = sequence(value, "Sheet data");
        const nested = values.length > 0 && values.every((item) => Array.isArray(item) || isSequence(item));
        if (nested) {
            const rows = values.map((row, index) => sequence(row, `Sheet row ${index + 1}`));
            const columns = rows[0]?.length ?? 0;
            if (!rows.every((row) => row.length === columns)) throw new Error("Sheet rows must have equal lengths");
            return {
                kind: "sequence",
                binding,
                shape: [rows.length, columns],
                at: ([row, column]) => rows[row - 1][column - 1],
            };
        }
        return {
            kind: "sequence",
            binding,
            shape: [values.length],
            at: ([row]) => values[row - 1],
        };
    }

    throw new Error("Sheet data must be a tensor, matrix, array, tuple, or sequence");
}

function normalizedSheetIndex(value, length, label) {
    const index = exactInteger(value, label);
    const normalized = index < 0 ? length + index + 1 : index;
    if (normalized < 1 || normalized > length) {
        throw new Error(`${label} ${index} is out of range for length ${length}`);
    }
    return normalized;
}

function spreadsheetColumnLabel(index) {
    let label = "";
    let current = index;
    while (current > 0) {
        current -= 1;
        label = String.fromCharCode(65 + (current % 26)) + label;
        current = Math.floor(current / 26);
    }
    return label;
}

function sheetColumnLabel(index, mode) {
    if (mode === "letters") return spreadsheetColumnLabel(index);
    if (mode === "numbers") return String(index);
    return `${spreadsheetColumnLabel(index)} · ${index}`;
}

function sheetDisplayAddress(row, column, mode) {
    return mode === "numbers" ? `R${row}C${column}` : `${spreadsheetColumnLabel(column)}${row}`;
}

function sheetPlaneKey(slice, hiddenAxes) {
    return hiddenAxes.map(({ axis }) => `${axis}:${slice[axis - 1]}`).join(",");
}

function sheetPlaneSlices(shape, initialSlice, hiddenAxes) {
    let slices = [initialSlice.map((item) => item)];
    for (const { axis } of hiddenAxes) {
        slices = slices.flatMap((slice) => Array.from({ length: shape[axis - 1] }, (_item, index) => {
            const next = slice.map((item) => item);
            next[axis - 1] = index + 1;
            return next;
        }));
    }
    return slices;
}

function sheetField(entry, options, name, fallback = null) {
    const optionValue = options ? get(options, name) : null;
    return optionValue ?? get(entry, name, fallback);
}

function documentViewField(view, name, fallback = null) {
    if (!view || typeof view !== "object" || Array.isArray(view)) return fallback;
    if (Object.hasOwn(view, name)) return view[name];
    const canonical = String(name).toLowerCase();
    const key = Object.keys(view).find((candidate) => candidate.toLowerCase() === canonical);
    return key === undefined ? fallback : view[key];
}

function sheetOption(entry, options, documentView, name, fallback = null) {
    const explicit = sheetField(entry, options, name);
    return explicit ?? documentViewField(documentView, name, fallback);
}

/**
 * Create a portable sheet snapshot from rank-1+ indexable data.
 *
 * Passing an ordinary value produces an immutable snapshot. Passing a Binding
 * also retains the live binding so a host-owned WidgetSession can route
 * semantic edits back to the source Cell.
 */
export function createSheet(args) {
    const entry = spec(args, ["data", "options"], "Sheet");
    const data = sheetData(get(entry, "data"));
    const optionsValue = get(entry, "options");
    const options = optionsValue === null || optionsValue === undefined
        ? null
        : map(optionsValue, "Sheet options");
    const refreshOptions = options
        ? new Map(options)
        : new Map([...entry].filter(([name]) => !["data", "options"].includes(String(name).toLowerCase())));
    const rank = data.shape.length;
    const documentView = data.formulaSheet?.documentView ?? null;

    const viewAxesValue = sheetOption(entry, options, documentView, "viewAxes");
    const defaultViewAxes = rank === 1 ? [1] : [1, 2];
    const viewAxes = viewAxesValue === null
        ? defaultViewAxes
        : sequence(viewAxesValue, "Sheet viewAxes").map((axis, index) =>
            normalizedSheetIndex(axis, rank, `Sheet view axis ${index + 1}`));
    const expectedViewAxisCount = rank === 1 ? 1 : 2;
    if (viewAxes.length !== expectedViewAxisCount) {
        throw new Error(`Sheet viewAxes must contain ${expectedViewAxisCount} ${expectedViewAxisCount === 1 ? "axis" : "axes"}`);
    }
    if (new Set(viewAxes).size !== viewAxes.length) throw new Error("Sheet viewAxes must be distinct");

    const visibleAxes = new Set(viewAxes);
    const sliceValue = sheetOption(entry, options, documentView, "slice");
    const requestedSlice = sliceValue === null ? null : sequence(sliceValue, "Sheet slice");
    if (requestedSlice !== null && requestedSlice.length !== rank) {
        throw new Error(`Sheet slice must contain ${rank} entries`);
    }
    const slice = requestedSlice === null
        ? data.shape.map((_length, index) => visibleAxes.has(index + 1) ? null : 1)
        : requestedSlice.map((item, index) => {
            const axis = index + 1;
            if (visibleAxes.has(axis)) {
                if (item !== null) throw new Error(`Sheet slice axis ${axis} must be _ because it is visible`);
                return null;
            }
            if (data.shape[index] === 0) throw new Error(`Sheet cannot select empty hidden axis ${axis}`);
            return normalizedSheetIndex(item, data.shape[index], `Sheet slice axis ${axis}`);
        });

    const axesValue = sheetOption(entry, options, documentView, "axes");
    const axes = axesValue === null
        ? data.shape.map((_length, index) => `axis${index + 1}`)
        : sequence(axesValue, "Sheet axes").map((axis, index) => {
            const name = asString(axis);
            if (name === null || name.length === 0) throw new Error(`Sheet axis ${index + 1} must have a nonempty string name`);
            return name;
        });
    if (axes.length !== rank) throw new Error(`Sheet axes must contain ${rank} names`);

    const axisLabelsValue = sheetOption(entry, options, documentView, "axisLabels");
    const axisLabels = axisLabelsValue === null
        ? data.shape.map(() => null)
        : sequence(axisLabelsValue, "Sheet axisLabels").map((labels, axisIndex) => {
            if (labels === null) return null;
            const values = sequence(labels, `Sheet axisLabels axis ${axisIndex + 1}`);
            if (values.length !== data.shape[axisIndex]) {
                throw new Error(
                    `Sheet axisLabels axis ${axisIndex + 1} must contain ${data.shape[axisIndex]} labels`,
                );
            }
            return Object.freeze(values.map((label, labelIndex) => {
                if (label === null) return null;
                const name = asString(label);
                if (name === null || name.length === 0) {
                    throw new Error(
                        `Sheet axisLabels axis ${axisIndex + 1} label ${labelIndex + 1} must be a nonempty string`,
                    );
                }
                return name;
            }));
        });
    if (axisLabels.length !== rank) {
        throw new Error(`Sheet axisLabels must contain ${rank} axis entries`);
    }

    const defaultAddress = data.binding?.name || "grid";
    const addressBase = asString(sheetOption(
        entry,
        options,
        documentView,
        "address",
        { type: "string", value: defaultAddress },
    ));
    if (addressBase === null || addressBase.length === 0) throw new Error("Sheet address must be a nonempty string");
    const columnLabelMode = asString(sheetOption(
        entry,
        options,
        documentView,
        "columnLabels",
        { type: "string", value: "dual" },
    ));
    if (!["dual", "letters", "numbers"].includes(columnLabelMode)) {
        throw new Error("Sheet columnLabels must be :dual, :letters, or :numbers");
    }
    const titleValue = sheetOption(entry, options, documentView, "title");
    const title = titleValue === null ? null : asString(titleValue);
    if (titleValue !== null && title === null) throw new Error("Sheet title must be a string");

    const rowAxis = viewAxes[0];
    const columnAxis = viewAxes[1] ?? null;
    const rowCount = data.shape[rowAxis - 1];
    const columnCount = columnAxis === null ? 1 : data.shape[columnAxis - 1];
    const rowHeaders = Array.from({ length: rowCount }, (_item, index) => {
        const label = axisLabels[rowAxis - 1]?.[index] ?? null;
        return label === null ? String(index + 1) : `${label} · ${index + 1}`;
    });
    const columnHeaders = Array.from({ length: columnCount }, (_item, index) => {
        const label = columnAxis === null ? null : axisLabels[columnAxis - 1]?.[index] ?? null;
        const fallback = sheetColumnLabel(index + 1, columnLabelMode);
        return label === null ? fallback : `${label} · ${index + 1}`;
    });
    const hiddenAxes = data.shape.map((length, index) => ({
        axis: index + 1,
        name: axes[index],
        length,
        selected: slice[index],
        ...(axisLabels[index]
            ? {
                labels: axisLabels[index].map((label, coordinate) =>
                    label === null ? String(coordinate + 1) : `${label} · ${coordinate + 1}`),
                selectedLabel: axisLabels[index][slice[index] - 1],
            }
            : {}),
    })).filter(({ axis }) => !visibleAxes.has(axis));
    const cellsForSlice = (planeSlice) => Array.from({ length: rowCount }, (_row, rowIndex) =>
        Array.from({ length: columnCount }, (_column, columnIndex) => {
            const index = planeSlice.map((item) => item);
            index[rowAxis - 1] = rowIndex + 1;
            if (columnAxis !== null) index[columnAxis - 1] = columnIndex + 1;
            const formulaMetadata = data.formulaMetadataAt?.(index) ?? null;
            const coordinateLabels = index.map((coordinate, axisIndex) =>
                axisLabels[axisIndex]?.[coordinate - 1] ?? null);
            return Object.freeze({
                value: data.at(index),
                formulaSource: data.formulaSourceAt?.(index) ?? null,
                slotId: formulaMetadata?.slotId ?? null,
                assignmentMode: formulaMetadata?.assignmentMode ?? null,
                blank: formulaMetadata?.blank === true,
                state: formulaMetadata?.state ?? "clean",
                dependencies: Object.freeze([...(formulaMetadata?.dependencies ?? [])]),
                diagnostics: Object.freeze([...(formulaMetadata?.diagnostics ?? [])]),
                diagnosticKind: formulaMetadata?.diagnosticKind ?? null,
                diagnosticSource: formulaMetadata?.diagnosticSource ?? null,
                index: Object.freeze(index),
                coordinateLabels: Object.freeze(coordinateLabels),
                coordinateLabel: coordinateLabels.filter((label) => label !== null).join(" / ") || null,
                address: `${addressBase}[${index.join(",")}]`,
                displayAddress: sheetDisplayAddress(rowIndex + 1, columnIndex + 1, columnLabelMode),
            });
        }));
    const planes = sheetPlaneSlices(data.shape, slice, hiddenAxes).map((planeSlice) => Object.freeze({
        key: sheetPlaneKey(planeSlice, hiddenAxes),
        slice: Object.freeze(planeSlice),
        cells: Object.freeze(cellsForSlice(planeSlice).map((row) => Object.freeze(row))),
    }));
    const selectedPlaneKey = sheetPlaneKey(slice, hiddenAxes);
    const cells = planes.find((plane) => plane.key === selectedPlaneKey)?.cells ?? planes[0].cells;

    return output("sheet", {
        sourceKind: data.kind,
        formulaSheet: data.formulaSheet ?? null,
        formulaBacked: Boolean(data.formulaSheet),
        binding: data.binding,
        bindingId: data.binding?.id ?? null,
        editable: Boolean(data.binding || data.formulaSheet),
        editMode: data.formulaSheet ? "formula" : data.binding ? "value" : null,
        rank,
        shape: Object.freeze([...data.shape]),
        axes: Object.freeze(axes),
        axisLabels: Object.freeze(axisLabels),
        viewAxes: Object.freeze(viewAxes),
        slice: Object.freeze(slice),
        addressBase,
        title,
        columnLabelMode,
        showAxisSummary: axesValue !== null || axisLabelsValue !== null,
        rowAxis: Object.freeze({ axis: rowAxis, name: axes[rowAxis - 1] }),
        columnAxis: columnAxis === null
            ? null
            : Object.freeze({ axis: columnAxis, name: axes[columnAxis - 1] }),
        rowHeaders: Object.freeze(rowHeaders),
        columnHeaders: Object.freeze(columnHeaders),
        hiddenAxes: Object.freeze(hiddenAxes.map((axis) => Object.freeze(axis))),
        selectedPlaneKey,
        planes: Object.freeze(planes),
        cells,
        options: refreshOptions.size > 0 ? refreshOptions : null,
    }, sheetMethods());
}

/**
 * Detach a live Sheet from its Binding for persistence or static export.
 *
 * Cell values and plane records are already immutable snapshots, so detaching
 * only removes the runtime handle and live-edit marker.
 */
export function createSheetSnapshot(sheet) {
    if (!isOutputValue(sheet) || sheet.kind !== "sheet") throw new Error("Expected a Sheet output value");
    if (!sheet.editable && !sheet.formulaBacked) return sheet;
    return output("sheet", {
        ...sheet,
        binding: null,
        bindingId: null,
        editable: false,
        editMode: null,
        formulaSheet: null,
        formulaBacked: false,
    });
}

export function createPath(args) {
    const entry = spec(args, ["points", "style"], "Path");
    const commands = get(entry, "commands");
    const points = get(entry, "points");
    if (commands !== null && commands !== undefined) {
        return output("path", {
            commands: sequence(commands, "Path commands"),
            points: null,
            style: optionalMap(get(entry, "style"), "Path style"),
        });
    }
    return output("path", {
        commands: null,
        points: sequence(points, "Path points"),
        style: optionalMap(get(entry, "style"), "Path style"),
    });
}

export function createGroup(args) {
    const entry = spec(args, ["children", "style", "metadata"], "Group");
    return output("group", {
        children: sequence(get(entry, "children"), "Group children"),
        style: optionalMap(get(entry, "style"), "Group style"),
        metadata: optionalMap(get(entry, "metadata"), "Group metadata"),
    });
}

export function createTransform(args) {
    const entry = spec(args, ["children", "transform", "style"], "Transform");
    const transform = optionalMap(get(entry, "transform"), "Transform specification") || entry;
    return output("transform", {
        children: sequence(get(entry, "children"), "Transform children"),
        translate: get(transform, "translate"),
        scale: get(transform, "scale"),
        rotate: get(transform, "rotate"),
        origin: get(transform, "origin"),
        style: optionalMap(get(entry, "style"), "Transform style"),
    });
}

export function createTextMark(args) {
    const entry = spec(args, ["position", "text", "style"], "TextMark");
    const position = sequence(get(entry, "position"), "TextMark position");
    if (position.length !== 2) throw new Error("TextMark position must contain x and y coordinates");
    const text = get(entry, "text");
    if (text === null || text === undefined) throw new Error("TextMark requires text");
    return output("text_mark", { position, text, style: optionalMap(get(entry, "style"), "TextMark style") });
}

export function createRectangle(args) {
    const entry = spec(args, ["origin", "size", "style"], "Rectangle");
    const origin = sequence(get(entry, "origin"), "Rectangle origin");
    const size = sequence(get(entry, "size"), "Rectangle size");
    if (origin.length !== 2 || size.length !== 2) throw new Error("Rectangle origin and size must each contain x and y coordinates");
    return output("rectangle", { origin, size, style: optionalMap(get(entry, "style"), "Rectangle style") });
}

export function createCircle(args) {
    const entry = spec(args, ["center", "radius", "style"], "Circle");
    const center = sequence(get(entry, "center"), "Circle center");
    if (center.length !== 2) throw new Error("Circle center must contain x and y coordinates");
    const radius = get(entry, "radius");
    if (radius === null || radius === undefined) throw new Error("Circle requires a radius");
    return output("circle", { center, radius, style: optionalMap(get(entry, "style"), "Circle style") });
}

export function createDragPoint(args) {
    const entry = spec(args, ["target", "radius", "style", "label"], "DragPoint");
    const target = get(entry, "target");
    if (!isReactiveNode(target)) {
        throw new Error("DragPoint target must be a ReactiveGraph node");
    }
    const center = sequence(target.get(), "DragPoint target value");
    if (center.length !== 2) {
        throw new Error("DragPoint target value must contain x and y coordinates");
    }
    return output("drag_point", {
        center: Object.freeze([...center]),
        radius: get(entry, "radius", int(7)),
        style: optionalMap(get(entry, "style"), "DragPoint style"),
        label: asString(get(entry, "label")) || "Draggable point",
        target,
        targetId: target.id,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createClip(args) {
    const entry = spec(args, ["children", "bounds", "style"], "Clip");
    const bounds = sequence(get(entry, "bounds"), "Clip bounds");
    if (bounds.length !== 4) throw new Error("Clip bounds must contain x, y, width, and height");
    return output("clip", { children: sequence(get(entry, "children"), "Clip children"), bounds, style: optionalMap(get(entry, "style"), "Clip style") });
}

export function createGraphic(args) {
    const entry = spec(args, ["size", "children", "metadata"], "Graphic");
    const size = sequence(get(entry, "size"), "Graphic size");
    if (size.length !== 2) throw new Error("Graphic size must contain width and height");
    return output("graphic", { size, children: sequence(get(entry, "children"), "Graphic children"), metadata: optionalMap(get(entry, "metadata"), "Graphic metadata") });
}

export function createFigure(args) {
    const entry = spec(args, ["content", "caption", "label", "alt"], "Figure");
    const content = get(entry, "content");
    if (content === null) throw new Error("Figure requires content");
    return output("figure", { content, caption: asString(get(entry, "caption")), label: asString(get(entry, "label")), alt: asString(get(entry, "alt")) });
}

export function createSlide(args) {
    const entry = spec(args, ["content", "title", "id", "notes", "metadata"], "Slide");
    const content = get(entry, "content");
    if (content === null) throw new Error("Slide requires content");
    return output("slide", { content, title: asString(get(entry, "title")), id: asString(get(entry, "id")), notes: asString(get(entry, "notes")), metadata: optionalMap(get(entry, "metadata"), "Slide metadata") });
}

export function createSlides(args) {
    const entry = spec(args, ["slides", "title", "theme", "metadata"], "Slides");
    const slides = sequence(get(entry, "slides"), "Slides entries");
    if (!slides.every((slide) => isOutputValue(slide) && slide.kind === "slide")) throw new Error("Slides requires an array of Slide values");
    return output("slides", { slides, title: asString(get(entry, "title")), theme: asString(get(entry, "theme")), metadata: optionalMap(get(entry, "metadata"), "Slides metadata") });
}

export function createSyntheticDivision(root, coefficients) {
    root = exactNumber(root, "SyntheticDivision root");
    const values = sequence(coefficients, "SyntheticDivision coefficients").map((value, index) => exactNumber(value, `SyntheticDivision coefficient ${index + 1}`));
    if (values.length < 2) throw new Error("SyntheticDivision requires at least two coefficients");
    const products = Array(values.length).fill(null);
    const bottom = Array(values.length).fill(null);
    bottom[0] = values[0];
    for (let index = 1; index < values.length; index += 1) {
        products[index] = root.multiply(bottom[index - 1]);
        bottom[index] = values[index].add(products[index]);
    }
    return output("grid", {
        columns: Array.from({ length: values.length + 1 }, () => null),
        rows: [[root, ...values], [null, null, ...products.slice(1)], [null, ...bottom]],
        rules: [{ kind: "vertical", afterColumn: 1 }, { kind: "horizontal", aboveRow: 3 }],
        style: new Map([["align", { type: "string", value: "right" }]]),
        semantic: { type: "synthetic_division", root, coefficients: values, products, bottom },
    });
}

/**
 * A deliberately small, portable plotting helper.  It produces an ordinary
 * Graphic made of Paths, so every host can render or serialize the result
 * without depending on a browser plotting library.
 */
export function createPolynomialPlot(coefficients, domain, options = null) {
    const values = sequence(coefficients, "Polynomial coefficients").map((value, index) => exactNumber(value, `Polynomial coefficient ${index + 1}`));
    if (values.length < 2) throw new Error("Plot.Polynomial requires at least two coefficients");
    const bounds = sequence(domain, "Polynomial plot domain");
    if (bounds.length !== 2) throw new Error("Polynomial plot domain must have a lower and upper bound");
    const xMin = numericValue(bounds[0], "Polynomial plot lower bound");
    const xMax = numericValue(bounds[1], "Polynomial plot upper bound");
    if (!(xMin < xMax)) throw new Error("Polynomial plot domain must increase");

    const optionEntries = options === null || options === undefined ? new Map() : map(options, "Polynomial plot options");
    const requestedSize = get(optionEntries, "size", null);
    const size = requestedSize === null ? [640, 360] : sequence(requestedSize, "Polynomial plot size").map((value, index) => numericValue(value, `Polynomial plot size ${index + 1}`));
    if (size.length !== 2 || size.some((value) => value <= 0)) throw new Error("Polynomial plot size must contain positive width and height");
    const samplesValue = get(optionEntries, "samples", null);
    const samples = samplesValue === null ? 161 : exactInteger(samplesValue, "Polynomial plot samples");
    if (samples < 2 || samples > 10000) throw new Error("Polynomial plot samples must be between 2 and 10000");
    const marginValue = get(optionEntries, "margin", null);
    const margin = marginValue === null ? 36 : numericValue(marginValue, "Polynomial plot margin");
    if (margin < 0 || margin * 2 >= Math.min(...size)) throw new Error("Polynomial plot margin is too large for its size");

    const coefficientNumbers = values.map((value) => numericValue(value, "Polynomial coefficient"));
    const evaluatePolynomial = (x) => coefficientNumbers.reduce((total, coefficient) => total * x + coefficient, 0);
    const samplesData = Array.from({ length: samples }, (_, index) => {
        const x = xMin + (xMax - xMin) * index / (samples - 1);
        return [x, evaluatePolynomial(x)];
    });
    let yMin = Math.min(0, ...samplesData.map(([, y]) => y));
    let yMax = Math.max(0, ...samplesData.map(([, y]) => y));
    if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
    }
    const yPadding = (yMax - yMin) * 0.08;
    yMin -= yPadding;
    yMax += yPadding;

    const [width, height] = size;
    const toPoint = ([x, y]) => [
        margin + (x - xMin) / (xMax - xMin) * (width - margin * 2),
        height - margin - (y - yMin) / (yMax - yMin) * (height - margin * 2),
    ];
    const curveStyle = new Map([
        ["stroke", get(optionEntries, "stroke", { type: "string", value: "#2563eb" })],
        ["width", get(optionEntries, "width", int(2))],
        ["fill", { type: "string", value: "none" }],
    ]);
    const axisStyle = new Map([
        ["stroke", { type: "string", value: "#64748b" }],
        ["width", int(1)],
        ["dash", { type: "string", value: "3 3" }],
        ["fill", { type: "string", value: "none" }],
    ]);
    const children = [];
    if (yMin <= 0 && yMax >= 0) children.push(output("path", { points: [toPoint([xMin, 0]), toPoint([xMax, 0])], style: axisStyle }));
    if (xMin <= 0 && xMax >= 0) children.push(output("path", { points: [toPoint([0, yMin]), toPoint([0, yMax])], style: axisStyle }));
    children.push(output("path", { points: samplesData.map(toPoint), style: curveStyle }));
    return output("graphic", {
        size: [int(Math.round(width)), int(Math.round(height))],
        children,
        metadata: new Map([["kind", { type: "string", value: "polynomial_plot" }]]),
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function cellText(value, format) {
    return value === null || value === undefined ? "" : format(value);
}

function ruleField(rule, name) {
    if (rule?.type === "map" && rule.entries instanceof Map) return get(rule.entries, name);
    return rule?.[name] ?? null;
}

function hasRule(grid, kind, value) {
    const field = kind === "vertical" ? "afterColumn" : "aboveRow";
    return grid.rules.some((rule) => {
        const ruleKind = asString(ruleField(rule, "kind")) ?? ruleField(rule, "kind");
        const ruleValue = ruleField(rule, field);
        return ruleKind === kind && (ruleValue === value || numericValue(ruleValue, `Grid ${field}`) === value);
    });
}

function styleEntry(style, name) {
    if (!(style instanceof Map)) return null;
    if (style.has(name)) return style.get(name);
    return style.get(String(name).toLowerCase()) ?? null;
}

function svgNumber(value, label) {
    const number = numericValue(value, label);
    if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
    return Number(number.toFixed(6)).toString();
}

function svgPoint(value, index) {
    const point = sequence(value, `Path point ${index + 1}`);
    if (point.length !== 2) throw new Error(`Path point ${index + 1} must contain x and y coordinates`);
    return [svgNumber(point[0], `Path point ${index + 1} x`), svgNumber(point[1], `Path point ${index + 1} y`)];
}

function svgPair(value, label) {
    const pair = sequence(value, label);
    if (pair.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return [svgNumber(pair[0], `${label} x`), svgNumber(pair[1], `${label} y`)];
}

function sceneField(value, name) {
    if (value?.type === "map" && value.entries instanceof Map) return get(value.entries, name);
    return value?.[name] ?? null;
}

function svgFlag(value, label) {
    if (value === true) return "1";
    if (value === false || value === null || value === undefined) return "0";
    return numericValue(value, label) === 0 ? "0" : "1";
}

function svgPathData(path) {
    if (!path.commands) {
        if (path.points.length === 0) return "";
        const points = path.points.map(svgPoint);
        const closed = styleEntry(path.style, "closed")?.value === 1n || styleEntry(path.style, "closed") === true;
        return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ") + (closed ? " Z" : "");
    }
    return path.commands.map((command, index) => {
        const op = (asString(sceneField(command, "op")) ?? sceneField(command, "op") ?? "").toLowerCase();
        const destination = () => svgPair(sceneField(command, "to"), `Path command ${index + 1} destination`);
        if (op === "move" || op === "m") {
            const [x, y] = destination();
            return `M${x} ${y}`;
        }
        if (op === "line" || op === "l") {
            const [x, y] = destination();
            return `L${x} ${y}`;
        }
        if (op === "quadratic" || op === "quad" || op === "q") {
            const [cx, cy] = svgPair(sceneField(command, "control"), `Path command ${index + 1} control`);
            const [x, y] = destination();
            return `Q${cx} ${cy} ${x} ${y}`;
        }
        if (op === "cubic" || op === "curve" || op === "c") {
            const [c1x, c1y] = svgPair(sceneField(command, "control1"), `Path command ${index + 1} control1`);
            const [c2x, c2y] = svgPair(sceneField(command, "control2"), `Path command ${index + 1} control2`);
            const [x, y] = destination();
            return `C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`;
        }
        if (op === "arc" || op === "a") {
            const [rx, ry] = svgPair(sceneField(command, "radius"), `Path command ${index + 1} radius`);
            const rotation = svgNumber(sceneField(command, "rotation") ?? int(0), `Path command ${index + 1} rotation`);
            const large = svgFlag(sceneField(command, "large"), `Path command ${index + 1} large flag`);
            const sweep = svgFlag(sceneField(command, "sweep"), `Path command ${index + 1} sweep flag`);
            const [x, y] = destination();
            return `A${rx} ${ry} ${rotation} ${large} ${sweep} ${x} ${y}`;
        }
        if (op === "close" || op === "z") return "Z";
        throw new Error(`Unsupported Path command '${op || "(missing op)"}'`);
    }).join(" ");
}

function svgStyle(style, defaultFill = null) {
    const attrs = [];
    const stroke = asString(styleEntry(style, "stroke"));
    const fill = asString(styleEntry(style, "fill"));
    const dash = asString(styleEntry(style, "dash"));
    const opacity = styleEntry(style, "opacity");
    const width = styleEntry(style, "width") ?? styleEntry(style, "strokeWidth");
    if (fill || defaultFill !== null) attrs.push(`fill="${escapeHtml(fill || defaultFill)}"`);
    if (stroke) attrs.push(`stroke="${escapeHtml(stroke)}"`);
    if (width !== null && width !== undefined) attrs.push(`stroke-width="${svgNumber(width, "Path stroke width")}"`);
    if (dash) attrs.push(`stroke-dasharray="${escapeHtml(dash)}"`);
    if (opacity !== null && opacity !== undefined) attrs.push(`opacity="${svgNumber(opacity, "Path opacity")}"`);
    return attrs.join(" ");
}

function svgTransform(node) {
    const transforms = [];
    if (node.translate !== null && node.translate !== undefined) {
        const [x, y] = svgPair(node.translate, "Transform translate");
        transforms.push(`translate(${x} ${y})`);
    }
    if (node.rotate !== null && node.rotate !== undefined) {
        const angle = svgNumber(node.rotate, "Transform rotate");
        const origin = node.origin === null || node.origin === undefined ? null : svgPair(node.origin, "Transform origin");
        transforms.push(origin ? `rotate(${angle} ${origin[0]} ${origin[1]})` : `rotate(${angle})`);
    }
    if (node.scale !== null && node.scale !== undefined) {
        const scale = isSequence(node.scale) || Array.isArray(node.scale)
            ? svgPair(node.scale, "Transform scale")
            : [svgNumber(node.scale, "Transform scale"), svgNumber(node.scale, "Transform scale")];
        transforms.push(`scale(${scale[0]} ${scale[1]})`);
    }
    return transforms.join(" ");
}

function renderSvgText(node, format) {
    const [x, y] = svgPair(node.position, "TextMark position");
    const anchor = asString(styleEntry(node.style, "anchor"));
    const size = styleEntry(node.style, "size") ?? styleEntry(node.style, "fontSize");
    const font = asString(styleEntry(node.style, "font"));
    const weight = asString(styleEntry(node.style, "weight"));
    const attrs = [svgStyle(node.style, "currentColor")];
    if (anchor) attrs.push(`text-anchor="${escapeHtml(anchor)}"`);
    if (size !== null && size !== undefined) attrs.push(`font-size="${svgNumber(size, "TextMark size")}"`);
    if (font) attrs.push(`font-family="${escapeHtml(font)}"`);
    if (weight) attrs.push(`font-weight="${escapeHtml(weight)}"`);
    return `<text x="${x}" y="${y}" ${attrs.filter(Boolean).join(" ")}>${escapeHtml(cellText(node.text, format))}</text>`;
}

function renderSvgNode(node, format, defs) {
    if (!isOutputValue(node)) return "";
    if (node.kind === "path") {
        const d = svgPathData(node);
        if (!d) return "";
        return `<path d="${d}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "rectangle") {
        const [x, y] = svgPair(node.origin, "Rectangle origin");
        const [width, height] = svgPair(node.size, "Rectangle size");
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "circle") {
        const [cx, cy] = svgPair(node.center, "Circle center");
        return `<circle cx="${cx}" cy="${cy}" r="${svgNumber(node.radius, "Circle radius")}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "drag_point") {
        const [cx, cy] = svgPair(node.center, "DragPoint center");
        const replaced = node.replacesDependencies?.length
            ? ` data-rix-replaces-dependencies="${escapeHtml(node.replacesDependencies.join(","))}"`
            : "";
        return `<circle class="rix-output-drag-point" cx="${cx}" cy="${cy}" r="${svgNumber(node.radius, "DragPoint radius")}" ${svgStyle(node.style, "#7c3aed")} tabindex="0" role="button" aria-label="${escapeHtml(node.label)}" data-rix-drag-target="${escapeHtml(node.targetId)}" data-rix-position="${cx},${cy}"${replaced}/>`;
    }
    if (node.kind === "text_mark") return renderSvgText(node, format);
    if (node.kind === "group") return `<g ${svgStyle(node.style)}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    if (node.kind === "transform") {
        const transform = svgTransform(node);
        return `<g${transform ? ` transform="${transform}"` : ""}${svgStyle(node.style) ? ` ${svgStyle(node.style)}` : ""}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    }
    if (node.kind === "clip") {
        const [x, y, width, height] = node.bounds.map((value, index) => svgNumber(value, `Clip bounds ${index + 1}`));
        const id = `rix-clip-${defs.length + 1}`;
        defs.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);
        return `<g clip-path="url(#${id})"${svgStyle(node.style) ? ` ${svgStyle(node.style)}` : ""}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    }
    return "";
}

export function renderGraphicSvg(graphic, format = (item) => String(item ?? "")) {
    if (!isOutputValue(graphic) || graphic.kind !== "graphic") throw new Error("Expected a Graphic output value");
    const size = graphic.size.map((value, index) => svgNumber(value, `Graphic size ${index + 1}`));
    const defs = [];
    const children = graphic.children.map((child) => renderSvgNode(child, format, defs)).join("");
    return `<svg class="rix-output-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size[0]} ${size[1]}" width="${size[0]}" height="${size[1]}" role="img">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${children}</svg>`;
}

function graphicIsInteractive(graphic) {
    const visit = (node) => {
        if (!isOutputValue(node)) return false;
        if (node.kind === "drag_point") return true;
        return Array.isArray(node.children) && node.children.some(visit);
    };
    return graphic.children.some(visit);
}

function formatSheetText(sheet, format) {
    const strings = sheet.cells.map((row) => row.map((cell) =>
        cell.blank ? "" : cell.value === null ? "_" : cellText(cell.value, format)));
    const rowHeaderWidth = Math.max(1, ...sheet.rowHeaders.map((header) => header.length));
    const columnWidths = sheet.columnHeaders.map((header, column) =>
        Math.max(header.length, 1, ...strings.map((row) => row[column]?.length ?? 0)));
    const heading = [
        sheet.title ? `Sheet: ${sheet.title}` : "Sheet",
        sheet.addressBase,
        `shape ${sheet.shape.join("×")}`,
        sheet.showAxisSummary
            ? `rows ${sheet.rowAxis.name} (axis ${sheet.rowAxis.axis})`
            : `view axes ${sheet.viewAxes.join(",")}`,
        sheet.showAxisSummary && sheet.columnAxis
            ? `columns ${sheet.columnAxis.name} (axis ${sheet.columnAxis.axis})`
            : null,
        ...sheet.hiddenAxes.map((axis) =>
            `${axis.name} ${axis.selectedLabel ?? axis.selected} (axis ${axis.axis}:${axis.selected})`),
    ].filter(Boolean).join(" · ");
    const header = `${"".padStart(rowHeaderWidth)}  ${sheet.columnHeaders
        .map((label, column) => label.padStart(columnWidths[column]))
        .join("  ")}`;
    const rows = strings.map((row, rowIndex) =>
        `${sheet.rowHeaders[rowIndex].padStart(rowHeaderWidth)}  ${row
            .map((cell, column) => cell.padStart(columnWidths[column]))
            .join("  ")}`);
    return [heading, header, ...rows].join("\n");
}

export function formatOutputText(value, format) {
    if (!isOutputValue(value)) return format(value);
    if (value.kind === "live_view") return formatOutputText(value.current, format);
    if (value.kind === "text") return cellText(value.value, format);
    if (value.kind === "paragraph") return value.children.map((child) => cellText(child, format)).join("");
    if (value.kind === "heading") return `${"#".repeat(value.level)} ${cellText(value.content, format)}`;
    if (value.kind === "fragment") return value.children.map((child) => formatOutputText(child, format)).join("\n\n");
    if (value.kind === "control_slider") {
        return `${value.label}: ${cellText(value.value, format)} (${cellText(value.low, format)} … ${cellText(value.high, format)})`;
    }
    if (value.kind === "control_input") return `${value.label}: ${cellText(value.value, format)}`;
    if (value.kind === "control_choice" || value.kind === "control_toggle") {
        return `${value.label}: ${cellText(value.value, format)}`;
    }
    if (value.kind === "control_range") {
        return `${value.label}: ${cellText(value.value, format)} within ${cellText(value.low, format)} … ${cellText(value.high, format)}`;
    }
    if (value.kind === "control_reset") {
        return `${value.label}: ${cellText(value.value, format)} → ${cellText(value.initial, format)}`;
    }
    if (value.kind === "control_panel") {
        return [value.title, value.description, ...value.controls.map((control) => formatOutputText(control, format))]
            .filter(Boolean)
            .join("\n");
    }
    if (value.kind === "table") {
        const strings = value.rows.map((row) => row.map((cell) => cellText(cell, format)));
        const widths = value.columns.map((column, index) => Math.max(column.label.length, ...strings.map((row) => row[index].length)));
        const line = (row) => row.map((cell, index) => String(cell).padStart(widths[index])).join("  ");
        return [value.caption, line(value.columns.map((column) => column.label)), widths.map((width) => "-".repeat(width)).join("  "), ...strings.map(line)].filter(Boolean).join("\n");
    }
    if (value.kind === "grid") {
        const strings = value.rows.map((row) => row.map((cell) => cellText(cell, format)));
        const widths = value.columns.map((_, index) => Math.max(1, ...strings.map((row) => row[index].length)));
        const lines = [];
        for (let index = 0; index < strings.length; index += 1) {
            if (hasRule(value, "horizontal", index + 1)) lines.push(`  ${widths.slice(1).map((width) => "-".repeat(width + 2)).join("")}`);
            const parts = strings[index].map((cell, column) => cell.padStart(widths[column]));
            lines.push(hasRule(value, "vertical", 1) ? `${parts[0]} │ ${parts.slice(1).join("  ")}` : parts.join("  "));
        }
        return lines.join("\n");
    }
    if (value.kind === "sheet") return formatSheetText(value, format);
    if (value.kind === "figure") return [formatOutputText(value.content, format), value.caption].filter(Boolean).join("\n");
    if (value.kind === "graphic") return `[Graphic: ${cellText(value.size[0], format)} × ${cellText(value.size[1], format)}, ${value.children.length} scene nodes]`;
    if (value.kind === "path") return value.commands ? `[Path: ${value.commands.length} commands]` : `[Path: ${value.points.length} points]`;
    if (value.kind === "slide") return [value.title, formatOutputText(value.content, format)].filter(Boolean).join("\n");
    if (value.kind === "slides") return value.slides.map((slide, index) => `Slide ${index + 1}:\n${formatOutputText(slide, format)}`).join("\n\n");
    return `[Output: ${value.kind}]`;
}

export function renderOutputHtml(value, format = (item) => String(item ?? "")) {
    const text = (item) => escapeHtml(isOutputValue(item) ? formatOutputText(item, format) : cellText(item, format));
    if (!isOutputValue(value)) return `<pre>${text(value)}</pre>`;
    if (value.kind === "live_view") {
        return `<section class="rix-output-live-view" data-rix-live-view="${escapeHtml(value.id)}" data-rix-live-revision="${value.revision}">${renderOutputHtml(value.current, format)}</section>`;
    }
    if (value.kind === "text") return `<span class="rix-output-text">${text(value.value)}</span>`;
    if (value.kind === "paragraph") return `<p class="rix-output-paragraph">${value.children.map(text).join("")}</p>`;
    if (value.kind === "heading") return `<h${value.level} class="rix-output-heading">${text(value.content)}</h${value.level}>`;
    if (value.kind === "fragment") return `<section class="rix-output-fragment">${value.children.map((child) => renderOutputHtml(child, format)).join("")}</section>`;
    if (value.kind === "control_slider") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-slider" data-rix-control-kind="slider" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><input type="range" min="0" max="${value.steps}" step="1" value="${value.index}" data-rix-control-input aria-label="${escapeHtml(value.label)}"><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</label>`;
    }
    if (value.kind === "control_input") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-input" data-rix-control-kind="input" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><span class="rix-output-control-input-row"><input type="text" value="${text(value.value)}" placeholder="${escapeHtml(value.placeholder)}" data-rix-control-input aria-label="${escapeHtml(value.label)}"><button type="button" data-rix-control-commit>Set</button></span><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</label>`;
    }
    if (value.kind === "control_choice") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        const options = value.options.map((option, index) => `<option value="${index}"${index === value.index ? " selected" : ""}>${escapeHtml(option.label ?? cellText(option.value, format))}</option>`).join("");
        return `<label class="rix-output-control rix-output-control-choice" data-rix-control-kind="choice" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><select data-rix-control-input aria-label="${escapeHtml(value.label)}">${options}</select><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</label>`;
    }
    if (value.kind === "control_toggle") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-toggle" data-rix-control-kind="toggle" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><input type="checkbox"${value.index === 1 ? " checked" : ""} data-rix-control-input aria-label="${escapeHtml(value.label)}"><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</label>`;
    }
    if (value.kind === "control_range") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<fieldset class="rix-output-control rix-output-control-range" data-rix-control-kind="range" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><legend class="rix-output-control-label">${escapeHtml(value.label)}</legend><span class="rix-output-control-range-inputs"><input type="range" min="0" max="${value.steps}" step="1" value="${value.indices[0]}" data-rix-control-input data-rix-control-endpoint="low" aria-label="${escapeHtml(value.label)} lower endpoint"><input type="range" min="0" max="${value.steps}" step="1" value="${value.indices[1]}" data-rix-control-input data-rix-control-endpoint="high" aria-label="${escapeHtml(value.label)} upper endpoint"></span><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</fieldset>`;
    }
    if (value.kind === "control_reset") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<div class="rix-output-control rix-output-control-reset" data-rix-control-kind="reset" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><button type="button" data-rix-control-input aria-label="${escapeHtml(value.label)}">Reset</button><output data-rix-control-value>${text(value.value)}</output>${value.help ? `<small>${escapeHtml(value.help)}</small>` : ""}</div>`;
    }
    if (value.kind === "control_panel") {
        return `<section class="rix-output-control-panel" data-rix-interactive="true">${value.title ? `<h3>${escapeHtml(value.title)}</h3>` : ""}${value.description ? `<p>${escapeHtml(value.description)}</p>` : ""}<div class="rix-output-control-list">${value.controls.map((control) => renderOutputHtml(control, format)).join("")}</div><output class="rix-output-control-status" aria-live="polite"></output></section>`;
    }
    if (value.kind === "table") return `<table class="rix-output-table">${value.caption ? `<caption>${escapeHtml(value.caption)}</caption>` : ""}<thead><tr>${value.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${value.rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "grid") return `<table class="rix-output-grid"><tbody>${value.rows.map((row, rowIndex) => `<tr${hasRule(value, "horizontal", rowIndex + 1) ? " class=\"rix-grid-rule-top\"" : ""}>${row.map((cell, column) => `<td${hasRule(value, "vertical", column + 1) ? " class=\"rix-grid-rule-left\"" : ""}>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "sheet") {
        const summary = `${value.addressBase} · shape ${value.shape.join("×")}`;
        const axisSummary = value.columnAxis
            ? `Rows: ${value.rowAxis.name} · Columns: ${value.columnAxis.name}`
            : `Rows: ${value.rowAxis.name}`;
        const controls = value.hiddenAxes.length === 0 ? "" : `<div class="rix-output-sheet-plane-controls" aria-label="Tensor plane">${value.hiddenAxes.map(({ axis, name, length, selected, labels }) => `<label><span>${escapeHtml(name)} · axis ${axis}</span><select data-rix-sheet-axis="${axis}" aria-label="${escapeHtml(name)} axis ${axis}">${Array.from({ length }, (_item, index) => `<option value="${index + 1}"${selected === index + 1 ? " selected" : ""}>${escapeHtml(labels?.[index] ?? String(index + 1))}</option>`).join("")}</select></label>`).join("")}</div>`;
        const headerAttributes = (axis, coordinate, fallback) => value.formulaBacked
            ? ` class="rix-sheet-header-editable" tabindex="0" data-rix-header-axis="${axis}" data-rix-header-coordinate="${coordinate}" data-rix-header-label="${escapeHtml(value.axisLabels[axis - 1]?.[coordinate - 1] ?? "")}" data-rix-header-fallback="${escapeHtml(fallback)}"`
            : "";
        const renderSheetCell = (cell, rowIndex, columnIndex) => {
            const diagnostic = cell.diagnostics[0] ?? null;
            const cellValue = cell.blank ? "" : cell.value === null ? "_" : text(cell.value);
            const title = [
                cell.coordinateLabel,
                cell.displayAddress,
                cell.address,
                cell.dependencies.length > 0 ? `depends on ${cell.dependencies.map((dependency) => `${value.addressBase}[${dependency}]`).join(", ")}` : null,
                diagnostic ? `${cell.diagnosticKind ?? "runtime"} error: ${diagnostic}` : null,
            ].filter(Boolean).join(" · ");
            const diagnosticAttributes = diagnostic === null
                ? ""
                : ` data-rix-state="error" data-rix-diagnostic-kind="${escapeHtml(cell.diagnosticKind ?? "runtime")}" data-rix-diagnostics="${escapeHtml(JSON.stringify(cell.diagnostics))}"${cell.diagnosticSource === null ? "" : ` data-rix-diagnostic-source="${escapeHtml(cell.diagnosticSource)}"`} aria-invalid="true"`;
            return `<td data-rix-row="${rowIndex + 1}" data-rix-column="${columnIndex + 1}" data-rix-index="${cell.index.join(",")}" data-rix-address="${escapeHtml(cell.address)}" data-rix-display-address="${escapeHtml(cell.displayAddress)}"${cell.blank ? ' data-rix-blank="true"' : ""}${cell.coordinateLabel === null ? "" : ` data-rix-coordinate-labels="${escapeHtml(JSON.stringify(cell.coordinateLabels))}" data-rix-coordinate-label="${escapeHtml(cell.coordinateLabel)}"`}${cell.formulaSource === null ? "" : ` data-rix-formula-source="${escapeHtml(cell.formulaSource)}"`}${cell.slotId === null ? "" : ` data-rix-slot-id="${escapeHtml(cell.slotId)}"`}${cell.assignmentMode === null ? "" : ` data-rix-assignment-mode="${escapeHtml(cell.assignmentMode)}"`}${cell.dependencies.length === 0 ? "" : ` data-rix-dependencies="${escapeHtml(JSON.stringify(cell.dependencies))}"`}${diagnosticAttributes} title="${escapeHtml(title)}">${cellValue}</td>`;
        };
        const bodies = value.planes.map((plane) => `<tbody data-rix-plane-key="${escapeHtml(plane.key)}" data-rix-slice="${plane.slice.map((item) => item ?? "").join(",")}"${plane.key === value.selectedPlaneKey ? "" : " hidden"}>${plane.cells.map((row, rowIndex) => `<tr><th scope="row" data-rix-row="${rowIndex + 1}"${headerAttributes(value.rowAxis.axis, rowIndex + 1, String(rowIndex + 1))}${value.axisLabels[value.rowAxis.axis - 1] ? ` title="${escapeHtml(value.rowAxis.name)} ${rowIndex + 1}"` : ""}>${escapeHtml(value.rowHeaders[rowIndex])}</th>${row.map((cell, columnIndex) => renderSheetCell(cell, rowIndex, columnIndex)).join("")}</tr>`).join("")}</tbody>`).join("");
        const liveAttributes = value.editable
            ? ` data-rix-editable="true" data-rix-edit-mode="${value.editMode}"${value.bindingId ? ` data-rix-binding-id="${escapeHtml(value.bindingId)}"` : ""}`
            : "";
        const assignmentControl = value.editMode === "formula"
            ? `<label class="rix-output-sheet-assignment"><span>Assignment</span><select data-rix-edit-assignment-mode aria-label="Formula assignment mode">${FORMULA_SHEET_ASSIGNMENT_MODES.map((mode) => `<option value="${escapeHtml(mode)}"${mode === ":=" ? " selected" : ""}>${escapeHtml(mode)}</option>`).join("")}</select></label>`
            : "";
        const editor = value.editable
            ? `<form class="rix-output-sheet-editor" hidden><label class="rix-output-sheet-formula"><span data-rix-edit-label>Choose a cell to edit</span><input data-rix-edit-source aria-label="${value.editMode === "formula" ? "RiX formula" : "RiX value"}" autocomplete="off" spellcheck="false"></label>${assignmentControl}<button type="submit">${value.editMode === "formula" ? "Set formula" : "Set"}</button><output data-rix-edit-value aria-live="polite"></output><output data-rix-edit-status aria-live="polite"></output></form>`
            : "";
        const formulaAttributes = value.formulaBacked ? ` data-rix-formula-sheet="true" data-rix-formula-epoch="${value.formulaSheet.epoch}"` : "";
        return `<section class="rix-output-sheet" data-rix-rank="${value.rank}" data-rix-selected-plane="${escapeHtml(value.selectedPlaneKey)}"${liveAttributes}${formulaAttributes}>${value.title ? `<h3 class="rix-output-sheet-title">${escapeHtml(value.title)}</h3>` : ""}<div class="rix-output-sheet-location" aria-live="polite" data-rix-summary="${escapeHtml(summary)}">${escapeHtml(summary)}</div>${value.showAxisSummary ? `<div class="rix-output-sheet-axis-summary">${escapeHtml(axisSummary)}</div>` : ""}${controls}${editor}<table><thead><tr><th class="rix-output-sheet-corner" scope="col">${escapeHtml(value.addressBase)}</th>${value.columnHeaders.map((header, column) => `<th scope="col" data-rix-column="${column + 1}"${value.columnAxis ? headerAttributes(value.columnAxis.axis, column + 1, sheetColumnLabel(column + 1, value.columnLabelMode)) : ""}${value.columnAxis && value.axisLabels[value.columnAxis.axis - 1] ? ` title="${escapeHtml(value.columnAxis.name)} ${column + 1}"` : ""}>${escapeHtml(header)}</th>`).join("")}</tr></thead>${bodies}</table></section>`;
    }
    if (value.kind === "figure") return `<figure class="rix-output-figure"${value.label ? ` id="${escapeHtml(value.label)}"` : ""}>${renderOutputHtml(value.content, format)}${value.caption ? `<figcaption>${escapeHtml(value.caption)}</figcaption>` : ""}</figure>`;
    if (value.kind === "graphic") {
        const interactive = graphicIsInteractive(value);
        const replacesDependencies = interactive && value.children.some(function hasReplacement(node) {
            return isOutputValue(node) && (
                (node.kind === "drag_point" && node.replacesDependencies?.length > 0)
                || (node.children || []).some(hasReplacement)
            );
        });
        const interactionStatus = replacesDependencies
            ? "Dragging will replace this point’s current reactive dependencies."
            : "Drag the highlighted point or use its arrow keys.";
        return `<div class="rix-output-graphic"${interactive ? ' data-rix-interactive="true"' : ""}>${renderGraphicSvg(value, format)}${interactive ? `<output class="rix-output-graphic-status" aria-live="polite">${interactionStatus}</output>` : ""}</div>`;
    }
    if (value.kind === "slide") return `<section class="rix-output-slide">${value.title ? `<h2>${escapeHtml(value.title)}</h2>` : ""}${renderOutputHtml(value.content, format)}</section>`;
    if (value.kind === "slides") return `<section class="rix-output-slides">${value.slides.map((slide) => renderOutputHtml(slide, format)).join("")}</section>`;
    return `<pre>${escapeHtml(formatOutputText(value, format))}</pre>`;
}

export function createAlgebraOutputCollection() {
    const syntheticDivision = (root, coefficients) => createSyntheticDivision(root, coefficients);
    return {
        type: "map",
        entries: new Map([["SyntheticDivision", syntheticDivision], ["SYNTHETICDIVISION", syntheticDivision]]),
        _ext: new Map([
            ["SYNTHETICDIVISION", {
                type: "method_builtin",
                name: "SyntheticDivision",
                impl: (args) => syntheticDivision(...args.slice(1)),
            }],
            ["immutable", int(1)],
        ]),
    };
}

/**
 * Graphics is the intrinsic, renderer-facing scene language.  Plugins such as
 * Draw, Plot, and Geometry construct these values; renderers only need this
 * stable collection and the Graphic output schema.
 */
export function createGraphicsOutputCollection() {
    const methods = new Map([
        ["Graphic", createGraphic],
        ["Path", createPath],
        ["Group", createGroup],
        ["Transform", createTransform],
        ["Text", createTextMark],
        ["Rectangle", createRectangle],
        ["Circle", createCircle],
        ["DragPoint", createDragPoint],
        ["Clip", createClip],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => constructor(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function createControlsOutputCollection() {
    const methods = new Map([
        ["Slider", createSliderControl],
        ["Input", createInputControl],
        ["Choice", createChoiceControl],
        ["Toggle", createToggleControl],
        ["Range", createRangeControl],
        ["Reset", createResetControl],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => constructor(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function createPlotOutputCollection() {
    const polynomial = (coefficients, domain, options = null) => createPolynomialPlot(coefficients, domain, options);
    return {
        type: "map",
        entries: new Map([["Polynomial", polynomial], ["POLYNOMIAL", polynomial]]),
        _ext: new Map([
            ["POLYNOMIAL", {
                type: "method_builtin",
                name: "Polynomial",
                impl: (args) => polynomial(...args.slice(1)),
            }],
            ["immutable", int(1)],
        ]),
    };
}
