import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDemo, scenarios, type ScenarioId } from './demo.ts';
import type { PrinterSnapshot, SnapshotEvent } from '../../../packages/contracts/src/index.ts';
import type { CachedCover } from './cover-cache.ts';
import { expireFields } from '../../../packages/printer-bambu/src/parser.ts';

const webRoot = fileURLToPath(new URL('../../web/', import.meta.url));
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
export interface DashboardOptions {
  mode?: 'demo' | 'cloud';
  handleManagement?: (req:http.IncomingMessage,res:http.ServerResponse,path:string)=>Promise<boolean>;
  initialSnapshot?: PrinterSnapshot;
  tickMs?: number;
  getCover?: () => CachedCover | null;
}
export function createDashboard(options: DashboardOptions = {}) {
  const mode = options.mode ?? 'demo';
  let snapshot = structuredClone(options.initialSnapshot ?? makeDemo());
  let scenario: ScenarioId = 'printing';
  let sequence = 0;
  const sessionId = randomUUID();
  const clients = new Set<http.ServerResponse>();
  const event = (): SnapshotEvent => ({ type: 'snapshot', sessionId, sequence, snapshot });
  const publish = () => {
    sequence++;
    const frame = `event: snapshot\ndata: ${JSON.stringify(event())}\n\n`;
    for (const client of clients) {
      if (!client.write(frame)) { clients.delete(client); client.end(); }
    }
  };
  function update(next: PrinterSnapshot) { snapshot = structuredClone(next); publish(); }
  const json = (res: http.ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname;
      if(options.handleManagement && await options.handleManagement(req,res,pathname)) return;
      if (pathname === '/favicon.ico' && req.method === 'GET') { res.writeHead(204); res.end(); return; }
      if (pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true, mode, schemaVersion: snapshot.schemaVersion, setupEnabled:!!options.handleManagement });
      if (pathname === '/api/v1/printers' && req.method === 'GET') return json(res, 200, { printers: [{ printerId: snapshot.printerId, name: snapshot.name, model: snapshot.model }], mode });
      if (pathname === `/api/v1/printers/${encodeURIComponent(snapshot.printerId)}/snapshot` && req.method === 'GET') return json(res, 200, snapshot);
      if (pathname === `/api/v1/printers/${encodeURIComponent(snapshot.printerId)}/cover` && req.method === 'GET') {
        const cover = options.getCover?.();
        if (!cover || cover.taskId !== snapshot.taskId || url.searchParams.get('task') !== cover.taskId) return json(res, 404, { error: 'cover_unavailable' });
        res.writeHead(200, { 'Content-Type': cover.contentType, 'Cache-Control': 'private, max-age=60' });
        res.end(cover.data);
        return;
      }
      if (pathname === '/api/v1/events' && req.method === 'GET') {
        if (clients.size >= 32) return json(res, 503, { error: 'event_client_limit' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`retry: 3000\nevent: snapshot\ndata: ${JSON.stringify(event())}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (pathname === '/api/v1/demo/scenarios' && req.method === 'GET') return mode === 'demo' ? json(res, 200, { scenarios, current: scenario }) : json(res, 404, { error: 'not_found' });
      if (pathname === '/api/v1/demo/scenario' && req.method === 'POST') {
        if (mode !== 'demo') return json(res, 404, { error: 'not_found' });
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 415, { error: 'json_required' });
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return json(res, 403, { error: 'origin_not_allowed' });
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 1024) return json(res, 413, { error: 'body_too_large' });
        }
        let value: unknown;
        try { value = JSON.parse(body); } catch { return json(res, 400, { error: 'invalid_json' }); }
        const id = value && typeof value === 'object' ? (value as Record<string, unknown>).id : undefined;
        if (!scenarios.some(x => x.id === id)) return json(res, 400, { error: 'unknown_scenario' });
        scenario = id as ScenarioId;
        update(makeDemo(scenario));
        return json(res, 200, snapshot);
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
      let relative: string;
      try { relative = decodeURIComponent(pathname); } catch { return json(res, 400, { error: 'invalid_path' }); }
      if (relative.includes('\0') || relative.includes('\\')) return json(res, 400, { error: 'invalid_path' });
      if(relative==='/cast-config')relative='/cast-config.html';
      if(relative==='/setup') relative='/setup.html';
      if(relative==='/') relative='/admin.html';
      if(relative==='/preview'||relative==='/preview/') relative='/index.html';
      if (relative === '/' || relative === '/card' || relative === '/card/') relative = '/index.html';
      const file = resolve(webRoot, `.${relative}`);
      if (!file.startsWith(webRoot.endsWith(sep) ? webRoot : webRoot + sep)) return json(res, 403, { error: 'forbidden' });
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': relative==='/setup.html'?'no-store':'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch { json(res, 404, { error: 'not_found' }); }
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'internal_error' });
      else res.end();
    }
  });
  const timer = setInterval(() => {
    if (mode === 'demo') {
      if (scenario === 'offline' || scenario === 'stale') return;
      const next = structuredClone(snapshot);
      next.lastReportAt = new Date().toISOString();
      if (scenario === 'printing' || scenario === 'multi-ams') {
        next.progressPercent = Math.min(99, Math.round(((next.progressPercent ?? 42) + .1) * 10) / 10);
        next.remainingSeconds = Math.max(0, (next.remainingSeconds ?? 0) - 2);
      }
      update(next);
    } else {
      const next = expireFields(snapshot);
      if (JSON.stringify(next) !== JSON.stringify(snapshot)) update(next);
    }
  }, options.tickMs ?? 2000);
  timer.unref();
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
  heartbeat.unref();
  server.on('close', () => { clearInterval(timer); clearInterval(heartbeat); });
  const close = async () => {
    for (const client of clients) client.end();
    clients.clear();
    clearInterval(timer); clearInterval(heartbeat);
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  };
  return { server, close, update, getSnapshot: () => structuredClone(snapshot) };
}
