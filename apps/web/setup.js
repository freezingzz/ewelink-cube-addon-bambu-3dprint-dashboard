import { t, getLocale, onLocaleChange, bindStatic, sourceKey } from './i18n.js';
import { mountShell } from './admin-shell.js';
bindStatic();
mountShell('setup');
const $=id=>document.getElementById(id);
const errorLabels=()=>({REGION_REQUIRED:t("请选择账号地区。"),ACCOUNT_REQUIRED:t("请输入正确的邮箱或手机号。"),PASSWORD_REQUIRED:t("请输入密码，或选择验证码登录。"),CODE_REQUIRED:t("请输入有效验证码。"),TOKEN_REQUIRED:t("请输入有效登录令牌。"),CLOUD_LOGIN_REJECTED:t("登录未通过，请检查账号、密码和地区。若云端要求额外校验，可尝试验证码或已有令牌。"),CLOUD_CODE_REJECTED:t("验证码未通过，请检查或重新发送。"),CLOUD_CODE_SEND_FAILED:t("验证码发送失败，请稍后重试并检查账号地区。"),CLOUD_NETWORK_ERROR:t("无法连接拓竹云端，请检查网络。"),CLOUD_INVALID_RESPONSE:t("云端返回了无法识别的响应，请稍后重试。"),CLOUD_RATE_LIMITED:t("云端请求过于频繁，请稍后重试。"),CLOUD_UNAVAILABLE:t("拓竹云端暂时不可用，请稍后重试。"),CLOUD_AUTH_REQUIRED:t("登录已过期或令牌无效，请重新登录。"),CLOUD_DEVICE_LOOKUP_FAILED:t("未能取得设备列表，请重试。"),DEVICE_REQUIRED:t("请从本次设备列表中选择打印机。"),CHALLENGE_EXPIRED:t("验证码会话已过期，请重新登录。"),CHALLENGE_REQUIRED:t("请先发送验证码或开始登录。"),TRY_LATER:t("请稍后重试；验证码发送间隔至少60秒。"),SETUP_BUSY:t("正在处理上一次操作，请稍候。"),OPEN_LOCAL_SETUP:t("请从本机重新打开设置页面。"),SAME_ORIGIN_REQUIRED:t("请刷新本机设置页后再试。"),SETUP_FAILED:t("操作未完成，请检查本地数据卷权限后重试。"),SESSION_RESTORE_FAILED:t("本机会话恢复未完成，请重新登录。")});
let busy=false,latest=null,deviceKey='',messageKey='',messageError=false;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
function message(text,error=false){messageKey=sourceKey(text);messageError=error;$('message').textContent=t(messageKey);$('message').classList.toggle('error',error);}
async function api(path,body){
  let r;try{r=await fetch('/api/v1/setup/'+path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Request':'1'},body:JSON.stringify(body)})});}catch{throw new Error('CLOUD_NETWORK_ERROR');}
  const data=await r.json();if(!r.ok)throw new Error(data.error||'SETUP_FAILED');return data;
}
function fields(){const region=$('region').value,account=$('account').value.trim();if(!region)throw new Error('REGION_REQUIRED');if(!account)throw new Error('ACCOUNT_REQUIRED');return {region,account};}
function draw(s){
  latest=s;
  $('login-panel').hidden=s.authenticated||!!s.challenge;$('challenge-panel').hidden=!s.challenge;
  $('device-panel').hidden=!s.authenticated;$('live-panel').hidden=!s.selected;
  if(s.region)$('region').value=s.region;
  if(s.challenge){$('challenge-title').textContent=s.challenge==='tfa'?t("输入身份验证器中的双重验证码"):s.challenge==='sms'?t("输入短信验证码"):t("输入邮件验证码");$('resend').hidden=s.challenge==='tfa';}
  $('selected-device').textContent=s.selected?t("当前：{0} · {1}", s.selected.name, s.selected.model):t("已登录，请明确选择要监控的打印机。");
  const key=JSON.stringify([s.devices,s.selected]);if(key!==deviceKey){deviceKey=key;$('devices').replaceChildren();
    for(const device of s.devices){const item=node('div');item.className='device';const info=node('div');info.append(node('h3',device.name),node('p',t("{0} · 序列号末四位 {1} · {2}", device.model, device.serialSuffix, device.online===true?t("云端显示在线"):device.online===false?t("云端显示离线"):t("在线状态未知"))));const select=node('button',t("连接这台打印机"));select.type='button';select.addEventListener('click',()=>action(()=>api('select',{deviceId:device.id}),t("已选择打印机，正在等待真实报文。")));item.append(info,select);$('devices').append(item);}
    if(!s.devices.length){
      if(s.selected){const item=node('div');item.className='device selected';const info=node('div');info.append(node('h3',s.selected.name),node('p',t("{0} · 当前监控", s.selected.model)));const link=node('a',t("查看实时状态 →"));link.href='/';link.className='button secondary';item.append(info,link);$('devices').append(item);}
      $('devices').append(node('p',s.selected?t("会话已恢复。需要更换打印机时，可刷新设备列表。"):t("没有可选设备。请刷新列表，或检查账号、地区及拓竹账号中的设备绑定。")));
    }
  }
  const d=s.diagnostics||{};const labels={connecting:t("连接中"),syncing:t("已订阅，等待打印机报文"),online:t("已收到打印机状态"),offline:t("连接离线"),error:t("连接异常")};
  const fieldLabels={progressPercent:t("进度"),remainingSeconds:t("剩余时间"),nozzleC:t("喷嘴温度"),bedC:t("热床温度"),currentLayer:t("当前层"),totalLayers:t("总层数"),jobName:t("任务名称")};
  const connectionErrors={CLOUD_AUTH_REQUIRED:t("登录已过期，请重新登录"),CLOUD_SETUP_REQUIRED:t("账号身份未确认，请检查授权与网络"),CLOUD_SUBSCRIBE_FAILED:t("状态订阅失败"),CLOUD_TRANSPORT_ERROR:t("云端网络连接异常"),CLOUD_SYNC_REQUEST_FAILED:t("当前状态查询发送失败"),CLOUD_NO_REPORTS:t("已订阅但未收到打印机状态，请确认设备已开机联网")};
  const entries=[[t("采集状态"),labels[d.connection]||t("等待选择")],[t("有效报文"),String(d.validReports??0)],[t("最近报文"),d.lastReportAt?new Date(d.lastReportAt).toLocaleString(getLocale()):t("尚未收到")],[t("已知字段"),(d.knownFields||[]).map(key=>fieldLabels[key]||key).join(getLocale()==='en'?', ':'、')||t("尚无")],[t("AMS 单元"),String(d.amsUnits??0)],[t("任务封面"),({available:t("已取得"),loading:t("读取中"),unavailable:t("暂无可确认的封面"),error:t("暂未取得")})[d.cover]||t("等待")],[t("连接提示"),(d.errorCodes||[]).map(code=>connectionErrors[code]||t("打印机报告异常，请查看卡片详情")).join(getLocale()==='en'?', ':'、')||t("无")]];
  $('diagnostics').replaceChildren();for(const [label,value]of entries)$('diagnostics').append(node('dt',label),node('dd',value));
}
async function action(operation,success){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);message(t("正在处理，请稍候…"));
  try{const status=await operation();draw(status);message(sourceKey(success)==='验证码已发送。'?t("验证码已发送，请填写收到的验证码。"):status.challenge?status.challenge==='tfa'?t("请填写身份验证器里的验证码。"):t("需要验证码，请点击发送／重发后填写收到的验证码。"):t(sourceKey(success)));}
  catch(e){message(errorLabels()[e.message]||t("操作未完成，请稍后重试。"),true);}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();void action(async()=>{const input={...fields(),password:$('password').value};$('password').value='';return api('login',input);},t("登录成功，请选择打印机。"));});
