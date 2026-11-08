import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoverCache, allowedCoverUrl } from '../apps/server/src/cover-cache.ts';
test('cover fetching accepts only explicit official HTTPS image origins', () => {
  assert.ok(allowedCoverUrl('https://cdn.bambulab.com/image.jpg?token=private'));
  for (const value of ['http://cdn.bambulab.com/a', 'https://bambulab.com.evil.test/a', 'https://127.0.0.1/a', 'file:///tmp/x', 'https://user:pass@bambulab.com/a', 'https://bambulab.com:8080/a']) assert.equal(allowedCoverUrl(value), false);
});
test('a late cover cannot overwrite a newer task', async () => {
  const cache = new CoverCache();
  let finish!: (r: Response) => void;
  const late = cache.load('a', 'https://cdn.bambulab.com/a.jpg', (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch);
  assert.equal(await cache.load('b', 'https://cdn.bambulab.com/b.jpg', (async () => new Response('new', { headers: { 'Content-Type': 'image/jpeg' } })) as typeof fetch), 'available');
  finish(new Response('old', { headers: { 'Content-Type': 'image/jpeg' } }));
  assert.equal(await late, 'superseded');
  assert.equal(cache.current?.taskId, 'b');
  assert.equal(Buffer.from(cache.current!.data).toString(), 'new');
});
test('failed or non-image response never becomes an available cover', async () => {
  const cache = new CoverCache();
  const fetcher = (async () => new Response('<script>bad</script>', { headers: { 'Content-Type': 'text/html' } })) as typeof fetch;
  assert.equal(await cache.load('a', 'https://cdn.bambulab.com/a', fetcher), 'error');
  assert.equal(cache.current, null);
});
test('late rejected cover is superseded and its response stream is cancelled', async () => {
  const cache = new CoverCache();
  let finish!: (r: Response) => void;
  let cancelled = false;
  const late = cache.load('a', 'https://cdn.bambulab.com/a', (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch);
  await cache.load('b', 'https://cdn.bambulab.com/b', (async () => new Response('new', { headers: { 'Content-Type': 'image/png' } })) as typeof fetch);
  finish(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/html' } }));
  assert.equal(await late, 'superseded');
  assert.equal(cancelled, true);
  assert.equal(cache.current?.taskId, 'b');
});
