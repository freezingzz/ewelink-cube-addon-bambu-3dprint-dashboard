import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readCloudConfig, usernameFromToken, resolveCloudUsername, selectTaskCover, startCloud } from '../apps/server/src/cloud.ts';
import type { connect, IClientOptions } from 'mqtt';
const token = (body: unknown) => `header.${Buffer.from(JSON.stringify(body)).toString('base64url')}.signature`;
test('cloud config requires explicit region, printer and token without printing secret values', () => {
  assert.throws(() => readCloudConfig({}), /BAMBU_REGION/);
  assert.throws(() => readCloudConfig({ BAMBU_REGION: 'CN', BAMBU_SERIAL: '#' }), /BAMBU_SERIAL/);
  assert.equal(usernameFromToken(token({ uid: '12345678901234567890' })), 'u_12345678901234567890');
  assert.equal(usernameFromToken(token({ uid: Number.MAX_SAFE_INTEGER + 1 })), null);
  assert.equal(usernameFromToken(token({ username: 'u_123' })), 'u_123');
});
test('account fallback uses fixed official region URL and does not expose upstream error bodies', async () => {
  let url = '';
  const name = await resolveCloudUsername({ region: 'CN', serial: 'TEST123', token: 'not-a-jwt' }, (async input => { url = String(input); return Response.json({ uidStr: '123' }); }) as typeof fetch);
  assert.equal(name, 'u_123');
  assert.match(url, /^https:\/\/api\.bambulab\.cn\/v1\/design-user-service\/my\/preference$/);
  await assert.rejects(resolveCloudUsername({ region: 'GLOBAL', serial: 'TEST123', token: 'secret' }, (async () => new Response('secret upstream text', { status: 401 })) as typeof fetch), /^Error: CLOUD_AUTH_REQUIRED$/);
  for (const body of ['private-upstream-body', 'null']) await assert.rejects(resolveCloudUsername({ region: 'CN', serial: 'TEST123', token: 'secret' }, (async () => new Response(body)) as typeof fetch), /^Error: CLOUD_ACCOUNT_LOOKUP_FAILED$/);
});
test('cover requires exact device and task identity, never guesses the first hit', () => {
  const body = { hits: [ { dev_id: 'OTHER', task_id: '1', cover: 'bad' }, { dev_id: 'TEST', task_id: '2', cover: 'wrong-task' }, { dev_id: 'TEST', task_id: '1', cover: 'correct' } ] };
  assert.equal(selectTaskCover(body, 'TEST', '1'), 'correct');
  assert.equal(selectTaskCover({ hits: [{ id: '1', cover: 'anonymous' }] }, 'TEST', '1'), null);
  assert.equal(selectTaskCover(body, 'TEST', '3'), null);
  assert.equal(selectTaskCover({ hits: [{ dev_id: 'TEST', id: '1', cover: 'ambiguous' }] }, 'TEST', '1'), null);
});
test('read-only MQTT subscribes once, filters reports and latches authentication failures', async () => {
  const client = new EventEmitter() as EventEmitter & { subscribe: (...args: any[]) => void; end: (...args: any[]) => void };
  const states: string[] = [];
  const reports: unknown[] = [];
  let topic = '';
  let ended = 0;
  const queries: unknown[] = [];
  (client as any).publish = (name: string, body: string, options: unknown, callback: (error?: Error)=>void) => { queries.push({name,body:JSON.parse(body),options}); callback(); };
  client.subscribe = (name, _options, callback) => { topic = name; callback(null, [{ qos: 1 }]); };
  client.end = (...args) => { ended++; args.find(x => typeof x === 'function')?.(); };
  const connector = ((_url: string, options?: IClientOptions) => { assert.equal(options?.rejectUnauthorized, true); return client; }) as unknown as typeof connect;
  const stop = startCloud({ region: 'CN', serial: 'TEST123', token: 'secret', username: 'u_1' }, { report: x => reports.push(x), connection: (state, code) => states.push(code ?? state) }, connector);
  client.emit('connect');
  assert.equal(topic, 'device/TEST123/report');
  assert.deepEqual(queries, [
    {name:'device/TEST123/request',body:{info:{sequence_id:'0',command:'get_version'}},options:{qos:1,retain:false}},
    {name:'device/TEST123/request',body:{pushing:{sequence_id:'0',command:'pushall'}},options:{qos:1,retain:false}}
  ]);
  client.emit('message', 'device/OTHER/report', Buffer.from('{}'));
  client.emit('message', topic, Buffer.from('{bad'));
  client.emit('message', topic, Buffer.from('{"print":{"mc_percent":1}}'));
  assert.equal(reports.length, 1);
  client.emit('error', Object.assign(new Error('private'), { code: 5 }));
  client.emit('close');
  assert.equal(states.at(-1), 'CLOUD_AUTH_REQUIRED');
  assert.equal(ended, 1);
  await stop();
});

test('monitoring refreshes full status every 30 seconds and stops querying after shutdown', async context => {
  context.mock.timers.enable({apis:['setTimeout','setInterval']});
  const client = new EventEmitter() as any;
  client.connected = true;
  const commands: string[]=[];
  client.subscribe=(_topic: string,_options: unknown,done: Function)=>done(null,[{qos:1}]);
  client.publish=(_topic: string,body: string,_options: unknown,done: Function)=>{const value=JSON.parse(body);commands.push(value.pushing?.command??value.info?.command);done();};
  client.end=(...args: any[])=>args.find(x=>typeof x==='function')?.();
  const stop=startCloud({region:'CN',serial:'SYNTH12345',token:'SYNTHETIC',username:'u_test'},{report:()=>{},connection:()=>{}},(()=>client)as unknown as typeof connect);
  client.emit('connect');
  client.emit('message','device/SYNTH12345/report',Buffer.from('{"print":{"gcode_state":"IDLE","bed_temper":32}}'));
  context.mock.timers.tick(30000);
  assert.deepEqual(commands,['get_version','pushall','pushall']);
  await stop();context.mock.timers.tick(60000);
  assert.equal(commands.length,3);
});
