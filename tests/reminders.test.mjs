import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {firstWorkdays,previousMonth,reminderPlan,reminderCard} from '../lib/reminder-plan.mjs';
import {safeReturnTo} from '../lib/app-path.mjs';
import {groupReminders,validWebhook,webhookSign} from '../local/group-reminders.mjs';
import {adapters} from '../local/adapter.mjs';
import {api,readStore,writeStore,demoState} from '../lib/performance.mjs';
const url='https://open.feishu.cn/open-apis/bot/v2/hook/11111111-2222-3333-4444-555555555555';
const config={configRevision:0,groupName:'全员测试群',hour:9,enabled:true,atAll:true,webhook:url,signSecret:'test-signing-secret'};
function fixture(transport=async()=>Response.json({code:0}),extra={}){
 const sql=new DatabaseSync(':memory:');let date=new Date('2026-11-02T01:00:00Z');const options={keySecret:'test-only-master-key',base:'https://example.test/performance/',transport,clock:()=>date,...extra},service=groupReminders(sql,options);service.save({...config},'admin');return {sql,service,options,setDate:d=>date=new Date(d)};
}
test('前5个工作日覆盖节假日、调休周末，不能硬编码每月1—7日',()=>{
 assert.deepEqual(firstWorkdays('2026-11'),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);
 const calendar=Object.fromEntries(Array.from({length:8},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),false]));calendar['2026-10-10']=true;
 assert.deepEqual(firstWorkdays('2026-10',calendar),['2026-10-09','2026-10-10','2026-10-12','2026-10-13','2026-10-14']);
 assert.equal(previousMonth('2027-01'),'2026-12');
});
test('北京时间整点、前5工作日及晚间窗口外均不补发过期提醒',()=>{
 assert.equal(reminderPlan({},new Date('2026-11-02T00:59:59Z')).eligible,false);
 assert.equal(reminderPlan({},new Date('2026-11-02T01:00:00Z')).stage.day,1);
 assert.equal(reminderPlan({},new Date('2026-11-06T01:00:00Z')).stage.day,5);
 assert.equal(reminderPlan({},new Date('2026-11-02T10:00:00Z')).eligible,false);
 assert.equal(reminderPlan({},new Date('2026-11-07T01:00:00Z')).eligible,false);
 assert.equal(reminderPlan({},new Date('2026-11-09T01:00:00Z')).eligible,false);
 assert.equal(reminderPlan({},new Date('2026-12-31T16:00:00Z')).assessmentMonth,'2026-12');
});
test('群卡片只含流程事项与上月入口，测试不会@所有人',()=>{
 const p=reminderPlan({},new Date('2026-11-02T01:00:00Z')),card=reminderCard(p,'https://example.test/performance/',{atAll:true});
 assert(card.card.elements[0].text.content.includes('<at id=all>'));assert(card.card.elements[0].text.content.includes('2026-11-06'));
 const link=new URL(card.card.elements[1].actions[0].url);assert.equal(link.pathname,'/performance/');assert.equal(link.searchParams.get('month'),'2026-10');assert.equal(link.searchParams.get('page'),'mine');
 assert(!JSON.stringify(card).includes('employeeId'));
 assert(!JSON.stringify(reminderCard(p,'https://example.test/performance/',{atAll:false,test:true})).includes('<at id=all>'));
});
test('登录后返回上月页面，拒绝跨站跳转和非法月份参数',()=>{
 const safe=v=>safeReturnTo(v,'https://example.test','/performance');
 assert.equal(safe('/performance/?month=2026-10&page=mine'),'/performance/?month=2026-10&page=mine');
 for(const bad of ['//evil.test','https://evil.test/','/login','/performance/../login','/\\evil.test'])assert.equal(safe(bad),'/performance/');
 assert.equal(safe('/performance/?month=2026-99&page=settings&secret=discard'),'/performance/');
});
test('Webhook与签名加密保存，状态不回显，配置更新校验独立版本',()=>{
 const f=fixture();try{const raw=f.sql.prepare('SELECT payload FROM reminder_config').get().payload;
 assert(!raw.includes(url));assert(!raw.includes(config.signSecret));assert(!JSON.stringify(f.service.status()).includes(config.signSecret));assert(!JSON.stringify(f.service.status()).includes(url));
 assert.throws(()=>f.service.save(config,'admin'),/刷新/);
 assert.throws(()=>f.service.save({...config,configRevision:1,webhook:url.replace('11111111','99999999'),signSecret:''},'admin'),/更新签名/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM reminder_config_audit').get().n,1);
 }finally{f.sql.close();}
});
test('只向飞书官方Webhook发送，拒绝内网、带凭证、重定向和额外参数',()=>{
 for(const value of ['http://127.0.0.1/','https://evil.test/'+url,'https://user:pass@open.feishu.cn/open-apis/bot/v2/hook/1111111122222222',url+'?redirect=http://localhost',url+'#x',url.replace('cn/','cn:444/')])assert.throws(()=>validWebhook(value));
 assert.equal(validWebhook(url),url);
});
test('同一天并发触发与服务重启不会重复群发',async()=>{
 let calls=0,body;const f=fixture(async(u,opts)=>{calls++;body=JSON.parse(opts.body);assert.equal(opts.redirect,'error');return Response.json({code:0});});try{
 const results=await Promise.all([f.service.tick({}),f.service.tick({})]);assert.equal(calls,1);assert(results.some(x=>x.sent));
 const restarted=groupReminders(f.sql,f.options);assert.equal((await restarted.tick({})).sent,false);assert.equal(calls,1);assert.equal(body.timestamp,String(Date.parse('2026-11-02T01:00:00Z')/1000));assert(body.sign);
 assert.equal(f.service.status().delivery[0].status,'sent');
 }finally{f.sql.close();}
});
test('网络结果不确定不自动重试，确认群未收到才允许重发',async()=>{
 let calls=0;const f=fixture(async()=>{if(++calls===1)throw Error('network error includes secret endpoint');return Response.json({code:0});});try{
 assert.equal((await f.service.tick({})).status,'unknown');await f.service.tick({});assert.equal(calls,1);
 await assert.rejects(()=>f.service.retry('monthly:2026-11-02',{},false),/确认未收到/);
 assert.equal((await f.service.retry('monthly:2026-11-02',{},true)).sent,true);assert.equal(calls,2);
 assert(!JSON.stringify(f.service.status()).includes('secret endpoint'));
 }finally{f.sql.close();}
});
test('飞书明确拒绝会记录错误码，修复配置后可手工重试当天提醒',async()=>{
 let calls=0;const f=fixture(async()=>Response.json(++calls===1?{code:19021,msg:'sign fail'}:{code:0}));try{
 assert.equal((await f.service.tick({})).errorCode,'19021');await f.service.tick({});assert.equal(calls,1);
 assert.equal((await f.service.retry('monthly:2026-11-02',{})).sent,true);
 f.setDate('2026-11-03T01:00:00Z');await assert.rejects(()=>f.service.retry('monthly:2026-11-02',{}),/当天/);
 }finally{f.sql.close();}
});
test('进程在发送中退出后保留待核对状态，演示环境不会发真实群消息',async()=>{
 const f=fixture();try{f.sql.prepare("INSERT INTO reminder_outbox(id,date,stage,status,created_at,updated_at,config_revision) VALUES(?,?,?,'sending',?,?,1)").run('monthly:2026-11-02','2026-11-02','1','2026-11-02T00:50:00Z','2026-11-02T00:50:00Z');
 assert.equal((await f.service.tick({})).sent,false);assert.equal(f.service.status().delivery[0].status,'unknown');
 const demo=groupReminders(f.sql,{...f.options,demo:true});assert.equal((await demo.tick({})).sent,false);await assert.rejects(()=>demo.test({}),/演示环境/);
 }finally{f.sql.close();}
});
test('群提醒管理接口仅管理员可用，凭证不进入工作区快照',async()=>{
 const env=await adapters(resolve('work/reminder-api-'+Date.now()));try{const row=await readStore(env.DB,'company',false);await writeStore(env.DB,'company',row.revision,demoState({legacy:true}));const revision=1;
 env.REMINDERS=groupReminders(env.sql,{keySecret:'server-only-test',base:'https://example.test/performance',transport:async()=>Response.json({code:0})});
 const identity=id=>({key:'company',userId:id,demo:false});
 assert.equal((await api(new Request('https://example.test/api/notifications'),env,identity('lin'))).status,403);
 const req=new Request('https://example.test/api/notifications/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...config,revision})});
 assert.equal((await api(req,env,identity('chen'))).status,200);
 const publicState=await(await api(new Request('https://example.test/api/state'),env,identity('chen'))).text();assert(!publicState.includes(config.signSecret));assert(!publicState.includes(url));
 const configState=await(await api(new Request('https://example.test/api/notifications'),env,identity('chen'))).text();assert(!configState.includes(url));assert(!configState.includes(config.signSecret));
 const forged=new Request('https://example.test/api/notifications/test',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({revision})});assert.equal((await api(forged,env,identity('chen'))).status,403);
 }finally{env.sql.close();}
});

test('签名与独立HMAC参考值一致',()=>{assert.equal(webhookSign('test-signing-secret','1700000000'),'8+AD5scD8fIa8VJ+zWT5Bsd8iQwKT/D2d1mzhKogGP8=');});
