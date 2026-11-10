import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {adapters} from './adapter.mjs';
import {applicationMessaging} from './application-messaging.mjs';
import {feishuClient} from './feishu-client.mjs';
import {readStore} from '../lib/performance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),env=await adapters(process.env.DATA_DIR||join(root,'data'));
try{
 const service=applicationMessaging(env.sql,{env,client:feishuClient({appId:process.env.FEISHU_APP_ID,appSecret:process.env.FEISHU_APP_SECRET}),appId:process.env.FEISHU_APP_ID,base:process.env.APP_BASE_URL,demo:process.env.DEMO_MODE==='true'}),{state}=await readStore(env.DB,'company',false),command=process.argv[2]||'status';
 if(command==='status')console.log(JSON.stringify(service.status(state.calendar)));
 else if(command==='run'){await service.flush('company');console.log(JSON.stringify({ok:true,mode:'application'}));}
 else if(command==='check'){const admin=state.people.find(p=>p.active&&p.roles.includes('admin'));if(!admin)throw Error('No administrator');console.log(JSON.stringify(await service.check(admin)));}
 else throw Error('Use status, check or run. Configure application permissions through the administrator webpage.');
}finally{env.sql.close();}
