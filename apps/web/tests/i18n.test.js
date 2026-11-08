import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { english } from '../messages.js';
import { resolveLocale, setLocale, getLocale, t } from '../i18n.js';
import { durationText, statusOf, lifecycleLabels, reportTime } from '../model.js';
import { displaySnapshot, errorMessage } from '../display.js';
import { previewSpec } from '../preview-sizes.js';

test('locale priority is explicit URL, saved preference, browser, then English',()=>{
 assert.equal(resolveLocale({query:'en',saved:'zh-CN',browser:'zh-TW'}),'en');
 assert.equal(resolveLocale({query:'invalid',saved:'zh',browser:'en-US'}),'zh-CN');
 assert.equal(resolveLocale({browser:'zh-TW'}),'zh-CN');assert.equal(resolveLocale({browser:'fr-FR'}),'en');
 assert.equal(resolveLocale({saved:'en',browser:'zh-CN'}),'en');
});
test('catalog covers UI source messages and preserves every interpolation',()=>{
 for(const [key,value]of Object.entries(english)){
  assert.ok(value.trim(),key);assert.doesNotMatch(value,/[\u3400-\u9fff]/u,key);
  const fields=s=>[...new Set(s.match(/\{\d+\}/g)||[])].sort();assert.deepEqual(fields(value),fields(key),key);
 }
 for(const name of ['admin-shell.js','admin.js','setup.js','app.js','tiles.js','model.js','preview.js','preview-sizes.js','display.js','unlock.js','unlock.html','cast-config.js','cast-config.html','cast-cards.js','admin.html','setup.html','index.html']){
  const source=readFileSync(new URL('../'+name,import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,'');
  const keys=name.endsWith('.html')?[...source.matchAll(/>([^<>]+)</g),...source.matchAll(/(?:aria-label|title|placeholder)="([^"]+)"/g)].map(m=>m[1].trim()):[...source.matchAll(/(?:"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)')/g)].map(m=>m[1]??m[2]);
  for(const key of keys.filter(key=>key!=='简体中文'&&/[\u3400-\u9fff]/u.test(key)))assert.ok(Object.hasOwn(english,key),`${name}: ${key}`);
 }
});
test('switching locale updates computed labels, durations, metadata and code-based errors',()=>{
 try{
  setLocale('en');assert.equal(getLocale(),'en');assert.equal(lifecycleLabels.idle,'Idle');assert.equal(durationText(5760),'1h 36m');assert.equal(durationText(0),'0m');assert.equal(durationText(null),'—');
  assert.equal(statusOf({connection:'offline',lifecycle:'printing'}).label,'Printer offline');
  assert.equal(t('槽 {0}', '<script>'),'Slot <script>'); // text-only rendering remains the caller’s job
  assert.match(reportTime('2026-11-07T12:00:00Z'),/^Updated /);
  assert.match(previewSpec('cast').basis,/Desktop · 12 columns/);
  assert.equal(errorMessage({code:'print:42',message:'irrelevant'}),'Printer reported error 42');
  assert.match(errorMessage({code:'CLOUD_AUTH_REQUIRED'}),/Sign in again/);
  const raw={provenance:'cloud',name:'我的 H2C',jobName:'我的任务',stage:'厂商阶段',errors:[{code:'VENDOR',message:'厂商信息'}]};
  assert.deepEqual(displaySnapshot(raw),raw);assert.equal(raw.name,'我的 H2C');
  setLocale('zh-CN');assert.equal(lifecycleLabels.idle,'待机');assert.equal(durationText(5760),'1 小时 36 分');
 }finally{setLocale('zh-CN');}
});
