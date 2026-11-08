import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import {
  CloudAuth,
  CloudError,
  regionOf,
  type CloudSession,
  type Device,
  type Challenge,
} from './cloud-auth.ts';
import { SessionStore } from './session-store.ts';
import { readFile } from 'node:fs/promises';
import type { CloudConfig } from './cloud.ts';
export interface SetupOptions {
  store: SessionStore;
  auth?: CloudAuth;
  remote?: { origin: string; accessKey: string };
  cast?: {
    read: () => Promise<unknown>;
    save: (value: unknown) => Promise<unknown>;
    sync: () => Promise<unknown>;
    authorize?: () => Promise<unknown>;
  };
  connect: (config: CloudConfig, device: Device) => Promise<void>;
  reset: (authenticated: boolean) => Promise<void>;
  diagnostics: () => object;
}
function managementPageHeaders(res: ServerResponse) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

export function createSetup(options: SetupOptions) {
  const remote = options.remote;
  if (remote) {
    const u = new URL(remote.origin);
    if (
      !['http:', 'https:'].includes(u.protocol) ||
      u.origin !== remote.origin ||
      u.username ||
      u.password ||
      remote.accessKey.length < 32 ||
      remote.accessKey.length > 512 ||
      /[\r\n]/.test(remote.accessKey)
    )
      throw new Error('Invalid remote setup configuration');
  }
  const remoteHost = (req: IncomingMessage) =>
    !!remote && req.headers.host === new URL(remote.origin).host;
  const sameOrigin = (req: IncomingMessage) =>
    req.headers.origin ===
      (remoteHost(req) ? remote!.origin : `http://${req.headers.host}`) &&
    req.headers['x-setup-request'] === '1';
  const auth = options.auth ?? new CloudAuth(),
    key = randomBytes(32).toString('hex');
  let session: CloudSession | null = null,
    devices: Device[] = [],
    challenge: Challenge | null = null,
    busy = false,
    lastError: string | null = null;
  const attempts = new Map<string, number>();
  let challengeTimer: ReturnType<typeof setTimeout> | undefined;
  const setChallenge = (next: Challenge | null) => {
    clearTimeout(challengeTimer);
    challenge = next;
    if (next) {
      challengeTimer = setTimeout(
        () => {
          challenge = null;
        },
        10 * 60 * 1000,
      );
      challengeTimer.unref();
    }
  };
  const status = () => ({
    authenticated: !!session,
    region: session?.region ?? challenge?.region ?? null,
    expiresAt: session?.expiresAt ?? null,
    challenge: challenge?.kind ?? null,
    busy,
    error: lastError,
    selected: session?.selected
      ? { name: session.selected.name, model: session.selected.model }
      : null,
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      model: d.model,
      online: d.online,
      serialSuffix: d.serial.slice(-4),
    })),
    diagnostics: options.diagnostics(),
  });
  const json = (res: ServerResponse, code: number, value: unknown) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  const localHost = (req: IncomingMessage) => {
    try {
      return (
        ['127.0.0.1', 'localhost', '[::1]'].includes(
          new URL(`http://${req.headers.host}`).hostname,
        ) &&
        (!remote ||
          ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
            req.socket.remoteAddress ?? '',
          ))
      );
    } catch {
      return false;
    }
  };
  const authorized = (req: IncomingMessage) => {
    const supplied = /(?:^|;\s*)cube_setup=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie ?? '',
    )?.[1];
    return (
      !!supplied && timingSafeEqual(Buffer.from(supplied), Buffer.from(key))
    );
  };
  const limit = (action: string, ms = 3000) => {
    const previous = attempts.get(action) ?? 0;
    if (Date.now() - previous < ms) throw new CloudError('TRY_LATER');
    attempts.set(action, Date.now());
  };
  const loadDevices = async (next: CloudSession) =>
    (await auth.devices(next)).map((d) => ({ ...d, id: randomUUID() }));
  async function accept(next: CloudSession) {
    const found = await loadDevices(next);
    await options.store.save(next);
    session = next;
    devices = found;
    setChallenge(null);
    lastError = null;
    await options.reset(true);
  }
  async function restore() {
    busy = true;
    try {
      session = await options.store.load();
      if (session?.selected)
        await options.connect(
          {
            region: session.region,
            token: session.token,
            serial: session.selected.serial,
          },
          session.selected,
        );
    } catch {
      lastError = 'SESSION_RESTORE_FAILED';
    } finally {
      busy = false;
    }
  }
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
      throw new CloudError('JSON_REQUIRED');
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 24000) throw new CloudError('BODY_TOO_LARGE');
      chunks.push(Buffer.from(chunk));
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw 0;
      return parsed;
    } catch {
      throw new CloudError('INVALID_REQUEST');
    }
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<boolean> {
    // Remote installations must unlock first; only loopback gets a bootstrap cookie.
    const admitted = remoteHost(req) || localHost(req);
    const cookie = () =>
      `cube_setup=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${remoteHost(req) && remote!.origin.startsWith('https:') ? '; Secure' : ''}`;
    if (path === '/api/v1/setup/unlock') {
      if (!remoteHost(req) || req.method !== 'POST' || !sameOrigin(req)) {
        json(res, 403, { error: 'SAME_ORIGIN_REQUIRED' });
        return true;
      }
      try {
        limit('unlock');
        const input = await body(req);
        const supplied =
          typeof input.accessKey === 'string' ? input.accessKey : '';
        const hash = (v: string) => createHash('sha256').update(v).digest();
        if (!timingSafeEqual(hash(supplied), hash(remote!.accessKey))) {
          json(res, 403, { error: 'INVALID_ADMIN_KEY' });
          return true;
        }
        res.setHeader('Set-Cookie', cookie());
        json(res, 200, { ok: true });
      } catch {
        json(res, 429, { error: 'TRY_LATER' });
      }
      return true;
    }
    if (path === '/cast-config' || path === '/cast-config.html') {
      managementPageHeaders(res);
      if (!admitted) {
        json(res, 403, { error: 'LOCAL_SETUP_ONLY' });
        return true;
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) {
        json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        return true;
      }
      if (!authorized(req)) {
        if (localHost(req) && !remoteHost(req))
          res.setHeader('Set-Cookie', cookie());
        else {
          res.writeHead(302, { Location: '/setup' });
          res.end();
          return true;
        }
      }
    }
    if (path === '/setup' || path === '/setup.html') {
      if (!admitted) {
        json(res, 403, { error: 'LOCAL_SETUP_ONLY' });
        return true;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        return true;
      }
      if (localHost(req) && !remoteHost(req))
        res.setHeader('Set-Cookie', cookie());
      managementPageHeaders(res);
      if (remoteHost(req) && !authorized(req)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          await readFile(new URL('../../web/unlock.html', import.meta.url)),
        );
        return true;
      }
      return false;
    }
    if (!path.startsWith('/api/v1/setup/')) return false;
    if (!admitted || !authorized(req)) {
      json(res, 403, { error: 'OPEN_LOCAL_SETUP' });
      return true;
    }
    if (req.method === 'GET' && path === '/api/v1/setup/cast' && options.cast) {
      try {
        json(res, 200, await options.cast.read());
      } catch {
        json(res, 500, { error: 'CAST_CONFIG_FAILED' });
      }
      return true;
    }
    if (req.method === 'GET' && path === '/api/v1/setup/status') {
      json(res, 200, status());
      return true;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return true;
    }
    if (!sameOrigin(req)) {
      json(res, 403, { error: 'SAME_ORIGIN_REQUIRED' });
      return true;
    }
    if (busy) {
      json(res, 409, { error: 'SETUP_BUSY' });
      return true;
    }
    busy = true;
    try {
      const input = await body(req);
      if (options.cast && path === '/api/v1/setup/cast/save') {
        json(res, 200, await options.cast.save(input));
        return true;
      }
      if (options.cast?.authorize && path === '/api/v1/setup/cast/authorize') {
        json(res, 200, await options.cast.authorize());
        return true;
      }
      if (options.cast && path === '/api/v1/setup/cast/sync') {
        json(res, 200, await options.cast.sync());
        return true;
      }
      if (path === '/api/v1/setup/login') {
        limit('login');
        const region = regionOf(input.region),
          account = auth.account(input.account);
        if (typeof input.password !== 'string')
          throw new CloudError('PASSWORD_REQUIRED');
        const result = await auth.login(region, account, input.password);
        if ('kind' in result) {
          setChallenge(result);
          lastError = null;
        } else await accept(result);
      } else if (path === '/api/v1/setup/code/send') {
        limit('send-code', 60000);
        const region = regionOf(input.region ?? challenge?.region),
          account = auth.account(input.account ?? challenge?.account);
        setChallenge(await auth.sendCode(region, account));
        lastError = null;
      } else if (path === '/api/v1/setup/code/verify') {
        limit('verify');
        if (!challenge) throw new CloudError('CHALLENGE_REQUIRED');
        if (typeof input.code !== 'string')
          throw new CloudError('CODE_REQUIRED');
        await accept(await auth.verify(challenge, input.code));
      } else if (path === '/api/v1/setup/token') {
        limit('token');
        const region = regionOf(input.region);
        if (
          typeof input.token !== 'string' ||
          input.token.length < 20 ||
          input.token.length > 16384 ||
          /[\r\n]/.test(input.token)
        )
          throw new CloudError('TOKEN_REQUIRED');
        await accept({ region, token: input.token, expiresAt: null });
      } else if (path === '/api/v1/setup/devices') {
        if (!session) throw new CloudError('CLOUD_AUTH_REQUIRED');
        limit('devices');
        devices = await loadDevices(session);
        lastError = null;
      } else if (path === '/api/v1/setup/select') {
        if (!session) throw new CloudError('CLOUD_AUTH_REQUIRED');
        const device = devices.find((d) => d.id === input.deviceId);
        if (!device) throw new CloudError('DEVICE_REQUIRED');
        const next = { ...session, selected: device };
        await options.store.save(next);
        session = next;
        lastError = null;
        await options.connect(
          { region: next.region, token: next.token, serial: device.serial },
          device,
        );
      } else if (path === '/api/v1/setup/logout') {
        await options.store.clear();
        session = null;
        devices = [];
        setChallenge(null);
        lastError = null;
        await options.reset(false);
      } else {
        json(res, 404, { error: 'NOT_FOUND' });
        return true;
      }
      busy = false;
      json(res, 200, status());
    } catch (error) {
      lastError = error instanceof CloudError ? error.message : 'SETUP_FAILED';
      json(res, lastError === 'TRY_LATER' ? 429 : 400, { error: lastError });
    } finally {
      busy = false;
    }
    return true;
  }
  return { handle, restore, status };
}
