import {ensure} from './errors.mjs';
import {formalMessageGate} from './formal-launch.mjs';
export function manualNudgePlan(s,u,cycleId,key,config,outbox=[],now=new Date()){
 ensure(u?.active&&u.roles.includes('admin'),'仅管理员可一键催促未提交员工',403);const cycle=s.cycles.find(c=>c.id===cycleId);ensure(cycle,'考核月份不存在',404);
 const pending=s.assessments.filter(a=>a.cycleId===cycleId&&a.status==='active'&&a.monthlySubmission?.status!=='submitted'&&s.people.some(p=>p.id===a.employeeId&&p.active&&!p.assessmentPaused));
 const eligible=[],skipped=[];
 for(const a of pending){const p=s.people.find(p=>p.id===a.employeeId),event={kind:'manual_nudge',cycleId,assessmentId:a.id,recipientId:p.id,month:cycle.month},gate=formalMessageGate(s,event,key,config,now),recent=[...outbox,...(s.notificationEvents||[])].some(e=>e.kind==='manual_nudge'&&(e.recipient_id||e.recipientId)===p.id&&(e.cycleId===cycleId||e.payload&&JSON.parse(e.payload).cycleId===cycleId)&&now-Date.parse(e.created_at||e.at)<30*60000);
  const reason=!p.feishuOpenId?'尚未绑定飞书账号':!config.workflowEnabled?'个人待办推送已关闭':!gate.eligible?'尚未到正式启用日期':recent?'30分钟内已催促，请稍后再试':null;
  (reason?skipped:eligible).push({assessmentId:a.id,employeeId:p.id,name:p.name,department:p.dept,...(reason?{reason}:{})});
 }
 return {cycleId,month:cycle.month,pending:pending.length,eligible,skipped,cooldownMinutes:30};
}
