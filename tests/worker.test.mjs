import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

test('the packaged worker is self-contained and reports progress, typed results and malformed-file errors', () => {
    const messages = [];
    const self = { postMessage: (data, transfers) => messages.push({ data, transfers }) };
    const context = vm.createContext({ self, TextDecoder, ArrayBuffer, DataView,
        Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array });
    vm.runInContext(readFileSync(new URL('../out/pcd-worker.js', import.meta.url), 'utf8'), context);
    const header = new TextEncoder().encode('VERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA binary\n');
    const buffer = new ArrayBuffer(header.length + 12);
    new Uint8Array(buffer).set(header);
    new DataView(buffer).setFloat32(header.length, 7, true);
    self.onmessage({ data: { buffer, maxPoints: 1000000 } });
    const result = messages.at(-1);
    assert.equal(result.data.type, 'complete');
    assert.equal(result.data.cloud.positions[0], 7);
    assert.equal(result.data.cloud.points, 1);
    assert.equal(result.transfers.length, 4);
    assert.ok(messages.some(message => message.data.type === 'progress'));
    self.onmessage({ data: { buffer: new ArrayBuffer(1), maxPoints: 1000000 } });
    assert.equal(messages.at(-1).data.type, 'error');
    assert.match(messages.at(-1).data.message, /DATA/);
});
