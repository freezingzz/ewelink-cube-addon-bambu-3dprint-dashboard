import { t, getLocale, onLocaleChange, setLocale } from './i18n.js';
import { icon as createIcon } from './icons.js';
let current;
export function mountShell(active) {
  current=active;
  document.body.classList.add('admin-shell');
  document.querySelector('.admin-nav')?.remove();
  const aside=document.createElement('aside'); aside.className='admin-nav';
  const brand=document.createElement('a'); brand.href='/?lang='+getLocale(); brand.className='admin-brand';
  const mark=document.createElement('span'); mark.className='admin-brand-mark'; mark.append(createIcon('printer',23));
  const name=document.createElement('span'); name.textContent='PRINT ROOM';
  const sub=document.createElement('small'); sub.textContent=t("3D 打印监控"); name.append(sub); brand.append(mark,name);
  const nav=document.createElement('nav'); nav.setAttribute('aria-label',t("插件管理"));
  for(const [id,href,label,icon] of [['overview','/',t("监控总览"),'overview'],['setup','/setup',t("账号与设备"),'setup'],['preview','/preview',t("卡片预览"),'preview'],['cast','/cast-config',t('CAST 配置'),'preview']]) {
    const link=document.createElement('a'); link.href=href+'?lang='+getLocale();
    const symbol=document.createElement('span'); symbol.append(createIcon(icon,19)); symbol.setAttribute('aria-hidden','true');
    link.append(symbol,document.createTextNode(label)); if(id===active)link.setAttribute('aria-current','page'); nav.append(link);
  }
  const footer=document.createElement('div'); footer.className='admin-nav-footer'; footer.textContent='CUBE ADD-ON';
  const note=document.createElement('small'); note.textContent=t("只读监控 · 本机服务"); footer.append(note);
  const language=document.createElement('label'); language.className='admin-locale';
  const caption=document.createElement('span');caption.textContent=t('界面语言');
  const select=document.createElement('select');select.id='ui-language';select.setAttribute('aria-label',t('界面语言'));
  for(const [value,label]of [['zh-CN','简体中文'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  select.value=getLocale();select.addEventListener('change',()=>{setLocale(select.value);document.getElementById('ui-language')?.focus();});language.append(caption,select);
  aside.append(brand,nav,language,footer); document.body.prepend(aside);
}

onLocaleChange(()=>{if(current)mountShell(current);});
