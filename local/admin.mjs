import {readFile,mkdir,cp,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backup} from 'node:sqlite';
import {adapters} from './adapter.mjs';
import {emptyState,mutate,readStore,writeStore,monthNow,uid,now} from '../lib/performance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const env=await adapters(process.env.DATA_DIR||join(root,'data'));
try{
const [command,file]=process.argv.slice(2);
if(command==='import'&&file){const people=JSON.parse(await readFile(resolve(file),'utf8'));const {state,revision}=await readStore(env.DB,'company',false);const administrator=state.people.find(p=>p.active&&p.roles.includes('admin'))||people.find(p=>p.active!==false&&p.roles.includes('admin'));if(!administrator)throw Error('名单必须包含启用的管理员');mutate(state,administrator,'importPeople',{people});await writeStore(env.DB,'company',revision,state);console.log(`Imported ${people.length} people. Existing cycle relations preserved.`);}
else if(command==='backup'&&file){const dest=resolve(file);if(dest===env.dir||dest.startsWith(env.dir+'/')||dest.startsWith(env.dir+'\\'))throw Error('备份目录必须在 data 目录之外');await mkdir(dest,{recursive:true});await backup(env.sql,join(dest,'performance.sqlite'));await cp(join(env.dir,'attachments'),join(dest,'attachments'),{recursive:true,force:false,errorOnExist:true});await writeFile(join(dest,'backup-info.json'),JSON.stringify({at:new Date().toISOString(),schema:1}));console.log('Backup completed. Restore only while the server is stopped.');}
else if(command==='pending'){console.log(JSON.stringify(env.sql.prepare('SELECT id,name,created_at FROM login_requests ORDER BY created_at').all()));}
else if(command==='approve'&&file){
 const request=env.sql.prepare('SELECT * FROM login_requests WHERE id=?').get(file);if(!request)throw Error('登录开通编号不存在');
 const [roleCsv='',department='待分配部门',employeeId]=process.argv.slice(4);const roles=roleCsv?roleCsv.split(','):[];
 if(!roles.every(r=>['admin','hrbp','manager'].includes(r)))throw Error('角色无效');
 const {state,revision}=await readStore(env.DB,'company',false);if(state.people.some(p=>p.feishuOpenId===request.open_id))throw Error('该飞书身份已有人员绑定');
 const person={id:employeeId||uid(),name:request.name,dept:department,managerId:null,hrbpId:null,roles,active:true,feishuOpenId:request.open_id};
 if(state.people.some(p=>p.id===person.id))throw Error('人员 ID 已存在');
 state.people.push(person);state.audit.push({id:uid(),at:now(),actorId:'server-admin',actorName:'服务器管理员',action:'开通登录账号',target:person.id,details:{requestId:request.id,roles,department}});
 if(!state.cycles.length&&roles.includes('admin'))mutate(state,person,'openCycle',{month:monthNow()});
 await writeStore(env.DB,'company',revision,state);env.sql.prepare('DELETE FROM login_requests WHERE id=?').run(request.id);
 console.log(JSON.stringify({approved:true,id:person.id,name:person.name,roles}));
}
else {console.log('node local/admin.mjs import <people.json>\nnode local/admin.mjs backup <new-backup-directory>\nnode local/admin.mjs pending\nnode local/admin.mjs approve <request-id> <roles-csv> <department> [employee-id]');process.exitCode=1;}
}finally{env.sql.close();}
