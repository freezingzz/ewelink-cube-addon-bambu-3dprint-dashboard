import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudAuth, type CloudSession } from '../apps/server/src/cloud-auth.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';
import { createSetup } from '../apps/server/src/setup.ts';
import { createDashboard } from '../apps/server/src/server.ts';
import { emptySnapshot } from '../packages/contracts/src/index.ts';
const testToken='SYNTHETIC_TOKEN_NOT_A_REAL_CREDENTIAL';
const session:CloudSession={region:'CN',token:testToken,expiresAt:null};

test('password, email and TFA flows use fixed official endpoints and never return raw login failures',async()=>{
  const calls:{url:string;body:any}[]=[];
  let response=Response.json({loginType:'verifyCode'});
  const auth=new CloudAuth((async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body||'{}'))});return response;})as typeof fetch);
  const challenge=await auth.login('CN','test@example.invalid','synthetic-password');assert.ok('kind'in challenge);assert.equal(challenge.kind,'email');
  assert.equal(calls[0].url,'https://api.bambulab.cn/v1/user-service/user/login');
  response=Response.json({accessToken:testToken,expiresIn:3600});
  assert.equal((await auth.verify(challenge,'123456')).token,testToken);assert.equal(calls[1].body.code,'123456');
  response=new Response('{}',{headers:{'Set-Cookie':`token=${testToken}; HttpOnly; Secure`}});
  assert.equal((await auth.verify({...challenge,kind:'tfa',key:'SYNTHETIC_TFA_KEY'},'654321')).token,testToken);
  assert.equal(calls[2].url,'https://bambulab.cn/api/sign-in/tfa');
  response=new Response('private upstream text',{status:403});
  await assert.rejects(auth.login('GLOBAL','test@example.invalid','synthetic-password'),/^CloudError: CLOUD_LOGIN_REJECTED$/);
  const broken=new CloudAuth((async()=>{throw new Error('private token content');})as typeof fetch);
  await assert.rejects(broken.login('CN','test@example.invalid','synthetic-password'),/^CloudError: CLOUD_NETWORK_ERROR$/);
});
test('device response strips access codes and unknown fields; missing or forbidden lists are not empty success',async()=>{
  let response=Response.json({data:{devices:[{dev_id:'SYNTH12345',name:'H2C',dev_product_name:'H2C',access_code:'PRIVATE',online:true}]}});
  const auth=new CloudAuth((async()=>response)as typeof fetch);
  assert.deepEqual(await auth.devices(session),[{serial:'SYNTH12345',name:'H2C',model:'H2C',online:true}]);
  response=Response.json({devices:'bad'});await assert.rejects(auth.devices(session),/CLOUD_DEVICE_LOOKUP_FAILED/);
  response=new Response('{}',{status:401});await assert.rejects(auth.devices(session),/CLOUD_AUTH_REQUIRED/);
});
test('session persistence is private, atomic, expires safely and never stores password fields',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cube-session-')),store=new SessionStore(directory);
  try{await store.save(session);assert.equal((await store.load())?.token,testToken);assert.equal((await stat(join(directory,'cloud-session.json'))).mode&0o777,0o600);
    assert.equal((await stat(directory)).mode&0o777,0o700);assert.ok(!(await readFile(join(directory,'cloud-session.json'),'utf8')).includes('password'));
    await store.save({...session,expiresAt:'2000-01-01T00:00:00Z'});assert.equal(await store.load(),null);await store.clear();assert.equal(await store.load(),null);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('setup API requires local bootstrap cookie and same-origin JSON; selection is explicit and secrets stay server-side',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cube-setup-'));let selected='',resets=0;
  const auth=new CloudAuth((async(url)=>String(url).endsWith('/bind')?Response.json({devices:[{dev_id:'SYNTH12345',name:'H2C',dev_product_name:'H2C',access_code:'NEVER_EXPOSE'}]}):Response.json({accessToken:testToken}))as typeof fetch);
  const setup=createSetup({store:new SessionStore(directory),auth,connect:async config=>{selected=config.serial;},reset:async()=>{resets++;},diagnostics:()=>({validReports:0})});
  const dashboard=createDashboard({mode:'cloud',initialSnapshot:emptySnapshot('h2c-1','cloud'),handleManagement:setup.handle});
  await new Promise<void>(done=>dashboard.server.listen(0,'127.0.0.1',done));const address=dashboard.server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  try{
    assert.equal((await fetch(base+'/api/v1/setup/status')).status,403);
    const boot=await fetch(base+'/setup');assert.equal(boot.status,200);assert.match(boot.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
    const cookie=boot.headers.getSetCookie()[0].split(';')[0];
    const post=(path:string,body:object,origin=base)=>fetch(base+'/api/v1/setup/'+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-Setup-Request':'1'},body:JSON.stringify(body)});
    assert.equal((await post('login',{region:'CN',account:'test@example.invalid',password:'sample'},'https://foreign.invalid')).status,403);
    const response=await post('login',{region:'CN',account:'test@example.invalid',password:'sample'});assert.equal(response.status,200);const status=await response.json();
    assert.equal(status.authenticated,true);assert.equal(selected,'');assert.equal(status.devices[0].serialSuffix,'2345');assert.ok(!JSON.stringify(status).includes(testToken));assert.ok(!JSON.stringify(status).includes('SYNTH12345'));assert.ok(!JSON.stringify(status).includes('NEVER_EXPOSE'));
    assert.equal((await post('select',{deviceId:'not-owned'})).status,400);
    assert.equal((await post('select',{deviceId:status.devices[0].id})).status,200);assert.equal(selected,'SYNTH12345');
    assert.equal((await post('logout',{})).status,200);assert.equal(setup.status().authenticated,false);assert.equal(await new SessionStore(directory).load(),null);assert.ok(resets>=2);
    assert.equal((await fetch(base+'/data/cloud-session.json')).status,404);
  }finally{await dashboard.close();await rm(directory,{recursive:true,force:true});}
});
