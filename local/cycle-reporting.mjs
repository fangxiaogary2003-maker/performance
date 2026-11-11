import {createHash,randomUUID} from 'node:crypto';
import {cycleProgress,cyclePendingFor,cycleReminderWindow,cycleReportSheets} from '../lib/cycle-progress.mjs';
import {adminDigestWindow,ADMIN_DIGEST_POLICY_ID,ADMIN_DIGEST_HOUR} from '../lib/admin-digest.mjs';
export function reportSignature(s,cycleId,phase){const c=s.cycles.find(c=>c.id===cycleId),assessments=s.assessments.filter(a=>a.cycleId===cycleId).map(({status,archivedAt,monthlyFormDrafts,...a})=>a),ids=new Set(assessments.map(a=>a.id));return createHash('sha256').update(JSON.stringify({phase,cycleId,month:c.month,rule:s.rules.find(r=>r.id===c.ruleId),assessments,tasks:s.tasks.filter(t=>ids.has(t.assessmentId))})).digest('hex');}
export function cycleReporting(sql,{clock=()=>new Date()}={}){
 sql.exec('CREATE TABLE IF NOT EXISTS cycle_report_versions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,cycle_id TEXT NOT NULL,month TEXT NOT NULL,phase TEXT NOT NULL,signature TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(workspace_id,cycle_id,phase,signature))');
 const administrators=s=>s.people.filter(p=>p.active&&p.roles.includes('admin'));
 function sync(s,workspaceId='company'){
  const events=[];
  for(const c of s.cycles){const report=cycleProgress(s,c.id);if(!report?.counts.total||report.phase==='progress')continue;const signature=reportSignature(s,c.id,report.phase),at=clock().toISOString();
   sql.prepare('INSERT OR IGNORE INTO cycle_report_versions(id,workspace_id,cycle_id,month,phase,signature,created_at,payload) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),workspaceId,c.id,c.month,report.phase,signature,at,JSON.stringify({report,sheets:cycleReportSheets(report)}));
  }return events;
 }
 function scheduled(s,workspaceId='company',hour=9){
  const events=[];for(const c of s.cycles){const report=cycleProgress(s,c.id),window=cycleReminderWindow(c,s.calendar,clock(),hour);if(!report?.counts.total||report.allPublished||!window.eligible)continue;
   const owners=new Set(report.rows.flatMap(r=>r.pending.filter(p=>p.role!=='admin').flatMap(p=>p.responsibleIds)));
   for(const recipientId of owners){const items=cyclePendingFor(report,recipientId),page=items.every(i=>i.key==='monthly_assign')?'assign':items.some(i=>i.role==='employee')?'mine':items.some(i=>['manager','hrbp'].includes(i.role))?'team':items.some(i=>i.role==='hrd')?'bonus':'review';events.push({id:`cycle_daily:${c.id}:${window.date}:${recipientId}`,kind:'monthly',cycleId:c.id,month:c.month,date:window.date,recipientId,page,stageTitle:'本人未完成事项',stageBody:'请处理绩效待办。'});}
  }return events;
 }
 function adminScheduled(s,workspaceId='company'){
  if(workspaceId!=='company'||s.pilotWorkspace)return [];
  const events=[];for(const c of s.cycles){const report=cycleProgress(s,c.id);if(!report)continue;const window=adminDigestWindow(c,report,clock());if(!window.eligible)continue;
   for(const p of administrators(s))events.push({id:`cycle_digest17:${workspaceId}:${c.id}:${window.date}:${p.id}`,kind:'cycle_digest',workspaceId,policyId:ADMIN_DIGEST_POLICY_ID,scheduledHour:ADMIN_DIGEST_HOUR,cycleId:c.id,month:c.month,date:window.date,recipientId:p.id,overdue:window.overdue});
  }return events;
 }
 function current(s,e,hour=9){
  const c=s.cycles.find(c=>c.id===e.cycleId);if(!c)return false;const report=cycleProgress(s,c.id),recipient=s.people.find(p=>p.id===e.recipientId&&p.active);if(!recipient)return false;
  if(e.kind==='cycle_summary')return false;
  if(e.kind==='cycle_digest'){const window=adminDigestWindow(c,report,clock());return !s.pilotWorkspace&&e.workspaceId==='company'&&e.policyId===ADMIN_DIGEST_POLICY_ID&&e.scheduledHour===ADMIN_DIGEST_HOUR&&recipient.roles.includes('admin')&&e.date===window.date&&window.eligible;}
  const window=cycleReminderWindow(c,s.calendar,clock(),hour);if(e.date!==window.date||!window.eligible||report.allPublished)return false;
  return cyclePendingFor(report,e.recipientId).length>0;
 }
 function status(s,cycleId,workspaceId='company'){return {progress:cycleProgress(s,cycleId),versions:sql.prepare('SELECT id,month,phase,created_at FROM cycle_report_versions WHERE workspace_id=? AND cycle_id=? ORDER BY created_at DESC').all(workspaceId,cycleId)};}
 function version(id,workspaceId='company'){const row=sql.prepare('SELECT * FROM cycle_report_versions WHERE workspace_id=? AND id=?').get(workspaceId,id);return row?{...row,...JSON.parse(row.payload),payload:undefined}:null;}
 return {sync,scheduled,adminScheduled,current,status,version};
}
