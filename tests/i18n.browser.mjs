import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createDashboard } from '../apps/server/src/server.ts';
import { makeDemo } from '../apps/server/src/demo.ts';
import { createSetup } from '../apps/server/src/setup.ts';
import { CloudAuth } from '../apps/server/src/cloud-auth.ts';
import { SessionStore } from '../apps/server/src/session-store.ts';

const dir=await mkdtemp(join(tmpdir(),'cube-i18n-')),apps=[],requests=[],errors=[],checks=[];
let browser,setup;
const multi=makeDemo();multi.ams=[0,1,2,128,129].map((id,i)=>({...structuredClone(multi.ams[0]),id:String(id),trays:structuredClone(multi.ams[0].trays).slice(0,i<3?4:1)}));
const demo=createDashboard({initialSnapshot:multi,tickMs:3600000});apps.push(demo);
const auth=new CloudAuth(async(url,init)=>{requests.push(String(url));if(String(url).endsWith('/bind'))return Response.json({devices:[{dev_id:'SYNTH12345',name:'My H2C',dev_product_name:'H2C',online:true}]});if(JSON.parse(init?.body||'{}').password)return Response.json({loginType:'verifyCode'});return Response.json({accessToken:'SYNTHETIC_I18N_TOKEN_FOR_TEST_ONLY'});});
const cloud=createDashboard({mode:'cloud',initialSnapshot:makeDemo('idle'),handleManagement:(req,res,path)=>setup.handle(req,res,path)});apps.push(cloud);
setup=createSetup({store:new SessionStore(dir),auth,connect:async()=>{},reset:async()=>{},diagnostics:()=>({connection:'online',validReports:1,lastReportAt:new Date().toISOString(),knownFields:['nozzleC','remainingSeconds'],amsUnits:5,cover:'unavailable'})});
const listen=async app=>{await new Promise(done=>app.server.listen(0,'127.0.0.1',done));return `http://127.0.0.1:${app.server.address().port}`;};
try{
 const base=await listen(demo),cloudBase=await listen(cloud);
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
 await mkdir('artifacts/i18n',{recursive:true});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});};
 const englishOnly=async()=>{
  const unexpected=await page.evaluate(()=>{const out=[],w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(!/[\u3400-\u9fff]/u.test(n.textContent)||n.textContent==='简体中文'||n.parentElement.closest('option,script,style'))continue;const range=document.createRange();range.selectNodeContents(n);if([...range.getClientRects()].some(r=>r.width>0&&r.height>0)&&getComputedStyle(n.parentElement).visibility!=='hidden')out.push(n.textContent.trim());}return out;});
  assert.deepEqual(unexpected,[],'Untranslated visible UI');
 };
 await page.goto(base);await page.locator('.admin-ams-unit').first().waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('h1').innerText(),'Overview');
 for(const width of [1280,1440,1920,960,390]){
  await page.setViewportSize({width,height:1000});await ready();await englishOnly();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overview ${width}`);
  await page.screenshot({path:`artifacts/i18n/en-overview-${width}.png`,fullPage:true});
 }
 await page.selectOption('#ui-language','zh-CN');assert.equal(await page.locator('h1').innerText(),'监控总览');assert.match(await page.locator('#admin-material-summary').innerText(),/5 个单元/);
 await page.reload();assert.equal(await page.locator('#ui-language').inputValue(),'zh-CN');
 await page.selectOption('#ui-language','en');await page.locator('.admin-nav a[href^="/preview"]').click();await page.frameLocator('#card-preview').locator('.tile').waitFor();
 await englishOnly();assert.equal(await page.frameLocator('#card-preview').locator('html').getAttribute('lang'),'en');assert.match(await page.locator('#preview-size-source').innerText(),/Fixed at 368/);
 await page.selectOption('#ui-language','zh-CN');assert.equal(await page.frameLocator('#card-preview').locator('html').getAttribute('lang'),'zh-CN');
 await page.selectOption('#ui-language','en');await page.locator('[data-layout=cast]').click();await page.selectOption('#preview-cast-host','desktop16');
 assert.equal(await page.locator('#card-preview').evaluate(n=>n.getBoundingClientRect().width),136.375);await englishOnly();
 await page.setViewportSize({width:1440,height:1000});await ready();await page.screenshot({path:'artifacts/i18n/en-preview-desktop.png',fullPage:true});
 checks.push('English browser default; persistent in-place switching; all navigation and iframe locale; fractional CAST dimensions retained');
 const pinned=await context.newPage();await pinned.setViewportSize({width:128,height:128});await pinned.goto(base+'/card?layout=cast&lang=zh-CN');await pinned.locator('.tile').waitFor();assert.equal(await pinned.locator('html').getAttribute('lang'),'zh-CN');assert.equal(await page.locator('html').getAttribute('lang'),'en');await pinned.close();
 const blocked=await browser.newContext({locale:'fr-FR'});await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});const blockedPage=await blocked.newPage();await blockedPage.goto(base+'/card?layout=wide&lang=en');await blockedPage.locator('.tile,.printer-card').waitFor();assert.equal(await blockedPage.locator('html').getAttribute('lang'),'en');await blocked.close();
 checks.push('Independent explicit card locale and unavailable browser storage');
 await page.goto(cloudBase+'/setup?lang=en');await page.locator('#login-panel').waitFor({state:'visible'});
 for(const width of [1280,1440,1920,960,390]){
  await page.setViewportSize({width,height:1000});await ready();await englishOnly();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`setup ${width}`);
  await page.screenshot({path:`artifacts/i18n/en-setup-${width}.png`,fullPage:true});
 }
 // All credentials below are synthetic. Never screenshot filled credentials or token fields.
 await page.selectOption('#region','CN');await page.fill('#account','test@example.invalid');await page.fill('#password','SYNTHETIC_PASSWORD');await page.locator('details').evaluate(n=>n.open=true);await page.fill('#token','SYNTHETIC_TOKEN_INPUT');
 const count=requests.length;await page.selectOption('#ui-language','zh-CN');await page.selectOption('#ui-language','en');
 assert.equal(await page.locator('#account').inputValue(),'test@example.invalid');assert.equal(await page.locator('#password').inputValue(),'SYNTHETIC_PASSWORD');assert.equal(await page.locator('#token').inputValue(),'SYNTHETIC_TOKEN_INPUT');assert.equal(await page.locator('#region').inputValue(),'CN');assert.equal(requests.length,count);
 await page.click('#login');await page.locator('#challenge-panel').waitFor({state:'visible'});await page.fill('#code','123456');await page.selectOption('#ui-language','zh-CN');assert.match(await page.locator('#challenge-title').innerText(),/邮件/);await page.selectOption('#ui-language','en');assert.equal(await page.locator('#code').inputValue(),'123456');assert.match(await page.locator('#challenge-title').innerText(),/email/);
 await page.getByRole('button',{name:'Verify & sign in',exact:true}).click();await page.locator('#device-panel').waitFor({state:'visible'});await page.getByRole('button',{name:'Connect printer',exact:true}).click();await page.locator('#live-panel').waitFor({state:'visible'});await englishOnly();
 await page.setViewportSize({width:1440,height:1000});await page.locator('#token').evaluate(n=>n.value='');await page.screenshot({path:'artifacts/i18n/en-connected-mock.png',fullPage:true});
 const signedRequests=requests.length;await page.selectOption('#ui-language','zh-CN');await page.selectOption('#ui-language','en');assert.equal(requests.length,signedRequests);assert.equal(setup.status().authenticated,true);assert.equal(setup.status().region,'CN');assert.equal(await page.locator('#code').inputValue(),'');
 checks.push('Account/password/token and OTP retained across switching; CN region and selected session unchanged; login, challenge and diagnostics fully English');
 // Freeze gallery cards at their REST snapshot so ten iframes do not exhaust HTTP/1.1 SSE connections.
 const gallery=await context.newPage();await gallery.addInitScript(()=>{window.EventSource=class{addEventListener(){}close(){}};});await gallery.setViewportSize({width:1210,height:660});
 const cells=[['compact',170,170,'1×1 · 170 × 170'],['wide',368,170,'2×1 · 368 × 170'],['cast',113,113,'CAST · 113 × 113'],['cast',128,128,'CAST · 128 × 128'],['cast',136.375,136.375,'CAST · 136.375²']];
 await gallery.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:26px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fc;color:#333}h1{font-size:22px;margin:0 0 8px}p{color:#777;font-size:12px;margin:0 0 22px}.row{display:flex;gap:20px;align-items:flex-start;margin:10px 0 22px}.cell{display:grid;gap:8px}small{font-size:11px;color:#666}iframe{border:0;display:block}.cast{padding:8px;border-radius:12px;background:linear-gradient(#193e59,#8fb7cf)}h2{font-size:14px;margin:12px 0 6px}</style><h1>Print Room · 中文 / English</h1><p>Actual iframe dimensions · 100% preview scale · Synthetic demo data · CUBE OS 2.15.0 sizing reference</p>${['zh-CN','en'].map(lang=>`<h2>${lang==='en'?'English':'简体中文'}</h2><div class="row">${cells.map(([layout,w,h,label])=>`<div class="cell"><small>${label}</small><div class="${layout==='cast'?'cast':''}"><iframe title="${lang}-${layout}-${w}" src="${base}/card?layout=${layout}&lang=${lang}" style="width:${w}px;height:${h}px"></iframe></div></div>`).join('')}</div>`).join('')}`);
 for(const frame of gallery.frames().slice(1)){await frame.waitForSelector('.tile');await frame.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});}await gallery.screenshot({path:'artifacts/i18n/bilingual-cards.png',fullPage:true});await gallery.close();
 const failed=await context.newPage();await failed.route('**/api/v1/printers',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await failed.goto(base+'/?lang=en');await failed.waitForFunction(()=>document.querySelector('#admin-printer-name')?.textContent==='Service unavailable');await failed.selectOption('#ui-language','zh-CN');assert.equal(await failed.locator('#admin-printer-name').innerText(),'后台暂不可用');await failed.goto(base+'/preview?lang=zh-CN');await failed.getByText('暂时无法取得打印机状态',{exact:true}).waitFor();await failed.selectOption('#ui-language','en');assert.equal(await failed.getByText('Printer status unavailable',{exact:true}).count(),1);await failed.close();
 checks.push('Unavailable service messages also switch language without a reload');
 assert.deepEqual(errors,[]);await writeFile('artifacts/i18n/report.json',JSON.stringify({checks,viewports:[1280,1440,1920,960,390],evidence:'Synthetic browser and mock authentication only; no physical CUBE'},null,2));console.log('Bilingual UI: 10 English desktop/mobile views, persistent switching, input/challenge preservation, region/session isolation, independent cards and exact preview sizes passed.');
}finally{await browser?.close();await Promise.all(apps.map(app=>app.close()));await rm(dir,{recursive:true,force:true});}
