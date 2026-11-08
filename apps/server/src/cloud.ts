/** Status-only cloud transport; initial get_version/pushall sync follows PrintSphere. No print controls. */
import { connect, type MqttClient, type IClientOptions } from 'mqtt';
import type { Connection } from '../../../packages/contracts/src/index.ts';

export interface CloudConfig { region: 'CN' | 'GLOBAL'; serial: string; token: string; username?: string }
export function readCloudConfig(env: NodeJS.ProcessEnv): CloudConfig {
  const region = env.BAMBU_REGION;
  const serial = env.BAMBU_SERIAL;
  const token = env.BAMBU_TOKEN;
  if (region !== 'CN' && region !== 'GLOBAL') throw new Error('Set BAMBU_REGION to CN or GLOBAL in local configuration.');
  if (!serial || !/^[a-zA-Z0-9_-]{5,80}$/.test(serial)) throw new Error('BAMBU_SERIAL must identify the intended printer.');
  if (!token || token.length < 20 || /[\r\n]/.test(token)) throw new Error('A locally supplied BAMBU_TOKEN is required.');
  const username = env.BAMBU_USERNAME;
  if (username && !/^[a-zA-Z0-9_-]{1,100}$/.test(username)) throw new Error('Invalid BAMBU_USERNAME format.');
  return { region, serial, token, ...(username ? { username } : {}) };
}
export function usernameFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;
    if (typeof payload.username === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(payload.username)) return payload.username;
    const uid = payload.uid;
    if (typeof uid === 'string' && /^\d{1,32}$/.test(uid)) return `u_${uid}`;
    if (typeof uid === 'number' && Number.isSafeInteger(uid) && uid >= 0) return `u_${uid}`;
  } catch { /* Claims are only used to derive a username; broker authenticates the token. */ }
  return null;
}
export function cloudApiBase(region: CloudConfig['region']) { return region === 'CN' ? 'https://api.bambulab.cn' : 'https://api.bambulab.com'; }
export async function resolveCloudUsername(config: CloudConfig, fetcher: typeof fetch = fetch): Promise<string> {
  const known = config.username ?? usernameFromToken(config.token);
  if (known) return known;
  try {
  const response = await fetcher(`${cloudApiBase(config.region)}/v1/design-user-service/my/preference`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'CLOUD_AUTH_REQUIRED' : 'CLOUD_ACCOUNT_LOOKUP_FAILED');
  const parsed: unknown = await response.json();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CLOUD_ACCOUNT_LOOKUP_FAILED');
  const body = parsed as Record<string, unknown>;
  const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : body;
  const uid = data.uidStr ?? data.uid;
  if (typeof uid === 'string' && /^\d{1,32}$/.test(uid)) return `u_${uid}`;
  if (typeof uid === 'number' && Number.isSafeInteger(uid) && uid >= 0) return `u_${uid}`;
  throw new Error('CLOUD_USERNAME_UNAVAILABLE');
  } catch (error) {
    const code = error instanceof Error && ['CLOUD_AUTH_REQUIRED', 'CLOUD_USERNAME_UNAVAILABLE'].includes(error.message) ? error.message : 'CLOUD_ACCOUNT_LOOKUP_FAILED';
    throw new Error(code);
  }
}
export interface CloudCallbacks {
  report: (payload: unknown) => void;
  connection: (state: Connection, code?: string) => void;
}
export function startCloud(config: CloudConfig & { username: string }, callbacks: CloudCallbacks, connector: typeof connect = connect): () => Promise<void> {
  const reportTopic = `device/${config.serial}/report`;
  const options: IClientOptions = {
    username: config.username, password: config.token, protocolVersion: 4,
    clientId: `cube3d_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`,
    reconnectPeriod: 10000, connectTimeout: 15000, keepalive: 30, rejectUnauthorized: true,
    resubscribe: false, clean: true
  };
  callbacks.connection('connecting');
  const client: MqttClient = connector(`mqtts://${config.region === 'CN' ? 'cn' : 'us'}.mqtt.bambulab.com:8883`, options);
  let ended = false;
  let authFailed = false;
  let receivedStatus = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  const clearSyncTimers = () => { clearTimeout(retryTimer); clearTimeout(timeoutTimer); };
  const query = (section: 'info' | 'pushing', command: 'get_version' | 'pushall') => {
    if (ended || authFailed) return;
    client.publish(`device/${config.serial}/request`, JSON.stringify({[section]:{sequence_id:'0',command}}), {qos:1,retain:false}, error => { if(error && !ended && !authFailed) callbacks.connection('error','CLOUD_SYNC_REQUEST_FAILED'); });
  };
  client.on('connect', () => {
    clearSyncTimers(); clearInterval(refreshTimer); receivedStatus = false;
    callbacks.connection('syncing');
    client.subscribe(reportTopic, { qos: 1 }, (error, granted) => {
      if (error || granted?.some(grant => grant.qos === 128)) { callbacks.connection('error', 'CLOUD_SUBSCRIBE_FAILED'); return; }
      query('info','get_version'); query('pushing','pushall');
      refreshTimer = setInterval(() => { if(client.connected) query('pushing','pushall'); },30000); refreshTimer.unref();
      retryTimer = setTimeout(() => { if(!receivedStatus && client.connected) query('pushing','pushall'); },10000); retryTimer.unref();
      timeoutTimer = setTimeout(() => { if(!receivedStatus && client.connected && !ended && !authFailed) callbacks.connection('error','CLOUD_NO_REPORTS'); },30000); timeoutTimer.unref();
    });
  });
  client.on('message', (topic, bytes) => {
    if (topic !== reportTopic || bytes.length > 256 * 1024 || ended) return;
    try {
      const payload = JSON.parse(bytes.toString());
      const print = payload?.print ?? payload?.pushall?.print;
      if (print && typeof print === 'object' && ['gcode_state','mc_percent','nozzle_temper','bed_temper','ams','device','layer_num'].some(key=>key in print)) { receivedStatus = true; clearSyncTimers(); }
      callbacks.report(payload);
    } catch { /* Ignore malformed data without leaking raw frames. */ }
  });
  client.on('reconnect', () => { if (!ended && !authFailed) callbacks.connection('connecting'); });
  client.on('offline', () => { if (!ended && !authFailed) callbacks.connection('offline'); });
  client.on('close', () => { if (!ended && !authFailed) callbacks.connection('offline'); });
  client.on('error', error => {
    const code = (error as Error & { code?: number }).code;
    if (code === 4 || code === 5 || code === 134 || code === 135) {
      authFailed = true; clearSyncTimers(); clearInterval(refreshTimer);
      callbacks.connection('error', 'CLOUD_AUTH_REQUIRED');
      client.end(true);
    } else callbacks.connection('error', 'CLOUD_TRANSPORT_ERROR');
  });
  return () => new Promise<void>(done => { ended = true; clearSyncTimers(); clearInterval(refreshTimer); client.end(true, {}, () => done()); });
}

