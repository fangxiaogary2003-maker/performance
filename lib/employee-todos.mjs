import {taskSelfComplete} from './task-self.mjs';
import {isMonthlyCollaboration} from './monthly-collaboration.mjs';
import {qualitySelfReviewRequired,qualitySelfReviewComplete} from './quality-self-review.mjs';
import {FORM_TEMPLATE,reviewersOf} from './form-engine.mjs';
export function employeeTodo(a,tasks,person){
 if(person.assessmentPaused)return {stage:'paused',title:'本人的绩效考核暂缓',body:'本期无需填写个人绩效；如有指定给你的验收事项，请在下方处理。'};
 if(!a)return {stage:'none',title:'当前没有需要填写的绩效表',body:'考核单安排后，会在这里显示你的填写事项。'};
 if(a.status!=='active')return {stage:'result',title:a.status==='archived'?'本月绩效已归档':'本月绩效结果已发布',body:a.finalScore!=null?`最终得分 ${a.finalScore} 分${a.grade?' · '+a.grade:''}${a.gradeReason?'。'+a.gradeReason:''}`:'可查看本月已提交的内容。'};
 if(!tasks.length)return {stage:'goals',title:isMonthlyCollaboration(a)?'填写本月工作事项':'先填写本月工作目标',body:isMonthlyCollaboration(a)?'填写工作事项、标准、日期和权重，无需上级确认。':'添加工作任务、交付标准、日期和权重，再由直属上级确认。'};
 if(isMonthlyCollaboration(a)&&a.monthlySubmission?.status!=='submitted'&&Math.abs(tasks.reduce((n,t)=>n+t.weight,0)-100)>0.001)return {stage:'weights',title:'工作事项权重合计须为100%',body:'请编辑工作事项调整权重，填写完成后直接提交整月绩效。'};
 if(!isMonthlyCollaboration(a)&&!a.managerConfirmedAt)return {stage:'wait_goals',title:'等待直属上级确认目标',body:'你可以先核对或补充工作目标，上级确认后再进行本人确认。'};
 if(!isMonthlyCollaboration(a)&&!a.employeeConfirmedAt)return {stage:'confirm',title:'请确认本月工作目标',body:'核对任务、交付标准、日期和权重，确认后填写员工总结与自评。'};
 if(a.monthlySubmission?.status==='submitted')return {stage:'submitted',title:'本月绩效已提交',body:'等待评分；如果绩效表被退回，需要补充的内容会在这里提示。'};
 const remaining=tasks.filter(t=>isMonthlyCollaboration(a)?!taskSelfComplete(t):['planned','returned'].includes(t.status));
 if(remaining.length)return {stage:'tasks',title:`还有 ${remaining.length} 项工作事项需要填写`,body:remaining.some(t=>t.status==='returned')?'请根据退回意见修改员工总结与自评，再提交整月绩效。':'填写并保存员工总结、时效与质量自评。'};
 const missing=FORM_TEMPLATE.quality.filter(i=>!a.qualityCases?.[i.key]?.trim());
 if(qualitySelfReviewRequired(a)&&!qualitySelfReviewComplete(a))return {stage:'quality_self',title:'请完成核心素质自评和原因',body:'六项分别填写0—10分自评及当月事例，提交后由直属上级和HRBP评分。'};
 if(missing.length)return {stage:'cases',title:`还需补充 ${missing.length} 项典型事例`,body:'在下方填写当月事例并保存，完成后即可提交整月绩效。'};
 return {stage:'submit',title:'填报已齐，请提交本月绩效',body:a.monthlySubmission?.returnReason?'退回原因：'+a.monthlySubmission.returnReason:qualitySelfReviewRequired(a)?'提交后会自动通知直属上级和HRBP评分。':'提交后会自动通知直属上级评分。'};
}
export function employeeReviewTodos(s,u,cycleId){
 return s.tasks.filter(t=>{const a=s.assessments.find(a=>a.id===t.assessmentId);return a?.cycleId===cycleId&&a.status==='active'&&!isMonthlyCollaboration(a)&&reviewersOf(t).includes(u.id)&&(t.status==='submitted'||(t.status==='accepted'&&!t.collaborationEvaluations?.['reviewer:'+u.id]));});
}
