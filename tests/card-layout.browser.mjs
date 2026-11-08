import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDashboard } from '../apps/server/src/server.ts';
import { makeDemo, scenarios } from '../apps/server/src/demo.ts';

const app = createDashboard({ tickMs: 3600000 });
await new Promise(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${app.server.address().port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
const results = [], failures = [];
try {
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', e => browserErrors.push(e.message));
  await mkdir('artifacts/layout', { recursive: true });
  const layouts = [['compact',170,170], ['wide',368,170], ['cast',113,113], ['cast',128,128], ['cast',136,136], ['detail',457,900]];
  for (const locale of ['zh-CN','en']) for (const [layout, width, height] of layouts) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/card?layout=${layout}&lang=${locale}`);
    await page.waitForFunction(() => document.body.dataset.liveReady === 'true');
    const samples = [...scenarios.map(x => [x.id, makeDemo(x.id)]), ['long', { ...makeDemo(), name:'工作室 H2C 第二台多色打印机名称很长', jobName:'非常长的中文任务名称与英文 Extremely-long-project-name.3mf', progressPercent:100, remainingSeconds:360000, ams:makeDemo('multi-ams').ams }], ['errors', {...makeDemo('error'), errors:[{ severity:'error', message:'非常长的打印机错误，需要在详情查看与处理', code:'123456' },{severity:'warning', message:'第二条错误消息',code:'654321'}]}]];
    for (const [scene, sample] of samples) {
      const jobName = scene === 'long' ? sample.jobName : `布局验证 ${layout}/${width}/${scene}`;
      app.update({...sample, jobName});
      await page.waitForFunction(name => document.querySelector('.tile')?.dataset.snapshotJob === name || document.querySelector('.job-name')?.textContent === name, jobName);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const geometry = await page.evaluate(() => {
        const problems = [], labels = [], tile = document.querySelector('.tile'), card = document.querySelector('.printer-card');
        const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
        const intersect = (a,b) => ({ left:Math.max(a.left,b.left), top:Math.max(a.top,b.top), right:Math.min(a.right,b.right), bottom:Math.min(a.bottom,b.bottom) });
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let textId=0;
        while (walker.nextNode()) {
          textId++;
          const text = walker.currentNode;
          if (!text.textContent.trim() || !visible(text.parentElement)) continue;
          const range = document.createRange(); range.selectNodeContents(text);
          const css = getComputedStyle(text.parentElement);
          for (const raw of range.getClientRects()) {
            let r = {left:raw.left, top:raw.top, right:raw.right, bottom:raw.bottom};
            // Intentional ellipsis clips only that text cell; overflow elsewhere remains a failure.
            for (let el=text.parentElement; el && el!==card; el=el.parentElement) {
              const style=getComputedStyle(el);
              if (['hidden','clip'].includes(style.overflowX) || style.textOverflow==='ellipsis') {
                const box=el.getBoundingClientRect(); r.left=Math.max(r.left,box.left); r.right=Math.min(r.right,box.right);
              }
            }
            if (r.right<=r.left) continue;
            const value=text.textContent.trim().slice(0,30);
            if (r.left < -1 || r.right > innerWidth+1 || (tile && (r.top < -1 || r.bottom > innerHeight+1))) problems.push(`text outside viewport: ${value}`);
            if (tile && parseFloat(css.fontSize)<10) problems.push(`text too small: ${value} ${css.fontSize}`);
            labels.push({value, r, id:textId});
          }
        }
        for(const graphic of card.querySelectorAll('img,.tile-swatch')) {
          if(!visible(graphic)) continue;
          const r=graphic.getBoundingClientRect();
          if(r.left < -1 || r.right > innerWidth+1 || (tile && (r.top < -1 || r.bottom > innerHeight+1))) problems.push(`graphic outside viewport: ${graphic.className}`);
          labels.push({value:`graphic ${graphic.className}`,r,id:++textId});
        }
        for(let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
          if(labels[i].id===labels[j].id) continue;
          const overlap=intersect(labels[i].r,labels[j].r);
          if(overlap.right-overlap.left>1 && overlap.bottom-overlap.top>1.5) problems.push(`text overlap: ${labels[i].value} / ${labels[j].value}`);
        }
        if (tile) {
          const bands=[...tile.children].filter(visible).map(el=>({className:el.className,r:el.getBoundingClientRect()}));
          for(let i=0;i<bands.length-1;i++) if(bands[i].r.bottom>bands[i+1].r.top+.5) problems.push(`bands overlap: ${bands[i].className}/${bands[i+1].className}`);
          for(const el of tile.querySelectorAll('.tile-header,.tile-body,.tile-footer,.tile-hero,.tile-remaining,.tile-ams')) {
            if(visible(el) && el.scrollWidth>el.clientWidth+1) problems.push(`row overflow: ${el.className}`);
          }
        }
        if(document.documentElement.scrollWidth>innerWidth+1) problems.push('horizontal scrolling');
        if(tile && document.documentElement.scrollHeight>innerHeight+1) problems.push('vertical scrolling');
        return {problems, textCount:labels.length};
      });
      if (geometry.problems.length) failures.push({locale,layout,width,height,scene,...geometry});
      results.push({locale,layout,width,height,scene,textCount:geometry.textCount});
      if (['printing','error','long','multi-ams'].includes(scene)) await page.screenshot({ path:`artifacts/layout/${locale}-${layout}-${width}-${scene}.png`, fullPage:true });
    }
  }
  // Resizing the actual iframe must switch layout without a reload or stale markup.
  await page.setViewportSize({width:128,height:128}); await page.goto(`${base}/card?layout=cast&lang=zh-CN`);
  await page.locator('.tile').waitFor(); await page.setViewportSize({width:640,height:640});
  await page.waitForFunction(() => !document.querySelector('.tile'));
  await page.setViewportSize({width:113,height:113}); await page.locator('.tile').waitFor();
  await page.route('**/api/v1/events',route=>route.abort());
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.tile-status')?.textContent==='连接中断');
  assert.equal(await page.locator('#transport-message').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);
  await page.screenshot({path:'artifacts/layout/cast-113-disconnected.png'});
  await writeFile('artifacts/layout/report.json',JSON.stringify({browser:browser.version(),results,failures,browserErrors,evidence:'local synthetic browser only'},null,2));
  assert.deepEqual(browserErrors,[]); assert.equal(failures.length,0,JSON.stringify(failures.slice(0,4),null,2));
  console.log(`Verified ${results.length} layout/scenario combinations: readable text, separate bands, no text overlap or clipping.`);
} finally { await browser?.close(); await app.close(); }
