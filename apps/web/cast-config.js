import { t, bindStatic, onLocaleChange } from './i18n.js';
import { mountShell } from './admin-shell.js';
bindStatic();
mountShell('cast');
const $ = (id) => document.getElementById(id);
let saved,
  units = [],
  draftMessage = '',
  framesKey = '';
const labels = {
  status: '打印状态',
  summary: '任务总结',
  active: '当前耗材',
  external: '外置料盘',
};
function message(key) {
  draftMessage = key;
  $('cast-message').textContent = t(key);
}
async function api(path, body) {
  const response = await fetch('/api/v1/setup/cast' + path, {
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
  if (!response.ok) throw Error();
  return response.json();
}
function config() {
  return {
    status: $('cast-status').checked,
    summary: $('cast-summary').checked,
    amsUnits: [...document.querySelectorAll('[data-cast-unit]:checked')].map(
      (n) => n.value,
    ),
    language: $('cast-language').value,
    cubeUrl: $('cast-cube-url').value.trim().replace(/\/$/, ''),
    dashboardUrl: $('cast-dashboard-url').value.trim().replace(/\/$/, ''),
  };
}
function choices(selected) {
  $('cast-units').replaceChildren();
  for (const unit of [
    ...new Set(['active', 'external', ...units, ...selected]),
  ]) {
    const label = document.createElement('label');
    label.className = 'cast-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = unit;
    input.dataset.castUnit = 'true';
    input.checked = selected.includes(unit);
    input.addEventListener('change', preview);
    label.append(
      input,
      document.createTextNode(labels[unit] ? t(labels[unit]) : `AMS ${unit}`),
    );
    $('cast-units').append(label);
  }
}
function preview() {
  const c = config(),
    size = $('cast-size').value,
    profiles = [
      ...(c.status ? [['status', '', t('打印状态')]] : []),
      ...c.amsUnits.map((unit) => [
        'ams',
        unit,
        labels[unit] ? t(labels[unit]) : `AMS ${unit}`,
      ]),
      ...(c.summary ? [['summary', '', t('任务总结')]] : []),
    ];
  const key = JSON.stringify([profiles, c.language, size]);
  // Keep polling frames alive when unrelated form fields change.
  if (key === framesKey) return;
  framesKey = key;
  $('cast-previews').replaceChildren();
  for (const [kind, unit, label] of profiles) {
    const cell = document.createElement('div');
    cell.className = 'cast-preview-cell';
    const caption = document.createElement('span');
    caption.textContent = label;
    const surface = document.createElement('div');
    surface.className = 'cast-preview-surface';
    const frame = document.createElement('iframe');
    frame.title = label;
    frame.width = size;
    frame.height = size;
    frame.style.width = size + 'px';
    frame.style.height = size + 'px';
    frame.setAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-same-origin',
    );
    const url = new URL('/card', location.origin);
    url.searchParams.set('layout', 'cast');
    url.searchParams.set('view', kind);
    url.searchParams.set('unit', unit);
    url.searchParams.set('lang', c.language);
    frame.src = url.href;
    surface.append(frame);
    cell.append(caption, surface);
    $('cast-previews').append(cell);
  }
  $('cast-profile-count').textContent = t('已选择 {0} 张卡片', profiles.length);
}
async function save(sync = false) {
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    saved = await api('/save', config());
    message('配置已保存');
    if (sync) {
      const r = await api('/sync', {});
      message('卡片已同步，请在 CAST 中选择新卡片');
      $('cast-profile-count').textContent = t(
        '已同步 {0} 张卡片',
        r.results.length,
      );
    }
  } catch {
    message(
      sync
        ? '同步未完成，请检查 CUBE 地址、授权和服务可达性。'
        : '配置未保存，请检查输入并重试。',
    );
  } finally {
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
$('cast-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void save();
});
$('cast-authorize').addEventListener('click', async () => {
  try {
    saved = await api('/save', config());
    const r = await api('/authorize', {});
    message(
      r.authorized
        ? 'CUBE 已连接'
        : '请在 CUBE 控制台确认授权，然后再次点击连接 CUBE。',
    );
  } catch {
    message('CUBE 连接未完成，请检查地址和网络。');
  }
});
$('cast-sync').addEventListener('click', () => void save(true));
for (const id of ['cast-status', 'cast-summary', 'cast-language', 'cast-size'])
  $(id).addEventListener('change', preview);
onLocaleChange(() => {
  if (saved) {
    const selected = config().amsUnits;
    choices(selected);
    framesKey = '';
    preview();
  }
  message(draftMessage);
});
try {
  saved = await api('');
  const inventory = await (await fetch('/api/v1/printers')).json();
  const snapshot = await (
    await fetch(
      '/api/v1/printers/' +
        encodeURIComponent(inventory.printers[0].printerId) +
        '/snapshot',
    )
  ).json();
  units = (snapshot.ams || []).map((u) => String(u.id));
  $('cast-status').checked = saved.status;
  $('cast-summary').checked = saved.summary;
  $('cast-language').value = saved.language;
  $('cast-cube-url').value = saved.cubeUrl;
  $('cast-dashboard-url').value = saved.dashboardUrl;
  choices(saved.amsUnits);
  preview();
  message('选择卡片后可保存或同步到 CUBE');
} catch {
  message('请先打开账号与设备页面，再进入 CAST 配置。');
}
