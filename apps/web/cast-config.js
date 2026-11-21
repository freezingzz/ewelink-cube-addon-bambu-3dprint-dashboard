import { managementFetch } from './management-fetch.js';
import { bindStatic, getLocale, onLocaleChange, t } from './i18n.js';
import { mountShell } from './admin-shell.js';
import { castSizes } from './cast-sizes.js';
import { castHosts } from './preview-sizes.js';

bindStatic();
mountShell('cast');
const $ = (id) => document.getElementById(id);
const grid = $('cast-size'),
  host = $('cast-host'),
  language = $('cast-language');
for (const size of castSizes)
  grid.add(new Option(size.replace('x', ' × '), size));
for (const [id, profile] of Object.entries(castHosts))
  host.add(new Option(t(profile.label), id));
const requested = new URLSearchParams(location.search).get('grid');
grid.value = castSizes.includes(requested) ? requested : '2x2';
language.value = getLocale();

let messageKey = '';
function message(key) {
  messageKey = key;
  $('cast-message').textContent = t(key);
}
function preview() {
  const { gridWidth, columns, rem } = castHosts[host.value];
  const [width, height] = grid.value
    .split('x')
    .map((n) => (n * gridWidth) / columns - 1.5 * rem);
  const frame = $('cast-frame');
  frame.style.width = width + 'px';
  frame.style.height = height + 'px';
  const src = '/cast-card/' + grid.value + '?lang=' + language.value;
  if (frame.getAttribute('src') !== src) frame.src = src;
  $('cast-dimensions').textContent = t(
    '当前网格 {0} · 预计内容区 {1} × {2} CSS px',
    grid.selectedOptions[0].text,
    width,
    height,
  );
}
for (const input of [grid, host, language])
  input.addEventListener('change', preview);
onLocaleChange(() => {
  for (const option of host.options)
    option.text = t(castHosts[option.value].label);
  preview();
  message(messageKey);
});
preview();

async function api(path, body) {
  const response = await managementFetch('/api/v1/setup/cast' + path, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Setup-Request': '1',
          },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
async function submit(action) {
  const management = $('cast-management');
  management.disabled = true;
  try {
    await api('/save', {
      language: language.value,
      cubeUrl: $('cast-cube-url').value.trim(),
      dashboardUrl: $('cast-dashboard-url').value.trim(),
    });
    if (action === 'sync') {
      await api('/sync', {});
      message('卡片已同步，请在 CAST 中选择打印仪表盘。');
    } else if (action === 'authorize') {
      const result = await api('/authorize', {});
      message(
        result.authorized
          ? 'CUBE 已连接'
          : '请在 CUBE 控制台确认授权，然后再次点击连接 CUBE。',
      );
    } else message('配置已保存');
  } catch (error) {
    if (error.message === 'CAST_LEGACY_CARDS')
      message('检测到旧版打印卡。请先在 CUBE 确认并移除旧卡，再同步新版。');
    else if (error.message === 'CAST_LABEL_CONFLICT')
      message('CUBE 已有同名卡片。请核对卡片的归属和服务地址。如果是迁移前的打印卡，记下布局后移除旧卡、重新同步，再在面板中选回。');
    else if (error.message === 'CAST_SIZE_MISMATCH')
      message('卡片尺寸或地址与当前设置不一致。请核对服务地址和面板布局。如果是换网前的卡片，记下布局后移除旧卡、重新同步，再在面板中选回。');
    else if (action === 'sync')
      message('同步未完成，请检查 CUBE 地址、授权和服务可达性。');
    else if (action === 'authorize')
      message('CUBE 连接未完成，请检查地址和网络。');
    else message('配置未保存，请检查输入并重试。');
  } finally {
    management.disabled = false;
  }
}
$('cast-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!$('cast-management').disabled) void submit('save');
});
$('cast-sync').onclick = () => void submit('sync');
$('cast-authorize').onclick = () => void submit('authorize');
try {
  const health = await (await fetch('/healthz')).json();
  if (health.mode === 'demo' && !health.setupEnabled) {
    $('cast-management').hidden = true;
    message('演示数据 · 可预览所有尺寸。');
  } else {
    const saved = await api('');
    language.value = saved.language;
    $('cast-cube-url').value = saved.cubeUrl;
    $('cast-dashboard-url').value = saved.dashboardUrl;
    $('cast-management').disabled = false;
    preview();
  }
} catch (error) {
  if (error.message === 'ACCOUNT_SIGN_IN_REQUIRED') location.replace('/setup');
  message('请先打开账号与设备页面，再进入 CAST 配置。');
}
