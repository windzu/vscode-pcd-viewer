import { forEachChunk } from './chunked-work.js';

export function fieldRange(data, stride, points) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < points; i++) {
        const value = data[i * stride];
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return min === Infinity ? [0, 0] : [min, max];
}

export async function fillScalarColors(target, data, stride, range, options) {
    const [min, max] = range;
    const scale = max === min ? 0 : 255 / (max - min);
    return forEachChunk(target.length, (start, end) => {
        for (let i = start; i < end; i++) {
            const value = data[i * stride];
            const index = Math.floor((value - min) * scale);
            target[i] = Number.isFinite(index) ? Math.max(0, Math.min(255, index)) : 0;
        }
    }, options);
}

export async function fillPackedColors(target, data, stride, type, alpha, options) {
    const bits = type === 'F' && data.BYTES_PER_ELEMENT === 4
        ? new Uint32Array(data.buffer, data.byteOffset, data.length) : null;
    const scratch = new Float32Array(1);
    const scratchBits = new Uint32Array(scratch.buffer);
    return forEachChunk(target.length / 4, (start, end) => {
        for (let i = start; i < end; i++) {
            let packed;
            if (bits) packed = bits[i * stride];
            else if (type === 'F') {
                scratch[0] = data[i * stride];
                packed = scratchBits[0];
            } else packed = data[i * stride] >>> 0;
            target[i * 4] = (packed >>> 16) & 255;
            target[i * 4 + 1] = (packed >>> 8) & 255;
            target[i * 4 + 2] = packed & 255;
            target[i * 4 + 3] = alpha ? (packed >>> 24) & 255 : 255;
        }
    }, options);
}
