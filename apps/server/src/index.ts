import { createCastManager } from './cast-config.ts';
import { resolve } from 'node:path';
import { createDashboard } from './server.ts';
import { CoverCache } from './cover-cache.ts';
import { readCloudConfig } from './cloud.ts';
import { emptySnapshot } from '../../../packages/contracts/src/index.ts';
import { createCloudMonitor } from './cloud-monitor.ts';
import { createSetup } from './setup.ts';
import { SessionStore } from './session-store.ts';

const host = process.env.HOST ?? '127.0.0.1',
  port = Number(process.env.PORT ?? 3030);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const mode = process.env.DASHBOARD_MODE ?? 'demo';
if (!['demo', 'cloud', 'setup'].includes(mode))
  throw new Error('DASHBOARD_MODE must be demo, cloud or setup');
const coverCache = new CoverCache();
let setup: ReturnType<typeof createSetup> | undefined;
const initial = mode === 'demo' ? undefined : emptySnapshot('h2c-1', 'cloud');
if (initial && mode === 'setup') initial.name = '请登录并选择打印机';
const dashboard = createDashboard({
  mode: mode === 'demo' ? 'demo' : 'cloud',
  initialSnapshot: initial,
  getCover: () => coverCache.current,
  handleManagement:
    mode === 'setup'
      ? (req, res, path) =>
          setup?.handle(req, res, path) ?? Promise.resolve(false)
      : undefined,
});
const monitor = createCloudMonitor(dashboard, coverCache);
if (mode === 'setup')
  setup = createSetup({
    cast: createCastManager(
      resolve(process.env.DATA_DIR ?? 'data'),
      resolve(
        process.env.CUBE_AUTH_FILE ??
          `${process.env.DATA_DIR ?? 'data'}/cube-auth.json`,
      ),
    ),
    remote:
      process.env.SETUP_PUBLIC_ORIGIN || process.env.SETUP_ACCESS_KEY
        ? {
            origin: process.env.SETUP_PUBLIC_ORIGIN ?? '',
            accessKey: process.env.SETUP_ACCESS_KEY ?? '',
          }
        : undefined,
    store: new SessionStore(resolve(process.env.DATA_DIR ?? 'data')),
    connect: (config, device) => monitor.start(config, device),
    reset: async (authenticated) => {
      await monitor.stop();
      const next = emptySnapshot('h2c-1', 'cloud');
      next.name = authenticated ? '请选择打印机' : '请登录并选择打印机';
      dashboard.update(next);
    },
    diagnostics: () => {
      const s = dashboard.getSnapshot();
      return {
        ...monitor.diagnostics(),
        connection: s.connection,
        freshness: s.freshness,
        lastReportAt: s.lastReportAt,
        cover: s.cover.state,
        amsUnits: s.ams.length,
        knownFields: [
          'progressPercent',
          'remainingSeconds',
          'nozzleC',
          'bedC',
          'currentLayer',
          'totalLayers',
          'jobName',
        ].filter((k) => s[k as keyof typeof s] !== null),
        errorCodes: s.errors.map((e) => e.code),
      };
    },
  });
dashboard.server.on('error', () => {
  console.error('服务启动失败，请检查端口与监听地址。');
  process.exitCode = 1;
});
dashboard.server.listen(port, host, () => {
  console.log(`打印机状态服务已启动，模式：${mode}，端口：${port}。`);
  if (setup) void setup.restore();
  if (mode === 'cloud') {
    try {
      void monitor.start(readCloudConfig(process.env));
    } catch {
      console.error('云端配置不可用；未输出配置内容。');
    }
  }
});
let closed = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closed) return;
    closed = true;
    void Promise.allSettled([monitor.stop(), dashboard.close()]).then(() =>
      process.exit(0),
    );
  });
