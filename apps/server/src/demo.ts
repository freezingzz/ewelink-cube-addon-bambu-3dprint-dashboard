import { emptySnapshot, type PrinterSnapshot } from '../../../packages/contracts/src/index.ts';

export const scenarios = [
  { id: 'printing', label: '打印中 · AMS 与封面' },
  { id: 'preparing', label: '准备中' },
  { id: 'paused', label: '已暂停' },
  { id: 'finished', label: '任务完成' },
  { id: 'idle', label: '空闲 · 无任务' },
  { id: 'error', label: '打印异常' },
  { id: 'offline', label: '打印机离线' },
  { id: 'stale', label: '数据过期' },
  { id: 'unknown', label: '字段缺失' },
  { id: 'cover-error', label: '封面获取失败' },
  { id: 'multi-ams', label: '多 AMS 与外置料盘' },
  { id: 'task-switch', label: '切换到新任务' }
] as const;
export type ScenarioId = typeof scenarios[number]['id'];

export function makeDemo(id: ScenarioId = 'printing', now = new Date()): PrinterSnapshot {
  const state = emptySnapshot();
  Object.assign(state, {
    name: '工作室 · H2C', connection: 'online', lifecycle: 'printing', stage: '打印中',
    taskId: 'demo-task-a', jobName: '桌面收纳系统 · 六边形模块', progressPercent: 42,
    remainingSeconds: 5760, currentLayer: 126, totalLayers: 300,
    nozzleC: 220, bedC: 55, chamberC: 34, lastReportAt: now.toISOString(), freshness: 'fresh',
    ams: [{ id: '0', humidityPercent: 18, temperatureC: 28, trays: [
      { id: '0', present: true, material: 'PLA', color: '#63B7A4', remainingPercent: 72 },
      { id: '1', present: true, material: 'PLA', color: '#F5C66A', remainingPercent: 46 },
      { id: '2', present: true, material: 'PETG', color: '#DCE0E4', remainingPercent: null },
      { id: '3', present: false, material: null, color: null, remainingPercent: null }
    ] }],
    activeTray: { unitId: '0', trayId: '0' },
    cover: { taskId: 'demo-task-a', state: 'available', url: '/assets/demo-cover.svg' }
  });
  if (id === 'preparing') Object.assign(state, { lifecycle: 'preparing', stage: '热床调平', progressPercent: 0, currentLayer: 0 });
  if (id === 'paused') Object.assign(state, { lifecycle: 'paused', stage: '等待继续' });
  if (id === 'finished') Object.assign(state, { lifecycle: 'finished', stage: '打印完成 · 热床冷却中', progressPercent: 100, remainingSeconds: 0, currentLayer: 300, nozzleC: 46, bedC: 42 });
  if (id === 'idle') Object.assign(state, { lifecycle: 'idle', stage: '等待新任务', taskId: null, jobName: null, progressPercent: null, remainingSeconds: null, currentLayer: null, totalLayers: null, nozzleC: 25, bedC: 24, activeTray: null, cover: { taskId: null, state: 'unavailable', url: null } });
  if (id === 'error') Object.assign(state, { lifecycle: 'error', stage: '需要检查打印机', errors: [{ code: 'DEMO_FILAMENT', message: '演示异常：请检查耗材通路', severity: 'error' }] });
  if (id === 'offline' || id === 'stale') Object.assign(state, { connection: id === 'offline' ? 'offline' : 'online', freshness: 'stale', lastReportAt: new Date(now.getTime() - 300000).toISOString() });
  if (id === 'unknown') Object.assign(state, { nozzleC: null, bedC: null, chamberC: null, progressPercent: null, remainingSeconds: null, currentLayer: null, totalLayers: null, activeTray: null, ams: [], cover: { taskId: state.taskId, state: 'unavailable', url: null } });
  if (id === 'cover-error') state.cover = { taskId: state.taskId, state: 'error', url: null };
  if (id === 'multi-ams') {
    state.ams.push({ id: '128', humidityPercent: null, temperatureC: 42, trays: [{ id: '0', present: true, material: 'ASA', color: '#444B56', remainingPercent: null }] });
    state.externalTray = { id: 'external', present: true, material: 'TPU', color: '#EF9278', remainingPercent: null };
    state.activeTray = 'external';
  }
  if (id === 'task-switch') Object.assign(state, { taskId: 'demo-task-b', jobName: '新任务 · 工具挂架', progressPercent: 2, currentLayer: 4, totalLayers: 200, remainingSeconds: 7200, cover: { taskId: 'demo-task-b', state: 'loading', url: null } });
  return state;
}
