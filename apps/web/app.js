import { renderCastCard } from './cast-cards.js';
import { subscribeEvents } from './events.js';
import { cardSearchParams } from './cube-url.js';
import { displaySnapshot } from './display.js';
import { t, getLocale, onLocaleChange, bindStatic, sourceKey } from './i18n.js';
import { icon } from './icons.js';
import { lifecycleLabels, connectionLabels, numberText, durationText, progressValue, safeColor, safeImageUrl, reportTime, statusOf, isActiveTray, createEventGate } from './model.js';
import { mountShell } from './admin-shell.js';
import { renderTile } from './tiles.js';
import { mountPreview } from './preview.js';

bindStatic();
const $ = id => document.getElementById(id);
const params = cardSearchParams(location.search);
document.documentElement.dataset.cubeDrawer=String(params.get('ihost_env')==='iHostWebCustomCardDrawer');
const castView=['status','ams','summary'].includes(params.get('view'))?params.get('view'):null;
const layouts = ['wide', 'compact', 'cast', 'detail'];
const embedded = location.pathname === '/card' || location.pathname.startsWith('/card/');
let layout = layouts.includes(params.get('layout')) ? params.get('layout') : 'wide';
let snapshot = null;
let printerId = null;
let transportLost = false;
let unavailable = false;
let source;
let messageKey='', messageError=false;
let selectedScenario = null;
let scenarioVersion = 0;
let lastCoverErrorKey = null;
const acceptEvent = createEventGate();

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = String(text); return node; }
function append(parent, ...children) { children.filter(Boolean).forEach(child => parent.append(child)); return parent; }
function pair(label, value, extra = '') { return append(el('div', `metric ${extra}`), el('span', 'metric-label', label), el('strong', 'metric-value', value)); }
function message(text, error = false) { messageKey=sourceKey(text||'');messageError=error; const node = $('transport-message'); node.hidden = !text; node.classList.toggle('error', error); node.textContent = text || ''; }

function renderCover(s, detail = false) {
  const node = el('div', `cover ${detail ? 'cover-detail' : ''}`);
  const url = s.cover?.state === 'available' && s.cover.taskId === s.taskId ? safeImageUrl(s.cover.url, location.origin) : null;
  const coverKey = `${s.taskId}|${url}`;
  if (url && coverKey !== lastCoverErrorKey) {
    const image = el('img', 'cover-image'); image.alt = t("{0}的封面", s.jobName || t("当前任务")); image.src = url;
    image.addEventListener('error', () => { lastCoverErrorKey = coverKey; if (snapshot?.taskId === s.taskId) render(); }, { once: true });
    append(node, image, el('span', 'cover-caption', s.provenance === 'synthetic' ? t("合成任务封面") : t("当前任务封面")));
  } else {
    const isError = s.cover?.state === 'error' || coverKey === lastCoverErrorKey;
    append(node, el('div', 'cover-placeholder-icon', '◇'), el('strong', '', isError ? t("封面暂不可用") : s.cover?.state === 'loading' ? t("封面加载中") : t("暂无任务封面")), el('span', '', isError ? t("打印状态仍会持续更新") : t("有可用封面时会在这里显示")));
  }
  return node;
}

