import { t, getLocale, onLocaleChange } from './i18n.js';
import { previewSpec, castHosts } from './preview-sizes.js';

const node = (tag, className, text) => { const n = document.createElement(tag); n.className = className; if (text) n.textContent = text; return n; };
let mounted;
export function mountPreview(stage, layout) {
  const params = new URLSearchParams(location.search);
  const spec = previewSpec(layout, params);
  if (!mounted) {
    const host = node('div', 'size-preview');
    const controls = node('div', 'size-controls');
    const inputs = {};
    for (const [key, label] of [['width', t("内容区宽")], ['height', t("内容区高")]]) {
      const wrap = node('label', 'size-input-label', label);
      const input = node('input', 'size-input'); input.type = 'number'; input.min = '96'; input.max = '3840'; input.step = 'any'; input.id = `preview-${key}`;
      wrap.append(input, node('span', '', 'px')); controls.append(wrap); inputs[key] = input;
      input.addEventListener('change', () => {
        const n = Number(input.value);
        if (!Number.isFinite(n) || n < 96 || n > 3840) { input.value = String(previewSpec(mounted.layout, new URLSearchParams(location.search))[key]); return; }
        const url = new URL(location.href); url.searchParams.set(key, String(n)); history.replaceState(null, '', url); mountPreview(stage, mounted.layout);
      });
    }
    const hostLabel = node('label', 'size-input-label', t("CAST 宿主"));
    const hostSelect = node('select', 'size-zoom'); hostSelect.id = 'preview-cast-host';
    for (const [key, host] of Object.entries(castHosts)) { const option = node('option', '', t(host.label)); option.value = key; hostSelect.append(option); }
    hostLabel.append(hostSelect); controls.append(hostLabel);
    hostSelect.addEventListener('change', () => { const url = new URL(location.href); url.searchParams.set('castHost', hostSelect.value); for (const key of ['width', 'height']) url.searchParams.delete(key); history.replaceState(null, '', url); mountPreview(stage, mounted.layout); });
    const zoomLabel = node('label', 'size-input-label', t("显示比例"));
    const zoom = node('select', 'size-zoom'); zoom.id = 'preview-zoom';
    for (const value of [.5, 1, 1.5, 2]) { const option = node('option', '', `${value * 100}%`); option.value = String(value); zoom.append(option); }
    zoomLabel.append(zoom); controls.append(zoomLabel);
    zoom.addEventListener('change', () => { const url = new URL(location.href); url.searchParams.set('zoom', zoom.value); history.replaceState(null, '', url); mountPreview(stage, mounted.layout); });
    const reset = node('button', 'size-reset', t("恢复规格尺寸")); reset.type = 'button';
    reset.addEventListener('click', () => { const url = new URL(location.href); for (const key of ['width', 'height', 'zoom', 'castHost']) url.searchParams.delete(key); history.replaceState(null, '', url); mountPreview(stage, mounted.layout); });
    controls.append(reset);
    const description = node('p', 'size-description'); description.id = 'preview-size-description';
    const source = node('p', 'size-source'); source.id = 'preview-size-source';
    const canvas = node('div', 'preview-canvas');
    const space = node('div', 'preview-space');
    const frame = node('iframe', 'card-preview-frame'); frame.id = 'card-preview'; frame.title = t("CUBE 卡片内容区预览"); frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
    space.append(frame); canvas.append(space); host.append(controls, description, source, canvas); stage.replaceChildren(host);
    mounted = { host, hostLabel, hostSelect, inputs, zoom, description, source, canvas, space, frame, layout: null };
  }
  stage.className = 'card-stage preview-host';
  mounted.layout = layout;
  mounted.canvas.dataset.surface = layout==='cast'?'cast':'card';
  mounted.hostLabel.hidden = layout !== 'cast'; mounted.hostSelect.value = spec.castHost;
  const { width, height, zoom } = spec;
  for (const key of ['width', 'height']) if (document.activeElement !== mounted.inputs[key]) mounted.inputs[key].value = String(spec[key]);
  mounted.zoom.value = String(zoom);
  mounted.description.textContent = t("{0} · iframe 内容区 {1} × {2} CSS px · {3}% 显示{4}", spec.grid, width, height, zoom * 100, zoom === 1 ? '（1:1）' : t("（仅放大预览，不改变内容区）"));
  mounted.source.textContent = spec.custom ? t("自定义尺寸：用于适配检查。参考：{0}", spec.basis) : spec.basis;

  mounted.frame.style.width = `${width}px`; mounted.frame.style.height = `${height}px`;
  mounted.frame.style.transform = `scale(${zoom})`;
  mounted.space.style.width = `${width * zoom}px`; mounted.space.style.height = `${height * zoom}px`;
  const src = new URL('/card', location.origin); src.searchParams.set('layout', layout); src.searchParams.set('lang', getLocale());
  if (params.has('printerId')) src.searchParams.set('printerId', params.get('printerId'));
  if (mounted.frame.src !== src.href) mounted.frame.src = src.href;
}

onLocaleChange(()=>{if(mounted){const stage=mounted.host.parentElement,layout=mounted.layout;mounted=null;mountPreview(stage,layout);}});
