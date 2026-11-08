import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboard } from '../apps/server/src/server.ts';
import { makeDemo, scenarios } from '../apps/server/src/demo.ts';

async function start(mode: 'demo' | 'cloud' = 'demo') {
  const app = createDashboard({ mode, tickMs: 3600000 });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  return { app, base: `http://127.0.0.1:${address.port}` };
}
test('demo is explicitly synthetic, serves inventory, snapshot and validates scenario changes', async () => {
  const { app, base } = await start();
  try {
    const list = await (await fetch(base + '/api/v1/printers')).json();
    assert.equal(list.mode, 'demo');
    const state = await (await fetch(base + '/api/v1/printers/h2c-demo/snapshot')).json();
    assert.equal(state.provenance, 'synthetic');
    assert.equal(state.capabilities.controls, false);
    assert.equal((await fetch(base + '/api/v1/demo/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
    assert.equal((await fetch(base + '/api/v1/demo/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{"id":"offline"}' })).status, 403);
    const changed = await (await fetch(base + '/api/v1/demo/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"offline"}' })).json();
    assert.equal(changed.connection, 'offline');
    assert.equal(changed.freshness, 'stale');
    assert.equal((await fetch(base + '/api/v1/printers/missing/snapshot')).status, 404);
  } finally { await app.close(); }
});
test('SSE sends current full snapshot immediately and changed snapshots in sequence', async () => {
  const { app, base } = await start();
  const controller = new AbortController();
  try {
    const response = await fetch(base + '/api/v1/events', { signal: controller.signal });
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const initial = JSON.parse(first.split('data: ')[1].trim());
    assert.equal(initial.type, 'snapshot');
    assert.equal(initial.snapshot.provenance, 'synthetic');
    app.update(makeDemo('paused'));
    const next = new TextDecoder().decode((await reader.read()).value);
    const changed = JSON.parse(next.split('data: ')[1].trim());
    assert.equal(changed.sessionId, initial.sessionId);
    assert.ok(changed.sequence > initial.sequence);
    assert.equal(changed.snapshot.lifecycle, 'paused');
    await reader.cancel();
  } finally { controller.abort(); await app.close(); }
});
test('cloud service mode does not expose demo mutation endpoints', async () => {
  const { app, base } = await start('cloud');
  try {
    assert.equal((await fetch(base + '/api/v1/demo/scenarios')).status, 404);
    assert.equal((await fetch(base + '/api/v1/demo/scenario', { method: 'POST' })).status, 404);
  } finally { await app.close(); }
});
test('fixtures distinguish no-data, old-data and task identity across covers', () => {
  assert.equal(makeDemo('unknown').nozzleC, null);
  assert.equal(makeDemo('idle').taskId, null);
  assert.equal(makeDemo('cover-error').cover.state, 'error');
  assert.notEqual(makeDemo('task-switch').taskId, makeDemo('printing').taskId);
  assert.equal(makeDemo('multi-ams').ams[1].trays.length, 1);
  assert.equal(new Set(scenarios.map(x => x.id)).size, scenarios.length);
});
test('cover endpoint is task-scoped and never serves old-task bytes to a new task', async () => {
  const initial = makeDemo();
  const app = createDashboard({ mode: 'cloud', initialSnapshot: initial, getCover: () => ({ taskId: 'demo-task-a', data: Buffer.from('image-bytes'), contentType: 'image/png' }) });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1/printers/h2c-demo/cover`;
  try {
    assert.equal((await fetch(base)).status, 404);
    const image = await fetch(base + '?task=demo-task-a');
    assert.equal(await image.text(), 'image-bytes');
    assert.equal(image.headers.get('cache-control'), 'private, max-age=60');
    app.update(makeDemo('task-switch'));
    assert.equal((await fetch(base + '?task=demo-task-a')).status, 404);
    assert.equal((await fetch(base + '?task=demo-task-b')).status, 404);
  } finally { await app.close(); }
});
