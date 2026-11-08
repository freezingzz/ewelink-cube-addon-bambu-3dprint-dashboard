import { createDashboard } from './server.ts';
import { CoverCache } from './cover-cache.ts';
import { startCloud, resolveCloudUsername, cloudApiBase, selectTaskCover, type CloudConfig } from './cloud.ts';
import { emptySnapshot } from '../../../packages/contracts/src/index.ts';
import { applyReport } from '../../../packages/printer-bambu/src/parser.ts';

export function createCloudMonitor(dashboard: ReturnType<typeof createDashboard>, coverCache: CoverCache, deps: { start?:typeof startCloud; resolve?:typeof resolveCloudUsername; fetch?:typeof fetch } = {}) {
  let generation=0, coverGeneration=0, stopCloud: (()=>Promise<void>) | undefined;
  let active: CloudConfig | null=null, lastCoverAt=0;
  let reports=0, ignoredReports=0;
  const stop=async()=>{ generation++; coverGeneration++; active=null; reports=0; ignoredReports=0; coverCache.clear(); const close=stopCloud; stopCloud=undefined; await close?.(); };
  async function start(config: CloudConfig, device?: {name:string;model:string}) {
    await stop(); const run=generation; active=config;
    const initial=emptySnapshot('h2c-1','cloud');
    initial.name=device?.name||'H2C'; initial.model=device?.model||'H2C'; dashboard.update(initial);
    async function refreshCover() {
      const taskId=dashboard.getSnapshot().taskId; if(!taskId || run!==generation) return;
      const request=++coverGeneration; lastCoverAt=Date.now();
      const current=()=>run===generation && request===coverGeneration && dashboard.getSnapshot().taskId===taskId;
      const set=(state:'loading'|'available'|'unavailable'|'error')=>{if(current()) dashboard.update({...dashboard.getSnapshot(),cover:{taskId,state,url:state==='available'?`/api/v1/printers/h2c-1/cover?task=${encodeURIComponent(taskId)}`:null}});};
      set('loading');
      try {
        const response=await (deps.fetch??fetch)(`${cloudApiBase(config.region)}/v1/user-service/my/tasks?limit=10`,{headers:{Authorization:`Bearer ${config.token}`},signal:AbortSignal.timeout(10000),redirect:'error'});
        if(!response.ok) {set('error');return;}
        const url=selectTaskCover(await response.json(),config.serial,taskId);
        if(!current()) return;
        if(!url){coverCache.clear();set('unavailable');return;}
        const result=await coverCache.load(taskId,url); if(result!=='superseded') set(result);
      }catch{set('error');}
    }
    try {
      const username=await (deps.resolve??resolveCloudUsername)(config); if(run!==generation)return;
      stopCloud=(deps.start??startCloud)({...config,username},{
        report(payload){
          if(run!==generation)return;
          const previous=dashboard.getSnapshot(),next=applyReport(previous,payload);
          if(JSON.stringify(previous)===JSON.stringify(next)){ignoredReports++;return;}
          reports++; next.errors=next.errors.filter(e=>!e.code.startsWith('CLOUD_')); dashboard.update(next);
          if(next.taskId!==previous.taskId){coverGeneration++;coverCache.clear();if(next.taskId)void refreshCover();}
          else if(next.taskId && Date.now()-lastCoverAt>60000 && next.cover.state!=='available')void refreshCover();
        },
        connection(connection,code){
          if(run!==generation)return;
          const current=dashboard.getSnapshot(),errors=current.errors.filter(e=>!e.code.startsWith('CLOUD_'));
          if(code)errors.push({code,message:code==='CLOUD_AUTH_REQUIRED'?'云端会话失效，请重新登录':code==='CLOUD_NO_REPORTS'?'已订阅但未收到打印机状态，请确认设备已开机联网':'云端连接暂不可用',severity:'error'});
          dashboard.update({...current,connection,freshness:current.lastReportAt?'stale':'unknown',errors});
        }
      });
    }catch{
      if(run===generation)dashboard.update({...dashboard.getSnapshot(),connection:'error',errors:[{code:'CLOUD_SETUP_REQUIRED',message:'云端身份确认失败，请检查授权与网络',severity:'error'}]});
    }
  }
  return {start,stop,diagnostics:()=>({active:!!active,validReports:reports,ignoredReports})};
}
