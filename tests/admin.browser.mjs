import assert from 'node:assert/strict';
import {existsSync}from'node:fs';
import {mkdir,writeFile}from'node:fs/promises';
import {chromium}from'playwright';
import {createDashboard}from'../apps/server/src/server.ts';
import {makeDemo}from'../apps/server/src/demo.ts';
const initial=makeDemo('printing');
initial.ams=[0,1,2,128,129].map((id,i)=>({...structuredClone(initial.ams[0]),id:String(id),humidityPercent:25+i*4,trays:structuredClone(initial.ams[0].trays).slice(0,i<3?4:1)}));
const app=createDashboard({initialSnapshot:initial,tickMs:3600000});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${app.server.address().port}`;
let browser;const results=[];
try{
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',executablePath=process.env.BROWSER_EXECUTABLE||(existsSync(chrome)?chrome:undefined);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const page=await browser.newPage({locale:'zh-CN'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await mkdir('artifacts/admin',{recursive:true});
 for(const [width,height]of[[1280,900],[1440,1000],[1920,1080],[960,900],[390,844]]){
  await page.setViewportSize({width,height});await page.goto(base);await page.waitForFunction(()=>document.body.dataset.liveReady==='true');await page.locator('.admin-ams-unit').first().waitFor();
  assert.equal(await page.locator('.admin-ams-unit').count(),5);assert.equal(await page.locator('iframe').count(),0);assert.match(await page.locator('.admin-nav [aria-current=page]').innerText(),/监控总览/);
  const geometry=await page.evaluate(()=>{const r=el=>{const b=document.querySelector(el).getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,right:b.right,bottom:b.bottom};};return{scroll:document.documentElement.scrollWidth,width:innerWidth,main:r('.admin-main'),task:r('.task-panel'),connection:r('.connection-panel'),ams:r('.admin-ams-grid'),amsColumns:getComputedStyle(document.querySelector('.admin-ams-grid')).gridTemplateColumns.split(' ').length,statsColumns:getComputedStyle(document.querySelector('.admin-stats')).gridTemplateColumns.split(' ').length};});
  assert.ok(geometry.scroll<=width+1,`${width} overflow ${JSON.stringify(geometry)}`);
  if(width>=1280){assert.ok(geometry.main.width>1000);assert.ok(geometry.task.right<=geometry.connection.x+1);assert.equal(geometry.statsColumns,4);assert.ok(geometry.amsColumns>=3);}
  if(width===1920)assert.equal(geometry.amsColumns,5);
  if(width===390)assert.equal(geometry.amsColumns,1);
  await page.screenshot({path:`artifacts/admin/overview-${width}.png`,fullPage:true});results.push({width,height,...geometry});
 }
 await page.setViewportSize({width:1440,height:1000});app.update({...initial,jobName:'<img src=x onerror="window.bad=1">'.repeat(8)});await page.waitForFunction(()=>document.querySelector('#admin-job-name').textContent.startsWith('<img'));assert.equal(await page.locator('#admin-job-name img').count(),0);assert.equal(await page.evaluate(()=>window.bad),undefined);
 app.update({...makeDemo('offline'),ams:initial.ams});await page.waitForFunction(()=>document.querySelector('#admin-status').textContent==='打印机离线');
 await page.locator('.admin-nav a[href^="/preview"]').click();await page.frameLocator('#card-preview').locator('.printer-card').waitFor();assert.match(await page.locator('.admin-nav [aria-current=page]').innerText(),/卡片预览/);assert.equal(await page.locator('#card-preview').evaluate(n=>n.getBoundingClientRect().width),368);
 assert.deepEqual(errors,[]);await writeFile('artifacts/admin/report.json',JSON.stringify({results,checks:['native desktop dashboard without iframe','five synthetic AMS units use multiple columns','four desktop metrics','mobile fallback','long task text safety','live SSE offline update','navigation to exact card preview'],evidence:'synthetic browser only'},null,2));console.log('Desktop admin: 1280/1440/1920/960/390 layouts, five AMS units, SSE and preview navigation passed.');
}finally{await browser?.close();await app.close();}
