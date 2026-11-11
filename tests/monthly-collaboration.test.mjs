import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {emptyState,demoState,mutate,view,canSee,actorFor,readStore,writeStore,api} from '../lib/performance.mjs';
import {FORM_TEMPLATE,formPreview} from '../lib/form-engine.mjs';
import {monthlyCollaborationResult,currentMonthlyEvaluation} from '../lib/monthly-collaboration.mjs';
import {eventCurrent,appMessageCard} from '../lib/app-events.mjs';
import {cycleProgress,cyclePendingFor} from '../lib/cycle-progress.mjs';
import {cycleReporting} from '../local/cycle-reporting.mjs';
import {adapters} from '../local/adapter.mjs';
import {formSheets} from '../lib/form-export.mjs';
import {workbookBytes} from '../lib/exports.mjs';
const values=(items,n)=>Object.fromEntries(items.map(i=>[i.key,n]));
function fixture(){
 const s=emptyState();s.people=demoState().people;
 s.people.push({id:'hr',name:'HRBP测试',dept:'人力资源部',roles:['hrbp'],active:true},{id:'otherhr',name:'其他HRBP',dept:'人力资源部',roles:['hrbp'],active:true},{id:'wang',name:'第三评分人',dept:'财务部',roles:[],active:true});
 s.people.find(p=>p.id==='lin').hrbpId='hr';s.people.find(p=>p.id==='he').hrbpId='otherhr';
 const f={s,...Object.fromEntries(s.people.map(p=>[p.id,p]))};
 mutate(s,f.chen,'openCycle',{month:'2026-11'});f.c=s.cycles[0];f.a=s.assessments.find(a=>a.employeeId==='lin');
 for(const [i,weight]of [60,40].entries())mutate(s,f.lin,'createTask',{assessmentId:f.a.id,title:'月度工作'+i,objective:'O1',description:'本月工作任务描述',standard:'明确交付成果与记录',due:'2026-11-30',weight,cross:false});
 f.tasks=s.tasks.filter(t=>t.assessmentId===f.a.id);mutate(s,f.zhou,'approveGoals',{id:f.a.id});mutate(s,f.lin,'confirmGoals',{id:f.a.id});return f;
}
function assign(f,ids=['xu','he'],extra={}){mutate(f.s,f.hr,'assignMonthlyCollaboration',{assessmentIds:[f.a.id],reviewerIds:ids,...extra});}
function submit(f){for(const t of f.tasks)if(['planned','returned'].includes(t.status))mutate(f.s,f.lin,'submit',{id:t.id,result:'完整月度成果与交付说明',selfTimeliness:10,selfQuality:10});mutate(f.s,f.lin,'saveQualityCases',{id:f.a.id,cases:values(FORM_TEMPLATE.quality,'本月具体工作事例')});mutate(f.s,f.lin,'submitAssessment',{id:f.a.id});}
function rate(f,who,n=8,extra={}){mutate(f.s,f[who],'scoreMonthlyCollaboration',{id:f.a.id,values:values(FORM_TEMPLATE.collaboration,n),comment:'当月整体协作的评价依据',assignmentVersion:f.a.collaborationAssignmentVersion,submissionId:f.a.monthlySubmission?.id,...extra});}
function bind(f){mutate(f.s,f.chen,'saveFormRule',{name:'月度测试规则',approvalReference:'仅自动测试虚构数据',weights:{...FORM_TEMPLATE.referenceWeights},qualityScorer:'manager_hrbp',bonusEnabled:false,confirmed:true,crossAggregation:'task_weight',noCross:'okr_only',collaborationScorer:'manager'});const rule=f.s.rules.at(-1);mutate(f.s,f.chen,'bindRule',{cycleId:f.c.id,ruleId:rule.id});mutate(f.s,f.chen,'confirmCalendar',{cycleId:f.c.id});return rule;}
function grade(f,n=8,q=8){for(const t of f.tasks)mutate(f.s,f.zhou,'scoreTask',{id:t.id,timeliness:n,quality:n,comment:'按交付标准直接评分'});for(const kind of ['manager','hrbp'])mutate(f.s,kind==='manager'?f.zhou:f.hr,'scoreQuality',{id:f.a.id,kind,values:values(FORM_TEMPLATE.quality,q),comment:'典型事例评价依据'});}

