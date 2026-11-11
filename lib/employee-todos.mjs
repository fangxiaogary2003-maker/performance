import {isMonthlyCollaboration} from './monthly-collaboration.mjs';
import {FORM_TEMPLATE,reviewersOf} from './form-engine.mjs';
export function employeeTodo(a,tasks,person){
 if(person.assessmentPaused)return {stage:'paused',title:'本人的绩效考核暂缓',body:'本期无需填写个人绩效；如有指定给你的验收事项，请在下方处理。'};
 if(!a)return {stage:'none',title:'当前没有需要填写的绩效表',body:'考核单安排后，会在这里显示你的填写事项。'};
 if(a.status!=='active')return {stage:'result',title:a.status==='archived'?'本月绩效已归档':'本月绩效结果已发布',body:a.finalScore!=null?`最终得分 ${a.finalScore} 分${a.grade?' · '+a.grade:''}${a.gradeReason?'。'+a.gradeReason:''}`:'可查看本月已提交的内容。'};
 if(!tasks.length)return {stage:'goals',title:'先填写本月工作目标',body:'添加工作任务、交付标准、日期和权重，再由直属上级确认。'};
 if(!a.managerConfirmedAt)return {stage:'wait_goals',title:'等待直属上级确认目标',body:'你可以先核对或补充工作目标，上级确认后再进行本人确认。'};
 if(!a.employeeConfirmedAt)return {stage:'confirm',title:'请确认本月工作目标',body:'核对任务、交付标准、日期和权重，确认后开始填报成果。'};
 if(a.monthlySubmission?.status==='submitted')return {stage:'submitted',title:'本月绩效已提交',body:'等待评分；如果材料被退回，需要补充的内容会在这里提示。'};
 const remaining=tasks.filter(t=>['planned','returned'].includes(t.status));
 if(remaining.length)return {stage:'tasks',title:`还有 ${remaining.length} 项成果需要填写`,body:remaining.some(t=>t.status==='returned')?'请根据退回意见补充材料，并重新提交。':'填写工作成果、上传证据并完成时效与质量自评。'};
 const missing=FORM_TEMPLATE.quality.filter(i=>!a.qualityCases?.[i.key]?.trim());
 if(missing.length)return {stage:'cases',title:`还需补充 ${missing.length} 项典型事例`,body:'在下方填写当月事例并保存，完成后即可提交整月绩效。'};
 return {stage:'submit',title:'填报已齐，请提交本月绩效',body:a.monthlySubmission?.returnReason?'退回原因：'+a.monthlySubmission.returnReason:'提交后会自动通知直属上级评分。'};
}
export function employeeReviewTodos(s,u,cycleId){
 return s.tasks.filter(t=>{const a=s.assessments.find(a=>a.id===t.assessmentId);return a?.cycleId===cycleId&&a.status==='active'&&!isMonthlyCollaboration(a)&&reviewersOf(t).includes(u.id)&&(t.status==='submitted'||(t.status==='accepted'&&!t.collaborationEvaluations?.['reviewer:'+u.id]));});
}
