import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDashboard } from '../apps/server/src/server.ts';
import { createSetup } from '../apps/server/src/setup.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';
import { CloudAuth, type CloudSession } from '../apps/server/src/cloud-auth.ts';
import { verifyOwner } from '../apps/server/src/account-access.ts';

const token = (name: string) => 'synthetic.' + Buffer.from(JSON.stringify({username:name})).toString('base64url') + '.testonly';
const first = token('first'), second = token('second');
const sample = { dev_id: 'SYNTHETIC123', name: 'Test printer', dev_product_name: 'H2C' };

test('empty-volume sign-in isolates challenges and enforces the same cloud owner after restart and logout', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cube-owner-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory);
  const auth = new CloudAuth(async (url, init) => {
    if (String(url).endsWith('/bind')) {
      const value = new Headers(init?.headers).get('Authorization');
      return [first, second].includes(value?.slice(7) ?? '') ? Response.json({devices:[sample]}) : new Response('',{status:401});
    }
    const b = JSON.parse(String(init?.body));
    if (b.code === '123456') return Response.json({ accessToken:first });
    return Response.json({loginType:'verifyCode'});
  });
  async function boot() {
    const setup = createSetup({store, auth, accountDirectory:directory, reset:async()=>{},connect:async()=>{},diagnostics:()=>({})});
    await setup.restore();
    const app = createDashboard({mode:'cloud', handleManagement:setup.handle});
    await new Promise<void>(r=>app.server.listen(0, '127.0.0.1', r));
    t.after(()=>app.close());
    const addr = app.server.address(); assert.ok(addr && typeof addr === 'object');
    const base = 'http://127.0.0.1:' + addr.port;
    const api = (route:string, body?:object, headers:Record<string,string>={}) => fetch(base+'/api/v1/setup/'+route,{
      method:body?'POST':'GET', headers:{Origin:base,'X-Setup-Request':'1','Content-Type':'application/json',...headers},
      body:body?JSON.stringify(body):undefined,
    });
    return {base, api};
  }
  const {base, api} = await boot();
  const page = await fetch(base+'/setup');
  assert.equal(page.status,200); assert.equal(page.headers.get('Set-Cookie'),null);
  assert.match(await page.text(), /id="login-form"/);
  assert.equal((await api('cast')).status,403);
  const login = await api('login',{region:'CN',account:'a@example.invalid',password:'synthetic'});
  assert.equal((await login.json()).challenge,'email');
  const guest = {'X-Print-Room-Challenge':login.headers.get('X-Print-Room-Challenge')!};
  assert.equal((await (await api('status')).json()).challenge,null);
  assert.equal((await (await api('status', undefined, guest)).json()).challenge,'email');
  assert.equal((await api('select',{deviceId:'anything'})).status,403);
  assert.equal((await api('code/verify',{code:'123456'},{Origin:'http://different.invalid'})).status,403);
  const verified=await api('code/verify',{code:'123456'},guest);
  assert.equal(verified.status,200); const result=await verified.json();
  const manager={'X-Print-Room-Session':verified.headers.get('X-Print-Room-Session')!};
  assert.ok(manager['X-Print-Room-Session']); assert.equal(verified.headers.get('Set-Cookie'),null);
  assert.equal((await api('select',{deviceId:result.devices[0].id},manager)).status,200);
  assert.equal((await (await api('status')).json()).devices.length,0);
  const restart=await boot();
  const rejected=await restart.api('token',{region:'CN',token:second});
  assert.equal((await rejected.json()).error,'OWNER_ACCOUNT_REQUIRED');
  assert.equal((await store.load())?.selected?.serial,sample.dev_id);
  const again=await boot();
  const owner=await again.api('token',{region:'CN', token:first});
  assert.equal(owner.status,200); assert.equal((await owner.json()).selected.name,sample.name);
  const access={'X-Print-Room-Session':owner.headers.get('X-Print-Room-Session')!};
  assert.equal((await again.api('logout',{},access)).status,200);
  assert.equal((await again.api('devices',{},access)).status,403);
  const after=await boot();
  assert.equal((await (await after.api('token',{region:'CN',token:second})).json()).error,'OWNER_ACCOUNT_REQUIRED');
});

test('upgrading an older volume preserves the owner even when its session expired', async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cube-legacy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new SessionStore(dir);
  const old:CloudSession={region:'CN',token:first,expiresAt:'2000-01-01T00:00:00.000Z'};
  await store.save(old); assert.equal(await store.load(true),null);
  const identity=async(s:CloudSession)=>s.token;
  await assert.rejects(verifyOwner(dir,{...old,token:second},identity),/OWNER_ACCOUNT_REQUIRED/);
  await verifyOwner(dir,old,identity);
  await store.clear();
  await assert.rejects(verifyOwner(dir,{...old,token:second},identity),/OWNER_ACCOUNT_REQUIRED/);
});
