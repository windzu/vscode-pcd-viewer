import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameScheduler } from '../static/js/frame-scheduler.js';

test('render requests coalesce; damping can continue but idle and hidden views stop', () => {
    const callbacks = new Map();
    let next = 0, painted = 0, visible = true, damping = true;
    const scheduler = createFrameScheduler(() => {
        painted++;
        if (damping) { damping = false; scheduler.invalidate(); }
    }, { request: callback => { callbacks.set(++next, callback); return next; },
        cancel: id => callbacks.delete(id), isVisible: () => visible });
    const flush = () => { const entries = [...callbacks.values()]; callbacks.clear(); entries.forEach(fn => fn()); };
    for (let i=0;i<10;i++) scheduler.invalidate();
    assert.equal(callbacks.size, 1);
    flush();
    assert.equal(painted, 1);
    assert.equal(callbacks.size, 1);
    flush();
    assert.equal(painted, 2);
    assert.equal(callbacks.size, 0);
    scheduler.invalidate(); visible = false; scheduler.suspend(); scheduler.invalidate();
    assert.equal(callbacks.size, 0);
    visible = true; scheduler.invalidate(); flush();
    assert.equal(painted, 3);
    scheduler.dispose(); scheduler.invalidate();
    assert.equal(callbacks.size, 0);
});
