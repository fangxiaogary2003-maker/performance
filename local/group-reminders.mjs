import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {AppError,ensure} from '../lib/errors.mjs';
import {reminderPlan,reminderCard,REMINDER_STAGES} from '../lib/reminder-plan.mjs';
export function validWebhook(value){
 let u;try{u=new URL(value);}catch{throw new AppError('请填写有效的飞书群机器人Webhook');}
 ensure(u.protocol==='https:'&&u.hostname==='open.feishu.cn'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]{16,120}$/.test(u.pathname),'仅支持飞书官方自定义机器人Webhook');return u.href;
}
export const webhookSign=(secret,timestamp)=>createHmac('sha256',timestamp+'\n'+secret).update('').digest('base64');
export function groupReminders(sql,{keySecret,base,demo=false,transport=fetch,clock=()=>new Date()}={}){
 ensure(keySecret,'未配置服务器加密密钥',500);
 const key=createHash('sha256').update('performance-group-reminders\0'+keySecret).digest();
 const seal=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});};
 const unseal=value=>{try{const e=JSON.parse(value),d=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.body,'base64')),d.final()]).toString());}catch{throw new AppError('群机器人配置无法解密，请重新配置',409);}};
 sql.exec(`CREATE TABLE IF NOT EXISTS reminder_config(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reminder_outbox(id TEXT PRIMARY KEY,date TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,error_code TEXT,config_revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reminder_config_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,at TEXT NOT NULL,group_name TEXT NOT NULL,enabled INTEGER NOT NULL,revision INTEGER NOT NULL);`);
 const load=()=>{const row=sql.prepare('SELECT * FROM reminder_config WHERE id=1').get();return row?{...unseal(row.payload),revision:row.revision}:{revision:0,enabled:false,hour:9,atAll:true,groupName:'',webhook:'',signSecret:''};};
 const sanitize=c=>({revision:c.revision,enabled:c.enabled,hour:c.hour,atAll:c.atAll,groupName:c.groupName,configured:!!c.webhook,signatureConfigured:!!c.signSecret,timezone:'Asia/Shanghai'});
 const stale=()=>sql.prepare("UPDATE reminder_outbox SET status='unknown',error_code='INTERRUPTED' WHERE status='sending' AND updated_at<?").run(new Date(clock().getTime()-120000).toISOString());
 function status(calendar={}){
  stale();let c,configurationError=null;try{c=load();}catch(e){configurationError=e.message;c={revision:sql.prepare('SELECT revision FROM reminder_config WHERE id=1').get()?.revision||0,enabled:false,hour:9};}
  const plan=reminderPlan(calendar,clock(),c.hour);
  return {config:sanitize(c),configurationError,plan,stages:REMINDER_STAGES,delivery:sql.prepare('SELECT id,date,stage,status,attempts,created_at,updated_at,error_code FROM reminder_outbox ORDER BY created_at DESC LIMIT 15').all(),demo};
 }
 function save(b,actorId){
  let old;try{old=load();}catch{old={revision:sql.prepare('SELECT revision FROM reminder_config WHERE id=1').get()?.revision||0,webhook:'',signSecret:''};}
  ensure(b.configRevision===old.revision,'提醒设置已被其他管理员修改，请刷新',409);
  ensure(typeof b.groupName==='string'&&b.groupName.trim()&&b.groupName.length<=100,'请填写全员群名称');ensure(Number.isInteger(b.hour)&&b.hour>=7&&b.hour<=12,'提醒时间须为北京时间7—12点的整点');
  ensure(typeof b.enabled==='boolean'&&typeof b.atAll==='boolean','提醒开关格式无效');
  const webhook=b.webhook?.trim()?validWebhook(b.webhook.trim()):old.webhook||'';
  ensure(typeof (b.signSecret??'')==='string'&&(b.signSecret||'').length<=512,'签名密钥格式无效');
  const signSecret=b.clearSigningSecret?'':b.signSecret?.trim()||old.signSecret||'';
  ensure(webhook===old.webhook||!old.signSecret||b.signSecret?.trim()||b.clearSigningSecret,'更换Webhook时请更新签名密钥或选择清除旧密钥');ensure(!b.enabled||webhook,'请先配置群机器人Webhook');
  const c={revision:old.revision+1,groupName:b.groupName.trim(),hour:b.hour,enabled:b.enabled,atAll:b.atAll,webhook,signSecret},at=clock().toISOString();
  sql.exec('BEGIN IMMEDIATE');try{
   const actual=sql.prepare('SELECT revision FROM reminder_config WHERE id=1').get()?.revision||0;ensure(actual===old.revision,'提醒设置已被其他管理员修改，请刷新',409);
   sql.prepare('INSERT INTO reminder_config(id,revision,payload,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(c.revision,seal(c),at);
   sql.prepare('INSERT INTO reminder_config_audit(id,actor_id,at,group_name,enabled,revision) VALUES(?,?,?,?,?,?)').run(randomUUID(),actorId,at,c.groupName,c.enabled?1:0,c.revision);sql.exec('COMMIT');
  }catch(e){sql.exec('ROLLBACK');throw e;}return sanitize(c);
 }
 async function deliver(id,plan,test=false,retry=false){
  ensure(!demo,'演示环境不发送真实群消息',409);const c=load();ensure(c.webhook,'尚未配置群机器人Webhook',409);if(!test)ensure(c.enabled,'群提醒已停用',409);
  const at=clock().toISOString();
  if(retry){const row=sql.prepare('SELECT * FROM reminder_outbox WHERE id=?').get(id);ensure(row&&['rejected','unknown'].includes(row.status),'此记录不能重发',409);ensure(row.date===plan.date,'只能重发当天提醒',409);const r=sql.prepare("UPDATE reminder_outbox SET status='sending',attempts=attempts+1,updated_at=?,error_code=NULL,config_revision=? WHERE id=? AND status IN ('rejected','unknown')").run(at,c.revision,id);if(!r.changes)return {sent:false,reason:'already_claimed'};}
  else {const r=sql.prepare("INSERT OR IGNORE INTO reminder_outbox(id,date,stage,status,created_at,updated_at,config_revision) VALUES(?,?,?,'sending',?,?,?)").run(id,plan.date,test?'test':String(plan.stage.day),at,at,c.revision);if(!r.changes)return {sent:false,reason:'already_recorded'};}
  const body=reminderCard(plan,base,{atAll:test?false:c.atAll,test});if(c.signSecret){const timestamp=String(Math.floor(clock().getTime()/1000));Object.assign(body,{timestamp,sign:webhookSign(c.signSecret,timestamp)});}
  let state='unknown',errorCode=null;
  try{const response=await transport(c.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});const result=await response.json();
   const code=result.code??result.StatusCode;if(response.ok&&code===0)state='sent';else if(typeof code==='number'&&code!==0){state='rejected';errorCode=String(code);}else errorCode='HTTP_'+response.status;
  }catch{errorCode='NETWORK_OR_RESPONSE_UNCERTAIN';}
  sql.prepare('UPDATE reminder_outbox SET status=?,updated_at=?,error_code=? WHERE id=?').run(state,clock().toISOString(),errorCode,id);
  return {sent:state==='sent',status:state,errorCode};
 }
 async function tick(calendar={},date=clock()){
  stale();const c=load();if(!c.enabled||!c.webhook||demo)return {sent:false,reason:'not_enabled'};const plan=reminderPlan(calendar,date,c.hour);if(!plan.eligible)return {sent:false,reason:'outside_schedule'};
  return deliver('monthly:'+plan.date,plan);
 }
 async function test(calendar={}){
  const recent=sql.prepare("SELECT created_at FROM reminder_outbox WHERE stage='test' ORDER BY created_at DESC LIMIT 1").get();ensure(!recent||clock().getTime()-Date.parse(recent.created_at)>=60000,'测试卡片每分钟最多发送一次',429);
  const plan=reminderPlan(calendar,clock(),9);plan.stage=REMINDER_STAGES[0];return deliver('test:'+randomUUID(),plan,true);
 }
 async function retry(id,calendar={},confirmed=false){stale();const row=sql.prepare('SELECT * FROM reminder_outbox WHERE id=?').get(id);ensure(row&&row.stage!=='test','记录不存在或为测试消息',404);ensure(row.status!=='unknown'||confirmed,'发送结果不确定，请先核对群消息并确认未收到',409);const plan=reminderPlan(calendar,clock(),load().hour);ensure(plan.stage&&plan.date===row.date,'只能重发当天工作日提醒',409);return deliver(id,plan,false,true);}
 return {status,save,tick,test,retry};
}
