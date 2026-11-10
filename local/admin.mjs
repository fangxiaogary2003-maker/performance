import {readFile,mkdir,cp,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backup} from 'node:sqlite';
import {adapters} from './adapter.mjs';
import {emptyState,mutate,readStore,writeStore} from '../lib/performance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const env=await adapters(process.env.DATA_DIR||join(root,'data'));
try{
const [command,file]=process.argv.slice(2);
if(command==='import'&&file){const people=JSON.parse(await readFile(resolve(file),'utf8'));const {state,revision}=await readStore(env.DB,'company',false);const administrator=state.people.find(p=>p.active&&p.roles.includes('admin'))||people.find(p=>p.active!==false&&p.roles.includes('admin'));if(!administrator)throw Error('名单必须包含启用的管理员');mutate(state,administrator,'importPeople',{people});await writeStore(env.DB,'company',revision,state);console.log(`Imported ${people.length} people. Existing cycle relations preserved.`);}
else if(command==='backup'&&file){const dest=resolve(file);if(dest===env.dir||dest.startsWith(env.dir+'/')||dest.startsWith(env.dir+'\\'))throw Error('备份目录必须在 data 目录之外');await mkdir(dest,{recursive:true});await backup(env.sql,join(dest,'performance.sqlite'));await cp(join(env.dir,'attachments'),join(dest,'attachments'),{recursive:true,force:false,errorOnExist:true});await writeFile(join(dest,'backup-info.json'),JSON.stringify({at:new Date().toISOString(),schema:1}));console.log('Backup completed. Restore only while the server is stopped.');}
else {console.log('node local/admin.mjs import <people.json>\nnode local/admin.mjs backup <new-backup-directory>');process.exitCode=1;}
}finally{env.sql.close();}
