import { subscribeEvents } from './events.js';
import { displaySnapshot } from './display.js';
import { t, getLocale, onLocaleChange, bindStatic, sourceKey } from './i18n.js';
import { icon } from './icons.js';
import { mountShell } from './admin-shell.js';
import { statusOf, connectionLabels, durationText, numberText, progressValue, safeColor, safeImageUrl, reportTime, isActiveTray, createEventGate } from './model.js';
bindStatic();
mountShell('overview');
document.querySelector('.printer-icon').replaceChildren(icon('printer',29));
const $=id=>document.getElementById(id), gate=createEventGate();
const node=(tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
let printerId, snapshot, source, coverKey='', failedCoverKey='', materialsKey='', disconnected=false,unavailable=false,alertKey='';
const set=(id,text)=>$(id).textContent=text;
function alert(text){alertKey=sourceKey(text||'');$('admin-alert').hidden=!text;set('admin-alert',text||'');}
function cover(s){
  const url=s.cover?.state==='available'&&s.cover.taskId===s.taskId?safeImageUrl(s.cover.url,location.origin):null;
  const key=`${getLocale()}|${s.taskId}|${url}|${s.cover?.state}`;
  if(coverKey===key)return;coverKey=key;const host=$('admin-cover');host.replaceChildren();
  if(url&&failedCoverKey!==key){const img=node('img','','');img.alt=t("当前任务封面");img.src=url;img.addEventListener('error',()=>{failedCoverKey=key;coverKey='';if(snapshot)cover(snapshot);},{once:true});host.append(img);}
  else{const empty=node('div','admin-cover-empty');empty.append(node('span','','◇'),node('strong','',url||s.cover?.state==='error'?t("封面暂不可用"):t("暂无任务封面")),node('small','',s.lifecycle==='idle'?t("打印机待机，等待下一次任务"):t("有可用任务封面后显示")));host.append(empty);}
}
function materialGrid(s){
  const key=JSON.stringify([getLocale(),s.ams,s.activeTray,s.externalTray]);if(key===materialsKey)return;materialsKey=key;
  const grid=$('admin-ams');grid.replaceChildren();let trayCount=0;
  for(const unit of s.ams||[]){
    const card=node('article','admin-ams-unit');const heading=node('div','admin-unit-heading');heading.append(node('h3','',`AMS · ${unit.id}`),node('span','',t("湿度 {0}  /  {1}", numberText(unit.humidityPercent,0,'%'), numberText(unit.temperatureC,1,'°C'))));
    const trays=node('div',`admin-trays${unit.trays?.length===1?' single':''}`);
    for(const tray of unit.trays||[]){trayCount++;const active=isActiveTray(s.activeTray,unit.id,tray.id);const item=node('div',`admin-tray${active?' active':''}${tray.present===false?' empty':''}`);item.style.setProperty('--filament',safeColor(tray.color));item.append(node('span','admin-tray-label',t("槽 {0}{1}", tray.id, active?t(" · 使用中"):'')),node('span','admin-spool'),node('strong','',tray.present===false?t("空槽"):tray.material||t("材料未知")),node('small','',tray.present===false?'—':t("余量 {0}", numberText(tray.remainingPercent,0,'%'))));trays.append(item);}
    if(!unit.trays?.length)trays.append(node('p','admin-empty',t("等待槽位数据")));
    card.append(heading,trays);grid.append(card);
  }
  if(!s.ams?.length)grid.append(node('p','admin-empty',t("尚未收到 AMS 数据；未收到不代表未安装。")));
  set('admin-material-summary',t("{0} 个单元 · {1} 个槽位条目", s.ams?.length||0, trayCount));
  const external=$('admin-external');external.hidden=!s.externalTray&&s.activeTray!=='external';external.replaceChildren();
  if(!external.hidden)external.append(node('span','',t("外置料盘")),node('strong','',s.externalTray?.material||t("材料未知")),node('span','',t("余量 {0}", numberText(s.externalTray?.remainingPercent,0,'%'))),node('span','active-label',s.activeTray==='external'?t("当前选择"):t("待用")));
}
function render(s){
  snapshot=s;s=displaySnapshot(s);const status=statusOf(s),p=progressValue(s.progressPercent);const ready=s.lifecycle==='idle'&&s.connection==='online'&&s.freshness==='fresh';document.body.dataset.liveReady='true';
  set('admin-printer-name',s.name||s.model||t("打印机"));set('admin-printer-meta',t("{0} · {1} · 只读监控", s.model||t("型号未知"), s.provenance==='synthetic'?t("合成演示"):t("拓竹云端")));
  set('admin-status',disconnected?t("后台连接中断"):status.label);$('admin-status').dataset.tone=disconnected?'warning':status.tone;
  set('admin-updated',reportTime(s.lastReportAt));set('admin-progress',p===null?'—':`${numberText(p)}%`);set('admin-stage',status.note||status.label);set('admin-remaining',durationText(s.remainingSeconds));set('admin-layers',t("层数 {0} / {1}", numberText(s.currentLayer), numberText(s.totalLayers)));set('admin-nozzle',numberText(s.nozzleC,0,'°C'));set('admin-bed',numberText(s.bedC,0,'°C'));set('admin-chamber',t("腔体 {0}", numberText(s.chamberC,0,'°C')));
  set('admin-task-state',status.label);set('admin-job-name',s.jobName||(ready?t("打印机已就绪"):s.lifecycle==='idle'?t("暂无进行中的任务"):t("尚未收到任务名称")));set('admin-task-note',ready?t("当前没有进行中的打印任务。"):status.note||status.label);set('admin-progress-caption',p===null?'—':`${numberText(p)}%`);$('admin-progress-fill').style.width=`${p??0}%`;
  const track=document.querySelector('.admin-progress-track');if(p===null){track.removeAttribute('aria-valuenow');track.setAttribute('aria-valuetext',t("未知"));}else{track.setAttribute('aria-valuenow',String(p));track.removeAttribute('aria-valuetext');}
  const active=s.activeTray;set('admin-active-material',active==='external'?t("活动耗材：外置料盘"):active?t("活动耗材：AMS {0} / 槽 {1}", active.unitId, active.trayId):t("活动耗材：—"));
  set('admin-cover-state',t("封面：{0}", ({loading:t("读取中"),available:t("已取得"),error:t("暂不可用"),unavailable:t("暂无")})[s.cover?.state]||t("暂无")));
  set('admin-connection',connectionLabels[s.connection]||t("未知"));set('admin-source',s.provenance==='synthetic'?t("合成数据"):t("拓竹云端"));set('admin-freshness',({fresh:t("数据新鲜"),stale:t("数据已过期"),unknown:t("等待有效报文")})[s.freshness]||t("未知"));set('admin-ams-count',t("{0} 个单元", s.ams?.length||0));
  set('admin-connection-hint',s.connection==='online'?t("状态由后台持续采集，多个卡片共享同一份数据。"):t("请在账号与设备页面检查登录、选机与连接状态。"));
  $('admin-demo-notice').hidden=s.provenance!=='synthetic';
  const errors=$('admin-errors');errors.hidden=!s.errors?.length;errors.replaceChildren();for(const error of s.errors||[])errors.append(node('p','',error.message||t("打印机报告异常，请检查设备。")));
  cover(s);materialGrid(s);if(disconnected)alert(t("页面与后台的连接已中断，正在重连。下方保留最后收到的数据。"));else alert('');
}
async function json(path,options){const response=await fetch(path,{cache:'no-store',...options});if(!response.ok)throw new Error('request_failed');return response.json();}
async function start(){
  try{
    const inventory=await json('/api/v1/printers');const selected=inventory.printers?.[0];if(!selected)throw new Error('no_printer');printerId=selected.printerId;
    render(await json(`/api/v1/printers/${encodeURIComponent(printerId)}/snapshot`));
    source=subscribeEvents({onSnapshot:event=>{try{const payload=JSON.parse(event.data);if(!gate(payload)||payload.snapshot.printerId!==printerId)return;disconnected=false;render(payload.snapshot);}catch{alert(t("收到无法识别的状态，保留上一份数据。"));}},onError:()=>{disconnected=true;if(snapshot)render(snapshot);},onOpen:()=>{disconnected=false;if(snapshot)render(snapshot);}});
    if(inventory.mode==='demo'){
      const result=await json('/api/v1/demo/scenarios');const select=$('admin-scenario');for(const scene of result.scenarios){const option=node('option','',t(scene.label));option.value=scene.id;option.dataset.source=scene.label;select.append(option);}select.value=result.current;$('admin-demo-control').hidden=false;
      select.addEventListener('change',async()=>{select.disabled=true;try{await json('/api/v1/demo/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:select.value})});}catch{alert(t("演示切换失败，请重试。"));}finally{select.disabled=false;}});
    }
  }catch{unavailable=true;alert(t("暂时无法取得后台状态，请确认服务已启动。"));set('admin-printer-name',t("后台暂不可用"));}
}
window.addEventListener('pagehide',()=>source?.close());start();

onLocaleChange(()=>{const notification=alertKey;if(snapshot)render(snapshot);else if(unavailable)set('admin-printer-name',t("后台暂不可用"));if(notification)alert(t(notification));for(const option of $('admin-scenario').options)option.textContent=t(option.dataset.source||option.textContent);});
