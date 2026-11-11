import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {emptyState,demoState,mutate,view,readStore,writeStore,api} from '../lib/performance.mjs';
import {FORM_TEMPLATE} from '../lib/form-engine.mjs';
import {taskSelfComplete} from '../lib/task-self.mjs';
import {employeeTodo} from '../lib/employee-todos.mjs';
import {cycleProgress,cyclePendingFor} from '../lib/cycle-progress.mjs';
import {cycleReporting} from '../local/cycle-reporting.mjs';
import {applicationMessaging} from '../local/application-messaging.mjs';
import {adapters} from '../local/adapter.mjs';
const vals=(items,n)=>Object.fromEntries(items.map(i=>[i.key,n]));
function fixture(){
 const s=emptyState();s.people=demoState().people;for(const p of s.people)p.feishuOpenId='ou_'+p.id;
 const f={s,...Object.fromEntries(s.people.map(p=>[p.id,p]))};mutate(s,f.chen,'openCycle',{month:'2026-11'});f.c=s.cycles[0];f.a=s.assessments.find(a=>a.employeeId==='lin');
 for(const [i,weight]of [60,40].entries())mutate(s,f.lin,'createTask',{assessmentId:f.a.id,title:'原表工作事项'+i,objective:'O1',description:'工作事项描述',standard:'交付物标准',due:'2026-11-30',weight,cross:false});
 f.tasks=s.tasks.filter(t=>t.assessmentId===f.a.id);return f;
}
function save(f,n=0){for(const t of f.tasks)mutate(f.s,f.lin,'saveTaskSelf',{id:t.id,result:'PRIVATE_SUMMARY_NOT_IN_CARD',timeliness:n,quality:n,remark:''});}
function cases(f){mutate(f.s,f.lin,'saveQualityCases',{id:f.a.id,cases:vals(FORM_TEMPLATE.quality,'原表中的当月典型事例')});}
function ready(f){save(f);cases(f);}
test('总结与自评保存为可修改草稿，整月一次提交即可进入评分，无需附件或逐项成果提交',()=>{
 const f=fixture();ready(f);assert(f.tasks.every(t=>t.status==='planned'&&taskSelfComplete(t)&&t.attachments.length===0));assert.equal((f.s.notificationEvents||[]).length,0);mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});assert.equal(f.a.monthlySubmission.status,'submitted');assert(f.tasks.every(t=>t.status==='submitted'&&t.submissionVersion===1));assert.equal(f.s.notificationEvents.filter(e=>e.kind==='manager_submission').length,1);mutate(f.s,f.zhou,'scoreTask',{id:f.tasks[0].id,timeliness:8,quality:9,comment:'依据员工总结评分'});assert.equal(f.tasks[0].status,'accepted');assert(f.tasks.every(t=>t.reviews.length===0));
});
test('原表必填项仍校验：缺总结、缺自评或缺典型事例不能整月提交，有效0分可以',()=>{
 const f=fixture();assert.throws(()=>mutate(f.s,f.lin,'submitAssessment',{id:f.a.id}),/员工总结/);assert.throws(()=>mutate(f.s,f.lin,'saveTaskSelf',{id:f.tasks[0].id,result:'',timeliness:0,quality:0}),/完整说明/);save(f);assert.throws(()=>mutate(f.s,f.lin,'submitAssessment',{id:f.a.id}),/典型事例/);cases(f);f.tasks[0].selfEvaluation.quality=null;assert.throws(()=>mutate(f.s,f.lin,'submitAssessment',{id:f.a.id}),/员工总结/);f.tasks[0].selfEvaluation.quality=0;mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});assert.equal(f.a.monthlySubmission.status,'submitted');assert.equal(f.tasks[0].selfEvaluation.quality,0);
});
test('保存草稿不影响上级正式分，旧成果提交入口拒绝当前月度考核且不改变状态',()=>{
 const f=fixture();assert.throws(()=>mutate(f.s,f.lin,'submit',{id:f.tasks[0].id,result:'旧客户端',selfTimeliness:10,selfQuality:10}),/逐项成果提交已取消/);assert.equal(f.tasks[0].status,'planned');assert.throws(()=>mutate(f.s,f.xu,'saveTaskSelf',{id:f.tasks[0].id,result:'代填',timeliness:10,quality:10}),/本人/);ready(f);assert.equal(f.tasks[0].managerEvaluation,undefined);assert.throws(()=>mutate(f.s,f.zhou,'scoreTask',{id:f.tasks[0].id,timeliness:10,quality:10,comment:'尚未整月提交'}),/整月绩效/);
});
test('总结自评完整后待办直接指向整月提交，进度清单不会再等待逐项成果提交',()=>{
 const f=fixture();assert.equal(employeeTodo(f.a,f.tasks,f.lin).stage,'tasks');save(f);assert.equal(employeeTodo(f.a,f.tasks,f.lin).stage,'cases');cases(f);assert.equal(employeeTodo(f.a,f.tasks,f.lin).stage,'submit');let pending=cyclePendingFor(cycleProgress(f.s,f.c.id),'lin').filter(i=>i.assessmentId===f.a.id);assert.equal(pending.length,1);assert.equal(pending[0].key,'monthly_submit');mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});pending=cyclePendingFor(cycleProgress(f.s,f.c.id),'lin').filter(i=>i.assessmentId===f.a.id);assert.equal(pending.length,0);assert(cyclePendingFor(cycleProgress(f.s,f.c.id),'zhou').some(i=>i.key.startsWith('task_score:')));
});
test('整月提交后锁定总结，退回后可直接修改，再次整月提交刷新评分轮次并保留旧评分',()=>{
 const f=fixture();ready(f);mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});mutate(f.s,f.zhou,'scoreTask',{id:f.tasks[0].id,timeliness:8,quality:9,comment:'第一轮评分'});mutate(f.s,f.zhou,'scoreQuality',{id:f.a.id,kind:'manager',values:vals(FORM_TEMPLATE.quality,8),comment:'第一轮素质评分'});assert.throws(()=>save(f),/提交后须由上级退回/);const first=f.a.monthlySubmission.id;mutate(f.s,f.zhou,'returnAssessment',{id:f.a.id,reason:'请修正员工总结'});assert(f.tasks.every(t=>t.status==='returned'));assert.equal(f.tasks[0].managerEvaluation,null);assert.equal(f.tasks[0].evaluationHistory[0].managerEvaluation.quality,9);assert.equal(f.a.qualityEvaluationHistory[0].evaluations.manager.values.q1,8);assert.equal(view(f.s,f.lin,false).assessments.find(a=>a.id===f.a.id).qualityEvaluationHistory,undefined);save(f,6);mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});assert.notEqual(f.a.monthlySubmission.id,first);assert(f.tasks.every(t=>t.status==='submitted'&&t.submissionVersion===2));assert.deepEqual(f.a.qualityEvaluations,{});
});
test('首次工作日提醒自动发送填表入口，不以管理员确认分发、批准方案或确认日历为前提',()=>{
 const f=fixture(),sql=new DatabaseSync(':memory:');try{assert.equal(f.c.calendarConfirmed,false);assert.equal(f.c.ruleId,null);const reporting=cycleReporting(sql,{clock:()=>new Date('2026-12-01T01:00:00Z')}),messages=reporting.scheduled(f.s);for(const a of f.s.assessments)assert(messages.some(e=>e.kind==='monthly'&&e.recipientId===a.employeeId&&e.page==='mine'));assert(!messages.some(e=>e.kind==='cycle_digest'));const evening=cycleReporting(sql,{clock:()=>new Date('2026-12-01T09:00:00Z')});assert(evening.adminScheduled(f.s).some(e=>e.kind==='cycle_digest'&&e.recipientId==='chen'));f.c.remindersEnabled=false;assert.equal(reporting.scheduled(f.s).length,0);}finally{sql.close();}
});
test('当前月度表单禁止上传新成果文件，仍可按权限读取历史已存在附件',async()=>{
 const f=fixture(),env=await adapters(resolve('work/form-only-files-'+crypto.randomUUID()));try{const row=await readStore(env.DB,'company',false);await writeStore(env.DB,'company',row.revision,f.s);const r=await api(new Request('https://example.test/api/upload?taskId='+f.tasks[0].id,{method:'POST',headers:{'x-file-name':'upload.txt'},body:'not needed'}),env,{key:'company',userId:'lin',demo:true});assert.equal(r.status,409);assert.match((await r.json()).error,/不需要上传成果/);assert.equal((await readStore(env.DB,'company',false)).state.tasks[0].attachments.length,0);}finally{env.sql.close();}
});
test('真实API路径从已保存总结直接提交整月绩效，核对飞书上级并向三位当前评分人发卡片',async()=>{
 const f=fixture();ready(f);mutate(f.s,f.chen,'assignMonthlyCollaboration',{assessmentIds:[f.a.id],reviewerIds:['xu','he']});const env=await adapters(resolve('work/form-only-api-'+crypto.randomUUID())),calls=[],lookups=[];try{const row=await readStore(env.DB,'company',false);await writeStore(env.DB,'company',row.revision,f.s);const service=applicationMessaging(env.sql,{env,base:'https://example.test/performance',appId:'test-app',clock:()=>new Date('2026-11-11T02:00:00Z'),client:{async user(id){lookups.push(id);const p=f.s.people.find(p=>p.feishuOpenId===id);return {open_id:id,name:p.name,leader_user_id:p.managerId?'ou_'+p.managerId:null,status:{is_resigned:false}};},async send(id,card){calls.push({id,card});return 'test-message-'+calls.length;}}});env.APP_MESSAGING={...service,kick(){}};const current=await readStore(env.DB,'company',false),r=await api(new Request('https://example.test/api/submitAssessment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:current.revision,id:f.a.id})}),env,{key:'company',userId:'lin',demo:false});assert.equal(r.status,200);await service.flush();assert.deepEqual(lookups,['ou_lin','ou_zhou']);assert.deepEqual(calls.map(x=>x.id).sort(),['ou_he','ou_xu','ou_zhou']);assert(!JSON.stringify(calls).includes('PRIVATE_SUMMARY_NOT_IN_CARD'));const after=(await readStore(env.DB,'company',false)).state;assert(after.tasks.filter(t=>t.assessmentId===f.a.id).every(t=>t.status==='submitted'));assert.equal(after.assessments.find(a=>a.id===f.a.id).managerId,'zhou');}finally{env.sql.close();}
});
test('飞书直属上级读取失败时，整月API不会提前转换任务状态或排队评分通知',async()=>{
 const f=fixture();ready(f);const env=await adapters(resolve('work/form-only-failure-'+crypto.randomUUID()));try{const row=await readStore(env.DB,'company',false);await writeStore(env.DB,'company',row.revision,f.s);const service=applicationMessaging(env.sql,{env,base:'https://example.test',client:{async user(){return {open_id:'ou_lin',leader_user_id:null,status:{is_resigned:false}};}}});env.APP_MESSAGING={...service,kick(){}};const current=await readStore(env.DB,'company',false),r=await api(new Request('https://example.test/api/submitAssessment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:current.revision,id:f.a.id})}),env,{key:'company',userId:'lin',demo:false});assert.equal(r.status,409);const after=(await readStore(env.DB,'company',false)).state;assert(after.tasks.every(t=>t.status==='planned'));assert.equal(after.assessments.find(a=>a.id===f.a.id).monthlySubmission,undefined);assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM app_message_outbox').get().n,0);}finally{env.sql.close();}
});
