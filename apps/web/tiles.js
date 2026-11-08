import { t, getLocale } from './i18n.js';
import { numberText, durationText, progressValue, safeColor, statusOf, isActiveTray } from './model.js';

const node = (tag, className, text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
function amsSummary(s, cast) {
  const row = node('div', 'tile-ams');
  const materials = (s.ams || []).flatMap(unit => (unit.trays || []).filter(t => t.present !== false).map(tray => ({ unit, tray })));
  const label = s.ams?.length ? `AMS ${s.ams.length}` : s.activeTray === 'external' ? t("耗材") : 'AMS —';
  row.append(node('span', 'tile-ams-label', label));
  if (s.activeTray === 'external') {
    row.append(node('span', 'tile-material', t("外置 {0}", s.externalTray?.material || '—')));
  } else {
    // Keep the active filament visible when multiple AMS units exceed the small card's capacity.
    const ordered = [...materials].sort((a, b) => Number(!!isActiveTray(s.activeTray, b.unit.id, b.tray.id)) - Number(!!isActiveTray(s.activeTray, a.unit.id, a.tray.id)));
    const limit = cast ? 3 : 4;
    for (const {unit, tray} of ordered.slice(0, limit)) {
      const active = isActiveTray(s.activeTray, unit.id, tray.id);
      const swatch = node('span', `tile-swatch${active ? ' active' : ''}`);
      swatch.style.setProperty('--filament', safeColor(tray.color));
      swatch.title = t("AMS {0} 槽 {1} · {2}{3}", unit.id, tray.id, tray.material || t("未知"), active ? t(" · 使用中") : '');
      swatch.setAttribute('aria-label', swatch.title); row.append(swatch);
    }
    if (materials.length > limit) row.append(node('span', 'tile-more', `+${materials.length - limit}`));
  }
  return row;
}
export function renderTile(s, layout, renderCover, { transportLost = false } = {}) {
  const cast = layout === 'cast', compact = layout === 'compact';
  const status = transportLost ? { label:t("连接中断"), tone:'warning', note:t("页面与后台连接已中断，正在重连；保留的是最后收到的数据。") } : statusOf(s);
  if(getLocale()==='en') status.label=transportLost?'Retrying':s.connection==='offline'?'Offline':s.connection==='error'?'Error':s.freshness==='stale'?'Stale':s.connection==='connecting'?'Connecting':s.connection==='syncing'?'Syncing':s.freshness==='unknown'?'Waiting':({idle:'Idle',preparing:'Preparing',printing:'Printing',paused:'Paused',finished:'Done',error:'Error'})[s.lifecycle]||'Waiting';
  const progress = progressValue(s.progressPercent);
  const card = node('article', `printer-card tile tile-${layout} tone-${status.tone}`);
  card.dataset.snapshotJob = s.jobName || '';
  const header = node('header', 'tile-header');
  const name = node('h2', 'tile-name', s.name || s.model || t("打印机")); name.title = name.textContent;
  const origin = node('span', 'tile-origin', s.provenance === 'synthetic' ? t("演示") : t("云端"));
  origin.title = s.provenance === 'synthetic' ? t("合成演示 · 非实机数据") : t("云端数据");
  header.append(name, origin);
  const badge = node('div', 'status-badge tile-status', status.label);
  badge.title = [status.note, ...(s.errors || []).map(e => e.message || e.code)].filter(Boolean).join('；');
  if (!cast && !compact) header.append(badge);
  card.append(header);

  const body = node('div', 'tile-body');
  if (!compact) {
    const cover = renderCover(s); cover.classList.add('tile-cover');
    // A short placeholder stays readable inside the thumbnail, with the full explanation in its title.
    const fallback = cover.querySelector('strong');
    if (fallback) { fallback.title = fallback.textContent; fallback.textContent = getLocale()==='en'?'—':t("无图"); }
    body.append(cover);
  }
  const info = node('div', 'tile-info');
  if (!cast) {
    const error = s.errors?.find(e => e.severity !== 'warning') || s.errors?.[0];
    const task = node('p', `tile-task job-name${error ? ' tile-alert' : ''}`, error ? t("注意 · {0}", error.message || error.code || t("打印异常")) : s.jobName || t("暂无打印任务"));
    task.title = error ? `${error.message || ''} ${error.code || ''}` : task.textContent;
    info.append(task);
  }
  const hero = node('div', 'tile-hero');
  const digits = node('div', 'progress-number tile-progress');
  digits.append(node('strong', 'tile-progress-value', progress === null ? '—' : numberText(progress)), node('span', 'tile-percent', progress === null ? '' : '%'));
  hero.append(digits);
  if (cast || compact) hero.append(badge);
  info.append(hero);
  const remaining = node('p', 'tile-remaining');
  remaining.append(node('span', 'tile-remaining-label', t("剩余")), node('strong', 'tile-remaining-value', durationText(s.remainingSeconds)));
  // CAST's remaining-time row spans the full card rather than squeezing beside progress.
  if (compact) info.append(remaining);
  else if (!cast) hero.append(remaining);
  const track = node('div', 'tile-track');
  track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', t("打印进度"));
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
  track.setAttribute(progress === null ? 'aria-valuetext' : 'aria-valuenow', progress === null ? t("未知") : String(progress));
  const fill = node('span', 'tile-fill'); fill.style.width = `${progress ?? 0}%`; track.append(fill);
  if (!cast) info.append(track);
  if (!cast) {
    const metrics = node('div', 'tile-metrics');
    for (const [label, value] of [[t("喷嘴"), numberText(s.nozzleC, 0, '°')], [t("热床"), numberText(s.bedC, 0, '°')]]) {
      const metric = node('div', 'tile-metric'); metric.append(node('span', '', label), node('strong', '', value)); metrics.append(metric);
    }
    if (!compact) { const metric = node('div', 'tile-metric'); metric.append(node('span', '', t("层数")), node('strong', '', `${numberText(s.currentLayer)}/${numberText(s.totalLayers)}`)); metrics.append(metric); }
    info.append(metrics);
  }
  body.append(info); card.append(body);
  if (cast) card.append(remaining);
  const footer = node('footer', 'tile-footer');
  footer.append(amsSummary(s, cast));
  if (!cast && !compact) {
    const date = s.lastReportAt ? new Date(s.lastReportAt) : null;
    const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString(getLocale(), {hour12:false}) : t("等待数据");
    const updated = node('span', 'tile-updated', time); updated.title = t("最近数据更新时间"); footer.append(updated);
  }
  card.append(footer); return card;
}