const send=()=>action(()=>api('code/send',fields()),t("验证码已发送。"));
$('send-code').addEventListener('click',send);$('resend').addEventListener('click',()=>action(()=>api('code/send',{}),t("验证码已发送。")));
$('code-form').addEventListener('submit',e=>{e.preventDefault();void action(()=>{const code=$('code').value.trim();$('code').value='';return api('code/verify',{code});},t("验证成功，请选择打印机。"));});
$('token-form').addEventListener('submit',e=>{e.preventDefault();void action(()=>{const region=$('region').value,token=$('token').value.trim();$('token').value='';return api('token',{region,token});},t("令牌有效，请选择打印机。"));});
$('refresh-devices').addEventListener('click',()=>action(()=>api('devices',{}),t("设备列表已刷新。")));
const logout=()=>action(()=>api('logout',{}),t("已移除本机会话，请重新登录。"));
$('logout').addEventListener('click',logout);$('restart').addEventListener('click',logout);
try{draw(await api('status'));message(latest.selected?t("已恢复本机会话，正在监控所选打印机。"):latest.authenticated?t("已恢复登录，请选择打印机。"):t("请在下方登录。"));}catch(e){message(errorLabels()[e.message]||t("当前服务未启用云端设置，请打开云端容器的本机设置地址。"),true);}
setInterval(async()=>{if(!busy)try{draw(await api('status'));}catch{}},3000);

onLocaleChange(()=>{deviceKey='';if(latest)draw(latest);message(t(messageKey),messageError);});
