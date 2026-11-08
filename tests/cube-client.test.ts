import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardDefinition, registerCard } from '../packages/cube-client/src/index.ts';

const definition = createCardDefinition('http://192.168.1.50:3030');
const success = (data: unknown) => new Response(JSON.stringify({ error: 0, data }));
test('definition separates web sizes, drawer and cast and rejects browser-unreachable URLs', () => {
  assert.deepEqual(definition.web_settings.dimensions.map(x => x.size), ['1×1', '2×1']);
  assert.equal(new URL(definition.web_settings.drawer_component.src).searchParams.get('layout'), 'detail');
  assert.equal(definition.cast_settings.dimensions[0].size, '2×2');
  for (const url of ['http://localhost:3030', 'http://127.0.0.1:3030', 'http://[::1]:3030', 'http://0.0.0.0:3030', 'ftp://example.org', 'http://name:secret@example.org']) {
    assert.throws(() => createCardDefinition(url));
  }
});
test('first apply lists then creates and uses Bearer without returning token', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? success([]) : success({ id: 'card-1' });
  };
  const result = await registerCard({ cubeUrl: 'http://192.168.1.60', token: 'not-a-real-token', definition, fetch: fetcher });
  assert.deepEqual(result, { id: 'card-1', action: 'created' });
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(calls[1].url, 'http://192.168.1.60/open-api/v2/rest/ui/cards');
  assert.equal(JSON.parse(String(calls[1].init?.body)).web_settings.drawer_component.src, definition.web_settings.drawer_component.src);
  assert.equal(new Headers(calls[1].init?.headers).get('Authorization'), 'Bearer not-a-real-token');
  assert.ok(calls[0].init?.signal);
});
test('same registration is idempotent and does not write', async () => {
  let calls = 0;
  const result = await registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition,
    fetch: async () => { calls++; return success([{ id: 'card-1', ...definition }]); } });
  assert.equal(result.action, 'unchanged');
  assert.equal(calls, 1);
});
test('label collisions and missing explicit ID do not overwrite or create', async () => {
  let writes = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method !== 'GET') writes++;
    return success([{ id: 'other', ...createCardDefinition('http://192.168.1.51:3030') }]);
  };
  await assert.rejects(registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition, fetch: fetcher }), /同名/);
  await assert.rejects(registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition, cardId: 'missing', fetch: fetcher }), /不存在/);
  assert.equal(writes, 0);
});
test('explicit ID supports label-only update; changed resource URL fails closed', async () => {
  const calls: RequestInit[] = [];
  const fetcher: typeof fetch = async (_url, init) => { calls.push(init!); return init?.method === 'GET' ? success([{ ...definition, label: 'old label', id: 'card-1' }]) : success({}); };
  const result = await registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition, cardId: 'card-1', fetch: fetcher });
  assert.equal(result.action, 'updated');
  assert.deepEqual(JSON.parse(String(calls[1].body)), { label: definition.label });
  await assert.rejects(registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition: createCardDefinition('http://192.168.1.99:3030'), cardId: 'card-1', fetch: fetcher }), /资源配置不同/);
});
test('HTTP 200 with API error, malformed payload and transport failures never report success or leak raw server text', async () => {
  for (const response of [new Response('unauthorized', { status: 401 }), success({ cards: [] }), new Response('not json'), new Response(JSON.stringify({ error: 401, message: 'server secret token' }))]) {
    await assert.rejects(registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition, fetch: async () => response }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('server secret'));
      return true;
    });
  }
  await assert.rejects(registerCard({ cubeUrl: 'http://cube.local', token: 'test', definition, fetch: async () => { throw new Error('secret transport'); } }), /请求失败或超时/);
});