function renderAms(s) {
  const section = el('section', 'ams-section');
  append(section, append(el('div', 'section-heading'), el('h3', '', t("耗材仓")), el('span', 'section-count', t("{0} 个 AMS 单元", s.ams?.length || 0))));
  if (!s.capabilities?.ams) { append(section, el('p', 'empty-note', t("当前数据源未提供 AMS 能力"))); return section; }
  if (!s.ams?.length) append(section, el('p', 'empty-note', t("尚未收到 AMS 数据；未收到不代表未安装。")));
  for (const unit of s.ams || []) {
    const unitNode = el('div', 'ams-unit');
    append(unitNode, append(el('div', 'ams-unit-heading'), el('strong', '', `AMS · ${unit.id}`), el('span', '', t("湿度 {0}  /  {1}", numberText(unit.humidityPercent, 0, '%'), numberText(unit.temperatureC, 1, '°C')))));
    const trays = el('div', 'trays');
    for (const tray of unit.trays || []) {
      const active = isActiveTray(s.activeTray, unit.id, tray.id);
      const slot = el('div', `tray ${active ? 'active' : ''} ${tray.present === false ? 'empty' : ''}`);
      slot.style.setProperty('--filament', safeColor(tray.color));
      append(slot, append(el('div', 'tray-top'), el('span', 'slot-id', t("槽 {0}", tray.id)), active ? el('span', 'using-tag', t("使用中")) : null), el('div', 'spool', '◉'), el('strong', 'tray-material', tray.present === false ? t("空槽") : tray.material || t("材料未知")), el('span', 'tray-remaining', tray.present === false ? '—' : t("余量 {0}", numberText(tray.remainingPercent, 0, '%'))));
      append(trays, slot);
    }
    append(unitNode, trays); append(section, unitNode);
  }
  if (s.externalTray || s.activeTray === 'external') {
    const tray = s.externalTray;
    append(section, append(el('div', 'external-tray'), el('span', '', t("外置料盘")), el('strong', '', tray?.material || t("材料未知")), el('span', s.activeTray === 'external' ? 'using-tag' : '', s.activeTray === 'external' ? t("使用中") : t("待用"))));
  }
  return section;
}

