import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,mutate,view} from '../lib/performance.mjs';
import {FORM_TEMPLATE,newAssessment} from '../lib/form-engine.mjs';
import {applyHrbpRules} from '../lib/hrbp-routing.mjs';
import {applyAssessmentPauses} from '../lib/assessment-eligibility.mjs';
import {normalizedDirectory,mergeDirectory} from '../lib/feishu-directory.mjs';
import {monthlyRecipients,eventCurrent} from '../lib/app-events.mjs';

function fixture(){
 const s=emptyState();
 s.people=[
  {id:'admin',name:'测试管理员',dept:'IT',roles:['admin'],active:true},
  {id:'manager',name:'测试上级',dept:'总经办',departmentId:'office',departmentPathIds:['office'],roles:['manager'],active:true,feishuOpenId:'ou_manager'},
  {id:'yang',name:'杨青青',dept:'人力资源部',departmentId:'hr',departmentPathIds:['hr'],roles:['hrbp'],active:true,managerId:'manager',feishuOpenId:'ou_yang'},
  {id:'staff',name:'测试行政员工',dept:'行政组',departmentId:'admin_team',departmentPathIds:['admin_team','hr'],roles:[],active:true,managerId:'manager',feishuOpenId:'ou_staff'}
 ];
 s.hrbpRules=[{departmentId:'hr',departmentName:'人力资源部',hrbpId:'yang',allowSelfReview:true,source:'explicit_user_instruction'}];
 s.assessmentPauseRules=[{departmentId:'office',paused:true,reason:'总经办暂时搁置'}];
 applyHrbpRules(s);applyAssessmentPauses(s);
 return {s,admin:s.people[0],manager:s.people[1],yang:s.people[2],staff:s.people[3]};
}

test('明确的本人HRBP授权生成独立评分记录，上级评分仍由上级完成',()=>{
 const {s,admin,manager,yang}=fixture();mutate(s,admin,'openCycle',{month:'2026-11'});
 const a=s.assessments.find(a=>a.employeeId===yang.id);
 assert.equal(a.hrbpId,yang.id);assert.equal(a.hrbpSelfReviewAuthorized,true);assert.equal(a.hrbpAssignmentSnapshot.selfReviewAuthorized,true);
 const cases=Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,'测试用事例'])),values=Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,7]));
 mutate(s,yang,'saveQualityCases',{id:a.id,cases});mutate(s,yang,'scoreQuality',{id:a.id,kind:'hrbp',values,comment:'测试用HRBP角色评价'});
 assert.equal(a.qualityEvaluations.hrbp.actorId,yang.id);assert.equal(a.qualityEvaluations.manager,undefined);assert.deepEqual(a.qualityCases,cases);
 assert.throws(()=>mutate(s,yang,'scoreQuality',{id:a.id,kind:'manager',values,comment:'不可代上级评分'}),/评分人/);
 mutate(s,manager,'scoreQuality',{id:a.id,kind:'manager',values,comment:'测试用上级评价'});
 assert.equal(a.qualityEvaluations.manager.actorId,manager.id);assert.equal(a.qualityEvaluations.hrbp.actorId,yang.id);
 assert.equal(view(s,yang,false).assessments.find(x=>x.id===a.id).qualityEvaluations.hrbp.actorId,yang.id);
});

test('暂缓部门不生成本人考核，明确授权的本人HRBP正常入选且补单幂等',()=>{
 const {s,admin,yang,staff}=fixture();s.people.push({id:'missing',name:'待配置',active:true,roles:[],managerId:'manager'});
 mutate(s,admin,'openCycle',{month:'2026-11'});assert.deepEqual(s.assessments.map(a=>a.employeeId).sort(),[staff.id,yang.id].sort());
 const cycle=s.cycles[0];mutate(s,admin,'enrollCycle',{cycleId:cycle.id});assert.equal(s.assessments.length,2);
 const old=s.assessments.map(a=>JSON.stringify(a));s.hrbpRules[0].allowSelfReview=false;applyHrbpRules(s);mutate(s,admin,'openCycle',{month:'2026-12'});
 assert.deepEqual(s.assessments.filter(a=>a.cycleId!==cycle.id).map(a=>a.employeeId),[staff.id]);assert.deepEqual(s.assessments.filter(a=>a.cycleId===cycle.id).map(a=>JSON.stringify(a)),old);
});

test('总经办暂缓本人填报提醒，同时保留对直属员工的评分提醒',()=>{
 const {s,admin,manager,yang,staff}=fixture();mutate(s,admin,'openCycle',{month:'2026-11'});const cycle=s.cycles[0],a=s.assessments.find(a=>a.employeeId===staff.id);
 s.assessments.push(newAssessment({...manager,managerId:admin.id,hrbpId:yang.id},cycle.id));
 const plan=day=>({assessmentMonth:'2026-11',stage:{day}});
 assert(!monthlyRecipients(s,plan(1)).includes(manager.id));assert(monthlyRecipients(s,plan(3)).includes(manager.id));
 a.monthlySubmission={id:'submission',status:'submitted'};
 assert.equal(eventCurrent(s,{kind:'manager_submission',assessmentId:a.id,recipientId:manager.id,submissionId:'submission'}),true);
 const paused=s.assessments.find(a=>a.employeeId===manager.id);paused.monthlySubmission={id:'paused',status:'submitted'};
 assert.equal(eventCurrent(s,{kind:'manager_submission',assessmentId:paused.id,recipientId:admin.id,submissionId:'paused'}),false);
});

test('飞书再次同步保留部门暂缓和明确授权的本人HRBP',()=>{
 const {s,yang,manager,staff}=fixture();
 mergeDirectory(s,normalizedDirectory({departments:[{open_department_id:'hr',name:'人力资源部',parent_department_id:'0'},{open_department_id:'admin_team',name:'行政组',parent_department_id:'hr'},{open_department_id:'office',name:'总经办',parent_department_id:'0'}],users:[{open_id:'ou_yang',name:yang.name,department_ids:['hr'],leader_user_id:'ou_manager'},{open_id:'ou_staff',name:staff.name,department_ids:['admin_team'],leader_user_id:'ou_manager'},{open_id:'ou_manager',name:manager.name,department_ids:['office']}]}));
 assert.equal(yang.hrbpId,yang.id);assert.equal(yang.hrbpSelfReviewAuthorized,true);assert.equal(staff.hrbpId,yang.id);assert.equal(manager.assessmentPaused,true);assert.equal(staff.assessmentPaused,undefined);
});

test('CSV导入保留已有授权和暂缓，但不能通过客户端伪造本人HRBP授权',()=>{
 const {s,admin,yang,manager}=fixture();mutate(s,admin,'importPeople',{people:structuredClone(s.people)});
 assert.equal(s.people.find(p=>p.id===yang.id).hrbpSelfReviewAuthorized,true);assert.equal(s.people.find(p=>p.id===manager.id).assessmentPaused,true);
 const body=structuredClone(s.people),staff=body.find(p=>p.id==='staff');staff.hrbpId=staff.id;staff.roles=['hrbp'];staff.hrbpSelfReviewAuthorized=true;
 assert.throws(()=>mutate(s,admin,'importPeople',{people:body}),/兼任/);
});
