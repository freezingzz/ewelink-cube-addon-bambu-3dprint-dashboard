import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createCardDefinition,
  registerCard,
  validateHttpUrl,
  type CardDefinition,
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

function webSettingsFingerprint(settings: CardDefinition['web_settings']) {
  return JSON.stringify({
    default: settings.default,
    dimensions: settings.dimensions
      .map(({ size, src }) => ({ size, src }))
      .sort((a, b) => a.size.localeCompare(b.size)),
    drawer: settings.drawer_component?.src,
  });
}

export interface CastConfig {
  status: boolean;
  summary: boolean;
  amsUnits: string[];
  language: 'zh-CN' | 'en';
  cubeUrl: string;
  dashboardUrl: string;
}
export const defaultCastConfig: CastConfig = {
  status: true,
  summary: true,
  amsUnits: ['active'],
  language: 'zh-CN',
  cubeUrl: '',
  dashboardUrl: '',
};
export function validateCastConfig(value: unknown): CastConfig {
  const v = value as CastConfig;
  if (
    !v ||
    typeof v.status !== 'boolean' ||
    typeof v.summary !== 'boolean' ||
    !Array.isArray(v.amsUnits) ||
    v.amsUnits.length > 12 ||
    v.amsUnits.some(
      (u) => typeof u !== 'string' || !/^(active|external|\d{1,6})$/.test(u),
    ) ||
    !['zh-CN', 'en'].includes(v.language)
  )
    throw Error('Invalid CAST configuration');
  const url = (input: unknown, reachable = false) => {
    if (input === '') return '';
    if (typeof input !== 'string') throw Error('Invalid CAST URL');
    return validateHttpUrl(input, reachable).origin;
  };
  return {
    status: v.status,
    summary: v.summary,
    amsUnits: [...new Set(v.amsUnits)],
    language: v.language,
    cubeUrl: url(v.cubeUrl),
    dashboardUrl: url(v.dashboardUrl, true),
  };
}
export function castProfiles(c: CastConfig) {
  return [
    ...(c.status ? [{ id: 'status', kind: 'status', unit: '' }] : []),
    ...c.amsUnits.map((unit) => ({ id: 'ams-' + unit, kind: 'ams', unit })),
    ...(c.summary ? [{ id: 'summary', kind: 'summary', unit: '' }] : []),
  ];
}
export function castDefinitions(c: CastConfig) {
  if (!c.dashboardUrl || !c.cubeUrl)
    throw Error('Configure CUBE and dashboard addresses');
  return castProfiles(c).map((p) => {
    const title =
      p.kind === 'status'
        ? 'Print status'
        : p.kind === 'summary'
          ? 'Job summary'
          : p.unit === 'active'
            ? 'Active material'
            : p.unit === 'external'
              ? 'External spool'
              : `AMS ${p.unit}`;
    // CUBE 2.15.0 requires Web settings for each UI resource, so each profile
    // also appears in the CUBE list. This is not CAST-only registration.
    // See docs/research/cube-web-cast-separation.md before changing this model.
    const definition = createCardDefinition(
      c.dashboardUrl,
      `Print Room · ${title}`,
    );
    const url = new URL('/card', c.dashboardUrl);
    url.searchParams.set('layout', 'cast');
    url.searchParams.set('view', p.kind);
    if (p.unit) url.searchParams.set('unit', p.unit);
    url.searchParams.set('lang', c.language);
    definition.cast_settings.dimensions[0].src = url.href;
    return { ...p, definition };
  });
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
      const request = async (method: string, path: string, body?: unknown) => {
        const r = await fetch(c.cubeUrl + path, {
          method,
          headers: {
            Authorization: 'Bearer ' + auth.token,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        });
        const p = await r.json();
        if (!r.ok || p.error !== 0) throw Error('CUBE sync request failed');
        return p.data;
      };
      const results = [];
      for (const p of castDefinitions(c)) {
        const key = c.cubeUrl + '#' + p.id,
          id = ids[key];
        let result;
        const cards = id
          ? await request('GET', '/open-api/v2/rest/ui/cards')
          : [];
        const existing = cards.find((card: { id: string }) => card.id === id);
        if (existing) {
          if (
            existing.label !== p.definition.label ||
            existing.cast_settings?.dimensions?.length !== 1
          )
            throw Error('Registered card identity changed');
          if (
            webSettingsFingerprint(existing.web_settings) !==
            webSettingsFingerprint(p.definition.web_settings)
          )
            throw Error('Web settings differ; review before sync');
          const desired = p.definition.cast_settings.dimensions[0].src;
          if (existing.cast_settings?.dimensions?.[0]?.src !== desired) {
            // Generic src updates also affect Web cards in CUBE 2.15.0.
            // Send only CAST settings to preserve the original layouts and drawer.
            await request(
              'PUT',
              '/open-api/v2/rest/ui/cards/' + encodeURIComponent(id),
              { cast_settings: { used: '2×2', src: desired } },
            );
            const checked = (
              await request('GET', '/open-api/v2/rest/ui/cards')
            ).find((card: { id: string }) => card.id === id);
            if (
              !checked ||
              webSettingsFingerprint(checked.web_settings) !==
                webSettingsFingerprint(existing.web_settings) ||
              checked.cast_settings?.dimensions?.[0]?.src !== desired
            )
              throw Error('CUBE resource verification failed');
            result = { id, action: 'updated' };
          } else result = { id, action: 'unchanged' };
        } else
          result = await registerCard({
            cubeUrl: c.cubeUrl,
            token: auth.token,
            definition: p.definition,
          });
        ids[key] = result.id;
        // Persist each success so a retry after a partial sync reuses these IDs.
        await writePrivateJson(registration, ids);
        results.push({ profile: p.id, ...result });
      }
      return { results };
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