function render() {
  if (!snapshot) return;
  const s = displaySnapshot(snapshot);
  document.documentElement.dataset.castState = s.connection==='offline'||s.connection==='error'?'offline':s.freshness==='fresh'&&['printing','preparing','paused','finished','error'].includes(s.lifecycle)?'active':'idle';
  if (!embedded) {
    mountPreview($('card-stage'), layout);
    $('demo-notice').hidden = s.provenance !== 'synthetic';
    $('scenario-select').disabled = s.provenance !== 'synthetic' || $('scenario-select').options.length === 0;
    if (transportLost) message(t("预览页与后台的实时连接已断开，正在重连。"));
    return;
  }
  if (layout==='cast'&&castView){const stage=$('card-stage');stage.className='card-stage layout-cast';stage.replaceChildren(renderCastCard(s,castView,params.get('unit')||'active',renderCover,transportLost));$('demo-notice').hidden=true;message('');return;}
  if (layout !== 'detail' && innerHeight <= 220) {
    const stage = $('card-stage'); stage.className = `card-stage layout-${layout}`;
    stage.replaceChildren(renderTile(s, layout, renderCover, { transportLost }));
    $('demo-notice').hidden = true;
    message('');
    return;
  }
  const status = statusOf(s);
  const p = progressValue(s.progressPercent);
  const stage = $('card-stage'); stage.className = `card-stage layout-${layout}`;
  const card = el('article', `printer-card tone-${status.tone}`);
  const header = el('header', 'card-header');
  append(header, append(el('div', 'printer-identity'), append(el('div', 'printer-symbol'),icon('printer',26)), append(el('div'), el('p', 'eyebrow', 'BAMBU LAB'), el('h2', '', s.name || s.model || t("打印机")))), append(el('div', 'status-badge'), el('span', 'dot'), el('span', '', status.label)));
  append(card, header);
  const content = el('div', 'card-content');
  const cover = renderCover(s, layout === 'detail');
  const info = el('div', 'print-info');
  append(info, el('p', 'eyebrow', t("CURRENT PRINT / 当前任务")), el('h3', 'job-name', s.jobName || (s.lifecycle === 'idle' ? t("准备迎接下一个创作") : t("任务名称未知"))));
  if (layout !== 'compact') append(info, el('p', 'stage-note', status.note || lifecycleLabels[s.lifecycle] || t("等待打印状态")));
  const progress = el('div', 'progress-summary');
  append(progress, append(el('div', 'progress-number'), el('strong', '', p === null ? '—' : numberText(p)), el('span', '', p === null ? '' : '%')), pair(t("预计剩余"), durationText(s.remainingSeconds), 'remaining'));
  append(info, progress);
  const track = el('div', 'progress-track'); track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', t("打印进度")); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); if (p !== null) track.setAttribute('aria-valuenow', String(p)); else track.setAttribute('aria-valuetext', t("未知"));
  const fill = el('div', 'progress-fill'); fill.style.width = `${p ?? 0}%`; append(track, fill); append(info, track);
  append(info, append(el('div', 'print-metrics'), pair(t("喷嘴温度"), numberText(s.nozzleC, 0, '°C')), pair(t("热床温度"), numberText(s.bedC, 0, '°C')), pair(t("打印层数"), `${numberText(s.currentLayer)} / ${numberText(s.totalLayers)}`)));
  append(content, cover, info); append(card, content);
  if (layout === 'detail' || layout === 'cast') append(card, renderAms(s));
  if (layout === 'wide' || layout === 'cast') {
    const materials = (s.ams || []).flatMap(unit => (unit.trays || []).filter(t => t.present !== false).map(tray => ({unit, tray})));
    const strip = el('div', 'material-strip'); append(strip, el('span', 'metric-label', 'AMS'));
    for (const {unit, tray} of materials.slice(0, 8)) { const swatch = el('span', `filament-swatch ${isActiveTray(s.activeTray, unit.id, tray.id) ? 'active' : ''}`); swatch.style.setProperty('--filament', safeColor(tray.color)); swatch.title = t("AMS {0} 槽 {1} · {2}", unit.id, tray.id, tray.material || t("未知")); append(strip, swatch); }
    append(strip, el('span', 'material-caption', s.ams?.length ? t("{0} 个 AMS · 详情查看耗材", s.ams.length) : t("等待耗材数据"))); append(card, strip);
  }
  if (s.errors?.length) {
    const errorList = el('div', 'error-list');
    for (const err of s.errors) append(errorList, append(el('div', `printer-error ${err.severity === 'warning' ? 'warning' : ''}`), el('strong', '', err.severity === 'warning' ? t("注意") : t("异常")), el('span', '', err.message || t("打印机报告异常")), el('code', '', err.code)));
    append(card, errorList);
  }
  if (layout === 'detail') append(card, append(el('div', 'connection-details'), pair(t("采集连接"), connectionLabels[s.connection] || t("未知")), pair(t("数据源"), s.provenance === 'synthetic' ? t("合成 / 云端格式") : t("拓竹云端")), pair(t("腔体温度"), numberText(s.chamberC, 0, '°C'))));
  const footer = el('footer', 'card-footer');
  append(footer, append(el('span', 'data-origin'), el('span', `origin-dot ${s.provenance === 'synthetic' ? 'synthetic' : ''}`), el('span', '', s.provenance === 'synthetic' ? t("合成演示 · 非实机数据") : t("云端数据"))), el('span', 'last-update', `${reportTime(s.lastReportAt)}${s.freshness === 'stale' ? t(" · 已过期") : ''}`)); append(card, footer);
  stage.replaceChildren(card);
  $('demo-notice').hidden = embedded || s.provenance !== 'synthetic';
  if (!embedded) $('scenario-select').disabled = s.provenance !== 'synthetic' || $('scenario-select').options.length === 0;
  if (transportLost) message(t("页面与后台的实时连接已断开，正在重连；下方保留的是最后收到的数据。"));
}

function renderUnavailable() { $('card-stage').replaceChildren(append(el('div', 'loading-card'), el('strong', '', t("暂时无法取得打印机状态")), el('p', '', t("请确认本地服务已启动，再刷新页面。")))); }

