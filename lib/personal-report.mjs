import {cycleReportSheets} from './cycle-progress.mjs';

// Present the immutable personal archive using the existing monthly-summary schema.
// Do not recompute ratings or read any other employee's current assessment.
export function personalReportSheets(ar){
 const {assessment:a,cycle,people=[]}=ar.snapshot,p=a.calculationSnapshot||{},rule=a.ruleSnapshot||{},person=id=>people.find(p=>p.id===id)?.name||'未记录',archived=a.status==='archived';
 const report={month:cycle.month||ar.month,due:cycle.due||'',ruleName:rule.name||p.ruleName||'未记录',approvalReference:rule.approvalReference||'',phase:'complete',counts:{total:1,completed:1},globalIssues:[],paused:[],exceptions:[],rows:[{
  assessmentScope:a.assessmentScope||'full',moduleScores:p.moduleScores||ar.moduleScores||null,name:a.employeeName,department:a.department,position:a.position||'',status:archived?'已归档':'已发布',score:a.finalScore??ar.score??null,grade:a.grade||p.grade||'',gradeReason:a.gradeReason||p.gradeReason||'',metrics:p,manager:person(a.managerId),hrbp:person(a.hrbpId),ruleName:rule.name||p.ruleName||'未记录',pending:[]
 }]};
 const sheets=cycleReportSheets(report),notes=sheets.find(([name])=>name==='范围与说明')[1];
 notes.push(['导出范围','仅本人已发布的月度绩效结果，评分明细保存在绩效档案中'],['员工',a.employeeName],['发布时刻（北京时间）',localTime(a.publishedAt)],['归档时刻（北京时间）',localTime(a.archivedAt||ar.at)]);
 if(a.hrbpOkrEvaluation)notes.push(['HRBP直接录入OKR（100分制）',a.hrbpOkrEvaluation.score],['OKR评分人',person(a.hrbpOkrEvaluation.actorId)],['OKR保存时刻（北京时间）',localTime(a.hrbpOkrEvaluation.at)]);
 if(ar.testOnly)notes.push(['流程试跑说明','独立流程试跑，结果不计入正式绩效'],['试跑名称',ar.snapshot.pilot?.title||'流程试跑']);
 return sheets;
}
function localTime(value){if(!value)return '未记录';const date=new Date(value);if(!Number.isFinite(date.getTime()))return String(value);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);}
