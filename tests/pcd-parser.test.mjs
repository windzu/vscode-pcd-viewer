import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readHeader, parseFast, parse, sourcePointIndex } from '../static/js/pcd-format/pcd-format.js';
import { preparePreview } from '../static/js/preview-data.js';
import { decompress } from '../static/js/pcd-format/lzf.js';

function header(points, encoding = 'binary', fields = 'x y z intensity tag',
    sizes = '4 4 4 4 1', types = 'F F F F U', counts = '1 1 1 1 1') {
    return new TextEncoder().encode(`# fixture\nVERSION 0.7\nFIELDS ${fields}\nSIZE ${sizes}\nTYPE ${types}\nCOUNT ${counts}\nWIDTH ${points}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${points}\nDATA ${encoding}\n`);
}

function fixture(values) {
    const head = header(values.length);
    const bytes = new Uint8Array(head.length + values.length * 17);
    bytes.set(head);
    const view = new DataView(bytes.buffer, head.length);
    values.forEach((point, i) => {
        point.slice(0, 4).forEach((v, j) => view.setFloat32(i * 17 + j * 4, v, true));
        view.setUint8(i * 17 + 16, point[4]);
    });
    return bytes;
}

test('packed 17-byte rows preserve all fields, including unaligned floats and byte tags', () => {
    const values = [[4.913, -2.17, 0.3, 81, 0], [1.25, 2.5, -0.5, 155, 64], [-4, 3, 2, 0, 2]];
    const cloud = parseFast(fixture(values));
    assert.equal(cloud.header.rowSize, 17);
    assert.equal(cloud.points, 3);
    assert.deepEqual(Array.from(cloud.fieldData.tag), [0, 64, 2]);
    assert.deepEqual(Array.from(cloud.fieldData.x), values.map(v => Math.fround(v[0])));
    assert.deepEqual(Array.from(cloud.fieldData.intensity), [81, 155, 0]);
});

test('preserves typed-array byte offsets and lengths from pooled/subarray input', () => {
    const original = fixture([[1, 2, 3, 4, 5]]);
    const pooled = new Uint8Array(original.length + 64).fill(255);
    pooled.set(original, 13);
    const view = pooled.subarray(13, 13 + original.length);
    assert.equal(parseFast(view).fieldData.z[0], 3);
    assert.deepEqual(parse(view).points, [[1, 2, 3, 4, 5]]);
});

test('reads only header bytes and handles UTF-8 comments, CRLF and extra field spaces', () => {
    const text = '# 点云\r\nVERSION 0.7\r\nFIELDS x  y z\r\nSIZE 4 4 4\r\nTYPE F F F\r\nWIDTH 1\r\nHEIGHT 1\r\nPOINTS 1\r\nDATA binary\r\n';
    const head = new TextEncoder().encode(text);
    const bytes = new Uint8Array(head.length + 12);
    bytes.set(head);
    new DataView(bytes.buffer).setFloat32(head.length, 10, true);
    const parsed = readHeader(bytes);
    assert.equal(parsed.headerLength, head.length);
    assert.deepEqual(parsed.fields, ['x', 'y', 'z']);
    assert.equal(parseFast(bytes).fieldData.x[0], 10);
});

test('preview samples the entire record, including both endpoints, without changing the header', () => {
    const bytes = fixture(Array.from({ length: 10 }, (_, i) => [i, i * 2, i * 3, i, i]));
    const original = bytes.slice();
    const cloud = preparePreview(bytes, 4);
    assert.equal(cloud.header.points, 10);
    assert.equal(cloud.header.width, 10);
    assert.equal(cloud.sourcePoints, 10);
    assert.equal(cloud.points, 4);
    assert.deepEqual(Array.from(cloud.fieldData.x), [0, 3, 6, 9]);
    assert.deepEqual(Array.from(cloud.fieldData.tag), [0, 3, 6, 9]);
    assert.deepEqual(Array.from(cloud.positions), [0, 0, 0, 3, 6, 9, 6, 12, 18, 9, 18, 27]);
    assert.deepEqual(cloud.center, [4.5, 9, 13.5]);
    assert.deepEqual(cloud.bounds, { min: [0, 0, 0], max: [9, 18, 27] });
    assert.deepEqual(bytes, original);
    assert.equal(sourcePointIndex(2, 10, 4), 6);
});

test('ASCII sampling supports whitespace, comments, blank lines and a final line without newline', () => {
    const head = header(5, 'ascii');
    const body = new TextEncoder().encode('\n0 0 0 0 0\r\n# skipped\n1\t2 3 4 5\n2 4 6 8 10\n3 6 9 12 15\n4 8 12 16 20');
    const bytes = new Uint8Array(head.length + body.length);
    bytes.set(head); bytes.set(body, head.length);
    const cloud = parseFast(bytes, true, { maxPoints: 3 });
    assert.deepEqual(Array.from(cloud.fieldData.x), [0, 2, 4]);
    assert.deepEqual(Array.from(cloud.fieldData.tag), [0, 10, 20]);
});

