export interface CachedCover { taskId: string; data: Uint8Array; contentType: string }
const allowedDomains = ['bambulab.com', 'bambulab.cn', 'bblmw.com', 'bblcdn.com'];
export function allowedCoverUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && allowedDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
/** An independent generation prevents a late task-A response replacing task B's cover. */
export class CoverCache {
  #generation = 0;
  #controller: AbortController | null = null;
  #cached: CachedCover | null = null;
  get current() { return this.#cached; }
  clear() { this.#generation++; this.#controller?.abort(); this.#cached = null; }
  async load(taskId: string, url: string, fetcher: typeof fetch = fetch): Promise<'available' | 'error' | 'superseded'> {
    this.clear();
    const generation = this.#generation;
    if (!allowedCoverUrl(url)) return 'error';
    const controller = new AbortController();
    this.#controller = controller;
    let body: ReadableStream<Uint8Array> | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const failure = () => generation === this.#generation ? 'error' as const : 'superseded' as const;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(url, { signal: controller.signal, redirect: 'error' });
      body = response.body;
      if (!response.ok) return failure();
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return failure();
      if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024 || !body) return failure();
      reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 5 * 1024 * 1024) return failure();
        chunks.push(chunk.value);
      }
      if (generation !== this.#generation) return 'superseded';
      if (!bytes) return failure();
      this.#cached = { taskId, data: Buffer.concat(chunks), contentType };
      return 'available';
    } catch { return generation === this.#generation ? 'error' : 'superseded'; }
    finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      else if (body && !body.locked) await body.cancel().catch(() => {});
    }
  }
}
