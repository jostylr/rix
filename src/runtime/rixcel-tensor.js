import { Integer, Rational, RationalInterval } from '@ratmath/core';
import { isShaped, shapedGetBySelectors } from './shaped.js';
import { createSheet } from './output.js';
import { UNDECIDED } from './decision.js';
import { appendRixCelEvent, replayRixCelDocument } from './rixcel-document.js';

const LIMIT = 4096;
const fail = message => { throw new Error(`RiXCel tensor plane: ${message}`); };
function axes(value, rank, label) {
    const result = value ?? (rank === 1 ? [1] : [1, 2]);
    if (!Array.isArray(result) || result.length !== Math.min(2, rank)
        || new Set(result).size !== result.length
        || result.some(axis => !Number.isSafeInteger(axis) || axis < 1 || axis > rank)) {
        fail(`${label} must contain ${Math.min(2, rank)} distinct valid axes`);
    }
    return [...result];
}
function field(value, name) { return value?.entries instanceof Map ? value.entries.get(name.toLowerCase()) : value?.[name]; }
function list(value) { return Array.isArray(value) ? value : value?.values; }
function positiveIndex(value) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    return typeof value === 'number' ? value : NaN;
}
function components(tensor) {
    const value = isShaped(tensor) ? tensor : field(tensor, 'components') ?? tensor;
    if (isShaped(value)) {
        if (!value.shape.length || value.shape.some(length => !Number.isSafeInteger(length) || length < 1)) {
            fail('requires a nonempty finite positive shape');
        }
        return { shape:value.shape, at:index => shapedGetBySelectors(value, index.map(coordinate => ({kind:'index',value:coordinate}))) };
    }
    if (field(value, 'schema')?.value !== 'rix.coordinate-storage@1' || field(value, 'kind')?.value !== 'finiteSupport') {
        fail('requires finite Shaped or Tensor components');
    }
    const shapeValue = list(field(value, 'shape'));
    if (!Array.isArray(shapeValue) || shapeValue.length < 1 || shapeValue.length > 32) fail('invalid sparse component shape');
    const shape = shapeValue.map(positiveIndex);
    if (shape.some(length => !Number.isSafeInteger(length) || length < 1)) fail('requires a nonempty finite positive shape');
    const terms = list(field(value, 'terms'));
    if (!Array.isArray(terms) || terms.length > 2048) fail('sparse support exceeds 2048 terms');
    const cells = new Map();
    for (const term of terms) {
        const coordinates = list(field(term, 'indices'));
        if (!Array.isArray(coordinates) || coordinates.length !== shape.length) fail('invalid sparse coordinate rank');
        const index = coordinates.map(positiveIndex);
        if (index.some((n, axis) => !Number.isSafeInteger(n) || n < 1 || n > shape[axis])) fail('sparse coordinate out of bounds');
        const scalar = field(term, 'value');
        if (!(scalar instanceof Integer) && !(scalar instanceof Rational)) fail('sparse values must be exact Rational scalars');
        const key = index.join(',');
        if (cells.has(key)) fail('sparse coordinates must be canonical without duplicates');
        cells.set(key, scalar);
    }
    return {shape, at:index => cells.get(index.join(',')) ?? new Integer(0n)};
}

