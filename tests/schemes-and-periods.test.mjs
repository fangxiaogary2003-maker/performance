import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {emptyState,demoState,mutate,view,api,readStore,writeStore,fifthWorkday} from '../lib/performance.mjs';
import {FORM_TEMPLATE} from '../lib/form-engine.mjs';
import {ruleAvailable} from '../lib/scheme-management.mjs';
import {shiftMonth,currentMonth,assessmentMonthNow,defaultCycleId,periodLabel,ensureCurrentPeriods} from '../lib/assessment-period.mjs';
import {cycleReminderWindow} from '../lib/cycle-progress.mjs';
import {cycleReporting} from '../local/cycle-reporting.mjs';
import {DatabaseSync} from 'node:sqlite';
import {adapters} from '../local/adapter.mjs';
function fixture(){const s=emptyState();s.people=demoState().people;const admin=s.people.find(p=>p.id==='chen'),employee=s.people.find(p=>p.id==='lin');mutate(s,admin,'openCycle',{month:'2026-11'});const fields={name:'测试方案',weights:{...FORM_TEMPLATE.referenceWeights},qualityScorer:'manager_hrbp',bonusEnabled:true,approvalReference:'仅自动测试的制度依据',confirmed:true};return {s,admin,employee,fields,c:s.cycles[0]};}
const saveDraft=f=>{mutate(f.s,f.admin,'saveFormRuleDraft',f.fields);return f.s.ruleDrafts.at(-1);};
const approve=(f,extra={})=>{mutate(f.s,f.admin,'saveFormRule',{...f.fields,...extra});return f.s.rules.at(-1);};
test('方案草稿保存和修改使用同一个ID，部分字段可暂存，批准后不能再原地修改',()=>{
 const f=fixture();mutate(f.s,f.admin,'saveFormRuleDraft',{name:'待补齐草稿'});const d=f.s.ruleDrafts[0];assert.equal(d.status,'draft');assert.equal(d.confirmed,false);mutate(f.s,f.admin,'saveFormRuleDraft',{...f.fields,draftId:d.id,name:'补全后的草稿'});assert.equal(f.s.ruleDrafts.length,1);assert.equal(d.name,'补全后的草稿');assert.equal(d.updatedBy,f.admin.id);const r=approve(f,{draftId:d.id});assert.equal(d.status,'approved');assert.equal(d.approvedRuleId,r.id);assert.throws(()=>mutate(f.s,f.admin,'saveFormRuleDraft',{...f.fields,draftId:d.id}),/已批准或删除/);assert.throws(()=>approve(f,{draftId:d.id}),/已批准或删除/);
});
test('复制批准方案为草稿，批准新版本保留原方案与月份绑定',()=>{
 const f=fixture(),r=approve(f);mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id});const original=JSON.stringify(r);mutate(f.s,f.admin,'copyRuleDraft',{ruleId:r.id});const d=f.s.ruleDrafts.at(-1);assert.equal(d.sourceRuleId,r.id);assert.equal(d.status,'draft');assert.equal(d.confirmed,false);const next=approve(f,{draftId:d.id,name:'调整权重后的方案',weights:{...f.fields.weights,work:60,quality:40}});assert.equal(next.version,2);assert.equal(next.familyId,r.id);assert.equal(next.previousRuleId,r.id);assert.equal(JSON.stringify(r),original);assert.equal(f.c.ruleId,r.id);assert.equal(next.weights.work,60);
});
test('修改新版本不能覆盖已评分月份；现有未评分月份可以显式切换方案',()=>{
 const f=fixture(),first=approve(f),second=approve(f,{name:'另一方案'});mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:first.id});mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:second.id});assert.equal(f.c.ruleId,second.id);f.s.assessments[0].monthlyCollaborationEvaluations={xu:{values:{c1:8}}};assert.throws(()=>mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:first.id}),/撤回评分/);assert.equal(f.c.ruleId,second.id);
});
test('停用方案不影响已有绑定与算分内容，禁止新月份绑定，重新启用可恢复',()=>{
 const f=fixture(),r=approve(f);mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id});mutate(f.s,f.admin,'setRuleAvailability',{ruleId:r.id,enabled:false});assert(!ruleAvailable(r));assert.equal(f.c.ruleId,r.id);assert.equal(r.weights.work,70);mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id});mutate(f.s,f.admin,'openCycle',{month:'2026-10'});const c=f.s.cycles.at(-1);assert.throws(()=>mutate(f.s,f.admin,'bindRule',{cycleId:c.id,ruleId:r.id}),/停用或删除/);mutate(f.s,f.admin,'setRuleAvailability',{ruleId:r.id,enabled:true});mutate(f.s,f.admin,'bindRule',{cycleId:c.id,ruleId:r.id});assert(ruleAvailable(r));
});
test('仅未用方案可移入回收站，删除可恢复，已绑定和历史档案方案不能删除',()=>{
 const f=fixture(),r=approve(f);mutate(f.s,f.admin,'removeRule',{ruleId:r.id});assert(r.removedAt);assert(!ruleAvailable(r));assert.throws(()=>mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id}),/停用或删除/);assert.throws(()=>mutate(f.s,f.admin,'copyRuleDraft',{ruleId:r.id}),/先恢复/);mutate(f.s,f.admin,'restoreRule',{ruleId:r.id});assert(ruleAvailable(r));mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id});assert.throws(()=>mutate(f.s,f.admin,'removeRule',{ruleId:r.id}),/已绑定/);f.c.ruleId=null;f.s.archives.push({snapshot:{assessment:{ruleSnapshot:{id:r.id}}}});assert.throws(()=>mutate(f.s,f.admin,'removeRule',{ruleId:r.id}),/历史档案/);
});
test('删除草稿可恢复，回收站内容不能修改或批准，复制不覆盖原草稿',()=>{
 const f=fixture(),d=saveDraft(f);mutate(f.s,f.admin,'copyRuleDraft',{draftId:d.id});assert.equal(f.s.ruleDrafts.length,2);assert.notEqual(f.s.ruleDrafts[1].id,d.id);mutate(f.s,f.admin,'removeRuleDraft',{draftId:d.id});assert.equal(d.status,'deleted');assert.throws(()=>approve(f,{draftId:d.id}),/删除/);assert.throws(()=>mutate(f.s,f.admin,'saveFormRuleDraft',{...f.fields,draftId:d.id}),/删除/);mutate(f.s,f.admin,'restoreRuleDraft',{draftId:d.id});assert.equal(d.status,'draft');assert.equal(d.deletedAt,undefined);
});
test('方案管理全部写操作限管理员，草稿不能通过名称假装绑定生效',()=>{
 const f=fixture(),d=saveDraft(f),r=approve(f);for(const action of ['saveFormRuleDraft','saveFormRule','copyRuleDraft','setRuleAvailability','removeRule','restoreRule','removeRuleDraft','restoreRuleDraft'])assert.throws(()=>mutate(f.s,f.employee,action,{...f.fields,ruleId:r.id,draftId:d.id,enabled:false}),/管理员/);assert.throws(()=>mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:d.id}),/规则不存在/);assert.equal(f.c.ruleId,null);
});
test('批准与草稿对象的保留字段由服务端生成，不能伪造版本或批准身份',()=>{
 const f=fixture();mutate(f.s,f.admin,'saveFormRuleDraft',{...f.fields,id:'forged',status:'approved',approvedBy:'employee',sourceRuleId:'forged'});const d=f.s.ruleDrafts[0];assert.notEqual(d.id,'forged');assert.equal(d.status,'draft');assert.equal(d.sourceRuleId,undefined);const r=approve(f,{draftId:d.id,version:99,familyId:'forged',approvedBy:'employee'});assert.equal(r.version,1);assert.equal(r.familyId,r.id);assert.equal(r.approvedBy,f.admin.id);
});
test('方案API保持管理员隔离和工作区版本校验，管理页草稿可返回但员工看不到',async()=>{
 const f=fixture(),env=await adapters(resolve('work/schemes-test-'+Date.now()));try{let row=await readStore(env.DB,'schemes',false);await writeStore(env.DB,'schemes',row.revision,f.s);row=await readStore(env.DB,'schemes',false);const req=(action,body)=>new Request('https://example.test/api/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:row.revision,...body})}),actor=id=>({key:'schemes',userId:id,demo:false});assert.equal((await api(req('saveFormRuleDraft',f.fields),env,actor(f.employee.id))).status,403);assert.equal((await api(req('saveFormRuleDraft',f.fields),env,actor(f.admin.id))).status,200);assert.equal((await api(req('saveFormRuleDraft',f.fields),env,actor(f.admin.id))).status,409);const state=async who=>(await api(new Request('https://example.test/api/state'),env,actor(who))).json();assert.equal((await state(f.admin.id)).ruleDrafts.length,1);assert.equal((await state(f.employee.id)).ruleDrafts.length,0);}finally{env.sql.close();}
});
test('11月默认考核10月，1月考核上年12月，北京时间跨月边界正确',()=>{
 const now=new Date('2026-11-11T04:00:00Z');assert.equal(assessmentMonthNow(now),'2026-10');assert.equal(assessmentMonthNow(new Date('2027-01-01T00:00:00Z')),'2026-12');assert.equal(currentMonth(new Date('2026-10-31T16:00:00Z')),'2026-11');assert.equal(assessmentMonthNow(new Date('2026-10-31T15:59:59Z')),'2026-09');assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2027-01',-1),'2026-12');assert.equal(defaultCycleId([{id:'nov',month:'2026-11'},{id:'oct',month:'2026-10'}],now),'oct');assert.match(periodLabel('2026-10'),/2026年10月工作（11月填报）/);assert.match(periodLabel('2026-12'),/2027年1月填报/);
});
test('自动补齐上月与本月，保留既有考核和方案绑定，重复运行幂等',()=>{
 const f=fixture(),r=approve(f);mutate(f.s,f.admin,'bindRule',{cycleId:f.c.id,ruleId:r.id});const originalAssessments=JSON.stringify(f.s.assessments),originalCycle=JSON.stringify(f.c),originalRules=JSON.stringify(f.s.rules),now=new Date('2026-11-11T04:00:00Z'),open=b=>mutate(f.s,f.admin,'openCycle',b);assert(ensureCurrentPeriods(f.s,f.admin,open,now));const october=f.s.cycles.find(c=>c.month==='2026-10');assert.equal(october.remindersEnabled,false);assert.equal(october.due,'2026-11-06');assert.equal(fifthWorkday('2026-10'),'2026-11-06');assert.equal(october.ruleId,null);assert.equal(JSON.stringify(f.s.assessments.filter(a=>a.cycleId===f.c.id)),originalAssessments);assert.equal(JSON.stringify(f.c),originalCycle);assert.equal(JSON.stringify(f.s.rules),originalRules);const count=f.s.assessments.length;assert.equal(ensureCurrentPeriods(f.s,f.admin,open,now),false);assert.equal(f.s.assessments.length,count);assert.equal(defaultCycleId(f.s.cycles,now),october.id);
});
test('补建月份催办默认关闭，可由管理员开启，既有开启月份仍按原日期工作',()=>{
 const f=fixture(),now=new Date('2026-11-11T04:00:00Z');ensureCurrentPeriods(f.s,f.admin,b=>mutate(f.s,f.admin,'openCycle',b),now);const oct=f.s.cycles.find(c=>c.month==='2026-10');assert.equal(cycleReminderWindow(oct,{},now).eligible,false);assert.throws(()=>mutate(f.s,f.employee,'setCycleReminders',{cycleId:oct.id,enabled:true}),/管理员/);const sql=new DatabaseSync(':memory:');try{const reporting=cycleReporting(sql,{clock:()=>now});assert.equal(reporting.scheduled(f.s).length,0);mutate(f.s,f.admin,'setCycleReminders',{cycleId:oct.id,enabled:true});assert.equal(cycleReminderWindow(oct,{},now).eligible,true);assert(reporting.scheduled(f.s).some(e=>e.cycleId===oct.id));mutate(f.s,f.admin,'setCycleReminders',{cycleId:oct.id,enabled:false});assert.equal(reporting.scheduled(f.s).length,0);assert.equal(f.c.remindersEnabled,true);}finally{sql.close();}
});
test('管理方案入口仅管理员可见，默认工作月份由服务端返回给所有角色',()=>{
 const f=fixture();ensureCurrentPeriods(f.s,f.admin,b=>mutate(f.s,f.admin,'openCycle',b));const admin=view(f.s,f.admin,false),employee=view(f.s,f.employee,false);assert(admin.workspace.pages.includes('schemes'));assert(!employee.workspace.pages.includes('schemes'));assert.equal(admin.defaultCycleId,defaultCycleId(f.s.cycles));assert.equal(employee.defaultCycleId,admin.defaultCycleId);assert.equal(admin.version,'0.9.1');
});
