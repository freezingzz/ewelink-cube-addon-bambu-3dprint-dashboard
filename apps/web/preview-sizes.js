import { t } from './i18n.js';
// Source: official CUBE OS 2.15.0 frontend. See docs/research/T-010-card-sizing.md.
export const previewProfiles = {
  compact: { width: 170, height: 170, grid: '管理页 1×1', basis: 'CUBE OS 2.15.0：固定 170 × 170 CSS px，iframe 无内边距。' },
  wide: { width: 368, height: 170, grid: '管理页 2×1', basis: 'CUBE OS 2.15.0：固定 368 × 170 CSS px，两格之间 28 px。' },
  cast: { width: 128, height: 128, grid: 'CAST 2×2', basis: 'CUBE OS 2.15.0：12 列 GridStack、912 px 画布、根字号 16 px 时为 128 × 128；屏幕／列数变化时重新计算，并非固定规格。' },
  detail: { width: 457, height: 900, grid: '管理页详情', basis: 'CUBE OS 2.15.0：弹窗宽 457 px；900 px 高为本地测试值，实际高度由宿主决定。这里仅预览内容，未复刻宿主 56 px 叠加标题栏。' }
};
// GridStack auto cells are square; each content box removes two 0.75rem margins.
export function castGridSize(gridWidth, columns = 12, rootFontSize = 16) {
  return 2 * gridWidth / columns - 1.5 * rootFontSize;
}
export const castHosts = {
  desktop12: { label: '桌面 · 12 列 / 912 px', gridWidth: 912, columns: 12, rem: 16 },
  desktop16: { label: '桌面 · 16 列 / 1283 px', gridWidth: 1283, columns: 16, rem: 16 },
  phone375: { label: '手机 · 6 列 / 375 px', gridWidth: 375, columns: 6, rem: 8 }
};
export function previewSpec(layout, params = new URLSearchParams()) {
  let profile = previewProfiles[layout] || previewProfiles.wide;
  const castHost = Object.hasOwn(castHosts, params.get('castHost')) ? params.get('castHost') : 'desktop12';
  if (layout === 'cast') {
    const host = castHosts[castHost], size = castGridSize(host.gridWidth, host.columns, host.rem);
    profile = { ...profile, width: size, height: size, basis: t('CUBE OS 2.15.0 GridStack：{0}，根字号 {1} px。推导内容区 {2} × {2} CSS px；旧版布局规则可能不同，待 CUBE 实测。', t(host.label), host.rem, size) };
  }
  profile = { ...profile, grid: t(profile.grid), basis: t(profile.basis) };
  const dimension = (key, fallback) => {
    const n = Number(params.get(key));
    return params.has(key) && Number.isFinite(n) && n >= 96 && n <= 3840 ? Math.round(n * 1000) / 1000 : fallback;
  };
  const width = dimension('width', profile.width), height = dimension('height', profile.height);
  const custom = width !== profile.width || height !== profile.height;
  const zoom = Number(params.get('zoom'));
  return { ...profile, width, height, custom, castHost, zoom: [0.5, 1, 1.5, 2].includes(zoom) ? zoom : 1 };
}
