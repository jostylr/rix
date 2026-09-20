/** Copy-owned, bounded approximate tensor buffers. Never a Rational certificate. */
import { Integer } from '@ratmath/core';
import { createShaped, forEachShapedCell, isShaped, shapedSize } from '../../src/runtime/shaped.js';
import { convertFloat, normalizeFormat, roundToFormat, diagnosticsOf, makeFloat } from './ieee754.js';

export const FLOAT_TENSOR_LIMITS = Object.freeze({ cells: 262144, rank: 16, work: 4194304 });
const buffers = new WeakMap();
const str = value => ({ type: 'string', value });
const seq = values => ({ type: 'sequence', values });
const int = value => new Integer(BigInt(value));
const values = value => Array.isArray(value) ? value : value?.values ?? value?.elements;
function shapeOf(value) {
    const source = values(value);
    if (!Array.isArray(source) || source.length < 1 || source.length > FLOAT_TENSOR_LIMITS.rank) throw new Error('Float tensor shape must contain one to 16 positive Integer dimensions');
    const shape = source.map(n => n instanceof Integer ? Number(n.value) : n);
    if (shape.some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Float tensor shape must contain one to 16 positive Integer dimensions');
    const size = shape.reduce((a,b) => a*b, 1);
    if (!Number.isSafeInteger(size) || size > FLOAT_TENSOR_LIMITS.cells) throw new Error('Float tensor cell budget exceeded');
    return shape;
}
function wrap(data, shape, format, diagnostics = [], nativeType = 'float_ieee754', cellDiagnostics = new Map(), operation = 'tensorConvert') {
    const tensor = { type: 'float_tensor', toString() { return `FloatTensor(${format}, ${shape.join('×')}; approximate)`; }, entries: new Map([
        ['schema', str('rix.float.tensor@1')], ['status', str('approximate')], ['certified', null],
        ['format', str(format)], ['shape', seq(shape.map(int))],
        ['diagnostics', seq([...new Set(diagnostics)].map(str))],
    ]), _ext: new Map([['immutable', int(1)]]) };
    for (const [key,value] of tensor.entries) tensor._ext.set(key,value);
    buffers.set(tensor, { data, shape: [...shape], format, diagnostics, nativeType, cellDiagnostics, operation });
    return tensor;
}
function requireTensor(value) {
    const tensor = buffers.get(value);
    if (!tensor) throw new Error('Expected a live Float tensor adapter; reconstruct from Shaped across serialization/worker boundaries');
    return tensor;
}
export function floatTensorFromTypedArray(data, shapeValue) {
    if (!(data instanceof Float32Array || data instanceof Float64Array)) throw new Error('Float tensor requires Float32Array or Float64Array');
    const shape = shapeOf(shapeValue);
    if (data.length !== shape.reduce((a,b)=>a*b,1)) throw new Error('Float tensor data/shape mismatch');
    const cellDiagnostics = new Map();
    for (let i=0;i<data.length;i++) if (!Number.isFinite(data[i])) cellDiagnostics.set(i, ['nonFiniteInput']);
    return wrap(data.slice(), shape, data instanceof Float32Array ? 'binary32' : 'binary64', cellDiagnostics.size ? ['nonFiniteInput'] : [], 'float_ieee754', cellDiagnostics, 'tensorImport');
}
export function floatTensorToTypedArray(tensor) { return requireTensor(tensor).data.slice(); }
export function createFloatTensorAdapters(nativeType = 'float_ieee754') {
    return {
        Tensor(source, shapeValue, formatValue) {
            const shape = shapeOf(shapeValue ?? (isShaped(source) ? source.shape : undefined));
            const size = shape.reduce((a,b)=>a*b,1);
            const format = normalizeFormat(formatValue);
            const data = format === 'binary32' ? new Float32Array(size) : new Float64Array(size);
            const diagnostics = new Set();
            const cellDiagnostics = new Map();
            let index = 0;
            const push = value => {
                const converted = convertFloat(value, format, nativeType);
                const local = [...new Set([...diagnosticsOf(value), ...diagnosticsOf(converted), ...(!Number.isFinite(converted.value) ? ['nonFiniteInput'] : [])])];
                for (const diagnostic of local) diagnostics.add(diagnostic);
                if (local.length) cellDiagnostics.set(index, local);
                data[index++] = converted.value;
            };
            if (isShaped(source)) {
                if (shapedSize(source) !== size) throw new Error('Float tensor data/shape mismatch');
                forEachShapedCell(source, push);
            } else {
                const entries = values(source);
                if (!entries || entries.length !== size) throw new Error('Float tensor data/shape mismatch');
                for (const entry of entries) push(entry);
            }
            return wrap(data, shape, format, [...diagnostics], nativeType, cellDiagnostics);
        },
        ToShaped(value) {
            const tensor = requireTensor(value);
            return createShaped(tensor.shape, Array.from(tensor.data, (n,index) => makeFloat(n, tensor.format, tensor.nativeType, { diagnostics: tensor.cellDiagnostics.get(index) ?? [], operation: tensor.operation })));
        },
        MatMul(leftValue, rightValue) {
            const left = requireTensor(leftValue), right = requireTensor(rightValue);
            if (left.shape.length !== 2 || ![1,2].includes(right.shape.length) || left.shape[1] !== right.shape[0]) throw new Error('Float MatMul requires rank-2 left and compatible rank-1/rank-2 right');
            if (left.format !== right.format) throw new Error('Float MatMul formats must agree; convert explicitly');
            const [rows, inner] = left.shape, columns = right.shape[1] ?? 1;
            const shape = shapeOf(right.shape.length === 1 ? [rows] : [rows, columns]);
            if (rows * inner * columns > FLOAT_TENSOR_LIMITS.work) throw new Error('Float MatMul work budget exceeded');
            const data = left.format === 'binary32' ? new Float32Array(rows*columns) : new Float64Array(rows*columns);
            const diagnostics = new Set([...left.diagnostics, ...right.diagnostics]);
            const cellDiagnostics = new Map();
            for (let i=0;i<rows;i++) for (let j=0;j<columns;j++) {
                let sum=0;
                const local = new Set();
                for (let k=0;k<inner;k++) {
                    const a=left.data[i*inner+k], b=right.data[k*columns+j];
                    const leftDiagnostics = left.cellDiagnostics.get(i*inner+k);
                    const rightDiagnostics = right.cellDiagnostics.get(k*columns+j);
                    if (leftDiagnostics) for (const diagnostic of leftDiagnostics) local.add(diagnostic);
                    if (rightDiagnostics) for (const diagnostic of rightDiagnostics) local.add(diagnostic);
                    const product=roundToFormat(a*b,left.format);
                    if (Number.isFinite(a) && Number.isFinite(b) && !Number.isFinite(product)) local.add('overflow');
                    if (a!==0 && b!==0 && product===0) local.add('underflowToZero');
                    const next=roundToFormat(sum+product,left.format);
                    if (Number.isFinite(sum) && Number.isFinite(product) && !Number.isFinite(next)) local.add('overflow');
                    if (Number.isNaN(next)) local.add('invalidOperation');
                    sum=next;
                }
                data[i*columns+j]=sum;
                if (local.size) cellDiagnostics.set(i*columns+j, [...local]);
                for (const diagnostic of local) diagnostics.add(diagnostic);
            }
            return wrap(data, shape, left.format, [...diagnostics], nativeType, cellDiagnostics, 'tensorMatMul');
        },
    };
}
export const FLOAT_TENSOR_EXPORTS = ['Tensor', 'ToShaped', 'MatMul'];