/** Read one full finite plane, with 1-based axes and null visible slice entries. */
export function rixCelTensorPlane(tensor, options = {}) {
    const value = components(tensor), rank = value.shape.length;
    const viewAxes = axes(options.viewAxes, rank, 'viewAxes');
    const slice = options.slice ?? value.shape.map((_, axis) => viewAxes.includes(axis + 1) ? null : 1);
    if (!Array.isArray(slice) || slice.length !== rank) fail(`slice must contain ${rank} entries`);
    slice.forEach((coordinate, axis) => {
        if (viewAxes.includes(axis + 1)) {
            if (coordinate !== null) fail(`slice axis ${axis + 1} must be null because it is visible`);
        } else if (!Number.isSafeInteger(coordinate) || coordinate < 1 || coordinate > value.shape[axis]) {
            fail(`slice axis ${axis + 1} is out of bounds`);
        }
    });
    const shape = [value.shape[viewAxes[0] - 1], viewAxes.length === 1 ? 1 : value.shape[viewAxes[1] - 1]];
    const maxCells = options.maxCells ?? LIMIT;
    if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > LIMIT) fail(`maxCells must be from 1 through ${LIMIT}`);
    if (shape[0] > Math.floor(maxCells / shape[1])) fail(`selected plane exceeds ${maxCells} cells`);
    const indices = [], values = [];
    for (let row = 1; row <= shape[0]; row++) {
        const rowIndices = [], rowValues = [];
        for (let column = 1; column <= shape[1]; column++) {
            const index = [...slice]; index[viewAxes[0] - 1] = row;
            if (viewAxes.length === 2) index[viewAxes[1] - 1] = column;
            rowIndices.push(index);
            rowValues.push(value.at(index));
        }
        indices.push(rowIndices); values.push(rowValues);
    }
    return { shape, viewAxes, slice: [...slice], indices, values };
}

/** A detached readonly Sheet. Reactive hosts rebuild it when the source changes. */
export function createRixCelTensorSheet(tensor, options = {}) {
    const plane = rixCelTensorPlane(tensor, options);
    const entries = new Map();
    if (options.title !== undefined) entries.set('title', { type: 'string', value: String(options.title) });
    return createSheet([plane.values, { type: 'map', entries }]);
}

function quote(value) {
    let width = 2;
    for (const match of value.matchAll(/"+/g)) width = Math.max(width, match[0].length + 1);
    const delimiter = '"'.repeat(width);
    return `${delimiter} ${value} ${delimiter}.Slice(2,-1)`;
}
function source(value) {
    if (value === null) return '_';
    if (value instanceof Integer) return String(value.value);
    if (value instanceof Rational) return `${value.numerator}/${value.denominator}`;
    if (value instanceof RationalInterval) return `(${source(value.start)}):(${source(value.end)})`;
    if (value?.type === 'string') return quote(value.value);
    if (value === UNDECIDED) return '?';
    fail('snapshot values must be exact Integer, Rational, RationalInterval, string, null or undecided scalars');
}

/** Build one atomic slot:batch candidate; never mutate the destination or overwrite occupied cells. */
export function materializeRixCelTensorPlane(input, tensor, options = {}) {
    const { document, slots } = replayRixCelDocument(input);
    const plane = rixCelTensorPlane(tensor, options);
    const rank = document.shape.length;
    const targetAxes = axes(options.targetAxes, rank, 'targetAxes');
    if (targetAxes.length === 1 && plane.shape[1] !== 1) fail('a two-dimensional plane requires two destination axes');
    const start = options.targetStart ?? document.shape.map(() => 1);
    if (!Array.isArray(start) || start.length !== rank || start.some((coordinate, axis) =>
        !Number.isSafeInteger(coordinate) || coordinate < 1 || coordinate > document.shape[axis])) fail('targetStart must be an in-bounds rank-matching index');
    targetAxes.forEach((axis, position) => {
        if (plane.shape[position] > document.shape[axis - 1] - start[axis - 1] + 1) fail('selected plane shape does not fit the destination');
    });
    const occupied = new Map(slots.map(slot => [slot.index.join(','), slot]));
    const drafts = new Set(document.drafts.map(draft => draft.index.join(',')));
    const edits = [];
    plane.values.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
        const index = [...start]; index[targetAxes[0] - 1] += rowOffset;
        if (targetAxes.length === 2) index[targetAxes[1] - 1] += columnOffset;
        const key = index.join(','), previous = occupied.get(key) ?? document.defaultSlot;
        // A null-valued formula is still occupied; only explicit blank slots are free.
        if (drafts.has(key) || previous.view?.blank !== true || previous.source.trim() !== '_') fail(`collision at grid[${key}]`);
        edits.push({ index, source: source(value), assignmentMode: ':=', view: { blank: false } });
    }));
    const event = { type: 'slot:batch', edits };
    return { document: appendRixCelEvent(document, event), event, shape: plane.shape };
}
