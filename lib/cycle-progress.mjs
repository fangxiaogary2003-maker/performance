import {taskSelfComplete} from './task-self.mjs';
import {qualitySelfReviewRequired,qualitySelfReviewComplete} from './quality-self-review.mjs';
import {FORM_TYPE,FORM_TEMPLATE,formPreview,reviewersOf} from './form-engine.mjs';
import {isMonthlyCollaboration,monthlyReviewersOf,currentMonthlyEvaluation,requiredMonthlyReviewers} from './monthly-collaboration.mjs';
import {firstWorkdays,shanghaiTime} from './reminder-plan.mjs';
const validScore=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10;
const complete=(v,items)=>!!v&&items.every(i=>validScore(v[i.key]));
const fresh=(e,t)=>e&&(e.taskVersion??t.version)===t.version&&(e.submissionVersion??0)===(t.submissionVersion||0);
export function cycleProgress(s,cycleId){
 const cycle=s.cycles.find(c=>c.id===cycleId);if(!cycle)return null;
 const admins=s.people.filter(p=>p.active&&p.roles.includes('admin')),adminIds=admins.map(p=>p.id),person=id=>s.people.find(p=>p.id===id),name=id=>person(id)?.name||'未配置',rule=s.rules.find(r=>r.id===cycle.ruleId),globalIssues=[];
 if(!rule)globalIssues.push('尚未绑定经批准的评分规则');if(!cycle.calendarConfirmed)globalIssues.push('本月工作日历尚未确认');
 const paused=s.pilotWorkspace?[]:s.people.filter(p=>p.active&&p.assessmentPaused),assessments=s.assessments.filter(a=>a.cycleId===cycle.id&&!person(a.employeeId)?.assessmentPaused);
 const rows=assessments.map(a=>{
  const p=person(a.employeeId),ts=s.tasks.filter(t=>t.assessmentId===a.id),published=['published','archived'].includes(a.status),pending=[],isForm=a.formVersion===FORM_TYPE||rule?.type===FORM_TYPE,preview=!published&&isForm?formPreview(s,a,rule):a.calculationSnapshot||null;
  const add=(key,step,role,ids,detail='',taskId=null)=>{ids=[...new Set(ids.filter(Boolean))];const valid=ids.length&&ids.every(id=>person(id)?.active);if(role!=='admin'&&!valid){pending.push({key:key+':owner',step:'负责人待核对',role:'admin',responsibleIds:adminIds,detail:step+'：负责人未配置或已停用',taskId});return;}pending.push({key,step,role,responsibleIds:role==='admin'?adminIds:ids,detail,taskId});};
  if(!published){
   const crossRequired=(rule?.weights||FORM_TEMPLATE.referenceWeights).work>0&&(rule?.weights||FORM_TEMPLATE.referenceWeights).collaboration>0;
   if(isMonthlyCollaboration(a)&&crossRequired){const ids=monthlyReviewersOf(a);if(ids.length!==requiredMonthlyReviewers(a,s.pilotWorkspace))add('monthly_assign','待HRBP指定月度跨部门评分人','hrbp',[a.hrbpId],'按原表指定两位评分人');else if(a.monthlySubmission?.status==='submitted'){const remaining=ids.filter(id=>!currentMonthlyEvaluation(a,id));if(remaining.length)add('monthly_collaboration','待月度跨部门评分','reviewer',remaining,'对当月整体协作表现完成五项评价');}}
   if(!p?.active)add('account','员工账号待核对','admin',adminIds);
   else if(!ts.length)add('goals','待填写工作目标','employee',[a.employeeId]);
   else if(Math.abs(ts.reduce((n,t)=>n+t.weight,0)-100)>0.001)add('weights','目标权重待修正','employee',[a.employeeId],'目标权重合计须为100%');
   else if(!isMonthlyCollaboration(a)&&!a.managerConfirmedAt)add('manager_goals','待主管确认目标','manager',[a.managerId]);
   else if(!isMonthlyCollaboration(a)&&!a.employeeConfirmedAt)add('employee_goals','待员工确认目标','employee',[a.employeeId]);
   else{
    const monthlySubmitted=a.monthlySubmission?.status==='submitted',policy=rule?.type===FORM_TYPE?rule:{weights:FORM_TEMPLATE.referenceWeights,collaborationScorer:'reviewers',qualityScorer:'manager_hrbp',bonusEnabled:true,noCross:'block'};
    for(const t of ts){
     if(isMonthlyCollaboration(a)){if(!monthlySubmitted&&!taskSelfComplete(t))add('fill:'+t.id,t.status==='returned'?'退回待员工修改总结与自评':'待填写员工总结与自评','employee',[a.employeeId],t.title,t.id);else if(monthlySubmitted&&(!fresh(t.managerEvaluation,t)||!validScore(t.managerEvaluation?.timeliness)||!validScore(t.managerEvaluation?.quality)))add('task_score:'+t.id,'待主管任务评分','manager',[a.managerId],t.title,t.id);continue;}
     const ids=reviewersOf(t),draft=!!t.result?.trim()&&validScore(t.selfEvaluation?.timeliness)&&validScore(t.selfEvaluation?.quality);
     if(t.cross&&!ids.length&&t.status!=='accepted')add('assign:'+t.id,'待HRBP指定验收人','hrbp',[a.hrbpId],t.title,t.id);
     if(['planned','returned'].includes(t.status)&&(!draft||!t.cross||ids.length))add('fill:'+t.id,t.status==='returned'?'退回待员工补充':draft?'待员工提交任务成果':'待填写成果与自评','employee',[a.employeeId],t.title,t.id);
     if(isForm&&['submitted','accepted'].includes(t.status)&&(!validScore(t.selfEvaluation?.timeliness)||!validScore(t.selfEvaluation?.quality)))add('self:'+t.id,'已提交成果缺少自评，待核对','admin',adminIds,t.title,t.id);
     if(t.status==='submitted'&&(t.cross||monthlySubmitted||!isForm)){
      const needed=t.cross?ids:[a.managerId],remaining=needed.filter(id=>!t.reviews?.some(r=>r.actorId===id&&(r.round||0)===(t.submissionVersion||0)&&r.decision==='accepted'));
      if(remaining.length)add('accept:'+t.id,t.cross?'待跨部门验收':'待主管验收',t.cross?'reviewer':'manager',remaining,t.title,t.id);
     }
     const needsOkr=policy.weights.work>0&&(policy.weights.okr>0||(!ts.some(x=>x.cross)&&policy.noCross==='okr_only'));
     if(isForm&&t.status==='accepted'){
      if(monthlySubmitted&&needsOkr&&(!fresh(t.managerEvaluation,t)||!validScore(t.managerEvaluation?.timeliness)||!validScore(t.managerEvaluation?.quality)))add('task_score:'+t.id,'待主管任务评分','manager',[a.managerId],t.title,t.id);
      if(t.cross&&policy.weights.work>0&&policy.weights.collaboration>0){const keys=policy.collaborationScorer==='manager'?[['manager',a.managerId]]:ids.map(id=>['reviewer:'+id,id]);const missing=keys.filter(([key])=>!fresh(t.collaborationEvaluations?.[key],t)||!complete(t.collaborationEvaluations[key]?.values,FORM_TEMPLATE.collaboration)).map(([,id])=>id);if(missing.length)add('collaboration:'+t.id,'待协作五项评价',policy.collaborationScorer==='manager'?'manager':'reviewer',missing,t.title,t.id);}
     }
    }
    if(isForm){
     const missingCases=FORM_TEMPLATE.quality.filter(i=>!a.qualityCases?.[i.key]?.trim());if(missingCases.length&&!qualitySelfReviewRequired(a))add('cases','待员工补充典型事例','employee',[a.employeeId],`缺${missingCases.length}项事例`);
     const missingSelf=qualitySelfReviewRequired(a)&&!qualitySelfReviewComplete(a);if(missingSelf)add('quality_self','待员工核心素质自评','employee',[a.employeeId],'请补齐六项自评分和自评原因');
     const submittedTasks=ts.every(t=>isMonthlyCollaboration(a)?taskSelfComplete(t):['submitted','accepted'].includes(t.status)&&validScore(t.selfEvaluation?.timeliness)&&validScore(t.selfEvaluation?.quality));
     if(!monthlySubmitted&&submittedTasks&&!missingCases.length&&!missingSelf)add('monthly_submit',a.monthlySubmission?.status==='returned'?'整月退回待重提':'待提交整月绩效','employee',[a.employeeId],a.monthlySubmission?.returnReason||'');
     if(monthlySubmitted&&policy.weights.quality>0){
      if((policy.qualityScorer==='manager_only'||policy.weights.managerQuality>0)&&preview?.managerQuality===null)add('manager_quality','待主管核心素质评分','manager',[a.managerId]);
      if(policy.qualityScorer==='manager_hrbp'&&policy.weights.hrQuality>0&&preview?.hrQuality===null){if(a.hrbpId===a.employeeId&&!a.hrbpSelfReviewAuthorized)add('self_hrbp','本人HRBP授权待核对','admin',adminIds);else add('hrbp_quality','待HRBP核心素质评分','hrbp',[a.hrbpId]);}
     }
     if(policy.bonusEnabled&&a.bonus?.status==='pending_manager')add('bonus_manager','加分待主管审批','manager',[a.managerId]);
     if(policy.bonusEnabled&&a.bonus?.status==='pending_hrd')add('bonus_hrd','加分待HRD审批','hrd',[a.hrdId]);
    }else if(ts.every(t=>t.status==='accepted')&&rule?.components)for(const item of rule.components)if(a.components?.[item.key]?.score==null)add('module:'+item.key,'待'+item.name+'评分',item.scorer==='manager'?'manager':'hrbp',[item.scorer==='manager'?a.managerId:a.hrbpId]);
   }
  }
  const legacyReady=!!rule?.components&&a.formVersion!==FORM_TYPE&&ts.length>0&&a.employeeConfirmedAt&&ts.every(t=>t.status==='accepted')&&rule.components.every(c=>a.components?.[c.key]?.score!=null);
  const scoringReady=published||(!pending.length&&(isForm?preview?.ready:legacyReady));
  if(!published&&!pending.length){if(!scoringReady)add('policy','评分规则或计算口径待核对','admin',adminIds,preview?.blockers?.join('；')||'尚未绑定批准规则');else if(!cycle.calendarConfirmed)add('calendar','待管理员确认工作日历','admin',adminIds);else add('publish','评分齐全，待管理员发布','admin',adminIds);}
  for(const item of pending)item.responsibleNames=item.responsibleIds.map(name).join('、');
  const order={account:0,goals:1,weights:1,manager_goals:2,employee_goals:3,fill:4,self:4,assign:5,monthly_assign:5,cases:6,quality_self:6,monthly_submit:7,accept:8,task_score:9,collaboration:10,monthly_collaboration:10,manager_quality:11,hrbp_quality:12,bonus_manager:13,bonus_hrd:14};
  const ranked=[...pending].sort((a,b)=>(order[a.key.split(':')[0]]??20)-(order[b.key.split(':')[0]]??20)),current=ranked[0];
  const score=published?a.finalScore:scoringReady?(isForm?preview.finalScore:Math.min(100,Math.round(rule.components.reduce((n,c)=>n+a.components[c.key].score*c.weight/100,0)*100)/100)):null;
  return {id:a.id,employeeId:a.employeeId,name:a.employeeName,department:a.department,position:a.position||'',manager:name(a.managerId),hrbp:name(a.hrbpId),published,submitted:published||a.monthlySubmission?.status==='submitted',scoringReady:!!scoringReady,score,grade:published?a.grade||'':scoringReady?preview?.grade||'':'',gradeReason:published?a.gradeReason||a.calculationSnapshot?.gradeReason||'':scoringReady?preview?.gradeReason||'':'',metrics:published?a.calculationSnapshot||{}:rule?preview||{}:{},status:published?(a.status==='archived'?'已归档':'已发布'):scoringReady?'评分齐全待发布':'流程未完成',stage:current?.step||(a.status==='archived'?'已归档':'已发布'),responsible:current?.responsibleIds.map(name).join('、')||'',pending,submittedAt:a.monthlySubmission?.at||a.monthlySubmission?.submittedAt||'',publishedAt:a.publishedAt||'',ruleName:(published?a.ruleSnapshot?.name:rule?.name)||'尚未批准'};
 });
 const enrolled=new Set(assessments.map(a=>a.employeeId)),exceptions=(s.pilotWorkspace?[]:s.people).filter(p=>p.active&&!p.assessmentPaused&&!enrolled.has(p.id)&&(!p.managerId||!p.hrbpId)).map(p=>({name:p.name,department:p.dept,reason:[!p.managerId?'直属上级未配置':'',!p.hrbpId?'HRBP未配置':''].filter(Boolean).join('；')}));
 const allPublished=rows.length>0&&rows.every(r=>r.published),allScored=rows.length>0&&rows.every(r=>r.scoringReady);
 return {cycleId:cycle.id,month:cycle.month,due:cycle.due,ruleName:rule?.name||'尚未批准',approvalReference:rule?.approvalReference||'',calendarConfirmed:!!cycle.calendarConfirmed,phase:allPublished?'complete':allScored?'scored':'progress',allScored,allPublished,globalIssues:allPublished?[]:globalIssues,counts:{total:rows.length,submitted:rows.filter(r=>r.submitted).length,completed:rows.filter(r=>r.published).length,scored:rows.filter(r=>r.scoringReady).length,unfinished:rows.filter(r=>!r.published).length,employeePending:rows.filter(r=>r.pending.some(p=>p.role==='employee')).length},rows,exceptions,paused:paused.map(p=>({name:p.name,department:p.dept,reason:p.assessmentPauseReason||'个人考核暂缓'}))};
}
export function cyclePendingFor(report,recipientId){return report?.rows.flatMap(row=>row.pending.filter(p=>p.role!=='admin'&&p.responsibleIds.includes(recipientId)).map(p=>({employee:row.name,employeeId:row.employeeId,assessmentId:row.id,...p})))||[];}
export function cycleReminderWindow(cycle,calendar,now,hour=9){
 const today=shanghaiTime(now),d=new Date(cycle.month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);const next=d.toISOString().slice(0,7),days=firstWorkdays(next,calendar),weekday=new Date(today.date+'T00:00:00Z').getUTCDay(),workday=calendar[today.date]===true||(calendar[today.date]!==false&&![0,6].includes(weekday));
 return {date:today.date,overdue:today.date>cycle.due,eligible:cycle.remindersEnabled!==false&&today.hour>=hour&&today.hour<18&&(days.includes(today.date)||today.date===cycle.due||(today.date>cycle.due&&workday))};
}
export function cycleReportSheets(report){
 const missing=v=>v==null?'未评':v;
 return [['月度结果汇总',[['考核月份','员工','部门','岗位','状态','最终或待发布总分','等级','等级判定依据','OKR（10分）','协作（10分）','工作事项（100分）','核心素质（100分）','加分','直属上级','HRBP','规则版本'],...report.rows.map(r=>[report.month,r.name,r.department,r.position,r.status,r.score==null?'未完成':r.score,r.grade,r.gradeReason,missing(r.metrics.okr),missing(r.metrics.collaboration),missing(r.metrics.work),missing(r.metrics.quality),missing(r.metrics.bonus),r.manager,r.hrbp,r.ruleName])]],['流程未完成清单',[['考核月份','员工','部门','当前环节','当前责任人','具体待办','责任角色','任务或原因'],...report.rows.flatMap(r=>r.pending.map(p=>[report.month,r.name,r.department,r.stage,p.responsibleNames,p.step,({employee:'员工',manager:'直属上级',hrbp:'HRBP',reviewer:'跨部门评分人',hrd:'HRD',admin:'管理员'})[p.role],p.detail]))]],['范围与说明',[['项目','内容'],['考核月份',report.month],['截止日期',report.due],['汇总状态',report.phase==='complete'?'全部结果已发布':report.phase==='scored'?'评分齐全，待管理员核对发布':'流程进行中，未完成项不计为0分'],['评分规则版本',report.ruleName],['批准依据',report.approvalReference||'尚未批准'],['参与考核人数',report.counts.total],['已发布人数',report.counts.completed],...report.globalIssues.map(x=>['管理员待处理',x]),...report.paused.map(p=>['个人考核暂缓',p.name+' / '+p.department+' / '+p.reason]),...report.exceptions.map(p=>['未生成考核单账号（待核对）',p.name+' / '+p.department+' / '+p.reason])]]];
}
