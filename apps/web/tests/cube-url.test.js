import test from 'node:test';import assert from 'node:assert/strict';
import{cardSearchParams}from'../cube-url.js';
test('CUBE drawer suffix does not corrupt existing layout or locale queries',()=>{
 const p=cardSearchParams('?layout=detail&lang=en?ihost_env=iHostWebCustomCardDrawer');assert.equal(p.get('layout'),'detail');assert.equal(p.get('lang'),'en');assert.equal(p.get('ihost_env'),'iHostWebCustomCardDrawer');
 assert.equal(cardSearchParams('?layout=detail?ihost_env=iHostWebCustomCardDrawer').get('layout'),'detail');
 assert.equal(cardSearchParams('?printerId=custom%3Fvalue&layout=wide').get('printerId'),'custom?value');
});
