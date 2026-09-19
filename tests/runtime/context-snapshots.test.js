import { expect, test } from 'bun:test';
import { Context } from '../../src/runtime/context.js';
import { Cell } from '../../src/runtime/cell.js';
import { Integer } from '@ratmath/core';

function fixture() {
    const token = Object.freeze({ type: 'identity_token', description: 'opaque host identity' });
    const shared = { type: 'sequence', values: [new Integer(1n)], _ext: new Map([['identity', token]]) };
    const parent = new Context();
    parent.set('a', shared); parent.set('b', shared);
    parent.push(new Map([['local', new Cell(shared)]]));
    return { parent, shared, token };
}

test('concurrent snapshots preserve aliases within one child while isolating parent and siblings', () => {
    const { parent, shared, token } = fixture();
    const left = parent.concurrentChild(), right = parent.concurrentChild();
    expect(left.get('a')).toBe(left.get('b'));
    expect(left.get('a')).toBe(left.get('local'));
    expect(left.get('a')).not.toBe(shared);
    expect(left.get('a')).not.toBe(right.get('a'));
    expect(left.get('a')._ext.get('identity')).toBe(token);
    left.get('a').values.push(new Integer(2n));
    expect(left.get('b').values).toHaveLength(2);
    expect(parent.get('a').values).toHaveLength(1);
    expect(right.get('a').values).toHaveLength(1);
    expect(() => left.assertCellWritable(left.getCell('a'), 'a')).toThrow('cannot write captured ordinary binding');
});

test('captured scope snapshot shares one memo without sharing mutable source cells', () => {
    const { shared, token } = fixture(), context = new Context();
    const cell = new Cell(shared);
    const source = new Map([['x', cell], ['y', cell]]);
    context.push(source, { snapshot: true, readOnly: true });
    expect(context.get('x')).toBe(context.get('y'));
    expect(context.getCell('x')).not.toBe(cell);
    expect(context.get('x')._ext.get('identity')).toBe(token);
    context.get('y').values.push(null);
    expect(shared.values).toHaveLength(1);
});
