import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { regionOf, type CloudSession } from './cloud-auth.ts';
export class SessionStore {
  constructor(directory: string) { this.directory=directory; }
  private directory: string;
  async save(session: CloudSession) {
    await mkdir(this.directory,{recursive:true,mode:0o700}); await chmod(this.directory,0o700);
    const temporary=join(this.directory,`.session-${randomUUID()}.tmp`);
    try { await writeFile(temporary,JSON.stringify(session),{mode:0o600,flag:'wx'}); await rename(temporary,join(this.directory,'cloud-session.json')); }
    finally {await unlink(temporary).catch(()=>{});}
  }
  async load(): Promise<CloudSession|null> {
    try {
      const session=JSON.parse(await readFile(join(this.directory,'cloud-session.json'),'utf8')) as CloudSession;
      regionOf(session.region);
      if(typeof session.token!=='string' || session.token.length<20 || session.token.length>16384 || /[\r\n]/.test(session.token))return null;
      if(session.expiresAt && (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt)<=Date.now())){await this.clear();return null;}
      if(session.selected && (!/^[A-Za-z0-9_-]{5,80}$/.test(session.selected.serial) || typeof session.selected.name!=='string' || typeof session.selected.model!=='string'))return null;
      return session;
    }catch{return null;}
  }
  async clear(){await unlink(join(this.directory,'cloud-session.json')).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw new Error('SESSION_STORE_FAILED');});}
}
