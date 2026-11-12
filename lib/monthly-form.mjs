import {FORM_TEMPLATE} from './form-engine.mjs';
import {ensure} from './errors.mjs';
import {qualitySelfReviewRequired} from './quality-self-review.mjs';
import {pilotSelfManagerAuthorized} from './pilot-self-review.mjs';

const fields=['title','objective','description','standard','due','weight'];
const items=(s,a)=>s.tasks.filter(t=>t.assessmentId===a.id);
export function monthlyFormRoles(a,u,pilot=null){
 return [a.employeeId===u.id&&'employee',a.managerId===u.id&&(a.employeeId!==u.id||pilotSelfManagerAuthorized(a,pilot))&&'manager',a.hrbpId===u.id&&(a.employeeId!==u.id||a.hrbpSelfReviewAuthorized===true)&&'hrbp'].filter(Boolean);
}
export function monthlyFormSource(s,a,kind){
 return JSON.stringify([a.id,a.status,a.goalVersion,a.monthlySubmission?.id||'',a.monthlySubmission?.status||'',a.qualityScoringRound||0,kind==='employee'?'':a.qualityEvaluations?.[kind]?.at||'',items(s,a).map(t=>[t.id,t.version,t.submissionVersion||0,t.selfEvaluation?.at||'',kind==='manager'?t.managerEvaluation?.at||'':'']),...(qualitySelfReviewRequired(a)?[a.qualitySelfReviewVersion,a.qualitySelfEvaluation?.at||'']:[])]);
}
export function monthlyFormValues(s,a,kind){
 if(kind==='employee')return {tasks:items(s,a).map(t=>({id:t.id,title:t.title||'',objective:t.objective||'',description:t.description||'',standard:t.standard||'',due:t.due||'',weight:t.weight??'',result:t.result||'',remark:t.remark||'',selfTimeliness:t.selfEvaluation?.timeliness??'',selfQuality:t.selfEvaluation?.quality??''})),cases:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,a.qualityCases?.[i.key]||''])),...(qualitySelfReviewRequired(a)?{qualitySelfValues:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,a.qualitySelfEvaluation?.values?.[i.key]??'']))}:{})};
 return {tasks:kind==='manager'?items(s,a).map(t=>({id:t.id,timeliness:t.managerEvaluation?.timeliness??'',quality:t.managerEvaluation?.quality??'',comment:t.managerEvaluation?.comment||''})):[],values:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,a.qualityEvaluations?.[kind]?.values?.[i.key]??''])),comment:a.qualityEvaluations?.[kind]?.comment||''};
}
function assessment(s,u,b){
 const a=s.assessments.find(a=>a.id===b.id);ensure(a,'考核单不存在',404);ensure(a.collaborationMode==='monthly','此表单仅用于当前月度考核',409);ensure(a.status==='active','已发布或归档，不能修改',409);ensure(monthlyFormRoles(a,u,s.pilotWorkspace).includes(b.kind),'不是此表单的填写人',403);
 ensure(b.kind!=='employee'||(!u.assessmentPaused&&a.monthlySubmission?.status!=='submitted'),'整月绩效已提交或个人考核暂缓，不能修改',409);
 ensure(b.kind==='employee'||a.monthlySubmission?.status==='submitted','请等待员工提交整月绩效',409);
 ensure(b.source===monthlyFormSource(s,a,b.kind),'绩效内容已更新，请保留填写内容并刷新后核对',409);return a;
}
const text=(v,max)=>{ensure(typeof v==='string'&&v.length<=max,'填写内容类型或长度无效');return v.trim();};
const number=(v,max)=>{if(v===''||v==null)return '';ensure(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max,'分数或权重超出允许范围');return v;};
function normalize(s,a,kind,form){
 ensure(form&&typeof form==='object'&&!Array.isArray(form),'表单内容无效');
 if(kind==='employee'){
  ensure(Array.isArray(form.tasks)&&form.tasks.length<=100,'工作事项最多100项');const known=new Set(items(s,a).map(t=>t.id)),seen=new Set();
  const tasks=form.tasks.map(row=>{ensure(row&&typeof row==='object'&&!Array.isArray(row),'工作事项格式无效');const id=text(row.id,100);ensure(/^[A-Za-z0-9_-]{1,100}$/.test(id)&&!seen.has(id),'工作事项编号无效或重复');seen.add(id);ensure(known.has(id)||id.startsWith('new-'),'工作事项不属于本考核单',403);return {id,...Object.fromEntries([['title',160],['objective',100],['description',2000],['standard',2000],['due',10],['result',10000],['remark',2000]].map(([key,max])=>[key,text(row[key]??'',max)])),weight:number(row.weight,100),selfTimeliness:number(row.selfTimeliness,10),selfQuality:number(row.selfQuality,10)};});
  ensure([...known].every(id=>seen.has(id)),'已有工作事项不能从表单中省略，请刷新后核对',409);
  return {tasks,cases:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,text(form.cases?.[i.key]??'',4000)])),...(qualitySelfReviewRequired(a)?{qualitySelfValues:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,number(form.qualitySelfValues?.[i.key],10)]))}:{})};
 }
 const expected=items(s,a);ensure(Array.isArray(form.tasks)&&form.tasks.length===(kind==='manager'?expected.length:0),'评分工作事项与考核单不一致',409);const seen=new Set();
 const tasks=form.tasks.map(row=>{ensure(row&&typeof row==='object'&&!Array.isArray(row),'评分格式无效');ensure(expected.some(t=>t.id===row.id)&&!seen.has(row.id),'评分工作事项编号无效',403);seen.add(row.id);return {id:row.id,timeliness:number(row.timeliness,10),quality:number(row.quality,10),comment:text(row.comment??'',3000)};});
 return {tasks,values:Object.fromEntries(FORM_TEMPLATE.quality.map(i=>[i.key,number(form.values?.[i.key],10)])),comment:text(form.comment??'',3000)};
}
export function monthlyFormCandidate(s,u,b,mutate){
 const a=assessment(s,u,b),form=normalize(s,a,b.kind,b.form),next=structuredClone(s),actor=next.people.find(p=>p.id===u.id),target=next.assessments.find(x=>x.id===a.id);
 if(b.kind==='employee'){
  ensure(form.tasks.length,'请至少填写一项工作事项');ensure(Math.abs(form.tasks.reduce((n,t)=>n+(typeof t.weight==='number'?t.weight:0),0)-100)<0.001,'工作事项权重合计须为100%');
  for(const row of form.tasks){
   let task=next.tasks.find(t=>t.id===row.id&&t.assessmentId===a.id);const body=Object.fromEntries(fields.map(key=>[key,row[key]]));
   if(task&&!['planned','returned'].includes(task.status)){if(task.managerEvaluation)(task.evaluationHistory||=[]).push({managerEvaluation:structuredClone(task.managerEvaluation),taskVersion:task.version,submissionVersion:task.submissionVersion||0,reason:'整月退回后通过统一表单重新提交',actorId:u.id,at:new Date().toISOString()});task.status='returned';task.managerEvaluation=null;task.collaborationEvaluations={};}
   if(task){if(fields.some(key=>task[key]!==row[key]))mutate(next,actor,'changeTask',{id:task.id,...body,reason:'员工在统一绩效表单中更新工作事项'});}
   else{mutate(next,actor,'createTask',{assessmentId:a.id,...body,cross:false});task=next.tasks.at(-1);}
   mutate(next,actor,'saveTaskSelf',{id:task.id,result:row.result,remark:row.remark,timeliness:row.selfTimeliness,quality:row.selfQuality});
  }
  mutate(next,actor,qualitySelfReviewRequired(target)?'saveQualitySelfEvaluation':'saveQualityCases',{id:a.id,cases:form.cases,values:form.qualitySelfValues});
 }else{
  ensure(form.comment,'请填写评分说明');
  for(const row of form.tasks){const task=next.tasks.find(t=>t.id===row.id),comment=row.comment||form.comment,e=task.managerEvaluation;if(!e||e.timeliness!==row.timeliness||e.quality!==row.quality||e.comment!==comment)mutate(next,actor,'scoreTask',{...row,comment});}
  const old=target.qualityEvaluations?.[b.kind];if(!old||JSON.stringify(old.values)!==JSON.stringify(form.values)||old.comment!==form.comment)mutate(next,actor,'scoreQuality',{id:a.id,kind:b.kind,values:form.values,comment:form.comment});
 }
 if(target.monthlyFormDrafts)delete target.monthlyFormDrafts[b.kind];return next;
}
export function monthlyFormMutate(s,u,action,b,mutate){
 if(!['saveMonthlyFormDraft','submitMonthlyForm'].includes(action))return false;
 if(action==='saveMonthlyFormDraft'){const a=assessment(s,u,b),form=normalize(s,a,b.kind,b.form);a.monthlyFormDrafts||={};a.monthlyFormDrafts[b.kind]={actorId:u.id,kind:b.kind,source:b.source,form,updatedAt:new Date().toISOString()};return true;}
 const next=monthlyFormCandidate(s,u,b,mutate);if(b.kind==='employee')mutate(next,next.people.find(p=>p.id===u.id),'submitAssessment',{id:b.id});Object.assign(s,next);return true;
}
export function ownMonthlyDrafts(a,u,pilot=null){return Object.fromEntries(Object.entries(a.monthlyFormDrafts||{}).filter(([kind,d])=>d.actorId===u.id&&monthlyFormRoles(a,u,pilot).includes(kind)));}
