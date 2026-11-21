import { icon } from './icons.js';
import { getLocale, t } from './i18n.js';
import { displaySnapshot } from './display.js';
import { castState, finishTime } from './cast-model.js';
import {
  isActiveTray,
  knownNumber,
  numberText,
  progressValue,
  safeColor,
  safeImageUrl,
} from './model.js';
import { castSizes } from './cast-sizes.js';

const tile = document.querySelector('#tile');
const declared = location.pathname.split('/').at(-1);
let size = declared;
let latest = {};
let disconnected = false;
let pinnedUnit = null;
let renderedKey;
const dash = '—';

function element(tag, cls, text) {
  const el = document.createElement(tag);
  el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function group(cls, ...children) {
  const el = element('div', cls);
  el.append(...children);
  return el;
}
function metric(caption, value) {
  return group(
    'metric',
    element('span', 'caption', caption),
    element('strong', 'value', value),
  );
}
function compactTime(seconds) {
  if (!knownNumber(seconds) || seconds < 0) return dash;
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const en = getLocale() === 'en';
  return (
    (hours ? hours + (en ? 'h' : '时') : '') +
    (minutes % 60 || !hours
      ? (en && hours ? ' ' : '') + (minutes % 60) + (en ? 'm' : '分')
      : '')
  );
}
function taskCover(snapshot) {
  const holder = group('cover empty', element('span', '', t('暂无任务封面')));
  const cover = snapshot.cover;
  const src =
    cover?.state === 'available' &&
    snapshot.taskId &&
    cover.taskId === snapshot.taskId
      ? safeImageUrl(cover.url, location.origin)
      : null;
  if (src) {
    const image = element('img', '');
    image.alt = t('当前任务封面');
    image.addEventListener('error', () => {
      holder.classList.add('empty');
      holder.textContent = t('暂无任务封面');
    });
    image.src = src;
    holder.classList.remove('empty');
    holder.replaceChildren(image);
  }
  return holder;
}
function unitPages(s) {
  const units = (s.ams || []).map((unit) => ({
    ...unit,
    name: 'AMS ' + unit.id,
  }));
  if (s.externalTray || s.activeTray === 'external') {
    units.push({
      id: 'external',
      name: t('外置料盘'),
      trays: s.externalTray ? [s.externalTray] : [],
    });
  }
  return units;
}
function trayLabel(tray) {
  return tray?.present === false ? t('空槽') : tray?.material || dash;
}
function slotName(id) {
  return /^\d+$/.test(id) ? String(Number(id) + 1) : id;
}
function filament(s, pages) {
  const external = s.activeTray === 'external';
  const unit = pages.find(
    (page) => page.id === (external ? 'external' : s.activeTray?.unitId),
  );
  const tray = external
    ? s.externalTray
    : unit?.trays.find((tray) => tray.id === s.activeTray?.trayId);
  const value = group('matvalue');
  if (unit && tray && tray.present !== false) {
    const dot = element('i', 'swatch');
    dot.style.setProperty('--spool', safeColor(tray.color));
    value.append(
      dot,
      element(
        'b',
        '',
        unit.name +
          (external ? '' : ' / ' + slotName(tray.id)) +
          ' · ' +
          trayLabel(tray),
      ),
    );
  } else value.textContent = dash;
  return group('material', element('span', 'caption', t('当前耗材')), value);
}
function slotRow(unit, s) {
  const trays = [...unit.trays].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
  );
  if (!trays.length)
    return group('ams-empty', element('span', '', t('等待槽位数据')));
  const row = group(trays.length === 1 ? 'slots one-slot' : 'slots');
  for (const tray of trays) {
    const external = unit.id === 'external';
    const selected = external
      ? s.activeTray === 'external'
      : isActiveTray(s.activeTray, unit.id, tray.id);
    const active = selected && tray.present !== false;
    const ring = element('i', 'reel');
    ring.style.setProperty(
      '--spool',
      tray.present === false ? 'transparent' : safeColor(tray.color),
    );
    const name = external ? t('外置') : t('槽 {0}', slotName(tray.id));
    const cell = group(
      'slot' + (active ? ' selected' : ''),
      ring,
      group(
        'slot-type',
        element('b', '', name),
        element('small', '', trayLabel(tray)),
      ),
    );
    cell.title =
      name + ' · ' + trayLabel(tray) + (active ? t(' · 使用中') : '');
    row.append(cell);
  }
  return row;
}
function pagerButton(text, label, key, disabled, action) {
  const button = element(
    'button',
    key === 'current' ? 'current-slot' : 'page-arrow',
    text,
  );
  button.setAttribute('aria-label', label);
  button.title = label;
  button.dataset.action = key;
  button.disabled = disabled;
  button.onclick = action;
  return button;
}
function amsPanel(s, pages) {
  if (!pages.length)
    return group('ams-empty', element('span', '', t('暂无 AMS 数据')));
  const activeIndex = pages.findIndex((unit) =>
    unit.id === 'external'
      ? s.activeTray === 'external'
      : unit.trays.some((tray) => isActiveTray(s.activeTray, unit.id, tray.id)),
  );
  const pinnedIndex = pages.findIndex((unit) => unit.id === pinnedUnit);
  if (pinnedIndex === -1) pinnedUnit = null;
  const index = pinnedIndex >= 0 ? pinnedIndex : Math.max(0, activeIndex);
  const unit = pages[index];
  const tools = group('ams-tools');
  function select(id) {
    pinnedUnit = id;
    render();
  }
  if (pages.length > 1) {
    if (activeIndex >= 0)
      tools.append(
        pagerButton(
          t('当前'),
          t('返回当前料槽'),
          'current',
          pinnedUnit === null,
          () => select(null),
        ),
      );
    tools.append(
      pagerButton('‹', t('上一页 AMS'), 'previous', index === 0, () =>
        select(pages[index - 1].id),
      ),
      element('span', 'range', index + 1 + ' / ' + pages.length),
      pagerButton(
        '›',
        t('下一页 AMS'),
        'next',
        index === pages.length - 1,
        () => select(pages[index + 1].id),
      ),
    );
  }
  const panel = group(
    'ams-browser',
    group('ams-bar', element('b', 'unit-caption', unit.name), tools),
    slotRow(unit, s),
  );
  panel.dataset.unitId = unit.id;
  return panel;
}
function render() {
  const s = displaySnapshot(latest);
  const fresh =
    !disconnected && s.connection === 'online' && s.freshness === 'fresh';
  const data = fresh ? s : {};
  const state = castState(s, disconnected);
  const progress = progressValue(data.progressPercent);
  const time = compactTime(data.remainingSeconds);
  const layers =
    data.currentLayer == null && data.totalLayers == null
      ? dash
      : numberText(data.currentLayer) + '/' + numberText(data.totalLayers);
  const pages = unitPages(data);
  const name = s.jobName || t('暂无任务');
  const job = element('div', 'job', name);
  job.title = name;
  const status = group(
    'status',
    element('i', 'dot'),
    element('span', '', state),
  );
  const heading = group(
    'heading',
    group(
      'device',
      icon('printer', 16),
      element('b', '', s.model || t('打印机')),
    ),
    status,
  );
  const digits = element('div', 'progress', numberText(progress));
  if (progress !== null) digits.append(element('small', '', '%'));
  const fill = element('i', '');
  fill.style.width = (progress ?? 0) + '%';
  const track = group('track', fill);
  const left = metric(t('剩余时间'), time);
  const layer = metric(t('层数'), layers);
  const focus = document.activeElement?.dataset.action;
  const layout = document.createDocumentFragment();
  if (size === '2x2') {
    layout.append(
      status,
      job,
      digits,
      track,
      group(
        'compact-left',
        element('span', 'caption', t('剩余')),
        element('b', '', time),
      ),
    );
  } else if (size === '4x1') {
    layout.append(
      group('strip-job', status, job),
      digits,
      group(
        'strip-time',
        element('span', 'caption', t('剩余')),
        element('b', '', time),
      ),
    );
  } else {
    const withCover = size !== '4x2';
    const summary = group(
      'summary' + (withCover ? ' with-cover' : ''),
      group('job-info', job, digits, track),
    );
    if (withCover) summary.append(taskCover(s));
    layout.append(heading);
    if (size === '6x2')
      layout.append(group('wide-body', summary, group('side', left, layer)));
    else {
      const metrics = group('metrics', left, layer);
      if (withCover)
        metrics.append(
          metric(t('预计结束'), fresh ? finishTime(s, true) : dash),
        );
      layout.append(summary, metrics);
    }
    if (size === '4x4') layout.append(filament(data, pages));
    if (size === '6x6') {
      const phase = data.stage;
      const stageLabel = /^-?\d+$/.test(phase)
        ? Number(phase) >= 0
          ? t('阶段 {0}', phase)
          : dash
        : phase;
      const stage = element('strong', '', stageLabel || dash);
      stage.title = stage.textContent;
      layout.append(
        group(
          'conditions',
          group('phase', element('span', 'caption', t('打印阶段')), stage),
          group(
            'temperatures',
            ...[
              ['喷嘴温度', data.nozzleC],
              ['热床温度', data.bedC],
              ['腔体温度', data.chamberC],
            ].map(([label, value]) =>
              metric(t(label), numberText(value, 0, ' °C')),
            ),
          ),
        ),
      );
    }
    if (size === '6x4' || size === '6x6') layout.append(amsPanel(data, pages));
  }
  tile.dataset.ready = String(Boolean(s.printerId));
  tile.className = 'tile s' + size + ' ' + (fresh ? s.lifecycle : 'offline');
  tile.setAttribute(
    'aria-label',
    (s.name || t('打印机')) + ' · ' + size.replace('x', '×'),
  );
  tile.replaceChildren(layout);
  if (focus)
    tile.querySelector('[data-action="' + focus + '"]:enabled')?.focus();
}

