import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createCardDefinition,
  registerCard,
  validateHttpUrl,
} from '../../../packages/cube-client/src/index.ts';
// Replace complete JSON files atomically; tokens never enter the public API.
async function writePrivateJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export interface CastConfig {
  language: 'zh-CN' | 'en';
  cubeUrl: string;
  dashboardUrl: string;
}
export const defaultCastConfig: CastConfig = {
  language: 'zh-CN',
  cubeUrl: '',
  dashboardUrl: '',
};
export function validateCastConfig(value: unknown): CastConfig {
  const v = value as CastConfig;
  if (!v || !['zh-CN', 'en'].includes(v.language))
    throw Error('Invalid CAST configuration');
  const url = (input: unknown, reachable = false) => {
    if (input === '') return '';
    if (typeof input !== 'string') throw Error('Invalid CAST URL');
    return validateHttpUrl(input, reachable).origin;
  };
  return {
    language: v.language,
    cubeUrl: url(v.cubeUrl),
    dashboardUrl: url(v.dashboardUrl, true),
  };
}
export function createCastManager(directory: string, authFile: string) {
  const file = join(directory, 'cast-config.json');
  let busy = false;
  const read = async () => {
    try {
      return validateCastConfig(JSON.parse(await readFile(file, 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return structuredClone(defaultCastConfig);
      throw Error('Cannot read CAST configuration');
    }
  };
  const save = async (value: unknown) => {
    const c = validateCastConfig(value);
    await writePrivateJson(file, c);
    return c;
  };
  const sync = async () => {
    if (busy) throw Error('CAST sync busy');
    busy = true;
    try {
      const c = await read(),
        auth = JSON.parse(await readFile(authFile, 'utf8'));
      if (auth.cubeUrl !== c.cubeUrl || typeof auth.token !== 'string')
        throw Error('CUBE authorization missing');
      const registration = join(directory, 'cast-registration.json');
      let ids: Record<string, string> = {};
      try {
        ids = JSON.parse(await readFile(registration, 'utf8'));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
          throw Error('Cannot read registrations');
      }
      if (!c.dashboardUrl || !c.cubeUrl)
        throw Error('Configure CUBE and dashboard addresses');
      const key = c.cubeUrl + '#dashboard';
      const definition = createCardDefinition(c.dashboardUrl);
      const legacyIds = Object.entries(ids)
        .filter(([id]) => id.startsWith(c.cubeUrl + '#') && id !== key)
        .map(([, value]) => value);
      const registrationOptions = {
        cubeUrl: c.cubeUrl,
        token: auth.token,
        definition,
        legacyIds,
      };
      const result = await registerCard({
        ...registrationOptions,
        cardId: ids[key],
        recoverMissingId: true,
      });
      // Some hosts accept the POST but discard unsupported sizes. Read it back
      // before reporting success, including when recovering an interrupted sync.
      if (result.action === 'created')
        await registerCard({ ...registrationOptions, cardId: result.id });
      if (ids[key] !== result.id)
        await writePrivateJson(registration, { ...ids, [key]: result.id });
      return { results: [{ profile: 'dashboard', ...result }] };
    } finally {
      busy = false;
    }
  };
  const authorize = async () => {
    const c = await read();
    if (!c.cubeUrl) throw Error('Configure CUBE address');
    try {
      const a = JSON.parse(await readFile(authFile, 'utf8'));
      if (a.cubeUrl === c.cubeUrl && typeof a.token === 'string') {
        const r = await fetch(c.cubeUrl + '/open-api/v2/rest/ui/cards', {
          headers: { Authorization: 'Bearer ' + a.token },
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        });
        const p = await r.json();
        if (r.ok && p.error === 0) return { authorized: true };
      }
    } catch {}
    const r = await fetch(
      c.cubeUrl + '/open-api/v2/rest/bridge/access_token?app_name=Print%20Room',
      { signal: AbortSignal.timeout(8000), redirect: 'error' },
    );
    const p = await r.json();
    if (p.error === 401) return { authorized: false, needsApproval: true };
    if (
      !r.ok ||
      p.error !== 0 ||
      typeof p.data?.token !== 'string' ||
      p.data.token.length < 16 ||
      p.data.token.length > 4096 ||
      /[\r\n]/.test(p.data.token)
    )
      throw Error('CUBE authorization failed');
    await writePrivateJson(authFile, {
      cubeUrl: c.cubeUrl,
      token: p.data.token,
    });
    return { authorized: true };
  };
  return { read, save, sync, authorize };
}
