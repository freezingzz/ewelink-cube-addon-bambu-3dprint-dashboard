import { t, getLocale } from './i18n.js';
export const lifecycleLabels = { get unknown() { return t("等待状态"); }, get idle() { return t("待机"); }, get preparing() { return t("准备中"); }, get printing() { return t("正在打印"); }, get paused() { return t("已暂停"); }, get finished() { return t("打印完成"); }, get error() { return t("打印异常"); } };
export const connectionLabels = { get connecting() { return t("连接中"); }, get syncing() { return t("同步中"); }, get online() { return t("在线"); }, get offline() { return t("离线"); }, get error() { return t("连接异常"); } };
export function knownNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
export function numberText(value, digits = 0, suffix = '') { return knownNumber(value) ? `${value.toFixed(digits)}${suffix}` : '—'; }
export function durationText(seconds) {
  if (!knownNumber(seconds) || seconds < 0) return '—';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t("{0} 分钟", minutes);
  const hours = Math.floor(minutes / 60);
  return t("{0} 小时{1}", hours, minutes % 60 ? t(" {0} 分", minutes % 60) : '');
}
export function progressValue(value) { return knownNumber(value) ? Math.min(100, Math.max(0, value)) : null; }
export function safeColor(value) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#c8cbc8'; }
export function safeImageUrl(value, origin) {
  if (typeof value !== 'string' || !value) return null;
  try { const url = new URL(value, origin); return url.origin === origin && ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function reportTime(value) {
  if (!value) return t("尚未收到报文");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("更新时间未知") : t("{0} 更新", date.toLocaleTimeString(getLocale(), { hour12: false }));
}
export function statusOf(snapshot) {
  if (snapshot.connection === 'offline') return { label: t("打印机离线"), tone: 'muted', note: t("保留最近一次数据，等待重新连接") };
  if (snapshot.connection === 'error') return { label: t("连接异常"), tone: 'danger', note: t("当前数据可能不是最新状态") };
  if (snapshot.freshness === 'stale') return { label: t("数据已过期"), tone: 'warning', note: t("最近的数据已过期，等待新的打印机报文") };
  if (snapshot.freshness === 'unknown' || ['connecting', 'syncing'].includes(snapshot.connection)) return { label: connectionLabels[snapshot.connection] || t("等待数据"), tone: 'muted', note: t("收到有效数据后将自动更新") };
  return { label: lifecycleLabels[snapshot.lifecycle] || t("未知状态"), tone: snapshot.lifecycle === 'error' ? 'danger' : snapshot.lifecycle === 'paused' ? 'warning' : 'success', note: snapshot.stage && !/^-?\d+$/.test(snapshot.stage) ? snapshot.stage : lifecycleLabels[snapshot.lifecycle] || '' };
}
export function isActiveTray(active, unitId, trayId) { return active && typeof active === 'object' && String(active.unitId) === String(unitId) && String(active.trayId) === String(trayId); }
export function createEventGate() {
  let sessionId = null;
  let sequence = -1;
  return event => {
    if (!event || event.type !== 'snapshot' || typeof event.sessionId !== 'string' || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || !event.snapshot) return false;
    if (event.sessionId === sessionId && event.sequence <= sequence) return false;
    sessionId = event.sessionId;
    sequence = event.sequence;
    return true;
  };
}
