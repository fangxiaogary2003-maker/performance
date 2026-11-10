import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {adapters} from './adapter.mjs';
import {groupReminders} from './group-reminders.mjs';
import {readStore} from '../lib/performance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),env=await adapters(process.env.DATA_DIR||join(root,'data'));
try{
 const service=groupReminders(env.sql,{keySecret:process.env.FEISHU_APP_SECRET,base:process.env.APP_BASE_URL,demo:process.env.DEMO_MODE==='true'}),{state}=await readStore(env.DB,'company',false),command=process.argv[2]||'status';
 if(command==='status')console.log(JSON.stringify(service.status(state.calendar)));
 else if(command==='run')console.log(JSON.stringify(await service.tick(state.calendar)));
 else throw Error('Use status or run. Configure and test the group bot through the administrator webpage.');
}finally{env.sql.close();}
