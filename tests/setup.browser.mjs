import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createDashboard } from '../apps/server/src/server.ts';
import { createSetup } from '../apps/server/src/setup.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';
import { CloudAuth } from '../apps/server/src/cloud-auth.ts';
import { emptySnapshot } from '../packages/contracts/src/index.ts';
import { applyReport } from '../packages/printer-bambu/src/parser.ts';

const dir=await mkdtemp(join(tmpdir(),'cube-login-ui-'));
const cloud=new CloudAuth(async url=>String(url).endsWith('/bind')?Response.json({devices:[{dev_id:'SYNTH12345',name:'合成测试 H2C',dev_product_name:'H2C',online:true}]}):Response.json({accessToken:'SYNTHETIC_LOGIN_TOKEN_FOR_TEST_ONLY'}));
let manager;
const app=createDashboard({mode:'cloud',initialSnapshot:emptySnapshot('h2c-1','synthetic'),handleManagement:(req,res,path)=>manager.handle(req,res,path)});
manager=createSetup({store:new SessionStore(dir),auth:cloud,reset:async()=>app.update(emptySnapshot('h2c-1','synthetic')),connect:async()=>{
  // Deliberately preserve synthetic provenance: this is a login/UI test, not a physical printer.
  const next=applyReport(emptySnapshot('h2c-1','synthetic'),{print:{gcode_state:'RUNNING',subtask_name:'合成端到端任务',mc_percent:57,mc_remaining_time:80,nozzle_temper:210,bed_temper:55,ams:{ams:[{id:'0',tray:[{id:'0',tray_type:'PLA',tray_color:'12AA55FF'}]}]}}});
  next.name='合成测试 H2C';app.update(next);
},diagnostics:()=>({connection:app.getSnapshot().connection,validReports:app.getSnapshot().lastReportAt?1:0,lastReportAt:app.getSnapshot().lastReportAt,amsUnits:app.getSnapshot().ams.length})});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${app.server.address().port}`;
let browser;
try{
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const executablePath=process.env.BROWSER_EXECUTABLE||(existsSync(chrome)?chrome:undefined);
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/setup');await page.locator('#login-panel').waitFor({state:'visible'});
  for(const width of [1280,1440,1920]){
    await page.setViewportSize({width,height:1000});
    const geometry=await page.evaluate(()=>{const a=document.querySelector('.setup-primary').getBoundingClientRect(),b=document.querySelector('.setup-secondary').getBoundingClientRect();return{scroll:document.documentElement.scrollWidth,width:innerWidth,leftRight:a.right,rightLeft:b.left,mainWidth:document.querySelector('.setup').getBoundingClientRect().width};});
    assert.ok(geometry.scroll<=width+1 && geometry.leftRight<=geometry.rightLeft && geometry.mainWidth>1000,JSON.stringify(geometry));
  }
  await mkdir('artifacts/setup',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.locator('.admin-nav').count(),1);
  assert.equal(await page.locator('h1').count(),1);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await page.screenshot({path:'artifacts/setup/login-desktop.png',fullPage:true});
  await page.selectOption('#region','CN');await page.fill('#account','test@example.invalid');await page.fill('#password','SYNTHETIC_PASSWORD');
  await page.click('#login');await page.locator('#device-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('#password').inputValue(),'');assert.match(await page.locator('#devices').innerText(),/2345/);assert.doesNotMatch(await page.locator('body').innerText(),/SYNTH12345|SYNTHETIC_LOGIN_TOKEN/);
  await page.getByRole('button',{name:'连接这台打印机'}).click();await page.locator('#live-panel').waitFor({state:'visible'});
  await mkdir('artifacts/setup',{recursive:true});await page.screenshot({path:'artifacts/setup/mock-selected.png',fullPage:true});
  const card=await browser.newPage({locale:'zh-CN',viewport:{width:368,height:170}});await card.goto(base+'/card?layout=wide');
  await card.waitForFunction(()=>document.querySelector('.tile-progress-value')?.textContent==='57');assert.match(await card.locator('.tile-ams').innerText(),/AMS 1/);assert.match(await card.locator('.tile-origin').innerText(),/演示/);
  await card.screenshot({path:'artifacts/setup/mock-card.png'});
  await page.click('#logout');await page.locator('#login-panel').waitFor({state:'visible'});
  assert.equal(await new SessionStore(dir).load(),null);
  await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('#login-panel').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/setup/login-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/setup/report.json',JSON.stringify({checks:['local login form','password cleared','explicit masked device selection','SSE state and AMS render','synthetic provenance retained','logout clears persistence','mobile no horizontal overflow'],evidence:'mock cloud only; not physical H2C'},null,2));
  console.log('Setup browser login, selected printer, SSE/AMS rendering, logout and mobile layout: passed (mock cloud only).');
}finally{await browser?.close();await app.close();await rm(dir,{recursive:true,force:true});}
