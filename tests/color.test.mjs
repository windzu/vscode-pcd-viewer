import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fieldRange, fillScalarColors, fillPackedColors } from '../static/js/cloud-color.js';

test('field ranges ignore non-finite components and use the first COUNT component', async () => {
    const values = new Float32Array([NaN, 99, -2, 99, Infinity, 99, 2, 99]);
    const range = fieldRange(values, 2, 4);
    assert.deepEqual(range, [-2, 2]);
    const target = new Float32Array(4);
    assert.equal(await fillScalarColors(target, values, 2, range), true);
    assert.deepEqual(Array.from(target), [0, 0, 0, 255]);
    assert.deepEqual(fieldRange(new Float32Array([NaN, Infinity]), 1, 2), [0, 0]);
    await fillScalarColors(target, new Float32Array([7, 7, 7, 7]), 1, [7, 7]);
    assert.deepEqual(Array.from(target), [0, 0, 0, 0]);
});

test('packed RGB/RGBA preserves float bit patterns, alpha, COUNT stride and sliced arrays', async () => {
    const backing = new Uint32Array([0, 0x80402010, 0, 0xff010203, 0, 0]);
    const floats = new Float32Array(backing.buffer, 4, 4);
    const target = new Uint8Array(8);
    await fillPackedColors(target, floats, 2, 'F', true);
    assert.deepEqual(Array.from(target), [64, 32, 16, 128, 1, 2, 3, 255]);
    await fillPackedColors(target, new Uint32Array([0x00402010, 0x00010203]), 1, 'U', false);
    assert.deepEqual(Array.from(target), [64, 32, 16, 255, 1, 2, 3, 255]);
});

test('large field coloring yields to UI tasks and aborts a superseded request', async () => {
    const values = new Float32Array(50000).fill(1), target = new Float32Array(values.length);
    let clock = 0, yields = 0, cancelled = false;
    const done = await fillScalarColors(target, values, 1, [0, 1], {
        now: () => ++clock * 5,
        yieldTask: async () => { ++yields; cancelled = true; },
        isCancelled: () => cancelled,
    });
    assert.equal(done, false);
    assert.equal(yields, 1);
    assert.equal(target[0], 255);
    assert.equal(target.at(-1), 0);
});
