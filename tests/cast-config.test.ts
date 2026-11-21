import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createCastManager,
  defaultCastConfig,
  validateCastConfig,
} from '../apps/server/src/cast-config.ts';
import { createCardDefinition } from '../packages/cube-client/src/index.ts';
test('CAST config reads 0.1 files and persists only current fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cast-config-'));
  try {
    const m = createCastManager(dir, join(dir, 'no-token'));
    assert.deepEqual(await m.read(), defaultCastConfig);
    const c = {
      ...defaultCastConfig,
      amsUnits: ['active', '128', '128'],
      cubeUrl: 'http://192.0.2.10',
      dashboardUrl: 'http://192.0.2.20:3032',
    };
    await writeFile(join(dir, 'cast-config.json'), JSON.stringify(c));
    const expected = {
      ...defaultCastConfig,
      cubeUrl: c.cubeUrl,
      dashboardUrl: c.dashboardUrl,
    };
    assert.deepEqual(await m.read(), expected);
    assert.deepEqual(await m.save(c), expected);
    assert.throws(() => validateCastConfig({ ...c, language: 'fr' }));
    assert.throws(() =>
      validateCastConfig({ ...c, dashboardUrl: 'http://127.0.0.1:3034' }),
    );
    assert.throws(() =>
      validateCastConfig({ ...c, cubeUrl: 'http://user:secret@example.com' }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('one resource advertises all CAST sizes and the original CUBE overview and drawer', () => {
  const url = 'http://192.0.2.20:3032';
  const card = createCardDefinition(url);
  assert.deepEqual(card.cast_settings.default, '2×2');
  assert.deepEqual(
    card.cast_settings.dimensions.map((d) => [d.size, d.src]),
    ['2x2', '4x1', '4x2', '4x3', '4x4', '6x2', '6x3', '6x4', '6x6'].map(
      (size) => [size.replace('x', '×'), url + '/cast-card/' + size],
    ),
  );
  assert.deepEqual(card.web_settings, {
    default: '2×1',
    dimensions: [
      { size: '1×1', src: url + '/card?layout=compact' },
      { size: '2×1', src: url + '/card?layout=wide' },
    ],
    drawer_component: { src: url + '/card?layout=detail' },
  });
});
import http from 'node:http';
import { writeFile, readFile } from 'node:fs/promises';
test('sync is idempotent across retries, preserves unrelated cards, detects legacy and truncated resources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cast-sync-')),
    dashboardUrl = 'http://192.0.2.20:3032',
    token = 'SYNTHETIC_CUBE_TOKEN';
  const original = {
      id: 'original',
      ...createCardDefinition('http://another-dashboard.example', 'Original'),
    },
    cards: any[] = [structuredClone(original)];
  let truncateCreation = false;
  let puts = 0,
    deletes = 0;
  const cube = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    let data: unknown;
    if (req.method === 'GET') {
      data = cards;
    } else {
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      if (req.method === 'POST') {
        const card = { id: 'card-' + cards.length, ...body };
        if (truncateCreation)
          card.cast_settings.dimensions = card.cast_settings.dimensions.slice(
            0,
            1,
          );
        cards.push(card);
        data = { id: card.id };
      } else if (req.method === 'PUT') {
        puts++;
        assert.deepEqual(Object.keys(body), ['cast_settings']);
        const id = req.url!.split('/').at(-1),
          card = cards.find((c) => c.id === id);
        card.cast_settings.dimensions[0].src = body.cast_settings.src;
        data = {};
      } else {
        deletes++;
        data = {};
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 0, data }));
  });
  await new Promise<void>((r) => cube.listen(0, '127.0.0.1', r));
  const address = cube.address();
  assert.ok(address && typeof address === 'object');
  const cubeUrl = 'http://127.0.0.1:' + address.port;
  const file = join(dir, 'auth.json');
  await writeFile(file, JSON.stringify({ cubeUrl, token }), { mode: 0o600 });
  const manager = createCastManager(dir, file);
  try {
    await manager.save({ ...defaultCastConfig, cubeUrl, dashboardUrl });
    truncateCreation = true;
    await assert.rejects(manager.sync(), { code: 'CAST_SIZE_MISMATCH' });
    assert.equal(cards.length, 2);
    await assert.rejects(manager.sync(), { code: 'CAST_SIZE_MISMATCH' });
    assert.equal(cards.length, 2);
    cards.pop();
    truncateCreation = false;
    const inFlight = manager.sync();
    await assert.rejects(manager.sync(), /busy/);
    const first = await inFlight;
    assert.equal(first.results.length, 1);
    assert.equal(cards.length, 2);
    assert.equal(first.results[0].action, 'created');
    cards[1].cast_settings.dimensions.reverse();
    cards[1].cast_settings.default = '2x2';
    for (const d of cards[1].cast_settings.dimensions) d.size = d.size.replace('×', 'x');
    const second = await manager.sync();
    assert.equal(second.results[0].action, 'unchanged');
    await manager.save({ ...(await manager.read()), language: 'en' });
    assert.equal((await manager.sync()).results[0].id, first.results[0].id);
    assert.equal(puts, 0);
    assert.deepEqual(cards[0], original);
    cards[1].cast_settings.dimensions.pop();
    await assert.rejects(manager.sync(), { code: 'CAST_SIZE_MISMATCH' });
    assert.equal(cards.length, 2);
    cards.pop();
    cards.push({
      id: 'old',
      ...createCardDefinition(dashboardUrl, 'Print Room · Print status'),
      cast_settings: {
        default: '2×2',
        dimensions: [
          { size: '2×2', src: dashboardUrl + '/card?layout=cast&view=status' },
        ],
      },
    });
    await assert.rejects(manager.sync(), { code: 'CAST_LEGACY_CARDS' });
    assert.equal(cards.length, 2);
    cards.pop();
    assert.equal((await manager.sync()).results[0].action, 'created');
    assert.equal(cards.length, 2);
    await rm(join(dir, 'cast-registration.json'));
    cards[1].label = 'User label';
    const restarted = createCastManager(dir, file);
    assert.equal((await restarted.sync()).results[0].action, 'unchanged');
    assert.equal(cards.length, 2);
    assert.equal(deletes, 0);
    assert.deepEqual(await manager.authorize(), { authorized: true });
    assert.ok(
      !(await readFile(join(dir, 'cast-config.json'), 'utf8')).includes(token),
    );
  } finally {
    cube.closeAllConnections();
    await new Promise<void>((r) => cube.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

import { createSetup } from '../apps/server/src/setup.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';
import { createDashboard } from '../apps/server/src/server.ts';
test('direct local CAST settings bootstraps a private session and protects management mutations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cast-settings-'));
  const manager = createCastManager(dir, join(dir, 'auth.json'));
  const setup = createSetup({
    store: new SessionStore(dir),
    cast: manager,
    connect: async () => {},
    reset: async () => {},
    diagnostics: () => ({}),
  });
  const app = createDashboard({
    mode: 'cloud',
    handleManagement: setup.handle,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;
  try {
    assert.equal((await fetch(base + '/api/v1/setup/cast')).status, 403);
    const page = await fetch(base + '/cast-config');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /cast-form/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    const cookie = page.headers.getSetCookie()[0].split(';')[0];
    assert.match(page.headers.getSetCookie()[0], /HttpOnly; SameSite=Strict/);
    const headers = { Cookie: cookie };
    assert.deepEqual(
      await (await fetch(base + '/api/v1/setup/cast', { headers })).json(),
      defaultCastConfig,
    );
    const post = {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'X-Setup-Request': '1',
      },
      body: JSON.stringify(defaultCastConfig),
    };
    assert.equal(
      (await fetch(base + '/api/v1/setup/cast/save', post)).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/api/v1/setup/cast/save', {
          ...post,
          headers: { ...post.headers, Origin: base },
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + '/cast-config', { method: 'POST', headers })).status,
      405,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
