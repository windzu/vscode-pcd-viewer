import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitCloudView } from '../static/js/view-math.js';

test('cloud framing contains off-origin bounds in both portrait and landscape frusta', () => {
    const bounds = { min: [950, 2000, -40], max: [1050, 2040, 60] };
    for (const aspect of [0.4, 1, 2.5]) {
        const target = [1000, 2020, 10];
        const { distance, radius } = fitCloudView(bounds, target, 75, aspect);
        for (const x of bounds.min.slice(0, 1).concat(bounds.max[0])) {
            for (const y of [bounds.min[1], bounds.max[1]]) {
                for (const z of [bounds.min[2], bounds.max[2]]) {
                    assert.ok(Math.hypot(x-target[0], y-target[1], z-target[2]) <= radius);
                }
            }
        }
        const angle = Math.asin(radius / distance);
        assert.ok(angle < 75 * Math.PI / 360);
        assert.ok(angle < Math.atan(Math.tan(75 * Math.PI / 360) * aspect));
        assert.ok(fitCloudView(bounds, [0, 0, 0], 75, aspect).distance > distance);
    }
});

test('empty and single-position clouds have finite positive framing distances', () => {
    const result = fitCloudView({min:[0,0,0],max:[0,0,0]}, [0,0,0], 75, 1);
    assert.ok(Number.isFinite(result.distance) && result.distance > 0);
});