// Most hosts load the src for the selected grid. Some resize the existing iframe;
// infer a new grid only after observing a matching initial host geometry.
const [cols, rows] = declared.split('x').map(Number);
// From a rectangular frame, W-H gives the cell pitch without needing the
// host's gutter. A square only exposes one axis, so use the documented gutter
// presets for the initial pitch. The registered src remains authoritative on load.
const rectPitch =
  cols !== rows ? (innerWidth - innerHeight) / (cols - rows) : 0;
const gutter =
  rectPitch > 0
    ? cols * rectPitch - innerWidth
    : innerWidth / cols < 60
      ? 12
      : 24;
const pitch = (innerWidth + gutter) / cols;
if (
  pitch > 0 &&
  gutter >= 0 &&
  gutter <= 48 &&
  Math.abs(rows * pitch - gutter - innerHeight) < 3
)
  addEventListener('resize', () => {
    const nearest = (pixels) => Math.round((pixels + gutter) / pitch);
    const next = nearest(innerWidth) + 'x' + nearest(innerHeight);
    if (next !== size && castSizes.includes(next)) {
      size = next;
      render();
    }
  });

async function readJson(path, signal) {
  const response = await fetch(path, {
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
  });
  if (!response.ok) throw Error('Snapshot unavailable');
  return response.json();
}
let printerId, timer;
let session = new AbortController();
async function poll(signal) {
  try {
    if (!printerId)
      printerId = (await readJson('/api/v1/printers', signal)).printers[0]
        ?.printerId;
    if (!printerId) throw Error('No printer');
    const snapshot = await readJson(
      '/api/v1/printers/' + encodeURIComponent(printerId) + '/snapshot',
      signal,
    );
    if (snapshot.printerId !== latest.printerId) pinnedUnit = null;
    latest = snapshot;
    disconnected = false;
  } catch {
    if (signal.aborted) return;
    printerId = null;
    disconnected = true;
  }
  // Preserve the visible page and avoid reloading images for duplicate reports.
  const { lastReportAt, fieldUpdatedAt, ...values } = latest;
  const key = JSON.stringify([values, finishTime(latest, true), disconnected]);
  if (renderedKey !== key) {
    renderedKey = key;
    render();
  }
  if (!signal.aborted) timer = setTimeout(() => poll(signal), 3000);
}
addEventListener('pagehide', () => {
  session.abort();
  clearTimeout(timer);
});
addEventListener('pageshow', (event) => {
  if (event.persisted) {
    session = new AbortController();
    void poll(session.signal);
  }
});
render();
void poll(session.signal);
