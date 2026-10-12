import { forEachChunk } from './chunked-work.js';

// Origin/direction are in cloud coordinates; direction must have unit length.
// Keep only the nearest ray hit instead of allocating/sorting every intersection.
export async function pickNearestPoint(positions, origin, direction, threshold, {
    near = 0, far = Infinity, ...workOptions
} = {}) {
    let index = null, nearest = Infinity;
    const thresholdSquared = threshold * threshold;
    const completed = await forEachChunk(positions.length / 3, (start, end) => {
        for (let i = start; i < end; i++) {
            const x = positions[i * 3] - origin[0];
            const y = positions[i * 3 + 1] - origin[1];
            const z = positions[i * 3 + 2] - origin[2];
            const dot = x * direction[0] + y * direction[1] + z * direction[2];
            const distance = Math.max(0, dot);
            if (!Number.isFinite(distance) || distance < near || distance > far || distance >= nearest) continue;
            const dx = x - distance * direction[0];
            const dy = y - distance * direction[1];
            const dz = z - distance * direction[2];
            const rayDistanceSquared = dx*dx + dy*dy + dz*dz;
            if (rayDistanceSquared < thresholdSquared) {
                nearest = distance;
                index = i;
            }
        }
    }, workOptions);
    return { index: completed ? index : null, cancelled: !completed };
}
