import {createHash,randomUUID} from 'node:crypto';
import {AppError,ensure} from '../lib/errors.mjs';
import {readStore} from '../lib/performance.mjs';
import {normalizedDirectory,mergeDirectory,activeContact} from '../lib/feishu-directory.mjs';
import {appMessageCard,eventCurrent,monthlyRecipients} from '../lib/app-events.mjs';
import {reminderPlan} from '../lib/reminder-plan.mjs';
import {FEISHU_SCOPES} from './feishu-client.mjs';
import {cycleReporting} from './cycle-reporting.mjs';
export function applicationMessaging(sql,{env,client,base,appId,demo=false,clock=()=>new Date()}={}){
 sql.exec(`CREATE TABLE IF NOT EXISTS app_messaging_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS app_messaging_cache(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS app_message_outbox(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,recipient_id TEXT NOT NULL,recipient_open_id TEXT,recipient_name TEXT,payload TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,first_attempt_at TEXT,next_attempt_at TEXT,error_code TEXT,message_id TEXT);`);
 const reports=cycleReporting(sql,{clock});
 let flushing=false;
 const config=()=>{const row=sql.prepare('SELECT * FROM app_messaging_settings WHERE id=1').get();return row?{...JSON.parse(row.payload),revision:row.revision}:{revision:0,workflowEnabled:true,monthlyEnabled:true,hour:9};};
 const cached=id=>{const r=sql.prepare('SELECT * FROM app_messaging_cache WHERE id=?').get(id);return r?{...JSON.parse(r.payload),createdAt:r.created_at}:null;};
 const put=(id,value)=>sql.prepare('INSERT INTO app_messaging_cache(id,payload,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at').run(id,JSON.stringify(value),clock().toISOString());
 function status(calendar={}){return {mode:'application',appId,config:config(),demo,requiredScopes:FEISHU_SCOPES.map(([scope,name])=>({scope,name})),connection:cached('diagnosis'),plan:reminderPlan(calendar,clock(),config().hour),delivery:sql.prepare('SELECT id,kind,recipient_name,status,attempts,created_at,updated_at,error_code FROM app_message_outbox ORDER BY created_at DESC LIMIT 30').all(),directory:cached('directory')?{id:cached('directory').id,count:cached('directory').contacts.length,at:cached('directory').createdAt}:null};}
 function save(b,actorId){const c=config();ensure(b.configRevision===c.revision,'接入设置已更新，请刷新',409);ensure(typeof b.workflowEnabled==='boolean'&&typeof b.monthlyEnabled==='boolean','推送开关格式无效');ensure(Number.isInteger(b.hour)&&b.hour>=7&&b.hour<=12,'推送时间须为北京时间7—12点整点');const value={workflowEnabled:b.workflowEnabled,monthlyEnabled:b.monthlyEnabled,hour:b.hour,updatedBy:actorId,updatedAt:clock().toISOString()};
  const r=c.revision?sql.prepare('UPDATE app_messaging_settings SET revision=revision+1,payload=? WHERE id=1 AND revision=?').run(JSON.stringify(value),c.revision):sql.prepare('INSERT OR IGNORE INTO app_messaging_settings(id,revision,payload) VALUES(1,1,?)').run(JSON.stringify(value));ensure(r.changes,'接入设置已更新，请刷新',409);return config();}
 async function check(u){ensure(!demo,'演示环境不连接真实飞书',409);const result=await client.diagnose(u.feishuOpenId);put('diagnosis',result);if(result.botEnabled&&!result.missing.some(x=>x.scope==='im:message:send_as_bot'))sql.prepare("UPDATE app_message_outbox SET status='queued',error_code=NULL,first_attempt_at=NULL WHERE status='blocked'").run();return result;}
 async function directoryPreview(s){ensure(!demo,'演示环境不读取真实通讯录',409);const contacts=normalizedDirectory(await client.directory()),id=randomUUID();put('directory',{id,contacts});const names=new Map(contacts.map(c=>[c.openId,c.name]));const existing=new Set((s?.people||[]).map(p=>p.feishuOpenId)),known=new Set(contacts.filter(c=>c.active).map(c=>c.openId));return {id,count:contacts.length,activeCount:contacts.filter(c=>c.active).length,changes:{added:contacts.filter(c=>!existing.has(c.openId)).length,matched:contacts.filter(c=>existing.has(c.openId)).length,missingManager:contacts.filter(c=>c.active&&!known.has(c.leaderOpenId)).length},people:contacts.map(c=>({name:c.name,dept:c.dept,position:c.position,manager:names.get(c.leaderOpenId)||'未配置／不在可读范围',active:c.active}))};}
 function applyDirectory(s,id){const preview=cached('directory');ensure(preview&&preview.id===id&&clock().getTime()-Date.parse(preview.createdAt)<15*60000,'通讯录预览已过期，请重新读取',409);return mergeDirectory(s,preview.contacts);}
 async function prepareSubmission(s,u,a){ensure(a&&a.employeeId===u.id&&a.status==='active','只能提交自己的有效考核',403);
  if(demo){ensure(a.managerId,'演示员工尚未配置主管',409);return;}
  ensure(u.feishuOpenId,'请先绑定员工的飞书账号',409);const employee=await client.user(u.feishuOpenId);ensure(activeContact(employee),'员工在飞书通讯录中已停用／离职',409);ensure(employee.leader_user_id&&employee.leader_user_id!==u.feishuOpenId,'飞书通讯录中尚未配置有效直属上级，请联系HR',409);
  const leader=await client.user(employee.leader_user_id);ensure(activeContact(leader),'飞书直属上级已停用／离职，请联系HR',409);
  let manager=s.people.find(p=>p.feishuOpenId===leader.open_id);ensure(!manager||manager.active,'系统中的直属上级账号已停用，请管理员核对',409);
  const hasScores=Object.keys(a.qualityEvaluations||{}).length||Object.keys(a.components||{}).length||s.tasks.some(t=>t.assessmentId===a.id&&t.managerEvaluation);
  if(a.managerId&&a.managerId!==manager?.id)ensure(!hasScores&&!a.monthlySubmission,'通讯录主管与当期负责人不同，且本月已有提交或评分，请管理员核对后处理',409);
  if(!manager){manager={id:randomUUID(),name:leader.name,dept:'部门待同步',position:leader.job_title||'',roles:['manager'],active:true,managerId:null,hrbpId:null,hrdId:null,feishuOpenId:leader.open_id,source:'feishu_leader_lookup'};s.people.push(manager);}
  if(!manager.roles.includes('manager'))manager.roles.push('manager');
  if(a.managerId!==manager.id){(a.managerBindingHistory||=[]).push({oldManagerId:a.managerId||null,newManagerId:manager.id,source:'feishu',at:clock().toISOString()});s.audit.push({id:randomUUID(),actorId:u.id,actorName:u.name,action:'根据飞书直属上级更新本月评分负责人',target:a.id,at:clock().toISOString()});}
  a.managerId=manager.id;a.managerVerifiedAt=clock().toISOString();a.managerSource='feishu';u.managerId=manager.id;
 }
 function enqueue(s,e,workspaceId){const p=s.people.find(p=>p.id===e.recipientId),at=clock().toISOString();sql.prepare("INSERT OR IGNORE INTO app_message_outbox(id,workspace_id,kind,recipient_id,recipient_open_id,recipient_name,payload,status,created_at,updated_at,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(e.id,workspaceId,e.kind,e.recipientId,p?.feishuOpenId||null,p?.name||'待核对',JSON.stringify(e),p?.active&&p.feishuOpenId?'queued':'blocked',at,at,p?.feishuOpenId?null:'MISSING_IDENTITY');}
 function receipt(eventId){const row=sql.prepare('SELECT status,error_code,updated_at FROM app_message_outbox WHERE id=?').get(eventId);return row?{status:row.status,updatedAt:row.updated_at}: {status:'queued'};}
 function decorate(view){for(const a of view.assessments)if(a.monthlySubmission?.eventId)a.submissionNotification=receipt(a.monthlySubmission.eventId);return view;}
 async function flush(workspaceId='company'){
  if(flushing||demo)return;flushing=true;try{const {state:s}=await readStore(env.DB,workspaceId,false),c=config();
   if(c.workflowEnabled)for(const e of s.notificationEvents||[])enqueue(s,e,workspaceId);
   const summaries=reports.sync(s,workspaceId);if(c.workflowEnabled)for(const e of summaries)enqueue(s,e,workspaceId);if(c.monthlyEnabled)for(const e of reports.scheduled(s,workspaceId,c.hour))enqueue(s,e,workspaceId);
   const old=sql.prepare("SELECT id,first_attempt_at FROM app_message_outbox WHERE status='sending' AND updated_at<?").all(new Date(clock().getTime()-60000).toISOString());
   for(const row of old)sql.prepare('UPDATE app_message_outbox SET status=?,error_code=? WHERE id=?').run(clock().getTime()-Date.parse(row.first_attempt_at)<50*60000?'retry':'unknown','INTERRUPTED',row.id);
   const rows=sql.prepare("SELECT * FROM app_message_outbox WHERE workspace_id=? AND (status='queued' OR (status='retry' AND (next_attempt_at IS NULL OR next_attempt_at<=?))) ORDER BY CASE WHEN kind='monthly' THEN 1 ELSE 0 END,created_at LIMIT 25").all(workspaceId,clock().toISOString());
   for(const row of rows){const e=JSON.parse(row.payload);if(['monthly','cycle_digest'].includes(e.kind)?!c.monthlyEnabled:e.kind!=='test'&&!c.workflowEnabled)continue;
    const {state:live}=await readStore(env.DB,workspaceId,false),p=live.people.find(p=>p.id===row.recipient_id&&p.active),livePlan=reminderPlan(live.calendar,clock(),c.hour),expired=e.cycleId?!reports.current(live,e,c.hour):e.kind==='monthly'&&(e.date!==livePlan.date||!livePlan.eligible||!monthlyRecipients(live,livePlan).includes(row.recipient_id));
    if(!row.recipient_open_id&&p?.feishuOpenId){sql.prepare('UPDATE app_message_outbox SET recipient_open_id=? WHERE id=? AND recipient_open_id IS NULL').run(p.feishuOpenId,row.id);row.recipient_open_id=p.feishuOpenId;}
    if(!p||!eventCurrent(live,e)||expired||p.feishuOpenId!==row.recipient_open_id){sql.prepare("UPDATE app_message_outbox SET status='cancelled',error_code='NO_LONGER_CURRENT' WHERE id=?").run(row.id);continue;}
    if(row.status==='retry'&&row.first_attempt_at&&clock().getTime()-Date.parse(row.first_attempt_at)>=50*60000){sql.prepare("UPDATE app_message_outbox SET status='unknown',error_code='DEDUPE_WINDOW_EXPIRED' WHERE id=?").run(row.id);continue;}
    const at=clock().toISOString(),claim=sql.prepare("UPDATE app_message_outbox SET status='sending',attempts=attempts+1,updated_at=?,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND status IN ('queued','retry')").run(at,at,row.id);if(!claim.changes)continue;
    try{const messageId=await client.send(row.recipient_open_id,appMessageCard(live,e,base),createHash('sha256').update(row.id).digest('hex').slice(0,40));sql.prepare("UPDATE app_message_outbox SET status='sent',message_id=?,updated_at=?,error_code=NULL WHERE id=?").run(messageId,clock().toISOString(),row.id);}
    catch(error){const retryable=error.retryable===true&&row.attempts<4,state=retryable?'retry':error.retryable?'unknown':'blocked';sql.prepare('UPDATE app_message_outbox SET status=?,error_code=?,updated_at=?,next_attempt_at=? WHERE id=?').run(state,String(error.code||'NOT_READY'),clock().toISOString(),new Date(clock().getTime()+60000*Math.min(10,2**row.attempts)).toISOString(),row.id);}
   }
  }finally{flushing=false;}
 }
 function kick(key='company'){setImmediate(()=>flush(key).catch(()=>{}));}
 async function test(u,key='company'){ensure(!demo,'演示环境不发送真实消息',409);ensure(u.feishuOpenId,'请先绑定当前管理员飞书账号',409);const recent=sql.prepare("SELECT created_at FROM app_message_outbox WHERE kind='test' ORDER BY created_at DESC LIMIT 1").get();ensure(!recent||clock().getTime()-Date.parse(recent.created_at)>60000,'每分钟最多发送一次测试卡片',429);const {state:s}=await readStore(env.DB,key,false),id='test:'+randomUUID();enqueue(s,{id,kind:'test',recipientId:u.id},key);await flush(key);return receipt(id);}
 function retry(id,confirmed=false){const r=sql.prepare('SELECT * FROM app_message_outbox WHERE id=?').get(id);ensure(r&&['blocked','unknown'].includes(r.status),'记录不可重试',409);ensure(r.status!=='unknown'||confirmed,'请先确认收件人尚未收到，避免重复提醒',409);sql.prepare("UPDATE app_message_outbox SET status='queued',error_code=NULL,first_attempt_at=NULL,next_attempt_at=NULL WHERE id=?").run(id);kick(r.workspace_id);}
 return {status,save,check,directoryPreview,applyDirectory,prepareSubmission,flush,kick,test,retry,decorate,receipt,reports};
}
