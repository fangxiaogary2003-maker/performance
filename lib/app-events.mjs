import {FORM_TEMPLATE,reviewersOf} from './form-engine.mjs';
import {ensure} from './errors.mjs';
import {isMonthlyCollaboration,monthlyReviewersOf,currentMonthlyEvaluation} from './monthly-collaboration.mjs';
import {cycleProgress,cyclePendingFor} from './cycle-progress.mjs';
import {taskSelfComplete,validTaskSelfScore} from './task-self.mjs';
export function validateMonthlySubmission(s,u,a){
 ensure(a&&a.status==='active'&&a.employeeId===u.id,'仅员工本人可提交当前考核',403);ensure(a.monthlySubmission?.status!=='submitted','本次整月绩效已提交，请等待上级处理',409);
 ensure(!u.assessmentPaused,'本人的个人考核暂缓，当前不提交整月考核',409);const tasks=s.tasks.filter(t=>t.assessmentId===a.id);ensure(a.employeeConfirmedAt&&tasks.length,'请先完成目标签约',409);
 if(isMonthlyCollaboration(a)){ensure(tasks.every(taskSelfComplete),'请先保存全部工作事项的员工总结、时效与质量自评',409);}
 else{ensure(tasks.every(t=>['submitted','accepted'].includes(t.status)),'请先提交全部任务成果，并处理退回事项',409);ensure(tasks.every(t=>validTaskSelfScore(t.selfEvaluation?.timeliness)&&validTaskSelfScore(t.selfEvaluation?.quality)),'请补齐各任务时效及质量自评',409);}
 ensure(FORM_TEMPLATE.quality.every(i=>a.qualityCases?.[i.key]?.trim()),'请先保存核心素质六项典型事例',409);
}
export function afterMessageAction(s,u,action,b,{a,t,ta,oldCases}){
 const queue=(kind,recipientId,as,task,tag)=>addMessageEvent(s,{id:`${kind}:${task?.id||as.id}:${tag}`,kind,assessmentId:as.id,recipientId,taskId:task?.id||null,extra:task?{round:task.submissionVersion||0}:{}});
 const queueMonthly=as=>{if(!isMonthlyCollaboration(as)||as.monthlySubmission?.status!=='submitted')return;for(const recipientId of monthlyReviewersOf(as))addMessageEvent(s,{id:`monthly_collaboration:${as.id}:${as.monthlySubmission.id}:${as.collaborationAssignmentVersion}:${recipientId}`,kind:'monthly_collaboration',assessmentId:as.id,recipientId,extra:{submissionId:as.monthlySubmission.id,assignmentVersion:as.collaborationAssignmentVersion}});};
 if(action==='submitAssessment'||action==='clearScores')queueMonthly(a);
 if(action==='assignMonthlyCollaboration')for(const as of s.assessments.filter(a=>b.assessmentIds.includes(a.id)))queueMonthly(as);
 if(action==='submit'&&t.cross)for(const rid of reviewersOf(t))queue('task_review',rid,ta,t,(t.submissionVersion||0)+':'+rid);
 if(action==='assign')for(const task of s.tasks.filter(x=>b.ids.includes(x.id)&&x.status==='submitted'))for(const rid of reviewersOf(task))queue('task_review',rid,s.assessments.find(a=>a.id===task.assessmentId),task,(task.submissionVersion||0)+':'+rid);
 if(action==='review'&&b.decision==='returned'){returnMonthly(ta,'任务退回补充');queue('task_returned',ta.employeeId,ta,t,t.submissionVersion||0);}
 if(action==='changeTask'){const was=ta.monthlySubmission?.status==='submitted';returnMonthly(ta,'目标发生变更，请重新确认并提交');if(was)queue('assessment_returned',ta.employeeId,ta,null,ta.goalVersion);}
 if(action==='saveQualityCases'&&a.employeeId!==u.id&&oldCases!==JSON.stringify(a.qualityCases||{})){const was=a.monthlySubmission?.status==='submitted';returnMonthly(a,'典型事例发生变更，请核对后重新提交');if(was)queue('assessment_returned',a.employeeId,a,null,a.monthlySubmission.id);}
}
export function addMessageEvent(s,{id,kind,assessmentId,recipientId,taskId=null,extra={}}){s.notificationEvents||=[];if(!s.notificationEvents.some(e=>e.id===id))s.notificationEvents.push({id,kind,assessmentId,recipientId,taskId,at:new Date().toISOString(),...extra});}
export function returnMonthly(a,reason){if(a.monthlySubmission?.status==='submitted'){a.monthlySubmission.status='returned';a.monthlySubmission.returnReason=reason;a.monthlySubmission.returnedAt=new Date().toISOString();}}
export function monthlyRecipients(s,plan){
 const month=plan.assessmentMonth,c=s.cycles.find(c=>c.month===month),assessments=s.assessments.filter(a=>a.cycleId===c?.id&&a.status==='active'&&!s.people.find(p=>p.id===a.employeeId)?.assessmentPaused),ids=new Set();
 if(plan.stage.day<=2)for(const p of s.people.filter(p=>p.active&&p.feishuOpenId&&!p.assessmentPaused)){const a=s.assessments.find(a=>a.cycleId===c?.id&&a.employeeId===p.id);if(a?.status==='active'&&a.monthlySubmission?.status!=='submitted')ids.add(p.id);}
 if(plan.stage.day>=3)for(const a of assessments){const tasks=s.tasks.filter(t=>t.assessmentId===a.id);if(plan.stage.day===3||plan.stage.day===5){if(tasks.some(t=>!t.managerEvaluation)||!a.qualityEvaluations?.manager)ids.add(a.managerId);}
 if(plan.stage.day>=4){if(!a.qualityEvaluations?.hrbp)ids.add(a.hrbpId);for(const t of tasks.filter(t=>t.cross))for(const rid of reviewersOf(t)){if(t.status!=='accepted'||!t.collaborationEvaluations?.['reviewer:'+rid])ids.add(rid);}if(a.bonus?.status==='pending_hrd')ids.add(a.hrdId);if(a.bonus?.status==='pending_manager')ids.add(a.managerId);}
 if(plan.stage.day===5&&a.monthlySubmission?.status!=='submitted')ids.add(a.employeeId);}
 return [...ids].filter(id=>s.people.some(p=>p.id===id&&p.active&&p.feishuOpenId));
}
export function eventCurrent(s,e){
 const p=s.people.find(p=>p.id===e.recipientId&&p.active);if(!p)return false;if(['monthly','test'].includes(e.kind))return true;if(['cycle_summary','cycle_digest'].includes(e.kind))return p.roles.includes('admin');
 const a=s.assessments.find(a=>a.id===e.assessmentId),t=s.tasks.find(t=>t.id===e.taskId);if(!a||a.status!=='active'||s.people.find(p=>p.id===a.employeeId)?.assessmentPaused)return false;
 if(e.kind==='monthly_collaboration')return isMonthlyCollaboration(a)&&monthlyReviewersOf(a).includes(e.recipientId)&&a.monthlySubmission?.status==='submitted'&&a.monthlySubmission.id===e.submissionId&&a.collaborationAssignmentVersion===e.assignmentVersion&&!currentMonthlyEvaluation(a,e.recipientId);
 if(e.kind==='manager_submission')return a.managerId===e.recipientId&&a.monthlySubmission?.status==='submitted'&&a.monthlySubmission.id===e.submissionId&&(s.tasks.some(t=>t.assessmentId===a.id&&!t.managerEvaluation)||!a.qualityEvaluations?.manager);
 if(e.kind==='task_review')return t&&['submitted','accepted'].includes(t.status)&&(t.status!=='accepted'||!t.collaborationEvaluations?.['reviewer:'+e.recipientId])&&reviewersOf(t).includes(e.recipientId)&&(t.submissionVersion||0)===e.round;
 if(e.kind==='task_returned')return a.employeeId===e.recipientId&&t?.status==='returned';
 if(e.kind==='assessment_returned')return a.employeeId===e.recipientId&&a.monthlySubmission?.status==='returned';
 return false;
}
export function appMessageCard(s,e,base){
 const a=s.assessments.find(a=>a.id===e.assessmentId),t=s.tasks.find(t=>t.id===e.taskId),month=e.month||s.cycles.find(c=>c.id===a?.cycleId)?.month;
 let title='绩效待办',text='',page='mine',button='打开绩效工作台';
 if(e.kind==='manager_submission'){title='员工已提交绩效，请评分';text=`${a.employeeName} 已提交 ${month} 月度绩效。系统已核对你是本次考核的直属上级，请查看绩效表，${isMonthlyCollaboration(a)?'完成任务时效、质量及核心素质评分。':'完成相应验收后评分。'}`;page='team';button='查看员工并评分';}
 if(e.kind==='monthly_collaboration'){title='月度跨部门评分待办';text=`${a.employeeName} 已提交 ${month} 月度绩效。你是HRBP指定的跨部门评分人，请对该员工当月整体协作表现完成五项评价。`;page='review';button='查看月度绩效并评分';}
 if(e.kind==='task_review'){title='跨部门任务待验收';text=`${a.employeeName} 已提交 ${month} 的「${t.title}」，你是 HRBP 指定的验收人，请查看交付材料并完成验收／评价。`;page='review';button='查看待验收任务';}
 if(e.kind==='task_returned'||e.kind==='assessment_returned'){title='绩效材料需要补充';text=`你的 ${month} 绩效${t?'任务「'+t.title+'」':''}已退回，请进入系统查看意见并补齐。`;button='补充我的绩效';}
 if(e.kind==='test'){title='自建应用连接测试';text='这是一条应用个人卡片测试，未提交或发布任何真实绩效结果。';}
 if(e.kind==='monthly'){title=`${month} 绩效提醒 · ${e.stageTitle}`;text=e.stageBody;page=e.page;button='处理我的绩效待办';}
 if(e.kind==='monthly'&&e.cycleId){const report=cycleProgress(s,e.cycleId),items=cyclePendingFor(report,e.recipientId);title=`${month} 绩效待办提醒`;text=`你还有 ${items.length} 项待处理事项：\n`+items.slice(0,8).map(i=>`${i.employee}：${i.step}${i.detail?'（'+i.detail+'）':''}`).join('\n')+(items.length>8?'\n其余事项请进入系统查看。':'');page=e.page;button='处理我的绩效待办';}
 if(e.kind==='cycle_digest'){const report=cycleProgress(s,e.cycleId),unfinished=report.rows.filter(r=>!r.published);title=`${month} 绩效${e.overdue?'逾期':'进度'}汇总`;text=`参与 ${report.counts.total} 人，已发布 ${report.counts.completed} 人，未完成 ${report.counts.unfinished} 人。\n`+unfinished.slice(0,8).map(r=>`${r.name}：${r.stage}；当前责任人：${r.responsible||'管理员核对'}`).join('\n')+(unfinished.length>8?'\n完整名单及各步骤责任人请打开清单查看。':'')+(report.globalIssues.length?'\n管理员待处理：'+report.globalIssues.join('；'):'');page='reports';button='查看未完成清单与汇总表';}
 if(e.kind==='cycle_summary'){title=`${month} ${e.phase==='complete'?'正式结果':'评分'}汇总表已生成`;text=`本月 ${e.total} 人${e.phase==='complete'?'的考核结果均已发布，可下载正式结果汇总表。':'评分已齐，可下载待发布汇总表，核对后再发布正式结果。'}`;page='reports';button='查看并下载汇总表';}
 if(['cycle_summary','cycle_digest'].includes(e.kind)||(e.kind==='monthly'&&e.cycleId))if(text.length>1800)text=text.slice(0,1750)+'\n其余事项及完整责任人请进入系统查看。';
 const u=new URL(base);if(month)u.searchParams.set('month',month);if(e.reportId)u.searchParams.set('reportId',e.reportId);if(e.kind==='monthly_collaboration')u.searchParams.set('collaborationAssessmentId',a.id);u.searchParams.set('page',page);if(a&&page==='team')u.searchParams.set('assessmentId',a.id);if(t&&page!=='team')u.searchParams.set('taskId',t.id);
 return {config:{wide_screen_mode:true},header:{template:'green',title:{tag:'plain_text',content:title}},elements:[{tag:'div',text:{tag:'plain_text',content:text}},{tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:button},type:'primary',url:u.href}]},{tag:'note',elements:[{tag:'plain_text',content:'仅发送待办提示。评分、材料及审批请在绩效系统中完成。'}]}]};
}
