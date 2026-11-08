import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  castDefinitions,
  createCastManager,
  defaultCastConfig,
  validateCastConfig,
} from '../apps/server/src/cast-config.ts';
import { createCardDefinition } from '../packages/cube-client/src/index.ts';
test('CAST profiles persist, deduplicate and reject malformed or unsafe configuration', async () => {
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
    await m.save(c);
    assert.deepEqual((await m.read()).amsUnits, ['active', '128']);
    assert.throws(() =>
      validateCastConfig({ ...c, amsUnits: ['../../setup'] }),
    );
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
test('functional CAST definitions keep every web dimension and drawer on the original comprehensive views', () => {
  const c = {
    ...defaultCastConfig,
    cubeUrl: 'http://192.0.2.10',
    dashboardUrl: 'http://192.0.2.20:3032',
  };
  const profiles = castDefinitions(c),
    original = createCardDefinition(c.dashboardUrl);
  assert.equal(profiles.length, 3);
  for (const p of profiles) {
    assert.deepEqual(p.definition.web_settings, original.web_settings);
    assert.equal(
      new URL(p.definition.cast_settings.dimensions[0].src).searchParams.get(
        'view',
      ),
      p.kind,
    );
  }
  assert.equal(profiles[1].unit, 'active');
});
import http from 'node:http';
import { writeFile, readFile } from 'node:fs/promises';
test('sync preserves original web cards, keeps IDs across language changes and only updates CAST URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cast-sync-')),
    dashboardUrl = 'http://192.0.2.20:3032',
    token = 'SYNTHETIC_CUBE_TOKEN';
  const original = {
      id: 'original',
      ...createCardDefinition(dashboardUrl, 'Original'),
    },
    cards: any[] = [structuredClone(original)];
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
    const first = await manager.sync();
    assert.equal(first.results.length, 3);
    assert.equal(cards.length, 4);
    const second = await manager.sync();
    assert.ok(second.results.every((r) => r.action === 'unchanged'));
    assert.equal(cards.length, 4);
    await manager.save({ ...(await manager.read()), language: 'en' });
    const changed = await manager.sync();
    assert.ok(changed.results.every((r) => r.action === 'updated'));
    assert.deepEqual(
      changed.results.map((r) => r.id),
      first.results.map((r) => r.id),
    );
    assert.equal(puts, 3);
    assert.deepEqual(cards[0], original);
    for (const card of cards.slice(1)) {
      assert.deepEqual(
        card.web_settings,
        createCardDefinition(dashboardUrl).web_settings,
      );
      assert.equal(
        new URL(card.cast_settings.dimensions[0].src).searchParams.get('lang'),
        'en',
      );
    }
    await manager.save({ ...(await manager.read()), status: false });
    await manager.sync();
    assert.equal(deletes, 0);
    assert.equal(cards.length, 4);
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
