import {FORM_TEMPLATE,reviewersOf} from './form-engine.mjs';
import {ensure} from './errors.mjs';
export function validateMonthlySubmission(s,u,a){
 ensure(a&&a.status==='active'&&a.employeeId===u.id,'仅员工本人可提交当前考核',403);ensure(a.monthlySubmission?.status!=='submitted','本次整月绩效已提交，请等待上级处理',409);
 ensure(!u.assessmentPaused,'本人的个人考核暂缓，当前不提交整月考核',409);const tasks=s.tasks.filter(t=>t.assessmentId===a.id);ensure(a.employeeConfirmedAt&&tasks.length,'请先完成目标签约',409);
 ensure(tasks.every(t=>['submitted','accepted'].includes(t.status)),'请先提交全部任务成果，并处理退回事项',409);
 ensure(tasks.every(t=>typeof t.selfEvaluation?.timeliness==='number'&&typeof t.selfEvaluation?.quality==='number'),'请补齐各任务时效及质量自评',409);
 ensure(FORM_TEMPLATE.quality.every(i=>a.qualityCases?.[i.key]?.trim()),'请先保存核心素质六项典型事例',409);
}
export function afterMessageAction(s,u,action,b,{a,t,ta,oldCases}){
 const queue=(kind,recipientId,as,task,tag)=>addMessageEvent(s,{id:`${kind}:${task?.id||as.id}:${tag}`,kind,assessmentId:as.id,recipientId,taskId:task?.id||null,extra:task?{round:task.submissionVersion||0}:{}});
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
 const p=s.people.find(p=>p.id===e.recipientId&&p.active);if(!p)return false;if(['monthly','test'].includes(e.kind))return true;
 const a=s.assessments.find(a=>a.id===e.assessmentId),t=s.tasks.find(t=>t.id===e.taskId);if(!a||a.status!=='active'||s.people.find(p=>p.id===a.employeeId)?.assessmentPaused)return false;
 if(e.kind==='manager_submission')return a.managerId===e.recipientId&&a.monthlySubmission?.status==='submitted'&&a.monthlySubmission.id===e.submissionId&&(s.tasks.some(t=>t.assessmentId===a.id&&!t.managerEvaluation)||!a.qualityEvaluations?.manager);
 if(e.kind==='task_review')return t&&['submitted','accepted'].includes(t.status)&&(t.status!=='accepted'||!t.collaborationEvaluations?.['reviewer:'+e.recipientId])&&reviewersOf(t).includes(e.recipientId)&&(t.submissionVersion||0)===e.round;
 if(e.kind==='task_returned')return a.employeeId===e.recipientId&&t?.status==='returned';
 if(e.kind==='assessment_returned')return a.employeeId===e.recipientId&&a.monthlySubmission?.status==='returned';
 return false;
}
export function appMessageCard(s,e,base){
 const a=s.assessments.find(a=>a.id===e.assessmentId),t=s.tasks.find(t=>t.id===e.taskId),month=e.month||s.cycles.find(c=>c.id===a?.cycleId)?.month;
 let title='绩效待办',text='',page='mine',button='打开绩效工作台';
 if(e.kind==='manager_submission'){title='员工已提交绩效，请评分';text=`${a.employeeName} 已提交 ${month} 月度绩效。系统已核对你是本次考核的直属上级，请查看材料，完成相应验收后评分。`;page='team';button='查看员工并评分';}
 if(e.kind==='task_review'){title='跨部门任务待验收';text=`${a.employeeName} 已提交 ${month} 的「${t.title}」，你是 HRBP 指定的验收人，请查看交付材料并完成验收／评价。`;page='review';button='查看待验收任务';}
 if(e.kind==='task_returned'||e.kind==='assessment_returned'){title='绩效材料需要补充';text=`你的 ${month} 绩效${t?'任务「'+t.title+'」':''}已退回，请进入系统查看意见并补齐。`;button='补充我的绩效';}
 if(e.kind==='test'){title='自建应用连接测试';text='这是一条应用个人卡片测试，未提交或发布任何真实绩效结果。';}
 if(e.kind==='monthly'){title=`${month} 绩效提醒 · ${e.stageTitle}`;text=e.stageBody;page=e.page;button='处理我的绩效待办';}
 const u=new URL(base);if(month)u.searchParams.set('month',month);u.searchParams.set('page',page);if(a&&page==='team')u.searchParams.set('assessmentId',a.id);if(t&&page!=='team')u.searchParams.set('taskId',t.id);
 return {config:{wide_screen_mode:true},header:{template:'green',title:{tag:'plain_text',content:title}},elements:[{tag:'div',text:{tag:'plain_text',content:text}},{tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:button},type:'primary',url:u.href}]},{tag:'note',elements:[{tag:'plain_text',content:'仅发送待办提示。评分、材料及审批请在绩效系统中完成。'}]}]};
}
