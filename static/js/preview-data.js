import { parseFast } from './pcd-format/pcd-format.js';

export function preparePreview(data, maxPoints, onProgress) {
    const cloud = parseFast(data, true, { maxPoints, onProgress });
    const positions = new Float32Array(cloud.points * 3);
    const center = [0, 0, 0];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const fields = ['x', 'y', 'z'].map(axis => cloud.fieldData[axis]);
    const strides = ['x', 'y', 'z'].map(axis => cloud.header.count[cloud.header.fields.indexOf(axis)] || 1);
    let finitePoints = 0;
    for (let i = 0; i < cloud.points; i++) {
        const x = fields[0] ? fields[0][i * strides[0]] : 0;
        const y = fields[1] ? fields[1][i * strides[1]] : 0;
        const z = fields[2] ? fields[2][i * strides[2]] : 0;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            center[0] += x; center[1] += y; center[2] += z;
            min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
            max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
            finitePoints++;
        }
    }
    if (finitePoints) for (let j = 0; j < 3; j++) center[j] /= finitePoints;
    else for (let j = 0; j < 3; j++) min[j] = max[j] = 0;
    return { ...cloud, positions, center, bounds: { min, max } };
}
