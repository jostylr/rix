/** Reproducible isolated snapshot allocation fixture; no external services. */
import { Context } from '../src/runtime/context.js';
import { Cell, deepCopyValue } from '../src/runtime/cell.js';
import { Integer } from '@ratmath/core';
const parent = new Context();
const graph = { type: 'sequence', values: Array.from({ length: 256 }, (_, i) => new Integer(BigInt(i + 1))) };
for (let i = 0; i < 50; i++) parent.set(`v${i}`, graph);
function perBindingReference() {
    const copy = new Context();
    copy.globalScope = new Map([...parent.globalScope].map(([name, cell]) => [name, new Cell(deepCopyValue(cell.value))]));
    return copy;
}
const rows = [];
for (const [mode, clone] of [['per-binding-reference', perBindingReference], ['isolated-graph-memo', () => parent.concurrentChild()]]) {
    Bun.gc(true);
    const before = process.memoryUsage().heapUsed, start = performance.now();
    const copies = Array.from({ length: 32 }, clone);
    const milliseconds = performance.now() - start;
    Bun.gc(true);
    const retainedHeapDelta = process.memoryUsage().heapUsed - before;
    for (const copy of copies) {
        if (copy.get('v0') === graph || copy.get('v0').values[255].value !== 256n) throw new Error('Exact snapshot/isolation mismatch');
    }
    if (copies[0].get('v0') === copies[1].get('v0')) throw new Error('Shared child snapshot');
    rows.push({ mode, milliseconds, retainedHeapDelta, exactValueParity: true, copies: copies.length });
}
console.log(JSON.stringify({ schema: 'rix.benchmark.runtime-snapshots@1', runtime: `Bun ${Bun.version}`, bindings: 50, sharedExactLeaves: 256, rows,
    limitations: 'Reference copies each binding independently as the previous implementation did. Heap deltas are GC/runtime observations, not hard memory ceilings. Real ODE and worker benchmarks cover end-to-end behavior.' }, null, 2));
