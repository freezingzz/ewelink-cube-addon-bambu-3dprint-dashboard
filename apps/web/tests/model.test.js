import test from 'node:test';
import assert from 'node:assert/strict';
import { numberText, durationText, safeColor, safeImageUrl, statusOf, createEventGate } from '../model.js';
test('unknown numbers never become a false zero',()=>{assert.equal(numberText(null),'—');assert.equal(numberText(0),'0');assert.equal(numberText(false),'—');assert.equal(durationText(null),'—');assert.equal(durationText(61),'2 分钟');});
test('untrusted styles and cross-origin cover addresses are rejected',()=>{assert.equal(safeColor('red;display:none'),'#c8cbc8');assert.equal(safeImageUrl('javascript:alert(1)','http://localhost'),null);assert.equal(safeImageUrl('https://other.test/a','http://localhost'),null);assert.equal(safeImageUrl('/a','http://localhost'),'http://localhost/a');});
test('offline and stale states take precedence over last printing lifecycle',()=>{assert.equal(statusOf({connection:'offline',lifecycle:'printing'}).label,'打印机离线');assert.equal(statusOf({connection:'online',freshness:'stale',lifecycle:'printing'}).label,'数据已过期');});
test('SSE gate rejects duplicate and out-of-order snapshots and permits a new session',()=>{const accept=createEventGate();const event={type:'snapshot',sessionId:'a',sequence:1,snapshot:{}};assert.equal(accept(event),true);assert.equal(accept(event),false);assert.equal(accept({...event,sequence:0}),false);assert.equal(accept({...event,sessionId:'b',sequence:0}),true);assert.equal(accept({...event,sequence:-1}),false);});

// H2C idle reports can use -1 as an internal stage sentinel.
test('numeric stage sentinels use the readable lifecycle label', () => {
  assert.equal(statusOf({connection:'online',freshness:'fresh',lifecycle:'idle',stage:'-1'}).note,'待机');
});