/** Strict matching is intentional: no anonymous task hit or mismatched device may supply a cover. */
export function selectTaskCover(body: unknown, serial: string, taskId: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
  const hits = root.hits ?? data.hits;
  if (!Array.isArray(hits)) return null;
  for (const candidate of hits) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    const history = (item.print_history_info ?? item.printHistoryInfo) as Record<string, unknown> | undefined;
    const subtask = item.subtask as Record<string, unknown> | undefined;
    const records = [item, history, subtask].filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
    const serials = records.flatMap(r => ['dev_id', 'deviceId', 'device_id', 'devId', 'sn', 'printerSn'].map(key => r[key])).filter(v => typeof v === 'string');
    if (!serials.includes(serial)) continue;
    // A top-level generic "id" might refer to a design/history record, not the MQTT task.
    const ids = [...records.flatMap(r => ['subtask_id', 'task_id'].map(key => r[key])), subtask?.id].filter(v => typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v))).map(String);
    if (!ids.includes(taskId)) continue;
    const thumbnail = subtask?.thumbnail as Record<string, unknown> | undefined;
    const url = item.cover ?? item.coverUrl ?? item.cover_url ?? history?.cover ?? history?.coverUrl ?? history?.cover_image_url ?? thumbnail?.url;
    if (typeof url === 'string') return url;
  }
  return null;
}
