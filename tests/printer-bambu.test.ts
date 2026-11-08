import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySnapshot } from '../packages/contracts/src/index.ts';
import { applyReport, expireFields } from '../packages/printer-bambu/src/parser.ts';
const at=new Date('2026-11-07T04:00:00Z');
const later=new Date('2026-11-07T04:00:30Z');
const base=()=>emptySnapshot('test-printer','cloud');
// All reports here are SYNTHETIC protocol fixtures, not physical H2C captures.
test('partial updates preserve previous metrics and never mutate input',()=>{
 const a=applyReport(base(),{print:{gcode_state:'RUNNING',mc_percent:1,nozzle_temper:220,mc_remaining_time:2}},at);
 const before=structuredClone(a);
 const b=applyReport(a,{print:{bed_temper:0}},later);
 assert.deepEqual(a,before);assert.equal(b.progressPercent,1);assert.equal(b.nozzleC,220);assert.equal(b.bedC,0);assert.equal(b.remainingSeconds,120);
 const ts=(b as typeof b & {fieldUpdatedAt:Record<string,string>}).fieldUpdatedAt;
 assert.equal(ts.nozzleC,at.toISOString());assert.equal(ts.bedC,later.toISOString());
});
test('unknown envelopes and acknowledgements do not refresh report freshness',()=>{
 const a=applyReport(base(),{print:{mc_percent:25}},at);
 assert.deepEqual(applyReport(a,{print:{command:'push_status',sequence_id:'9'}},later),a);
 for(const p of [null,[],{},42,'bad',{print:[]}])assert.deepEqual(applyReport(a,p,later),a);
});
test('invalid scalars become unknown without inventing zero or refreshing live data',()=>{
 const a=applyReport(base(),{print:{nozzle_temper:225,mc_percent:40}},at);
 const b=applyReport(a,{print:{nozzle_temper:-1,mc_percent:101,bed_temper:true}},later);
 assert.equal(b.nozzleC,null);assert.equal(b.progressPercent,null);assert.equal(b.bedC,null);assert.equal(b.lastReportAt,a.lastReportAt);
});
test('cloud pushall envelopes and packed temperatures',()=>{
 const packed=250*65536+215;
 const a=applyReport(base(),{pushall:{print:{gcode_state:'RUNNING',device:{nozzle:{info:[{id:0,temp:packed}]},bed:{info:{temp:65*65536+60}},ctc:{info:{temp:50*65536+40}}}}}},at);
 assert.equal(a.nozzleC,215);assert.equal(a.bedC,60);assert.equal(a.chamberC,40);assert.equal(a.connection,'online');
});
test('active nozzle temperature follows V2 extruder state',()=>{
 const a=applyReport(base(),{print:{device:{extruder:{state:18},nozzle:{info:[{id:0,temp:210},{id:1,temp:230}]}}}},at);
 assert.equal(a.nozzleC,230);
});
test('multiple AMS units and partial slots survive incremental messages',()=>{
 const a=applyReport(base(),{print:{ams:{ams:[{id:'0',humidity_raw:32,tray:[{id:'0',tray_type:'PLA',tray_color:'00FF00FF',remain:60},{id:'1',tray_type:'PETG'}]},{id:'128',humidity:3,tray:[{id:'0',tray_type:'ASA'}]}]}}},at);
 const b=applyReport(a,{print:{ams:{ams:[{id:'0',tray:[{id:'0',remain:59}]}]}}},later);
 assert.equal(b.ams.length,2);assert.equal(b.ams[0].trays[0].material,'PLA');assert.equal(b.ams[0].trays[0].remainingPercent,59);assert.equal(b.ams[0].trays[1].material,'PETG');assert.equal(b.ams[1].humidityPercent,null);
 assert.equal(b.ams[0].trays[0].color,'#00FF00');
});
test('ID-only slot is ambiguous, explicit empty type clears it',()=>{
 const a=applyReport(base(),{print:{ams:{ams:[{id:0,tray:[{id:0,tray_type:'PLA',remain:80}]}]}}},at);
 const b=applyReport(a,{print:{ams:{ams:[{id:0,tray:[{id:0}]}]}}},later);
 assert.equal(b.ams[0].trays[0].material,'PLA');assert.equal(b.lastReportAt,a.lastReportAt);
 const c=applyReport(b,{print:{ams:{ams:[{id:0,tray:[{id:0,tray_type:''}]}]}}},later);
 assert.equal(c.ams[0].trays[0].present,false);assert.equal(c.ams[0].trays[0].remainingPercent,null);
});
test('snow updates without ams object, external spool and legacy selection',()=>{
 const a=applyReport(base(),{print:{ams:{tray_now:5},device:{extruder:{info:[{id:0,snow:128*256}]}}}},at);
 assert.deepEqual(a.activeTray,{unitId:'128',trayId:'0'});
 const b=applyReport(a,{print:{device:{extruder:{info:[{id:0,snow:255*256}]}},vir_slot:[{id:'255',tray_type:'TPU',tray_color:'112233FF'}]}},later);
 assert.equal(b.activeTray,'external');assert.equal(b.externalTray?.material,'TPU');
 const c=applyReport(b,{print:{ams:{tray_now:5}}},later);
 assert.deepEqual(c.activeTray,{unitId:'1',trayId:'1'});
});
test('task switch clears old cover and stale metrics, MQTT cover is never exposed',()=>{
 const a=applyReport(base(),{print:{subtask_id:'a',subtask_name:'A',mc_percent:90,layer_num:50}},at);
 a.cover={taskId:'a',state:'available',url:'/api/cover/a'};
 const b=applyReport(a,{print:{subtask_id:'b',subtask_name:'B',cover:'https://example.org/?token=secret'}},later);
 assert.equal(b.taskId,'b');assert.equal(b.progressPercent,null);assert.equal(b.currentLayer,null);assert.deepEqual(b.cover,{taskId:'b',state:'unavailable',url:null});
 assert.equal(JSON.stringify(b).includes('secret'),false);
});
test('completion, error clear and next run handle lifecycle',()=>{
 const a=applyReport(base(),{print:{gcode_state:'FAILED',print_error:42}},at);
 assert.equal(a.lifecycle,'error');assert.equal(a.errors[0].code,'print:42');
 const b=applyReport(a,{print:{gcode_state:'FINISH',print_error:0}},later);
 assert.equal(b.progressPercent,100);assert.equal(b.remainingSeconds,0);assert.equal(b.errors.length,0);
 const c=applyReport(b,{print:{gcode_state:'PREPARE'}},later);
 assert.equal(c.progressPercent,null);assert.equal(c.remainingSeconds,null);
});
test('field expiry is independent of unrelated live reports',()=>{
 const a=applyReport(base(),{print:{nozzle_temper:220}},at);
 const b=applyReport(a,{print:{mc_percent:30}},new Date(at.getTime()+50000));
 const c=expireFields(b,new Date(at.getTime()+70000));
 assert.equal(c.nozzleC,null);assert.equal(c.progressPercent,30);assert.equal(c.freshness,'fresh');
 assert.equal(expireFields(c,new Date(at.getTime()+120000)).freshness,'stale');
});
test('parser does not relabel synthetic fixtures as cloud evidence',()=>{
 assert.equal(applyReport(emptySnapshot(),{print:{mc_percent:2}},at).provenance,'synthetic');
});
test('malformed AMS-only reports and invalid task identity cannot prove a live connection', () => {
  const initial = emptySnapshot('h2c-test', 'cloud');
  const next = applyReport(initial, { print: { subtask_id: Infinity, stg_cur: NaN, ams: { ams: [{ id: 0, humidity_raw: false, temp: -1, tray: [{ id: 0, tray_color: 'bad', remain: false, unknown: 1 }] }] }, vt_tray: { id: 255, unknown: 1 } } });
  assert.equal(next.connection, 'connecting');
  assert.equal(next.freshness, 'unknown');
  assert.equal(next.lastReportAt, null);
  assert.equal(next.taskId, null);
});
