/** CUBE Open API v2 UI card client. No printer credentials belong in this module. */
export interface CardDefinition {
  label: string;
  cast_settings: { dimensions: { src: string; size: string }[]; default: string };
  web_settings: { dimensions: { src: string; size: string }[]; default: string; drawer_component: { src: string } };
}
export interface CubeCard extends CardDefinition { id: string }
export interface RegisterOptions {
  cubeUrl: string;
  token: string;
  definition: CardDefinition;
  cardId?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export function validateHttpUrl(value: string, browserReachable = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('需要完整的 HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('URL 必须使用 HTTP(S)，不能包含凭证、查询或片段');
  }
  const host = url.hostname.toLowerCase();
  if (browserReachable && (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '[::1]' || host.startsWith('127.'))) {
    throw new Error('卡片地址必须让访问 CUBE 的浏览器可达，不能使用回环或监听地址');
  }
  return url;
}
export function createCardDefinition(dashboardUrl: string, label = 'H2C · Print Dashboard'): CardDefinition {
  const base = validateHttpUrl(dashboardUrl, true);
  if (!label.trim() || label.length > 100) throw new Error('卡片名称需要 1–100 个字符');
  base.pathname = base.pathname.replace(/\/?$/, '/');
  const card = (layout: string) => { const url = new URL('card', base); url.searchParams.set('layout', layout); return url.href; };
  return {
    label,
    cast_settings: { dimensions: [{ src: card('cast'), size: '2×2' }], default: '2×2' },
    web_settings: {
      dimensions: [{ src: card('compact'), size: '1×1' }, { src: card('wide'), size: '2×1' }],
      default: '2×1', drawer_component: { src: card('detail') }
    }
  };
}
function sameResource(card: CubeCard, desired: CardDefinition): boolean {
  const dimensions = (value: { dimensions?: { src: string; size: string }[] } | undefined) =>
    JSON.stringify((value?.dimensions ?? []).map(({ src, size }) => ({ src, size })).sort((a, b) => a.size.localeCompare(b.size)));
  return card.label === desired.label && dimensions(card.cast_settings) === dimensions(desired.cast_settings)
    && dimensions(card.web_settings) === dimensions(desired.web_settings)
    && card.web_settings?.drawer_component?.src === desired.web_settings.drawer_component.src;
}
export async function registerCard(options: RegisterOptions): Promise<{ id: string; action: 'created' | 'updated' | 'unchanged' }> {
  const cube = validateHttpUrl(options.cubeUrl);
  if (cube.pathname !== '/') throw new Error('CUBE URL 必须是源站地址，不带路径');
  if (!options.token.trim() || /[\r\n]/.test(options.token)) throw new Error('需要有效的 CUBE_TOKEN 环境变量');
  if (options.cardId && !/^[A-Za-z0-9_-]{1,100}$/.test(options.cardId)) throw new Error('无效的 cardId');
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('无效的请求超时');
  const fetcher = options.fetch ?? globalThis.fetch;
  const request = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetcher(new URL(path, cube), {
        method, signal, redirect: 'error',
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch { throw new Error('CUBE 请求失败或超时；请检查设备与网络'); }
    if (!response.ok) throw new Error(`CUBE HTTP 错误 ${response.status}`);
    let payload: { error?: unknown; data?: unknown };
    try { payload = await response.json() as typeof payload; } catch { throw new Error('CUBE 返回非 JSON 响应'); }
    if (payload === null || typeof payload !== 'object' || payload.error !== 0) {
      throw new Error(`CUBE API 拒绝请求（错误码 ${typeof payload?.error === 'number' ? payload.error : 'unknown'}）`);
    }
    return payload.data;
  };
  const path = '/open-api/v2/rest/ui/cards';
  const data = await request('GET', path);
  if (!Array.isArray(data) || data.some(card => !card || typeof card !== 'object' || typeof card.id !== 'string')) {
    throw new Error('CUBE 卡片列表格式无效');
  }
  const cards = data as CubeCard[];
  if (options.cardId) {
    const existing = cards.find(card => card.id === options.cardId);
    if (!existing) throw new Error('指定卡片已不存在，请确认 ID 后重新注册');
    if (sameResource(existing, options.definition)) return { id: existing.id, action: 'unchanged' };
    // API's PUT cannot update drawer_component or all dimensions. Recreate explicitly instead of silently leaving stale URLs.
    if (!sameResource(existing, { ...options.definition, label: existing.label })) {
      throw new Error('现有资源配置不同；官方 PUT 未定义完整尺寸与抽屉更新，请显式删除旧卡片后重新注册，避免残留旧地址');
    }
    await request('PUT', `${path}/${encodeURIComponent(existing.id)}`, { label: options.definition.label });
    return { id: existing.id, action: 'updated' };
  }
  const matches = cards.filter(card => sameResource(card, options.definition));
  if (matches.length > 1) throw new Error('发现多个匹配卡片，请指定 cardId');
  if (matches.length === 1) return { id: matches[0].id, action: 'unchanged' };
  if (cards.some(card => card.label === options.definition.label)) {
    throw new Error('同名卡片使用不同资源，请确认其归属并指定 cardId，不自动覆盖或重复创建');
  }
  const created = await request('POST', path, options.definition) as { id?: unknown } | null;
  if (!created || typeof created.id !== 'string' || !created.id) throw new Error('CUBE 未返回有效卡片 ID，不能确认创建成功；请先查询设备避免重复创建');
  return { id: created.id, action: 'created' };
}
