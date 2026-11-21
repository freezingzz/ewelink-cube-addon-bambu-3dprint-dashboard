// Exercise the packaged service without real accounts or printer credentials.
import assert from 'node:assert/strict';
import { execFile as run } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const execFile = promisify(run);
const image = process.argv[2];
if (!image) throw new Error('Usage: node deploy/smoke-image.mjs IMAGE');
const docker = async (...args) => (await execFile('docker', args)).stdout.trim();
const results = [];
const fromVolume = process.argv[3] === '--volume';
for (const [platform, port] of [['linux/arm64', 3035], ['linux/amd64', 3036]]) {
  const name = `print-room-smoke-${process.pid}-${port}`;
  const volume = `${name}-data`;
  const network = `${name}-lan`;
  const base = `http://127.0.0.1:${port}`;
  const accessKey = 'SYNTHETIC_SMOKE_MANAGEMENT_KEY_ONLY_12345';
  try {
    await docker('volume', 'create', volume);
    await docker('run', '-d', '--name', name, '--platform', platform,
      '--read-only', '--tmpfs', '/tmp:size=16m', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true',
      '-p', `127.0.0.1:${port}:3030`, '-v', `${volume}:/app/data`,
      ...(fromVolume ? [] : ['-e', `SETUP_PUBLIC_ORIGIN=${base}`, '-e', `SETUP_ACCESS_KEY=${accessKey}`]), image);
    const healthy = async () => {
      for (let n = 0; n < 40; n++) {
        try {
          const r = await fetch(base + '/healthz', { signal: AbortSignal.timeout(1000) });
          if (r.ok) return r.json();
        } catch {}
        await delay(500);
      }
      throw new Error(`Service did not become ready: ${platform}`);
    };
    assert.equal((await healthy()).setupEnabled, true);
    if (fromVolume) {
      // A bridge client exercises the LAN path without loopback's local setup privileges.
      await docker('network', 'create', '--internal', network);
      await docker('network', 'connect', '--alias', 'dashboard.local', network, name);
      await docker('run', '--rm', '--network', network, '--platform', platform,
        '--entrypoint', 'node', image, '--input-type=module', '-e', `
          import assert from 'node:assert/strict';
          const page = await fetch('http://dashboard.local:3030/setup', { headers: { Accept: 'text/html' } });
          assert.equal(page.status, 200);
          assert.match(await page.text(), /id="login-form"/);
          assert.equal(page.headers.get('Set-Cookie'), null);
          const origin = 'http://dashboard.local:3030/api/v1/setup';
          assert.equal((await (await fetch(origin + '/status')).json()).authenticated, false);
          assert.equal((await fetch(origin + '/cast')).status, 403);
        `);
      const contents = 'SETUP_PUBLIC_ORIGIN=' + base + '\nSETUP_ACCESS_KEY=' + accessKey + '\n';
      await docker('exec', name, 'node', '-e',
        "require('node:fs').writeFileSync('/app/data/management.env', process.argv[1], { mode: 0o600 })", contents);
      await docker('restart', name);
      await healthy();
      const page = await fetch(base + '/setup');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /unlock-form/);
      assert.equal((await fetch(base + '/management.env')).status, 404);
    }
    const before = await fetch(base + '/cast-config', { redirect: 'manual' });
    assert.equal(before.status, 302);
    assert.equal(before.headers.get('set-cookie'), null);
    assert.equal((await fetch(base + '/api/v1/setup/cast')).status, 403);
    const unlock = async () => {
      const r = await fetch(base + '/api/v1/setup/unlock', {
        method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Setup-Request': '1' },
        body: JSON.stringify({ accessKey }),
      });
      assert.equal(r.status, 200);
      return r.headers.getSetCookie()[0].split(';')[0];
    };
    let cookie = await unlock();
    const config = { language: 'en', cubeUrl: '', dashboardUrl: '' };
    const saved = await fetch(base + '/api/v1/setup/cast/save', {
      method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Setup-Request': '1' },
      body: JSON.stringify(config),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), config);
    for (const path of ['/cast-card/6x6', '/adaptive-cast.js', '/adaptive-cast.css', '/card?layout=cast&view=status&lang=en', '/cast-model.js', '/cast-cards.js', '/cast-cards.css'])
      assert.equal((await fetch(base + path)).status, 200);
    const filesystem = JSON.parse(await docker('exec', name, 'node', '--input-type=module', '-e', `
      import fs from 'node:fs';import assert from 'node:assert/strict';
      for(const file of ['docs','tests','artifacts','.git','.env','AGENTS.md','apps/web/tests','node_modules/playwright','node_modules/typescript'])assert.equal(fs.existsSync('/app/'+file),false,file);
      for(const file of ['NOTICE.md','UPSTREAM_LICENSE'])assert.equal(fs.existsSync('/app/packages/printer-bambu/'+file),true);
      assert.equal(process.getuid(),1000);
      assert.throws(()=>fs.writeFileSync('/app/unexpected-write','test'),{code:'EROFS'});
      assert.equal(fs.statSync('/app/data').mode&0o777,0o700);
      assert.equal(fs.statSync('/app/data/cast-config.json').mode&0o777,0o600);
      assert.equal(fs.existsSync('/app/data/cloud-session.json'),false);
      console.log(JSON.stringify({architecture:process.arch,node:process.version,uid:process.getuid(),runtimeOnly:true,readOnlyRoot:true,privatePersistence:true}));
    `));
    await docker('restart', name);
    await healthy();
    cookie = await unlock();
    assert.deepEqual(await (await fetch(base + '/api/v1/setup/cast', { headers: { Cookie: cookie } })).json(), config);
    results.push({ platform, ...filesystem, managementConfig: fromVolume ? 'volume' : 'environment', remoteManagementProtected: true, restartPersistence: true });
    console.log(`${platform}: runtime, protected settings, read-only filesystem and restart passed.`);
  } finally {
    await docker('rm', '-f', name).catch(() => {});
    await docker('volume', 'rm', volume).catch(() => {});
    if (fromVolume) await docker('network', 'rm', network).catch(() => {});
  }
}
await mkdir('artifacts/release', { recursive: true });
await writeFile('artifacts/release/smoke.json', JSON.stringify({ image, results, evidence: 'Isolated local containers; synthetic management settings, no cloud session' }, null, 2));