// Independent PCL columnar fixture: each field's complete point values form one
// block, while COUNT>1 values remain adjacent within each point in that block.
function compressedFixture() {
    const head = header(3, 'binary_compressed', 'x histogram y z', '4 1 4 4', 'F U F F', '1 3 1 1');
    const body = new Uint8Array(45);
    const view = new DataView(body.buffer);
    [1, 2, 3].forEach((v, i) => view.setFloat32(i * 4, v, true));
    body.set([10, 11, 12, 20, 21, 22, 30, 31, 32], 12);
    [4, 5, 6].forEach((v, i) => view.setFloat32(21 + i * 4, v, true));
    [7, 8, 9].forEach((v, i) => view.setFloat32(33 + i * 4, v, true));
    const literals = [];
    for (let i = 0; i < body.length; i += 32) {
        const block = body.subarray(i, i + 32);
        literals.push(block.length - 1, ...block);
    }
    const bytes = new Uint8Array(head.length + 8 + literals.length);
    bytes.set(head);
    const sizes = new DataView(bytes.buffer, head.length, 8);
    sizes.setUint32(0, literals.length, true); sizes.setUint32(4, body.length, true);
    bytes.set(literals, head.length + 8);
    return bytes;
}

test('LZF compressed sampling preserves multi-value field grouping and unaligned size headers', () => {
    const bytes = compressedFixture();
    const cloud = parseFast(bytes, true, { maxPoints: 2 });
    assert.deepEqual(Array.from(cloud.fieldData.x), [1, 3]);
    assert.deepEqual(Array.from(cloud.fieldData.histogram), [10, 11, 12, 30, 31, 32]);
    assert.deepEqual(Array.from(cloud.fieldData.y), [4, 6]);
    assert.deepEqual(Array.from(cloud.fieldData.z), [7, 9]);
    assert.deepEqual(parse(bytes).points, [[1, [10, 11, 12], 4, 7], [2, [20, 21, 22], 5, 8], [3, [30, 31, 32], 6, 9]]);
});

test('typed LZF decoder handles overlapping references and validates declared size', () => {
    assert.deepEqual(Array.from(new Uint8Array(decompress(new Uint8Array([0, 65, 224, 248, 0]), 258))), Array(258).fill(65));
    assert.throws(() => decompress(new Uint8Array([0, 65, 224, 248, 0]), 257), /declared size/);
    assert.throws(() => decompress(new Uint8Array([0, 65]), 2), /size mismatch/);
    assert.throws(() => decompress(new Uint8Array([224]), 10));
});

test('rejects truncated binary/ASCII/compressed payloads and invalid preview limits before allocations', () => {
    const bytes = fixture([[1, 2, 3, 4, 5]]);
    assert.throws(() => parseFast(bytes.subarray(0, bytes.length - 1)), /truncated binary/);
    assert.throws(() => parseFast(header(2, 'ascii')), /truncated ASCII/);
    const compressed = compressedFixture();
    assert.throws(() => parseFast(compressed.subarray(0, compressed.length - 1)), /compressed sizes/);
    for (const maxPoints of [-1, NaN, 1.5]) {
        assert.throws(() => parseFast(bytes, true, { maxPoints }), /maxPoints/);
    }
    assert.throws(() => parseFast(header(1000000000)), /truncated binary/);
});

test('explicit full resolution disables sampling and preserves every source point', () => {
    const values = Array.from({length: 123}, (_, i) => [i, -i, i / 2, i, i % 65]);
    const cloud = preparePreview(fixture(values), 0);
    assert.equal(cloud.points, 123);
    assert.equal(cloud.sourcePoints, 123);
    assert.deepEqual(Array.from(cloud.fieldData.x), values.map(v => v[0]));
    assert.deepEqual(Array.from(cloud.fieldData.tag), values.map(v => v[4]));
    assert.equal(sourcePointIndex(122, 123, 123), 122);
});

test('finite bounds ignore NaN/Inf points for camera fitting', () => {
    const cloud = preparePreview(fixture([[NaN, 1, 2, 3, 4], [2, 4, 6, 8, 10], [Infinity, 0, 0, 0, 0]]), 10);
    assert.deepEqual(cloud.center, [2, 4, 6]);
    assert.deepEqual(cloud.bounds, { min: [2, 4, 6], max: [2, 4, 6] });
});

test('12-million-point 17-byte binary recording has bounded preview arrays and no binary string allocation', () => {
    const n = 11997601;
    const head = header(n);
    const bytes = new Uint8Array(head.length + n * 17);
    bytes.set(head);
    const view = new DataView(bytes.buffer, head.length);
    view.setFloat32((n - 1) * 17, 42, true);
    view.setUint8((n - 1) * 17 + 16, 64);
    const cloud = parseFast(bytes, true, { maxPoints: 1000000 });
    assert.equal(cloud.header.headerLength, head.length);
    assert.equal(cloud.sourcePoints, n);
    assert.equal(cloud.points, 1000000);
    assert.equal(cloud.fieldData.x[999999], 42);
    assert.equal(cloud.fieldData.tag[999999], 64);
    assert.equal(Object.values(cloud.fieldData).reduce((sum, field) => sum + field.byteLength, 0), 17000000);
    assert.ok(process.memoryUsage().heapUsed < 128 * 1024 * 1024, 'binary payload must not become a JavaScript string');
});
