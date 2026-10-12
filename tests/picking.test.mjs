import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickNearestPoint } from '../static/js/point-picking.js';

test('nearest picking preserves exact point index and applies near/far clipping', async () => {
    const positions = new Float32Array([0,0,10, 0.1,0,3, 4,0,2, NaN,0,1, 0,0,-1, 0,0,5]);
    const args = [positions, [0,0,0], [0,0,1], 0.2];
    assert.deepEqual(await pickNearestPoint(...args, {near:1}), {index:1,cancelled:false});
    assert.deepEqual(await pickNearestPoint(...args, {near:4,far:6}), {index:5,cancelled:false});
    assert.deepEqual(await pickNearestPoint(...args, {near:6,far:9}), {index:null,cancelled:false});
});

test('picking a dense cloud yields and can discard a stale result without a hit list', async () => {
    const positions = new Float32Array(300000);
    for (let i=0;i<positions.length/3;i++) positions[i*3+2]=10-i/100000;
    let clock=0, ticks=0, cancelled=false;
    const options={near:1,now:()=>++clock*5,yieldTask:async()=>{ticks++;cancelled=true},isCancelled:()=>cancelled};
    assert.deepEqual(await pickNearestPoint(positions,[0,0,0],[0,0,1],1,options),{index:null,cancelled:true});
    assert.equal(ticks,1);
    assert.deepEqual(await pickNearestPoint(positions,[0,0,0],[0,0,1],1,{near:1}),{index:99999,cancelled:false});
});