test('新月份采用独立月度跨部门评分，员工无需另填跨部门任务即可提交',()=>{
 const f=fixture();assert.equal(f.a.collaborationMode,'monthly');assert(f.tasks.every(t=>!t.cross));assert.throws(()=>mutate(f.s,f.lin,'createTask',{assessmentId:f.a.id,cross:true}),/取消跨部门任务/);submit(f);assert.equal(f.a.monthlySubmission.status,'submitted');assert.equal(f.s.notificationEvents.filter(e=>e.kind==='manager_submission').length,1);assert.equal(f.s.notificationEvents.filter(e=>e.kind==='monthly_collaboration').length,0);
 const rule=bind(f);assert.equal(rule.collaborationMode,'monthly');assert.equal(rule.collaborationScorer,'reviewers');assert.equal(rule.collaborationReviewerCount,2);assert(!('noCross'in rule));assert(!('crossAggregation'in rule));assert(formPreview(f.s,f.a,rule).blockers.some(x=>x.includes('两位月度')));
});
test('HRBP只能给负责员工指定两位有效异部门评分人，批量越权不会部分写入',()=>{
 const f=fixture();const call=(actor,reviewerIds,assessmentIds=[f.a.id])=>mutate(f.s,actor,'assignMonthlyCollaboration',{assessmentIds,reviewerIds});
 for(const ids of [[],['xu'],['xu','xu'],['xu','he','wang']])assert.throws(()=>call(f.hr,ids),/两位/);
 assert.throws(()=>call(f.hr,['lin','xu']),/本人/);assert.throws(()=>call(f.hr,['zhou','xu']),/部门之外/);assert.throws(()=>call(f.hr,['missing','xu']),/不存在/);
 f.wang.active=false;assert.throws(()=>call(f.hr,['wang','xu']),/停用/);assert.throws(()=>call(f.zhou,['xu','he']),/HRBP/);
 const other=f.s.assessments.find(a=>a.employeeId==='he');assert.throws(()=>call(f.hr,['xu','chen'],[f.a.id,other.id]),/HRBP/);assert.deepEqual(f.a.collaborationReviewerIds,[]);assign(f);assert.deepEqual(f.a.collaborationReviewerIds,['xu','he']);
});
test('月度评分人只在整月提交后获得材料权限，旧任务分派不再授权',()=>{
 const f=fixture();assign(f);f.tasks[0].reviewerIds=['wang'];assert.equal(canSee(f.xu,f.a,f.s),false);assert.equal(canSee(f.wang,f.a,f.s),false);assert.equal(view(f.s,f.xu,false).tasks.length,0);submit(f);assert(canSee(f.xu,f.a,f.s));assert.equal(view(f.s,f.xu,false).tasks.length,2);assert.equal(canSee(f.wang,f.a,f.s),false);
 mutate(f.s,f.zhou,'returnAssessment',{id:f.a.id,reason:'补充月度材料'});assert.equal(canSee(f.xu,f.a,f.s),false);assert.equal(view(f.s,f.xu,false).tasks.length,0);
});
test('旧逐项验收及任务协作评分接口不能继续写入新考核',()=>{
 const f=fixture();submit(f);assert.throws(()=>mutate(f.s,f.hr,'assign',{ids:[f.tasks[0].id],reviewerIds:['xu','he']}),/按员工分派/);assert.throws(()=>mutate(f.s,f.zhou,'review',{id:f.tasks[0].id,decision:'accepted',comment:'旧接口'}),/无需单独任务验收/);assert.throws(()=>mutate(f.s,f.xu,'scoreCollaboration',{id:f.tasks[0].id,values:values(FORM_TEMPLATE.collaboration,10)}),/独立的月度/);
});
test('直属上级在整月提交后直接评分，无需额外逐项验收',()=>{
 const f=fixture();const body={id:f.tasks[0].id,timeliness:8,quality:10,comment:'上级直接评分'};assert.throws(()=>mutate(f.s,f.zhou,'scoreTask',body),/整月绩效/);submit(f);assert.throws(()=>mutate(f.s,f.xu,'scoreTask',body),/直属上级/);mutate(f.s,f.zhou,'scoreTask',body);assert.equal(f.tasks[0].status,'accepted');assert.equal(f.tasks[0].managerEvaluation.quality,10);assert.equal(f.tasks[0].reviews.length,0);
});
test('五项各20%，两位逐维平均；缺评不是0，员工自评不计入正式分',()=>{
 const f=fixture();assign(f);submit(f);const rule=bind(f);grade(f);rate(f,'xu',8,{values:{c1:4,c2:6,c3:8,c4:10,c5:2}});assert.equal(monthlyCollaborationResult(f.a).score,null);rate(f,'he',8,{values:{c1:10,c2:8,c3:6,c4:4,c5:10}});const result=monthlyCollaborationResult(f.a);assert.deepEqual(result.values,{c1:7,c2:7,c3:7,c4:7,c5:6});assert(Math.abs(result.score-6.8)<1e-9);const p=formPreview(f.s,f.a,rule);assert.equal(p.collaboration,6.8);assert.equal(p.okr,8);assert.equal(p.work,76.4);assert.equal(p.quality,80);assert.equal(p.finalScore,77.48);assert.equal(p.grade,'合格');assert(p.ready);f.tasks[0].selfEvaluation.timeliness=0;assert.equal(formPreview(f.s,f.a,rule).finalScore,77.48);
});
test('月度0分有效，空值、缺维度、非指定人员以及旧轮次均不能评分',()=>{
 const f=fixture();assign(f);assert.throws(()=>rate(f,'xu'),/等待员工/);submit(f);assert.throws(()=>rate(f,'wang'),/指定/);assert.throws(()=>rate(f,'lin'),/指定/);assert.throws(()=>rate(f,'xu',8,{values:{c1:8}}),/0—10/);assert.throws(()=>rate(f,'xu',8,{values:values(FORM_TEMPLATE.collaboration,'')}),/0—10/);assert.throws(()=>rate(f,'xu',8,{assignmentVersion:0}),/轮次/);rate(f,'xu',0);rate(f,'he',0);assert.equal(monthlyCollaborationResult(f.a).score,0);
});
test('数字评分草稿隔离，跨部门评分人只见自己的五项，普通员工不见他人评分',()=>{
 const f=fixture();assign(f);submit(f);grade(f);rate(f,'xu',6);rate(f,'he',10);const r=view(f.s,f.xu,false),a=r.assessments.find(a=>a.id===f.a.id);assert.deepEqual(Object.keys(a.monthlyCollaborationEvaluations),['xu']);assert.equal(a.qualityEvaluations,undefined);assert.equal(a.collaborationAssignmentHistory,undefined);assert(r.tasks.every(t=>!t.managerEvaluation&&!t.selfEvaluation));const own=view(f.s,f.lin,false).assessments.find(a=>a.id===f.a.id);assert.deepEqual(own.monthlyCollaborationEvaluations,{});assert.deepEqual(own.qualityEvaluations,{});assert(!view(f.s,f.lin,false).audit.some(e=>e.action==='scoreMonthlyCollaboration'));
});
test('提交后分派发送两张整月评分卡片，改派保留历史并使旧卡片失效',()=>{
 const f=fixture();submit(f);assign(f);const events=f.s.notificationEvents.filter(e=>e.kind==='monthly_collaboration');assert.equal(events.length,2);assert(events.every(e=>eventCurrent(f.s,e)));const card=appMessageCard(f.s,events[0],'https://example.com/performance/'),url=new URL(card.elements[1].actions[0].url);assert.equal(url.searchParams.get('collaborationAssessmentId'),f.a.id);assert.equal(url.searchParams.get('taskId'),null);assert.match(card.elements[0].text.content,/当月整体协作/);
 rate(f,'xu');const oldVersion=f.a.collaborationAssignmentVersion;assert.throws(()=>assign(f,['xu','wang']),/完整说明/);assign(f,['xu','wang'],{reason:'实际协作关系调整'});assert.equal(f.a.collaborationAssignmentHistory[0].evaluations.xu.values.c1,8);assert.equal(f.a.collaborationAssignmentVersion,oldVersion+1);assert.equal(currentMonthlyEvaluation(f.a,'xu'),null);assert(events.every(e=>!eventCurrent(f.s,e)));assert.equal(canSee(f.he,f.a,f.s),false);assert.throws(()=>rate(f,'xu',9,{assignmentVersion:oldVersion}),/轮次/);assert.equal(f.s.notificationEvents.filter(e=>e.kind==='monthly_collaboration'&&eventCurrent(f.s,e)).length,2);
});
test('重选相同两人不撤回评分，重新提交及撤回评分会生成新轮次卡片',()=>{
 const f=fixture();assign(f);submit(f);rate(f,'xu');const firstSubmission=f.a.monthlySubmission.id,version=f.a.collaborationAssignmentVersion;assign(f,['he','xu']);assert(currentMonthlyEvaluation(f.a,'xu'));assert.equal(f.a.collaborationAssignmentVersion,version);mutate(f.s,f.zhou,'returnAssessment',{id:f.a.id,reason:'补充材料'});submit(f);assert.notEqual(f.a.monthlySubmission.id,firstSubmission);assert.equal(currentMonthlyEvaluation(f.a,'xu'),null);assert(f.a.collaborationAssignmentHistory[0].evaluations.xu);rate(f,'xu');mutate(f.s,f.zhou,'clearScores',{id:f.a.id,reason:'重新核对评分依据'});assert.equal(currentMonthlyEvaluation(f.a,'xu'),null);assert.equal(f.a.collaborationAssignmentVersion,version+1);assert.equal(f.s.notificationEvents.filter(e=>e.kind==='monthly_collaboration'&&eventCurrent(f.s,e)).length,2);
});
test('进度清单分别跟踪HRBP分派、主管评分及未完成的月度评分人',()=>{
 const f=fixture();f.s.assessments=[f.a];let report=cycleProgress(f.s,f.c.id);assert(cyclePendingFor(report,'hr').some(i=>i.key==='monthly_assign'));submit(f);assign(f);rate(f,'xu');report=cycleProgress(f.s,f.c.id);assert(cyclePendingFor(report,'zhou').some(i=>i.key.startsWith('task_score:')));assert.equal(cyclePendingFor(report,'he').filter(i=>i.key==='monthly_collaboration').length,1);assert.equal(cyclePendingFor(report,'xu').length,0);assert(!report.rows[0].pending.some(i=>i.key.startsWith('accept:')));grade(f);rate(f,'he');bind(f);assert.equal(cycleProgress(f.s,f.c.id).phase,'scored');
});
test('截止期提醒包含月度分派与评分，HRBP专用卡片直达分派页面',()=>{
 const f=fixture();f.s.assessments=[f.a];const sql=new DatabaseSync(':memory:');try{const reports=cycleReporting(sql,{clock:()=>new Date('2026-12-01T01:30:00Z')});let reminders=reports.scheduled(f.s),hr=reminders.find(e=>e.recipientId==='hr');assert.equal(hr.page,'assign');const digest=reminders.find(e=>e.kind==='cycle_digest');assert.match(appMessageCard(f.s,digest,'https://example.com/performance/').elements[0].text.content,/未完成/);submit(f);assign(f);rate(f,'xu');reminders=reports.scheduled(f.s);assert(reminders.some(e=>e.recipientId==='he'));assert(!reminders.some(e=>e.recipientId==='xu'));}finally{sql.close();}
});
test('独立月度评分保留五档及模块门槛，核心63不合格、72最多待改进',()=>{
 const f=fixture();assign(f);submit(f);rate(f,'xu',10);rate(f,'he',10);const rule=bind(f);grade(f,10,6.3);let p=formPreview(f.s,f.a,rule);assert.equal(p.finalScore,88.9);assert.equal(p.grade,'不合格');grade(f,10,7.2);p=formPreview(f.s,f.a,rule);assert.equal(p.finalScore,91.6);assert.equal(p.grade,'待改进');grade(f,9,8);rate(f,'xu',9);rate(f,'he',9);assert.equal(formPreview(f.s,f.a,rule).grade,'良好');
});
test('发布及归档固定月度两人五项评分，导出无跨部门任务汇总选项',async()=>{
 const f=fixture();assign(f);submit(f);grade(f);rate(f,'xu',6);rate(f,'he',10);bind(f);mutate(f.s,f.chen,'publish',{id:f.a.id});mutate(f.s,f.chen,'archive',{id:f.a.id});const ar=f.s.archives[0],sheets=formSheets(ar),monthly=sheets.find(([name])=>name==='月度跨部门评分');assert(monthly);assert.equal(monthly[1].length,4);assert.equal(monthly[1][3][8],8);assert(!sheets.some(([name])=>name==='协作五项评价'));assert(ar.snapshot.people.some(p=>p.id==='xu'));assert(ar.snapshot.people.some(p=>p.id==='he'));const frozen=JSON.stringify(ar);f.s.people.find(p=>p.id==='xu').name='改名';assert.equal(JSON.stringify(ar),frozen);assert(!JSON.stringify(sheets).includes('无协作处理'));await mkdir('work/monthly-export-qa',{recursive:true});await writeFile('work/monthly-export-qa/archive.xlsx',workbookBytes(ar));
});
test('附件下载遵循月度分派与提交状态，改派和退回立即撤销访问',async()=>{
 const f=fixture(),env=await adapters(resolve('work/monthly-files-'+Date.now()));assign(f);try{const initial=await readStore(env.DB,'monthly-files',false);await writeStore(env.DB,'monthly-files',initial.revision,f.s);const identity=userId=>({key:'monthly-files',userId,demo:true}),upload=await api(new Request('http://localhost/api/upload?taskId='+f.tasks[0].id,{method:'POST',headers:{'x-file-name':encodeURIComponent('月度成果.txt')},body:'monthly evidence'}),env,identity('lin'));assert.equal(upload.status,200);let row=await readStore(env.DB,'monthly-files',false);const file=row.state.tasks[0].attachments[0],get=()=>api(new Request('http://localhost/api/file/'+file.id),env,identity('xu'));assert.equal((await get()).status,403);const live={...f,s:row.state,a:row.state.assessments.find(a=>a.id===f.a.id),tasks:row.state.tasks.filter(t=>t.assessmentId===f.a.id)};submit(live);await writeStore(env.DB,'monthly-files',row.revision,live.s);assert.equal(await(await get()).text(),'monthly evidence');row=await readStore(env.DB,'monthly-files',false);mutate(row.state,f.hr,'assignMonthlyCollaboration',{assessmentIds:[f.a.id],reviewerIds:['he','wang'],reason:'实际协作关系调整'});await writeStore(env.DB,'monthly-files',row.revision,row.state);assert.equal((await get()).status,403);}finally{env.sql.close();}
});
