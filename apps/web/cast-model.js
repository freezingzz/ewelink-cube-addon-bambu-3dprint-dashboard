import { getLocale } from './i18n.js';
export function castState(s, lost = false) {
  const key = lost
    ? 'retry'
    : s.connection === 'offline'
      ? 'offline'
      : s.connection === 'error'
        ? 'error'
        : s.freshness === 'stale'
          ? 'stale'
          : s.freshness === 'unknown'
            ? 'waiting'
            : s.lifecycle;
  const en = {
    retry: 'Retrying',
    offline: 'Offline',
    error: 'Error',
    stale: 'Stale',
    waiting: 'Waiting',
    unknown: 'Waiting',
    idle: 'Idle',
    preparing: 'Prep',
    printing: 'Printing',
    paused: 'Paused',
    finished: 'Done',
  };
  const zh = {
    retry: '连接中断',
    offline: '离线',
    error: '异常',
    stale: '已过期',
    waiting: '等待数据',
    unknown: '等待数据',
    idle: '待机',
    preparing: '准备中',
    printing: '打印中',
    paused: '暂停',
    finished: '已完成',
  };
  return getLocale() === 'en' ? en[key] || 'Waiting' : zh[key] || '等待数据';
}
export function finishTime(s) {
  if (
    s.connection !== 'online' ||
    s.freshness !== 'fresh' ||
    !s.taskId ||
    !['printing', 'preparing'].includes(s.lifecycle) ||
    typeof s.remainingSeconds !== 'number' ||
    !Number.isFinite(s.remainingSeconds) ||
    s.remainingSeconds < 0
  )
    return '—';
  // Anchor ETA to the printer observation, not to each browser refresh.
  const stamp = Date.parse(
    s.fieldUpdatedAt?.remainingSeconds || s.lastReportAt,
  );
  if (!Number.isFinite(stamp)) return '—';
  return new Date(stamp + s.remainingSeconds * 1000).toLocaleString(
    getLocale(),
    {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  );
}
export function materialSelection(s, unit = 'active') {
  if (unit === 'external' || (unit === 'active' && s.activeTray === 'external'))
    return {
      external: true,
      trays: s.externalTray ? [s.externalTray] : [],
      id: 'external',
    };
  // Missing activity must stay unknown instead of selecting the first AMS.
  const id = unit === 'active' ? s.activeTray?.unitId : unit;
  const found = (s.ams || []).find((u) => String(u.id) === String(id));
  return found
    ? {
        ...found,
        trays: [...found.trays].sort((a, b) =>
          String(a.id).localeCompare(String(b.id), undefined, {
            numeric: true,
          }),
        ),
        external: false,
      }
    : { id: unit, trays: [], external: false };
}
