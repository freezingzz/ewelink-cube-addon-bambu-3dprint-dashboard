import { t } from './i18n.js';
import {
  numberText,
  durationText,
  progressValue,
  safeColor,
  isActiveTray,
} from './model.js';
import { castState, finishTime, materialSelection } from './cast-model.js';
const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const row = (label, value) => {
  const r = node('div', 'cast-data-row');
  r.append(node('span', '', label), node('strong', '', value));
  r.title = label + ' · ' + value;
  return r;
};
export function renderCastCard(s, kind, unit, renderCover, lost = false) {
  const card = node('article', `printer-card cast-module cast-${kind}`);
  card.dataset.snapshotJob = s.jobName || '';
  card.setAttribute('aria-label', `${s.name} · ${kind}`);
  const label = castState(s, lost),
    state = node('span', 'cast-state', label);
  state.title = label;
  if (kind === 'status') {
    const name = node('h2', 'cast-job', s.jobName || t('暂无任务'));
    name.title = s.jobName || t('暂无任务');
    card.append(name);
    const hero = node('div', 'cast-status-hero');
    const p = progressValue(s.progressPercent);
    const digits = node('div', 'cast-digits');
    digits.append(
      node('strong', '', p === null ? '—' : numberText(p)),
      node('small', '', p === null ? '' : '%'),
    );
    hero.append(digits, state);
    card.append(
      hero,
      row(t('剩余'), durationText(s.remainingSeconds)),
      row(
        t('层数'),
        `${numberText(s.currentLayer)}/${numberText(s.totalLayers)}`,
      ),
    );
  } else if (kind === 'ams') {
    const selected = materialSelection(s, unit);
    const header = node('header', 'cast-module-heading');
    header.append(
      node(
        'h2',
        '',
        selected.external
          ? t('外置料盘')
          : selected.id === 'active'
            ? t('当前耗材')
            : `AMS ${selected.id}`,
      ),
      node(
        'span',
        'cast-material-state',
        lost || s.connection !== 'online' || s.freshness !== 'fresh'
          ? label
          : '',
      ),
    );
    card.append(header);
    const grid = node(
      'div',
      `cast-slot-grid${selected.trays.length === 1 ? ' cast-slot-single' : ''}`,
    );
    for (const tray of selected.trays.slice(0, 4)) {
      const active = selected.external
        ? s.activeTray === 'external'
        : isActiveTray(s.activeTray, selected.id, tray.id);
      const item = node('div', `cast-slot${active ? ' active' : ''}`);
      item.title = `${t('槽 {0}', tray.id)} · ${tray.present === false ? t('空槽') : tray.material || t('材料未知')} · ${t('余量 {0}', numberText(tray.remainingPercent, 0, '%'))}`;
      item.setAttribute('aria-label', item.title);
      const swatch = node('span', 'cast-spool');
      swatch.style.setProperty('--filament', safeColor(tray.color));
      const material = node(
        'strong',
        '',
        tray.present === false ? t('空槽') : tray.material || '—',
      );
      item.append(
        swatch,
        material,
        node('small', '', selected.external ? t('外置') : String(tray.id)),
      );
      grid.append(item);
    }
    if (!selected.trays.length)
      grid.append(
        node(
          'p',
          'cast-no-material',
          unit === 'active' ? t('未报告活动槽位') : t('等待耗材数据'),
        ),
      );
    card.append(grid);
  } else {
    const name = node('h2', 'cast-job', s.jobName || t('暂无任务'));
    name.title = name.textContent;
    card.append(name);
    const cover = renderCover(s);
    cover.classList.add('cast-summary-cover');
    card.append(cover);
    const ending = row(
      lost || s.connection !== 'online' || s.freshness !== 'fresh'
        ? label
        : t('预计结束'),
      lost ? '—' : finishTime(s),
    );
    ending.title = ending.textContent;
    card.append(ending);
  }
  return card;
}
