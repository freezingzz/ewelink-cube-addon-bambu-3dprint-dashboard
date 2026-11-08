import test from'node:test';import assert from'node:assert/strict';import{subscribeEvents}from'../events.js';
test('fatal HTTP stream closure retries with backoff, recovers once and cancels after page disposal',()=>{
 const streams=[],timers=[];let opens=0,snapshots=0;
 class Stream{readyState=0;constructor(){streams.push(this);}addEventListener(_,f){this.snapshot=f;}close(){this.closed=true;}}
 const connection=subscribeEvents({EventSourceClass:Stream,schedule:(f,ms)=>{const t={f,ms};timers.push(t);return t;},cancel:t=>t.cancelled=true,onSnapshot:()=>snapshots++,onOpen:()=>opens++});
 streams[0].onerror();assert.equal(timers.length,0); // CONNECTING is already handled by EventSource.
 streams[0].readyState=2;streams[0].onerror();streams[0].onerror();assert.equal(timers.length,1);assert.equal(timers[0].ms,1000);timers[0].f();
 streams[1].readyState=2;streams[1].onerror();assert.equal(timers[1].ms,2000);timers[1].f();streams[2].onopen();streams[2].snapshot({});assert.equal(opens,1);assert.equal(snapshots,1);
 streams[2].readyState=2;streams[2].onerror();assert.equal(timers[2].ms,1000);connection.close();assert.equal(timers[2].cancelled,true);timers[2].f();assert.equal(streams.length,3);streams[2].snapshot({});assert.equal(snapshots,1);
});
