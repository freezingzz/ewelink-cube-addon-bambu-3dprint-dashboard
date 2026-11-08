import { t } from './i18n.js';

const errorMessages = {
  CLOUD_AUTH_REQUIRED: '云端会话失效，请重新登录',
  CLOUD_SETUP_REQUIRED: '云端身份确认失败，请检查授权与网络',
  CLOUD_SUBSCRIBE_FAILED: '状态订阅失败',
  CLOUD_TRANSPORT_ERROR: '云端网络连接异常',
  CLOUD_SYNC_REQUEST_FAILED: '当前状态查询发送失败',
  CLOUD_NO_REPORTS: '已订阅但未收到打印机状态，请确认设备已开机联网',
  DEMO_FILAMENT: '演示异常：请检查耗材通路'
};
export function errorMessage(error) {
  if (errorMessages[error.code]) return t(errorMessages[error.code]);
  if (/^print:\d+$/.test(error.code)) return t('打印机报告错误 {0}', error.code.slice(6));
  return error.message || error.code || t('打印机报告异常');
}
const demoNames = new Set(['工作室 · H2C', '桌面收纳系统 · 六边形模块', '新任务 · 工具挂架']);
const demoStages = new Set(['打印中', '热床调平', '等待继续', '打印完成 · 热床冷却中', '等待新任务', '需要检查打印机']);
// Only bundled demo fixtures are localized. Live names and vendor messages remain intact.
export function displaySnapshot(snapshot) {
  const result = { ...snapshot, errors: (snapshot.errors || []).map(error => ({ ...error, message: errorMessage(error) })) };
  if (snapshot.provenance === 'synthetic') {
    for (const field of ['name', 'jobName']) if (demoNames.has(snapshot[field])) result[field] = t(snapshot[field]);
    if (demoStages.has(snapshot.stage)) result.stage = t(snapshot.stage);
  }
  return result;
}
