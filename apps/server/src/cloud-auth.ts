/** Cloud authentication protocol reference: cptkirki/PrintSphere 32ad5aeb, FNCL v1.1; see NOTICE. */
import { cloudApiBase, type CloudConfig } from './cloud.ts';
export type Region = CloudConfig['region'];
export interface CloudSession { region: Region; token: string; expiresAt: string | null; selected?: Device }
export interface Device { id: string; serial: string; name: string; model: string; online: boolean | null }
export interface Challenge { region: Region; account: string; kind: 'email' | 'sms' | 'tfa'; key?: string; createdAt: number }
export class CloudError extends Error { constructor(code: string) { super(code); this.name = 'CloudError'; } }
export function regionOf(value: unknown): Region { if (value !== 'CN' && value !== 'GLOBAL') throw new CloudError('REGION_REQUIRED'); return value; }
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const headers = { 'User-Agent':'bambu_network_agent/01.09.05.01', 'X-BBL-Client-Name':'OrcaSlicer', 'X-BBL-Client-Type':'slicer', 'X-BBL-Client-Version':'01.09.05.51', 'X-BBL-Language':'en-US', 'X-BBL-OS-Type':'linux', 'X-BBL-OS-Version':'6.2.0', 'X-BBL-Agent-Version':'01.09.05.01', 'X-BBL-Executable-info':'{}', 'X-BBL-Agent-OS-Type':'linux', Accept:'application/json' };
export class CloudAuth {
  constructor(privateFetch: typeof fetch = fetch) { this.fetcher = privateFetch; }
  private fetcher: typeof fetch;
  async request(region: Region, path: string, body?: object, token?: string, site = false) {
    const base = site ? `https://bambulab.${region === 'CN' ? 'cn' : 'com'}` : cloudApiBase(region);
    let response: Response;
    try { response = await this.fetcher(base + path, { method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), redirect:'error', signal:AbortSignal.timeout(15000) }); }
    catch { throw new CloudError('CLOUD_NETWORK_ERROR'); }
    const reader = response.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    try {
      if (reader) for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 1024*1024) throw new CloudError('CLOUD_INVALID_RESPONSE'); chunks.push(part.value); }
    } catch { throw new CloudError('CLOUD_INVALID_RESPONSE'); }
    finally { await reader?.cancel().catch(()=>{}); reader?.releaseLock(); }
    let parsed: unknown;
    try { parsed=JSON.parse(Buffer.concat(chunks).toString()); } catch { parsed={}; }
    if (response.status === 429) throw new CloudError('CLOUD_RATE_LIMITED');
    if (response.status >= 500) throw new CloudError('CLOUD_UNAVAILABLE');
    const root=object(parsed), data=object(root.data); return {response, data:{...root,...data}};
  }
  account(value: unknown) { if(typeof value!=='string' || value.length<3 || value.length>254 || /[\r\n]/.test(value)) throw new CloudError('ACCOUNT_REQUIRED'); return value.trim(); }
  async login(region: Region, account: string, password: string): Promise<CloudSession | Challenge> {
    this.account(account); if (!password || password.length>1024) throw new CloudError('PASSWORD_REQUIRED');
    const {response,data}=await this.request(region,'/v1/user-service/user/login',{account,password,apiError:''});
    if(data.loginType==='verifyCode') return {region,account,kind:account.includes('@')?'email':'sms',createdAt:Date.now()};
    if(data.loginType==='tfa' && typeof data.tfaKey==='string' && data.tfaKey.length<=4096) return {region,account,kind:'tfa',key:data.tfaKey,createdAt:Date.now()};
    return this.session(region,response,data);
  }
  session(region: Region,response: Response,data: Record<string,any>): CloudSession {
    if(!response.ok || typeof data.accessToken!=='string' || data.accessToken.length<20 || data.accessToken.length>16384 || /[\r\n]/.test(data.accessToken)) throw new CloudError('CLOUD_LOGIN_REJECTED');
    return {region,token:data.accessToken,expiresAt:typeof data.expiresIn==='number' && data.expiresIn>0 ? new Date(Date.now()+Math.min(data.expiresIn,365*86400)*1000).toISOString() : null};
  }
  async sendCode(region: Region, account: string): Promise<Challenge> {
    this.account(account); const email=account.includes('@');
    const {response,data}=await this.request(region,email?'/v1/user-service/user/sendemail/code':'/v1/user-service/user/sendsmscode',email?{email:account,type:'codeLogin'}:{phone:account,type:'codeLogin'});
    if(!response.ok || data.success===false || (data.code!==undefined && ![0,'0','SUCCESS',200,'200'].includes(data.code))) throw new CloudError('CLOUD_CODE_SEND_FAILED');
    return {region,account,kind:email?'email':'sms',createdAt:Date.now()};
  }
  async verify(challenge: Challenge, code: string): Promise<CloudSession> {
    if(Date.now()-challenge.createdAt>10*60*1000) throw new CloudError('CHALLENGE_EXPIRED');
    if(!/^[0-9]{4,10}$/.test(code)) throw new CloudError('CODE_REQUIRED');
    const tfa=challenge.kind==='tfa';
    const {response,data}=await this.request(challenge.region,tfa?'/api/sign-in/tfa':'/v1/user-service/user/login',tfa?{tfaKey:challenge.key,tfaCode:code}:{account:challenge.account,code},undefined,tfa);
    if(tfa && response.ok) {
      for(const cookie of response.headers.getSetCookie()) { const token=/(?:^|;\s*)token=([^;]+)/.exec(cookie)?.[1]; if(token) return this.session(challenge.region,response,{accessToken:token,expiresIn:3600}); }
    }
    try { return this.session(challenge.region,response,data); } catch { throw new CloudError('CLOUD_CODE_REJECTED'); }
  }
  async devices(session: CloudSession): Promise<Omit<Device,'id'>[]> {
    const {response,data}=await this.request(session.region,'/v1/iot-service/api/user/bind',undefined,session.token);
    if(response.status===401 || response.status===403) throw new CloudError('CLOUD_AUTH_REQUIRED');
    if(!response.ok || !Array.isArray(data.devices)) throw new CloudError('CLOUD_DEVICE_LOOKUP_FAILED');
    return data.devices.slice(0,100).flatMap((raw: unknown) => {
      const d=object(raw), serial=[d.dev_id,d.deviceId,d.device_id,d.devId,d.sn,d.printerSn].find(v=>typeof v==='string' && /^[A-Za-z0-9_-]{5,80}$/.test(v));
      if(!serial) return [];
      return [{serial,name:String(d.name||d.dev_product_name||d.device_name||'打印机').slice(0,120),model:String(d.dev_product_name||d.model||d.product_name||'未知型号').slice(0,80),online:typeof d.online==='boolean'?d.online:null}];
    });
  }
}
