import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { castSizes } from '../apps/web/cast-sizes.js';
import { castHosts } from '../apps/web/preview-sizes.js';
import { createDashboard } from '../apps/server/src/server.ts';
import { makeDemo } from '../apps/server/src/demo.ts';

const out = 'artifacts/cast-0.2.0';
await mkdir(out, { recursive: true });
const app = createDashboard({
  mode: 'cloud',
  tickMs: 3600000,
  getCastLanguage: async () => 'en',
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.server.address().port;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE || (existsSync(chrome) ? chrome : undefined),
});
const problems = [],
  errors = [];
let count = 0;
function geometry() {
  const problems = [],
    leaves = [];
  const tile = document.querySelector('#tile');
  if (
    document.documentElement.scrollWidth > innerWidth + 1 ||
    document.documentElement.scrollHeight > innerHeight + 1
  )
    problems.push('document overflow');
  for (const el of tile.querySelectorAll('*')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const rect = el.getBoundingClientRect();
    if (
      rect.left < -1 ||
      rect.top < -1 ||
      rect.right > innerWidth + 1 ||
      rect.bottom > innerHeight + 1
    )
      problems.push('outside ' + el.className);
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    // Deliberate ellipses may clip long job, material and stage names.
    if (
      getComputedStyle(el).overflow === 'visible' &&
      text.width > rect.width + 2
    )
      problems.push('text overflow: ' + el.textContent);
    leaves.push({ rect, label: el.textContent });
  }
  for (const [i, a] of leaves.entries())
    for (const b of leaves.slice(i + 1)) {
      if (
        Math.min(a.rect.right, b.rect.right) -
          Math.max(a.rect.left, b.rect.left) >
          1.5 &&
        Math.min(a.rect.bottom, b.rect.bottom) -
          Math.max(a.rect.top, b.rect.top) >
          1.5
      )
        problems.push('overlap: ' + a.label + '/' + b.label);
    }
  return problems;
}
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(base + '/gallery', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto(base + '/gallery');
  for (const [host, spec] of Object.entries(castHosts))
    for (const lang of ['en', 'zh-CN'])
      for (const scenario of [
        'printing',
        'idle',
        'paused',
        'offline',
        'unknown',
        'long',
      ]) {
        const s = makeDemo(scenario === 'long' ? 'multi-ams' : scenario);
        if (scenario === 'long') {
          s.jobName = 'Long task name 文件名 '.repeat(8);
          s.stage = 'Print head calibration '.repeat(8);
          s.remainingSeconds = 420000;
          s.currentLayer = 1199;
          s.totalLayers = 2345;
          s.ams[0].trays[0].material = 'Long spool name '.repeat(5);
          s.activeTray = { unitId: '0', trayId: '0' };
        }
        app.update(s);
        await page.evaluate(
          ({ castSizes, spec, lang }) => {
            document.body.replaceChildren(
              ...castSizes.map((size) => {
                const frame = document.createElement('iframe');
                const [w, h] = size
                  .split('x')
                  .map(
                    (n) => (n * spec.gridWidth) / spec.columns - 1.5 * spec.rem,
                  );
                frame.style.width = w + 'px';
                frame.style.height = h + 'px';
                frame.style.border = 'none';
                frame.name = size;
                frame.src = '/cast-card/' + size + '?lang=' + lang;
                return frame;
              }),
            );
          },
          { castSizes, spec, lang },
        );
        for (const size of castSizes) {
          await page
            .frameLocator('iframe[name="' + size + '"]')
            .locator('.tile[data-ready=true]')
            .waitFor();
          const frame = page.frame({ name: size });
          assert.equal(await frame.locator('html').getAttribute('lang'), lang);
          assert.equal(
            await frame.locator('.cover').count(),
            ['4x3', '4x4', '6x2', '6x3', '6x4', '6x6'].includes(size) ? 1 : 0,
          );
          assert.equal(
            await frame.locator('.ams-browser,.ams-empty').count(),
            ['6x4', '6x6'].includes(size) ? 1 : 0,
          );
          assert.equal(
            await frame.locator('.conditions').count(),
            size === '6x6' ? 1 : 0,
          );
          if (scenario === 'offline')
            assert.equal(await frame.locator('.progress').innerText(), '—');
          if (scenario === 'printing' && (await frame.locator('img').count()))
            await frame.waitForFunction(
              () => document.querySelector('img')?.naturalWidth > 0,
            );
          for (const issue of await frame.evaluate(geometry))
            problems.push({ size, lang, scenario, host, issue });
          count++;
          if (
            host === 'desktop12' &&
            lang === 'zh-CN' &&
            scenario === 'printing' &&
            ['6x6', '6x3', '2x2'].includes(size)
          )
            await frame
              .locator('#tile')
              .screenshot({ path: out + '/' + size + '.png' });
        }
      }

  const s = makeDemo('multi-ams');
  s.ams = Array.from({ length: 5 }, (_, i) => ({ ...s.ams[0], id: String(i) }));
  s.activeTray = { unitId: '2', trayId: '1' };
  s.externalTray = null;
  app.update(s);
  await page.setViewportSize({ width: 432, height: 280 });
  await page.goto(base + '/cast-card/6x4?ihost_env=cast');
  const panel = page.locator('.ams-browser');
  await page.locator('[data-unit-id="2"]').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('[data-action=next]').click();
  await page.locator('[data-unit-id="3"]').waitFor();
  s.activeTray = { unitId: '0', trayId: '0' };
  s.progressPercent = 25;
  app.update(s);
  await page.waitForFunction(
    () => document.querySelector('.progress').textContent === '25%',
  );
  assert.equal(await panel.getAttribute('data-unit-id'), '3');
  await page.locator('[data-action=current]').click();
  await page.locator('[data-unit-id="0"]').waitFor();
  assert.ok(await page.locator('[data-action=previous]').isDisabled());
  await page.setViewportSize({ width: 432, height: 432 });
  await page.locator('.s6x6 .conditions').waitFor();
  await page.setViewportSize({ width: 432, height: 204 });
  await page.locator('.s6x3 .cover').waitFor();
  assert.equal(await panel.count(), 0);
  s.cover.taskId = 'old-job';
  s.progressPercent = 0;
  s.nozzleC = 0;
  app.update(s);
  await page.waitForFunction(
    () => document.querySelector('.progress').textContent === '0%',
  );
  assert.equal(await page.locator('img').count(), 0);
  await page.setViewportSize({ width: 432, height: 432 });
  assert.match(await page.locator('.temperatures').innerText(), /0 °C/);
  s.activeTray = 'external';
  s.externalTray = { id: 'external', present: false, material: null, color: null, remainingPercent: null };
  app.update(s);
  await page.locator('[data-unit-id="external"]').waitFor();
  assert.equal(await panel.locator('.slot.selected').count(), 0);
  assert.match(await panel.locator('.slot-type small').innerText(), /Empty/);
  await writeFile(
    out + '/report.json',
    JSON.stringify({ count, problems, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.equal(problems.length, 0, JSON.stringify(problems.slice(0, 15)));
  console.log(
    count +
      ' adaptive CAST layouts passed. Pagination, resize, zero values, task-scoped covers and stored language passed.',
  );
} finally {
  await browser.close();
  await app.close();
}
