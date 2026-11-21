import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import type { Challenge, CloudSession } from './cloud-auth.ts';
import { CloudError } from './cloud-auth.ts';
import { access, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Automatic sign-in is for the CUBE LAN origin; explicit remote settings take precedence.
export function isLanHost(host?: string) {
  if (!host || !/^[\w.:\[\]-]+$/.test(host)) return false;
  const url = URL.parse('http://' + host);
  if (!url || url.host !== host.toLowerCase()) return false;
  const name = url.hostname;
  if (name === 'localhost' || name === '[::1]' || name.endsWith('.local')) return true;
  if (name.startsWith('[')) return /^\[(?:f[cd]|fe[89ab])/i.test(name);
  if (isIP(name) !== 4) return false;
  const [a, b] = name.split('.').map(Number);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// The management UI sends this origin-scoped token in a header. Cookies are shared across CUBE add-on ports.
export function browserSession(key: string, host: string, expires = Date.now() + 8 * 3600000) {
  const signature = createHmac('sha256', key).update(host + ':' + expires).digest('hex');
  return expires + '.' + signature;
}
export function validBrowserSession(req: IncomingMessage, key: string) {
  const token = req.headers['x-print-room-session'];
  if (typeof token !== 'string' || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const expires = Number(token.slice(0,13));
  return expires > Date.now() && timingSafeEqual(Buffer.from(token), Buffer.from(browserSession(key, req.headers.host ?? '', expires)));
}

export class BrowserChallenges {
  private pending = new Map<string, { value: Challenge; until: number }>();
  private id(req: IncomingMessage) {
    const id = req.headers['x-print-room-challenge'];
    return typeof id === 'string' ? id : '';
  }
  get(req: IncomingMessage) {
    const entry = this.pending.get(this.id(req));
    return entry && entry.until > Date.now() ? entry.value : null;
  }
  clear(req: IncomingMessage) { this.pending.delete(this.id(req)); }
  set(req: IncomingMessage, res: ServerResponse, value: Challenge) {
    this.clear(req);
    for (const [id, entry] of this.pending) if (entry.until <= Date.now()) this.pending.delete(id);
    if (this.pending.size >= 64) throw new CloudError('TRY_LATER');
    const id = randomBytes(32).toString('hex');
    this.pending.set(id, { value, until: Date.now() + 600000 });
    res.setHeader('X-Print-Room-Challenge', id);
  }
}

// Ownership survives token expiry, logout and restarts. Publish a complete binding only once.
export async function verifyOwner(directory: string, next: CloudSession, identity: (s: CloudSession) => Promise<string>) {
  const file = join(directory, 'account-owner');
  const fingerprint = async (s: CloudSession) => createHash('sha256').update(s.region + ':' + await identity(s)).digest('hex');
  const wanted = await fingerprint(next);
  const matches = (value: string) => { if (value !== wanted) throw new CloudError('OWNER_ACCOUNT_REQUIRED'); };
  try { matches(await readFile(file, 'utf8')); return; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  // Migrate the previous installation's verified cloud account before accepting a new session.
  try {
    const previous: CloudSession = JSON.parse(await readFile(join(directory,'cloud-session.json'),'utf8'));
    matches(await fingerprint(previous));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // A legacy gateway grant without any cloud identity cannot be assigned to an arbitrary first visitor.
    try { await access(join(directory, 'cube-auth.json')); throw new CloudError('OWNER_MIGRATION_REQUIRED'); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = file + '.' + randomBytes(16).toString('hex');
  await writeFile(staging, wanted, { mode: 0o600, flag: 'wx' });
  try {
    try { await link(staging, file); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      matches(await readFile(file, 'utf8'));
    }
  } finally { await rm(staging, { force: true }); }
}