async function json(url, options) { const response = await fetch(url, { cache: 'no-store', ...options }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
function setLayout(value, preserveSize = false) {
  layout = layouts.includes(value) ? value : 'wide';
  document.documentElement.dataset.surface=embedded?(layout==='cast'?'cast':'card'):'preview';
  document.documentElement.dataset.frame=window.parent===window?'standalone':'embedded';
  document.querySelectorAll('[data-layout]').forEach(button => { const selected = button.dataset.layout === layout; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  const url = new URL(location.href); url.search=cardSearchParams(location.search).toString(); url.searchParams.set('layout', layout); if (!preserveSize) for (const key of ['width', 'height']) url.searchParams.delete(key); history.replaceState(null, '', url); render();
}
async function loadScenarios() {
  try {
    const {scenarios} = await json('/api/v1/demo/scenarios');
    const select = $('scenario-select'); select.replaceChildren();
    for (const scenario of scenarios || []) { const option = el('option', '', t(scenario.label)); option.value = scenario.id; option.dataset.source=scenario.label; select.append(option); }
    if (select.options.length) selectedScenario = select.value;
    select.disabled = false;
  } catch { $('scenario-select').replaceChildren(el('option', '', t("当前未开放演示切换"))); }
}
async function changeScenario() {
  const select = $('scenario-select'); const previous = selectedScenario; const version = ++scenarioVersion; select.disabled = true;
  try { await json('/api/v1/demo/scenario', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: select.value}) }); if (version === scenarioVersion) { selectedScenario = select.value; message(''); } }
  catch { select.value = previous || ''; message(t("演示场景切换失败，请稍后重试。"), true); }
  finally { select.disabled = snapshot?.provenance !== 'synthetic'; }
}
async function start() {
  document.body.classList.toggle('embedded', embedded);
  if(!embedded) mountShell('preview');
  if (embedded) for (const id of ['page-header', 'page-intro', 'preview-toolbar', 'preview-footer', 'page-footer']) $(id).hidden = true;
  document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => setLayout(button.dataset.layout)));
  $('scenario-select').addEventListener('change', changeScenario); setLayout(layout, true);
  if (!embedded) {
    void json('/healthz').then(health => {
      $('cloud-setup-link').hidden = !health.setupEnabled;
      if (health.mode === 'demo') loadScenarios();
      else { $('scenario-select').replaceChildren(el('option', '', t("实时云端数据"))); $('scenario-select').disabled = true; }
    }).catch(()=>{});
  }
  try {
    const list = await json('/api/v1/printers');
    const first = list.printers?.find(p => p.printerId === params.get('printerId')) || list.printers?.[0];
    if (!first) throw new Error('No printer');
    printerId = first.printerId;
    snapshot = await json(`/api/v1/printers/${encodeURIComponent(printerId)}/snapshot`); render();
    if(layout==='cast'&&castView){let stopped=false,timer;const poll=async()=>{try{snapshot=await json(`/api/v1/printers/${encodeURIComponent(printerId)}/snapshot`);transportLost=false;}catch{transportLost=true;}if(!stopped){render();timer=setTimeout(poll,3000);}};source={close(){stopped=true;clearTimeout(timer);}};void poll();return;}
    source = subscribeEvents({onSnapshot: event => {
      try { const payload = JSON.parse(event.data); if (!acceptEvent(payload) || payload.snapshot.printerId !== printerId) return; snapshot = payload.snapshot; transportLost = false; message(''); render(); document.body.dataset.liveReady = 'true'; } catch { message(t("收到无法识别的数据，保留上一份状态。"), true); }
    }, onOpen: () => { transportLost = false; message(''); render(); }, onError: () => { transportLost = true; render(); }});
  } catch { unavailable=true;renderUnavailable(); message(t("后台连接失败。此页面不会用虚构的实机状态替代连接结果。"), true); }
}
let resizeFrame;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (embedded) render(); }); });
window.addEventListener('pagehide', () => source?.close());
start();

onLocaleChange(()=>{const notification=messageKey;render();if(unavailable)renderUnavailable();message(t(notification),messageError);for(const option of $('scenario-select').options)option.textContent=t(option.dataset.source||sourceKey(option.textContent));});
