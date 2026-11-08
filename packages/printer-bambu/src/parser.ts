/**
 * Protocol mapping adapted from cptkirki/PrintSphere @32ad5aeb, FNCL v1.1.
 * Changed: independent TS implementation, immutable snapshots, strict unknowns,
 * no approximate humidity, no signed URL exposure, per-field observation times.
 * See ../NOTICE.md and ../UPSTREAM_LICENSE.
 */
import type { PrinterSnapshot, Tray, AmsUnit, Lifecycle } from '../../contracts/src/index.ts';
type RecordValue = Record<string, unknown>;
type TimedSnapshot = PrinterSnapshot & { fieldUpdatedAt?: Record<string, string> };
const object = (x: unknown): RecordValue => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as RecordValue : {};
const list = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const has = (r: RecordValue, k: string): boolean => Object.hasOwn(r, k);
function numeric(x: unknown): number | null {
  if (typeof x !== 'number' && typeof x !== 'string') return null;
  if (typeof x === 'string' && !x.trim()) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function bounded(x: unknown, min: number, max: number): number | null {
  const n = numeric(x); return n !== null && n >= min && n <= max ? n : null;
}
function identifier(x: unknown): string | null {
  if ((typeof x === 'string' && /^\d{1,12}$/.test(x)) || (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0)) return String(x);
  return null;
}
function temperature(x: unknown): number | null {
  let n = numeric(x);
  if (n === null || n < 0 || n > 0xFFFFFFFF) return null;
  if (n > 0xFFFF && Number.isInteger(n)) n = n % 65536;
  return n <= 500 ? n : null;
}
function mergeTray(previous: Tray | undefined, item: RecordValue, id: string): Tray {
  const next: Tray = previous ? { ...previous } : { id, present: null, material: null, color: null, remainingPercent: null };
  // ID-only is ambiguous in partial reports: preserve known values, never infer empty.
  if (has(item, 'tray_type')) {
    if (typeof item.tray_type === 'string') {
      next.material = item.tray_type || null;
      next.present = Boolean(item.tray_type);
      if (!next.present) { next.color = null; next.remainingPercent = null; }
    }
  }
  if (has(item, 'tray_color')) {
    next.color = typeof item.tray_color === 'string' && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(item.tray_color)
      ? '#' + item.tray_color.slice(0, 6).toUpperCase() : null;
  }
  if (has(item, 'remain')) next.remainingPercent = bounded(item.remain, 0, 100);
  return next;
}
function validTrayObservation(item: RecordValue): boolean {
  return (has(item, 'tray_type') && typeof item.tray_type === 'string')
    || (typeof item.tray_color === 'string' && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(item.tray_color))
    || (has(item, 'remain') && bounded(item.remain, 0, 100) !== null);
}
const states: Record<string, Lifecycle> = {
  IDLE: 'idle', READY: 'idle', PREPARE: 'preparing', PREPARING: 'preparing', INIT: 'preparing',
  RUNNING: 'printing', PRINTING: 'printing', PAUSE: 'paused', PAUSED: 'paused',
  FINISH: 'finished', FINISHED: 'finished', FAILED: 'error', ERROR: 'error'
};
/** Only MQTT print / pushall.print envelopes are accepted. No network I/O. */
export function applyReport(previous: PrinterSnapshot, payload: unknown, now = new Date()): PrinterSnapshot {
  const root = object(payload);
  const print = object(root.print ?? object(root.pushall).print);
  const next = structuredClone(previous) as TimedSnapshot;
  const observed = { ...(next.fieldUpdatedAt ?? {}) };
  const stamp = now.toISOString();
  let validReport = false;
  const touch = (key: string) => { observed[key] = stamp; validReport = true; };
  const assignNumber = (key: 'progressPercent'|'remainingSeconds'|'currentLayer'|'totalLayers'|'nozzleC'|'bedC'|'chamberC', r: RecordValue, source: string, decoder: (v: unknown) => number|null) => {
    if (!has(r, source)) return;
    const value = decoder(r[source]);
    next[key] = value;
    // Invalid values clear a previous value but do not prove a live report.
    if (value !== null) touch(key);
  };
  const rawId = print.subtask_id ?? print.task_id;
  const task = ((typeof rawId === 'string' && rawId.trim().length > 0 && rawId.length <= 200) || (typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId >= 0)) && String(rawId) !== '0' ? String(rawId) : null;
  const rawStatus = typeof print.gcode_state === 'string' ? print.gcode_state.toUpperCase() : null;
  const lifecycle = rawStatus ? states[rawStatus] ?? 'unknown' : null;
  const isNewRun = lifecycle && ['printing','preparing'].includes(lifecycle) && ['finished','idle'].includes(previous.lifecycle);
  if ((task !== null && task !== previous.taskId) || isNewRun) {
    next.progressPercent = next.remainingSeconds = next.currentLayer = next.totalLayers = null;
    next.jobName = null; next.stage = null;
    if (task === null) next.taskId = null;
    if (task !== null && lifecycle === null) next.lifecycle = 'unknown';
    next.cover = { taskId: task, state: 'unavailable', url: null };
    for (const k of ['progressPercent','remainingSeconds','currentLayer','totalLayers','jobName','stage','cover']) delete observed[k];
  }
  if (task !== null) { next.taskId = task; touch('taskId'); }
  if (lifecycle !== null) { next.lifecycle = lifecycle; if (lifecycle !== 'unknown') touch('lifecycle'); }
  for (const key of ['subtask_name','gcode_file']) {
    if (typeof print[key] === 'string') { next.jobName = print[key] || null; touch('jobName'); break; }
  }
  const stage = print.current_stage ?? print.stage_name ?? print.stg_cur;
  if (typeof stage === 'string' || (typeof stage === 'number' && Number.isFinite(stage))) { next.stage = String(stage); touch('stage'); }
  assignNumber('progressPercent',print,'mc_percent',v=>bounded(v,0,100));
  assignNumber('remainingSeconds',print,'mc_remaining_time',v=>{const n=bounded(v,0,1000000);return n === null ? null : n*60;});
  assignNumber('currentLayer',print,'layer_num',v=>{const n=bounded(v,0,1000000);return n!==null && Number.isInteger(n)?n:null;});
  assignNumber('totalLayers',print,'total_layer_num',v=>{const n=bounded(v,0,1000000);return n!==null && Number.isInteger(n)?n:null;});
  assignNumber('nozzleC',print,'nozzle_temper',temperature);
  assignNumber('bedC',print,'bed_temper',temperature);
  assignNumber('chamberC',print,'chamber_temper',temperature);
  const device=object(print.device), extruder=object(device.extruder);
  const state=bounded(extruder.state,0,65535);
  const activeNozzle=state===null?0:Math.floor(state/16)%16;
  const nozzleEntries=[...list(object(device.nozzle).info),...list(extruder.info)];
  const active=nozzleEntries.map(object).find(x=>numeric(x.id)===activeNozzle && has(x,'temp'));
  if(active) assignNumber('nozzleC',active,'temp',temperature);
  for(const [field, container] of [['bedC','bed'],['chamberC','chamber'],['chamberC','ctc']] as const){
    const info=object(object(device[container]).info);
    assignNumber(field,info,'temp',temperature);
  }
  assignNumber('bedC',device,'bed_temp',temperature);
  const ams=object(print.ams);
  for (const raw of list(ams.ams)) {
    const item=object(raw), id=identifier(item.id); if(id===null) continue;
    const old=next.ams.find(x=>x.id===id);
    const unit:AmsUnit=old?structuredClone(old):{id,humidityPercent:null,temperatureC:null,trays:[]};
    if(has(item,'humidity_raw')) unit.humidityPercent=bounded(item.humidity_raw,0,100);
    if(has(item,'temp')) unit.temperatureC=bounded(item.temp,0,100);
    for(const trayRaw of list(item.tray)){
      const t=object(trayRaw), trayId=identifier(t.id); if(trayId===null)continue;
      const i=unit.trays.findIndex(x=>x.id===trayId);
      const merged=mergeTray(unit.trays[i],t,trayId);
      if(i<0)unit.trays.push(merged);else unit.trays[i]=merged;
    }
    const i=next.ams.findIndex(x=>x.id===id);if(i<0)next.ams.push(unit);else next.ams[i]=unit;
    if((has(item,'humidity_raw') && bounded(item.humidity_raw,0,100)!==null)
      || (has(item,'temp') && bounded(item.temp,0,100)!==null)
      || list(item.tray).some(x=>validTrayObservation(object(x)))) touch('ams');
  }
  if(has(ams,'tray_now')){
    const tray=bounded(ams.tray_now,0,65535);
    next.activeTray=tray===254?'external':tray!==null&&Number.isInteger(tray)&&tray<254?(tray>=128?{unitId:String(tray),trayId:'0'}:{unitId:String(Math.floor(tray/4)),trayId:String(tray%4)}):null;
    if(tray!==null)touch('activeTray');
  }
  const snowInfo=list(extruder.info).map(object).find(x=>numeric(x.id)===activeNozzle&&has(x,'snow'));
  if(snowInfo){
    const snow=bounded(snowInfo.snow,0,65535);
    if(snow!==null && Number.isInteger(snow)){
      const unitId=Math.floor(snow/256), trayId=snow%256;
      next.activeTray=unitId===255?'external':{unitId:String(unitId),trayId:String(trayId)};
      touch('activeTray');
    }
  }
  const external=list(print.vir_slot).map(object).find(x=>String(x.id)==='255') ?? (has(print,'vt_tray')?object(print.vt_tray):has(ams,'vt_tray')?object(ams.vt_tray):null);
  if(external){next.externalTray=mergeTray(next.externalTray??undefined,external,'255');if(validTrayObservation(external))touch('externalTray');}
  if(has(print,'print_error')){
    const code=bounded(print.print_error,0,0xFFFFFFFF);
    if(code!==null){
      next.errors=next.errors.filter(x=>!x.code.startsWith('print:'));
      if(code!==0)next.errors.push({code:'print:'+String(code),message:'打印机报告错误 '+String(code),severity:'error'});
      touch('errors');
    }
  }
  if(lifecycle==='finished'){next.progressPercent=100;next.remainingSeconds=0;touch('progressPercent');touch('remainingSeconds');}
  if(next.lifecycle==='printing'&&(next.currentLayer??0)>0&&stage===undefined&&next.stage!==null&&/prepar|clean|level|^0$/.test(next.stage))next.stage=null;
  if(validReport){next.lastReportAt=stamp;next.freshness='fresh';next.connection='online';next.fieldUpdatedAt=observed;}
  return next;
}
/** Call on a timer: stale report fields are hidden, not refreshed by unrelated data. */
export function expireFields(previous: PrinterSnapshot, now = new Date(), maxAgeMs = 60000): PrinterSnapshot {
  const next=structuredClone(previous) as TimedSnapshot;
  if(!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw new RangeError('Invalid maxAgeMs');
  const times=next.fieldUpdatedAt??{};
  for(const key of ['nozzleC','bedC','chamberC','progressPercent','remainingSeconds','currentLayer','totalLayers'] as const){
    if(times[key] && now.getTime()-Date.parse(times[key])>maxAgeMs) next[key]=null;
  }
  if(previous.lastReportAt && now.getTime()-Date.parse(previous.lastReportAt)>maxAgeMs)next.freshness='stale';
  return next;
}
