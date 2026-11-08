import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createDashboard } from '../apps/server/src/server.ts';
import { makeDemo, scenarios } from '../apps/server/src/demo.ts';
import { createSetup } from '../apps/server/src/setup.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';
import { createCastManager } from '../apps/server/src/cast-config.ts';
const dir = await mkdtemp(join(tmpdir(), 'cast-ui-'));
let manager;
const app = createDashboard({
  tickMs: 3600000,
  handleManagement: (req, res, path) => manager.handle(req, res, path),
});
manager = createSetup({
  store: new SessionStore(dir),
  cast: createCastManager(dir, join(dir, 'auth.json')),
  connect: async () => {},
  reset: async () => {},
  diagnostics: () => ({}),
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + app.server.address().port;
let browser;
const failures = [],
  results = [],
  errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ locale: 'zh-CN' });
  let streams = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/events')) streams++;
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('artifacts/cast', { recursive: true });
  for (const lang of ['zh-CN', 'en'])
    for (const size of [113, 128, 136])
      for (const kind of ['status', 'ams', 'summary'])
        for (const scenario of [
          ...scenarios.map((s) => s.id),
          'long',
          'fixed-unit',
        ]) {
          let s = makeDemo(
            scenario === 'fixed-unit'
              ? 'multi-ams'
              : scenario === 'long'
                ? 'printing'
                : scenario,
          );
          if (scenario === 'long') {
            s.jobName = 'Very long printable model 文件名 and more details.3mf';
            s.progressPercent = 100;
            s.currentLayer = 999;
            s.totalLayers = 1000;
            s.remainingSeconds = 360000;
            s.ams[0].trays[0].material = 'VeryLongMaterial';
          }
          app.update(s);
          await page.setViewportSize({ width: size, height: size });
          await page.goto(
            base +
              `/card?layout=cast&view=${kind}&unit=${scenario === 'fixed-unit' ? '128' : 'active'}&lang=${lang}`,
          );
          await page.locator('.cast-module').waitFor();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              [...document.images].map((i) => i.decode().catch(() => {})),
            );
          });
          const geometry = await page.evaluate(() => {
            const root = document.querySelector('.cast-module'),
              problems = [],
              texts = [];
            const walker = document.createTreeWalker(
              root,
              NodeFilter.SHOW_TEXT,
            );
            let id = 0;
            while (walker.nextNode()) {
              const text = walker.currentNode,
                el = text.parentElement;
              if (
                !text.textContent.trim() ||
                !el.getClientRects().length ||
                getComputedStyle(el).visibility === 'hidden'
              )
                continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              const css = getComputedStyle(el);
              id++;
              for (const raw of range.getClientRects()) {
                let r = {
                  left: raw.left,
                  right: raw.right,
                  top: raw.top,
                  bottom: raw.bottom,
                };
                for (let n = el; n && n !== root; n = n.parentElement) {
                  const c = getComputedStyle(n);
                  if (
                    ['hidden', 'clip'].includes(c.overflowX) ||
                    c.textOverflow === 'ellipsis'
                  ) {
                    const b = n.getBoundingClientRect();
                    r.left = Math.max(r.left, b.left);
                    r.right = Math.min(r.right, b.right);
                  }
                }
                if (r.right <= r.left) continue;
                if (
                  r.left < -0.5 ||
                  r.right > innerWidth + 0.5 ||
                  r.top < -0.5 ||
                  r.bottom > innerHeight + 0.5
                )
                  problems.push('outside: ' + text.textContent);
                if (parseFloat(css.fontSize) < 10) problems.push('small font');
                texts.push({ id, value: text.textContent, r });
              }
            }
            for (let i = 0; i < texts.length; i++)
              for (let j = i + 1; j < texts.length; j++) {
                const a = texts[i],
                  b = texts[j];
                if (
                  a.id !== b.id &&
                  Math.min(a.r.right, b.r.right) -
                    Math.max(a.r.left, b.r.left) >
                    1 &&
                  Math.min(a.r.bottom, b.r.bottom) -
                    Math.max(a.r.top, b.r.top) >
                    1.5
                )
                  problems.push('overlap: ' + a.value + '/' + b.value);
              }
            if (
              document.documentElement.scrollWidth > innerWidth ||
              document.documentElement.scrollHeight > innerHeight
            )
              problems.push('scroll');
            return problems;
          });
          if (geometry.length)
            failures.push({ lang, size, kind, scenario, geometry });
          results.push({ lang, size, kind, scenario });
          if (
            size === 128 &&
            ['printing', 'idle', 'fixed-unit'].includes(scenario)
          )
            await page.screenshot({
              path: `artifacts/cast/${lang}-${kind}-${scenario}.png`,
            });
        }
  assert.equal(
    streams,
    0,
    'CAST module cards must not allocate an SSE stream per iframe',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/cast-config?lang=en');
  await page.locator('#cast-previews iframe').first().waitFor();
  assert.equal(await page.locator('#cast-previews iframe').count(), 3);
  await page.locator('#cast-status').uncheck();
  await page.locator('[data-cast-unit][value="128"]').check();
  await page.selectOption('#cast-size', '136.375');
  await page
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#cast-message').textContent === 'Settings saved',
  );
  await page.reload();
  await page.locator('#cast-form').waitFor();
  assert.equal(await page.locator('#cast-status').isChecked(), false);
  assert.equal(
    await page.locator('[data-cast-unit][value="128"]').isChecked(),
    true,
  );
  await page.screenshot({
    path: 'artifacts/cast/config-en.png',
    fullPage: true,
  });
  for (const width of [390, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      `CAST settings overflow at ${width}`,
    );
  }
  assert.equal(
    await page.evaluate(async () => {
      const r = await fetch('/api/v1/setup/cast/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return r.status;
    }),
    403,
  );
  await writeFile(
    'artifacts/cast/report.json',
    JSON.stringify(
      {
        results,
        failures,
        errors,
        checks: [
          'actual size geometry',
          'two languages',
          'configuration persistence',
          'protected write API',
        ],
        evidence: 'synthetic browser only',
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    `CAST modules: ${results.length} geometry cases, two languages and configuration persistence passed.`,
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
