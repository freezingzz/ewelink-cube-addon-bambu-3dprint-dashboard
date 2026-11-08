import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDashboard } from '../apps/server/src/server.ts';
import { previewProfiles } from '../apps/web/preview-sizes.js';
import { makeDemo, scenarios } from '../apps/server/src/demo.ts';

const app = createDashboard({ tickMs: 3600000 });
await new Promise(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${app.server.address().port}`;
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync(localChrome) ? localChrome : undefined);
let browser;
const errors = [];
const checks = [];
try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base+'/preview');
  const frame = page.frameLocator('#card-preview');
  const cardFrame = () => page.frames().find(f => f.url().includes('/card?'));
  await frame.locator('.printer-card').waitFor();
  assert.match(await page.locator('#demo-notice').innerText(), /合成/);
  await cardFrame().waitForFunction(() => document.querySelector('.cover-image')?.naturalWidth > 0);
  checks.push('home and synthetic cover');

  const expected = { offline: '打印机离线', stale: '数据已过期', paused: '已暂停', finished: '打印完成', preparing: '准备中', error: '打印异常', idle: '待机' };
  for (const scene of scenarios) {
    await page.selectOption('#scenario-select', scene.id);
    await page.waitForFunction(() => !document.querySelector('#scenario-select').disabled);
    if (expected[scene.id]) await cardFrame().waitForFunction(label => document.querySelector('.status-badge')?.textContent.includes(label), expected[scene.id]);
    if (scene.id === 'unknown') await cardFrame().waitForFunction(() => document.querySelector('.progress-number strong')?.textContent === '—');
    if (scene.id === 'cover-error') await cardFrame().waitForFunction(() => document.querySelector('.cover')?.textContent.includes('封面暂不可用') || document.querySelector('.cover strong')?.title.includes('封面暂不可用'));
    if (scene.id === 'task-switch') await cardFrame().waitForFunction(() => document.querySelector('.job-name')?.textContent.includes('新任务'));
  }
  checks.push('all 12 demo scenarios via UI');
  await page.selectOption('#scenario-select', 'multi-ams');
  await page.locator('[data-layout=detail]').click();
  await cardFrame().waitForFunction(() => document.querySelectorAll('.ams-unit').length === 2);
  assert.match(await frame.locator('.external-tray').innerText(), /使用中/);
  checks.push('multiple AMS units and external tray');

  app.update({ ...makeDemo(), jobName: '<img src=x onerror="window.injected=1">' });
  await cardFrame().waitForFunction(() => document.querySelector('.job-name')?.textContent.startsWith('<img'));
  assert.equal(await cardFrame().evaluate(() => window.injected), undefined);
  assert.equal(await frame.locator('.job-name img').count(), 0);
  checks.push('untrusted job name renders as text');

  await page.selectOption('#scenario-select', 'printing');
  await page.locator('[data-layout=detail]').click();
  await cardFrame().waitForFunction(() => document.querySelector('.cover-image')?.naturalWidth > 0);
  await mkdir('artifacts/browser', { recursive: true });
  await page.screenshot({ path: 'artifacts/browser/desktop.png', fullPage: true });

  // The host iframe sets CSS layout size; magnification must not change innerWidth/Height.
  await page.locator('[data-layout=wide]').click();
  await frame.locator('.printer-card').waitFor();
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [368, 170]);
  await page.selectOption('#preview-zoom', '2');
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [368, 170]);
  assert.equal(await page.locator('#card-preview').evaluate(n => n.getBoundingClientRect().width), 736);
  await page.locator('#preview-width').fill('400'); await page.locator('#preview-width').dispatchEvent('change');
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [400, 170]);
  assert.match(await page.locator('#preview-size-source').innerText(), /自定义尺寸/);
  await page.locator('.size-reset').click();
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [368, 170]);
  await page.locator('[data-layout=cast]').click();
  await frame.locator('.printer-card').waitFor();
  await page.selectOption('#preview-cast-host', 'desktop16');
  assert.equal(await page.locator('#card-preview').evaluate(n => n.getBoundingClientRect().width), 136.375);
  assert.match(await page.locator('#preview-size-source').innerText(), /16 列/);
  await page.selectOption('#preview-cast-host', 'phone375');
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [113, 113]);
  await page.locator('.size-reset').click();
  assert.deepEqual(await cardFrame().evaluate(() => [innerWidth, innerHeight]), [128, 128]);
  checks.push('iframe dimensions, CAST host presets, custom sizes, reset and zoom independent of content viewport');

  for (const [layout, {width, height}] of Object.entries(previewProfiles)) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/card?layout=${layout}`);
    await page.locator('.printer-card').waitFor();
    await page.waitForFunction(() => document.body.dataset.liveReady === 'true');
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    assert.equal(await page.locator('#preview-toolbar').isVisible(), false);
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, scrollHeight: document.documentElement.scrollHeight, height: innerHeight }));
    assert.ok(dimensions.scroll <= dimensions.width + 1, `${layout} horizontal overflow: ${JSON.stringify(dimensions)}`);
    if (layout !== 'detail') assert.ok(dimensions.scrollHeight <= dimensions.height + 1, `${layout} vertical overflow: ${JSON.stringify(dimensions)}`);
    await page.screenshot({ path: `artifacts/browser/${layout}.png`, fullPage: true, animations: 'disabled' });
    if (layout !== 'detail') {
      for (const scene of ['unknown', 'error', 'multi-ams', 'cover-error']) {
        app.update({ ...makeDemo(scene), jobName: `尺寸回归 ${scene}` });
        await page.waitForFunction(name => document.querySelector('.tile')?.dataset.snapshotJob === name || document.querySelector('.job-name')?.textContent === name, `尺寸回归 ${scene}`);
        const fit = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, height: innerHeight,
          cardBottom: document.querySelector('.printer-card').getBoundingClientRect().bottom }));
        assert.ok(fit.scroll <= fit.height + 1 && fit.cardBottom <= fit.height + 1, `${layout}/${scene} fit: ${JSON.stringify(fit)}`);
      }
      app.update(makeDemo());
    }

  }
  checks.push('unknown, error, multi-AMS and missing-cover content fits small viewports');
  checks.push('four embedded layouts without horizontal overflow');
  assert.deepEqual(errors, []);
  checks.push('no browser JavaScript/console errors');
  const report = { browser: browser.version(), checks, screenshots: ['desktop', 'compact', 'wide', 'cast', 'detail'], evidence: 'synthetic local browser only; not CUBE or real H2C' };
  await writeFile('artifacts/browser/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally { await browser?.close(); await app.close(); }

// Typography and collision checks run at the actual small-card sizes.
await import('./card-layout.browser.mjs');
