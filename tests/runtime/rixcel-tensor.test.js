import { expect, test } from 'bun:test';
import { Integer, Rational, RationalInterval } from '@ratmath/core';
import { createShaped, createShapedView } from '../../src/runtime/shaped.js';
import { createRixCelDocument, appendRixCelEvent, replayRixCelDocument } from '../../src/runtime/rixcel-document.js';
import { rixCelTensorPlane, createRixCelTensorSheet, materializeRixCelTensorPlane } from '../../src/runtime/rixcel-tensor.js';
import { parseAndEvaluate } from '../../src/index.js';
const int = n => new Integer(BigInt(n));
const tensor = () => createShaped([2, 2, 2], Array.from({length:8}, (_, i) => int(i + 1)));
const fresh = shape => createRixCelDocument({ id: 'target', shape });

test('selected tensor planes honor axes, slices and noncontiguous component strides', () => {
    const data = tensor();
    const plane = rixCelTensorPlane(data, { viewAxes: [3, 1], slice: [null, 2, null] });
    expect(plane.values.map(row => row.map(String))).toEqual([['3', '7'], ['4', '8']]);
    expect(plane.indices[1][1]).toEqual([2, 2, 2]);
    const transposed = createShapedView(data, { shape:[2,2,2], strides:[1,2,4], offset:0 });
    expect(rixCelTensorPlane({ components: transposed }, { slice:[null,null,2] }).values.map(row => row.map(String)))
        .toEqual([['5', '7'], ['6', '8']]);
});

test('snapshot batches exact values into a selected rank-N destination and stays detached', () => {
    const original = fresh([3, 2, 3]);
    const data = tensor();
    const result = materializeRixCelTensorPlane(original, data, {
        viewAxes:[3,1], slice:[null,2,null], targetAxes:[3,1], targetStart:[2,2,1],
    });
    expect(original.events).toHaveLength(0);
    expect(result.document.events).toHaveLength(1);
    expect(result.event.edits.map(edit => [edit.index,edit.source])).toEqual([
        [[2,2,1], '3'], [[3,2,1], '7'], [[2,2,2], '4'], [[3,2,2], '8'],
    ]);
    data.data[2] = int(99);
    expect(result.event.edits[0].source).toBe('3');
    expect(replayRixCelDocument(result.document).slots).toHaveLength(4);
});

test('collision and shape failures leave history and slots unchanged', () => {
    const original = appendRixCelEvent(fresh([2,2]), {type:'slot:set',index:[2,2],source:'_',view:{blank:false}});
    const before = JSON.stringify(original);
    expect(() => materializeRixCelTensorPlane(original, tensor())).toThrow('collision');
    expect(JSON.stringify(original)).toBe(before);
    expect(() => materializeRixCelTensorPlane(fresh([1,2]), tensor())).toThrow('shape');
    const withDefault = createRixCelDocument({id:'default', shape:[2,2], defaultSlot:{source:'1', assignmentMode:':=', view:{}}});
    expect(() => materializeRixCelTensorPlane(withDefault, tensor())).toThrow('collision');
    const withDraft = {...fresh([2,2]),drafts:[{index:[2,2],source:'1+',assignmentMode:':='}]};
    expect(() => materializeRixCelTensorPlane(withDraft, tensor())).toThrow('collision');
});

test('readonly views are bounded, refresh current values and do not expose bindings', () => {
    const data = tensor();
    const first = createRixCelTensorSheet(data, {slice:[null,null,1]});
    expect(first.editable).toBe(false); expect(first.binding).toBeNull();
    expect(first.cells[0][0].value.toString()).toBe('1');
    data.data[0] = int(77);
    const second = createRixCelTensorSheet(data, {slice:[null,null,1]});
    expect(second.cells[0][0].value.toString()).toBe('77');
    expect(first.cells[0][0].value.toString()).toBe('1');
    expect(createRixCelTensorSheet(data, {slice:[null,null,2]}).cells[0][0].value.toString()).toBe('2');
});

test('plane and target validation reject duplicate axes, invalid slices and excessive work', () => {
    const data = tensor();
    for (const options of [{viewAxes:[1,1]}, {slice:[null,null,3]}, {slice:[1,null,1]}, {maxCells:3}, {maxCells:5000}]) {
        expect(() => rixCelTensorPlane(data, options)).toThrow();
    }
    const huge = {...data, shape:[1000000,1000000,2]};
    expect(() => rixCelTensorPlane(huge)).toThrow('exceeds');
    expect(() => materializeRixCelTensorPlane(fresh([2,2]), data, {targetAxes:[1,1]})).toThrow('targetAxes');
    expect(() => materializeRixCelTensorPlane(fresh([2,2]), data, {targetStart:[0,1]})).toThrow('targetStart');
    expect(() => materializeRixCelTensorPlane(fresh([2]), data)).toThrow('two destination axes');
    expect(() => rixCelTensorPlane(createShaped([0], []))).toThrow('positive shape');
});

test('snapshot scalar sources roundtrip exact rational, interval, string and large integer values', () => {
    const values = [new Rational(1n,3n), new RationalInterval(new Rational(-2n,3n),new Rational(7n,4n)),
        {type:'string',value:'a ""\n\\ _ ; .Error("no")'}, int(9007199254740993000n), null];
    for (const value of values) {
        const data = createShaped([1], [value], {scalarDomain:'Unspecified'});
        const {event} = materializeRixCelTensorPlane(fresh([1]),data);
        const restored = parseAndEvaluate(event.edits[0].source);
        if (value?.type === 'string') expect(restored.value).toBe(value.value);
        else if (value === null) expect(restored).toBeNull();
        else expect(String(restored)).toBe(String(value));
    }
});

test('unsupported scalar rejects entire snapshot before publication', () => {
    const destination = fresh([1]);
    const data = createShaped([1], [1.2]);
    expect(() => materializeRixCelTensorPlane(destination,data)).toThrow('exact Integer');
    expect(destination.events).toHaveLength(0);
});

test('RiX dense and finite sparse Tensor representations produce the same selected plane', () => {
    const [dense,sparse,undecided] = parseAndEvaluate(`
.Plugin.Load("linalg");
v:=.linalg.VectorSpace("V",2); f:=.linalg.Frame(v,"e",:defining);
d:=.linalg.Tensor([1,0;0,2],[f,f]);
c:=.linalg.SparseCoordinates([{= indices=[1,1],value=1},{= indices=[2,2],value=2}],[2,2]);
s:=.linalg.Tensor(c,[f,f]); [d,s,?];`).values;
    expect(rixCelTensorPlane(dense).values.map(row=>row.map(String))).toEqual([['1','0'],['0','2']]);
    expect(rixCelTensorPlane(sparse).values.map(row=>row.map(String))).toEqual([['1','0'],['0','2']]);
    expect(materializeRixCelTensorPlane(fresh([2,2]),sparse).event.edits.map(edit=>edit.source)).toEqual(['1/1','0','0','2/1']);
    expect(materializeRixCelTensorPlane(fresh([1]),createShaped([1],[undecided])).event.edits[0].source).toBe('?');
},20000);
