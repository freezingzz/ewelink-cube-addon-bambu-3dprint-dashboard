import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readManagementConfig } from '../apps/server/src/management-config.ts';

test('remote management loads only its two settings from the private volume', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cube-management-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['SETUP_PUBLIC_ORIGIN', 'SETUP_ACCESS_KEY']) {
    const previous = process.env[name];
    delete process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  assert.equal(await readManagementConfig(dir), undefined);
  const path = join(dir, 'management.env');
  const origin = 'http://dashboard.test:3033';
  const accessKey = 'synthetic-management-key-for-tests-only';
  await writeFile(path, 'SETUP_PUBLIC_ORIGIN=' + origin);
  await assert.rejects(readManagementConfig(dir), /Both remote management settings/);
  await writeFile(path, [
    'SETUP_PUBLIC_ORIGIN=' + origin, 'SETUP_ACCESS_KEY=' + accessKey,
    'CUBE_MANAGEMENT_TEST_EXTRA=ignored',
  ].join('\n'));
  assert.deepEqual(await readManagementConfig(dir), { origin, accessKey });
  assert.equal(process.env.CUBE_MANAGEMENT_TEST_EXTRA, undefined);
  process.env.SETUP_PUBLIC_ORIGIN = 'http://second.test:3033';
  await assert.rejects(readManagementConfig(dir), /Both remote management settings/);
  process.env.SETUP_ACCESS_KEY = 'synthetic-separate-environment-test-key';
  assert.deepEqual(await readManagementConfig(dir), {
    origin: process.env.SETUP_PUBLIC_ORIGIN, accessKey: process.env.SETUP_ACCESS_KEY,
  });
});
