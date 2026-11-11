// Shared business engine: Cloudflare D1 and self-hosted SQLite use the same CAS store.
import {defaultCycleId,assessmentMonthNow} from './assessment-period.mjs';
import {schemeMutate,ruleAvailable} from './scheme-management.mjs';
import {AppError} from './errors.mjs';
import {eligibleForAssessment} from './assessment-eligibility.mjs';
import {workspaceAccess} from './workspace-access.mjs';
import {cycleProgress,cycleReportSheets} from './cycle-progress.mjs';
import {sheetsWorkbookBytes} from './exports.mjs';
import {isMonthlyCollaboration,monthlyReviewersOf} from './monthly-collaboration.mjs';
import {GRADING_POLICY_ID,GRADE_BANDS} from './grade-policy.mjs';
export {AppError} from './errors.mjs';
import {FORM_TYPE,FORM_TEMPLATE,reviewersOf,formPreview,formMutate,newAssessment,score10,validateFormRule} from './form-engine.mjs';
import {addMessageEvent,afterMessageAction,returnMonthly,validateMonthlySubmission} from './app-events.mjs';
const fail=(ok,msg,status=400)=>{if(!ok)throw new AppError(msg,status);};
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const monthNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const clean=(v,max=2000)=>{fail(typeof v==='string'&&v.trim().length>0&&v.length<=max,'请填写完整内容，且不要超过长度限制');return v.trim();};
const date=(v)=>{fail(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日期无效');return v;};
const month=(v)=>{fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(v),'月份无效');return v;};
const finite=(v,min,max)=>{fail(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,`数值须在 ${min}—${max} 之间`);return v;};
export function fifthWorkday(m,calendar={}){month(m);let d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);let count=0;for(let i=0;i<70;i++){const key=d.toISOString().slice(0,10),over=calendar[key];if(over===true||(over!==false&&d.getUTCDay()!==0&&d.getUTCDay()!==6))count++;if(count===5)return key;d.setUTCDate(d.getUTCDate()+1);}throw new AppError('日历配置异常');}
export function emptyState(){return {people:[],cycles:[],assessments:[],tasks:[],calendar:{},rules:[],audit:[],archives:[]};}
export function demoState({legacy=false}={}){
 const s=emptyState(); s.people=[
 {id:'lin',name:'林悦',dept:'产品设计部',managerId:'zhou',hrbpId:'chen',roles:[],active:true},
 {id:'zhou',name:'周宁',dept:'产品设计部',managerId:null,hrbpId:'chen',roles:['manager'],active:true},
 {id:'chen',name:'陈嘉',dept:'人力资源部',managerId:null,hrbpId:null,roles:['hrbp','admin'],active:true},
 {id:'xu',name:'许航',dept:'研发工程部',managerId:null,hrbpId:'chen',roles:[],active:true},
 {id:'he',name:'何澄',dept:'品牌市场部',managerId:'zhou',hrbpId:'chen',roles:[],active:true}];
 const current=monthNow(),d=new Date(current+'-01');d.setUTCMonth(d.getUTCMonth()-1);const previous=d.toISOString().slice(0,7);
 for(const m of [previous,current]){const c={id:'c-'+m,month:m,due:fifthWorkday(m),calendarConfirmed:false,openedAt:now(),ruleId:null};s.cycles.push(c);for(const person of s.people.filter(p=>['lin','he'].includes(p.id)))s.assessments.push({id:'a-'+m+'-'+person.id,cycleId:c.id,employeeId:person.id,employeeName:person.name,department:person.dept,managerId:person.managerId,hrbpId:person.hrbpId,status:'active',goalVersion:1,managerConfirmedAt:now(),employeeConfirmedAt:m===previous?now():null,components:{},redline:null});}
 const last=s.assessments.find(a=>a.employeeId==='lin'),cur=s.assessments.find(a=>a.employeeId==='lin'&&a.cycleId==='c-'+current);
 const add=(a,title,standard,weight,cross,status,reviewerId=null,result='')=>{s.tasks.push({id:uid(),assessmentId:a.id,title,standard,due:a===cur?current+'-25':previous+'-28',weight,cross,status,reviewerId,result,attachments:[],versions:[],reviews:[],version:1,createdAt:now()});};
 add(cur,'T2 新品结构方案设计','交付完整三维模型、关键尺寸图和结构评审纪要；通过研发可制造性评审。',50,true,'planned','xu');
 add(cur,'包装与说明书设计优化','完成包装信息检查、说明书改版与物料签样，归档确认记录。',30,true,'planned');
 add(cur,'设计规范知识库更新','补充 3 个项目案例，整理可复用的结构设计检查项。',20,false,'planned');
 add(last,'T2 结构样机交付','样机装配完成，提交测试报告并通过研发验收。',60,true,'submitted','xu','已完成样机装配及首轮测试，关键尺寸与图纸一致，请验收。');
 add(last,'产品视觉物料交付','交付主视觉与详情页源文件，经品牌部门确认。',40,true,'returned','he','首版设计已提交，待补充移动端适配图。');
 s.tasks.at(-1).reviews.push({actorId:'he',name:'何澄',decision:'returned',comment:'请补充移动端适配图和最终源文件。',at:now()});
 const h=s.assessments.find(a=>a.employeeId==='he'&&a.cycleId==='c-'+current);add(h,'11 月品牌活动视觉','完成全渠道活动视觉素材并按期上线。',100,true,'planned','lin');
 s.audit.push({id:uid(),at:now(),actorId:'system',actorName:'系统',action:'初始化虚构试点数据',target:'试点工作区'});if(!legacy){for(const a of s.assessments){a.collaborationMode='monthly';a.collaborationReviewerIds=a.employeeId==='lin'?['xu','he']:['xu','lin'];a.collaborationAssignmentVersion=1;a.monthlyCollaborationEvaluations={};}for(const t of s.tasks){t.cross=false;t.reviewerId=null;t.reviewerIds=[];}}return s;
}
export const isAdmin=u=>u.roles.includes('admin');
export const canManage=(u,a)=>isAdmin(u)||a.managerId===u.id||a.hrbpId===u.id;
export const canSee=(u,a,s)=>u.id===a.employeeId||canManage(u,a)||(isMonthlyCollaboration(a)?a.monthlySubmission?.status==='submitted'&&monthlyReviewersOf(a).includes(u.id):s.tasks.some(t=>t.assessmentId===a.id&&reviewersOf(t).includes(u.id)));
export const taskVisible=(u,t,a)=>u.id===a.employeeId||canManage(u,a)||(isMonthlyCollaboration(a)?a.monthlySubmission?.status==='submitted'&&monthlyReviewersOf(a).includes(u.id):reviewersOf(t).includes(u.id));
export function actorFor(s,id){const u=s.people.find(p=>p.id===id&&p.active);fail(u,'人员未导入或账号未获授权',403);return u;}
export function view(s,u,demo){
 const visible=s.assessments.filter(a=>canSee(u,a,s));
 const assessments=visible.map(a=>{
  if(a.employeeId!==u.id&&!canManage(u,a)&&isMonthlyCollaboration(a)&&a.monthlySubmission?.status==='submitted'&&monthlyReviewersOf(a).includes(u.id))return {id:a.id,cycleId:a.cycleId,employeeId:a.employeeId,employeeName:a.employeeName,department:a.department,position:a.position,status:a.status,reviewOnly:true,collaborationMode:'monthly',collaborationReviewerIds:[u.id],collaborationAssignmentVersion:a.collaborationAssignmentVersion,monthlySubmission:a.monthlySubmission?{id:a.monthlySubmission.id,status:a.monthlySubmission.status}:null,monthlyCollaborationEvaluations:a.monthlyCollaborationEvaluations?.[u.id]?{[u.id]:a.monthlyCollaborationEvaluations[u.id]}:{}};
  if(a.employeeId!==u.id&&!canManage(u,a))return {id:a.id,cycleId:a.cycleId,employeeId:a.employeeId,employeeName:a.employeeName,department:a.department,status:a.status,reviewOnly:true};
  const cycleMonth=s.cycles.find(c=>c.id===a.cycleId)?.month;const previous=cycleMonth?new Date(cycleMonth+'-01T00:00:00Z'):null;if(previous)previous.setUTCMonth(previous.getUTCMonth()-1);
  const previousCycle=s.cycles.find(c=>c.month===previous?.toISOString().slice(0,7));const previousScore=s.assessments.find(x=>x.cycleId===previousCycle?.id&&x.employeeId===a.employeeId&&x.status!=='active')?.finalScore??null;
  const chosen=s.rules.find(r=>r.id===s.cycles.find(c=>c.id===a.cycleId)?.ruleId),preview=formPreview(s,a,chosen);
  if(canManage(u,a)||a.status!=='active')return {...a,preview,position:a.position||'',previousScore};
  return {...a,components:{},qualityEvaluations:{},monthlyCollaborationEvaluations:{},collaborationAssignmentHistory:undefined,previousScore,preview:{ruleApproved:preview.ruleApproved,ruleName:preview.ruleName,blockers:preview.blockers,ready:false}};
 });
 const tasks=s.tasks.filter(t=>{const a=s.assessments.find(a=>a.id===t.assessmentId);return a&&taskVisible(u,t,a);}).map(t=>{
  const a=s.assessments.find(a=>a.id===t.assessmentId);if(canManage(u,a)||(a.employeeId===u.id&&a.status!=='active'))return t;
  const own=a.employeeId===u.id;
  const trim=v=>({...v,managerEvaluation:undefined,collaborationEvaluations:own?{}:Object.fromEntries(Object.entries(v.collaborationEvaluations||{}).filter(([key])=>key==='reviewer:'+u.id)),evaluationHistory:undefined,selfEvaluation:own?v.selfEvaluation:undefined});
  return {...trim(t),versions:t.versions.map(trim)};
 });
 const audit=s.audit.filter(e=>{
  if(isAdmin(u)||e.actorId===u.id)return true;
  const as=s.assessments.find(a=>a.id===e.target)||s.assessments.find(a=>s.tasks.some(t=>t.id===e.target&&t.assessmentId===a.id));
  if(as&&canManage(u,as))return true;
  if(['score','scoreTask','scoreQuality','scoreCollaboration','scoreMonthlyCollaboration','saveTaskSelf'].includes(e.action))return false;
  return tasks.some(t=>(e.targets||[e.target]).includes(t.id));
 }).slice(-100).reverse().map(e=>isAdmin(u)||e.actorId===u.id?e:{...e,details:undefined});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 const bonusInbox=s.assessments.filter(a=>a.status==='active'&&a.bonus&&(a.managerId===u.id||a.hrdId===u.id||isAdmin(u))).map(a=>({assessmentId:a.id,cycleId:a.cycleId,employeeName:a.employeeName,department:a.department,managerId:a.managerId,hrdId:a.hrdId,bonus:a.bonus}));
 return {user:u,demo,workspace:workspaceAccess(s,u),version:'0.6.1',defaultCycleId:defaultCycleId(s.cycles),assessmentWorkMonth:assessmentMonthNow(),gradingPolicy:{id:GRADING_POLICY_ID,bands:GRADE_BANDS,confirmation:s.gradingPolicyConfirmation||null},catalog:FORM_TEMPLATE,people:s.people.filter(p=>p.active||isAdmin(u)).map(({feishuOpenId,...p})=>p),cycles:s.cycles,assessments,tasks,calendar:isAdmin(u)?s.calendar:undefined,rules:s.rules,archives:s.archives.filter(a=>isAdmin(u)||a.employeeId===u.id||a.managerId===u.id||a.hrbpId===u.id).map(({snapshot,...a})=>a),audit,bonusInbox,overdueTaskIds:tasks.filter(t=>t.due<today&&t.status!=='accepted'&&s.assessments.find(a=>a.id===t.assessmentId)?.status==='active').map(t=>t.id)};
}
export function mutate(s,u,action,b={}){
 const at=now();let target=b.id||b.assessmentId||b.assessmentIds?.join(',')||b.cycleId||action;
 const a=s.assessments.find(a=>a.id===(b.assessmentId||b.id));
 const t=s.tasks.find(t=>t.id===b.id); const ta=t&&s.assessments.find(a=>a.id===t.assessmentId);
 const oldCases=a?JSON.stringify(a.qualityCases||{}):null;
 const active=x=>{fail(x,'记录不存在',404);fail(x.status==='active','考核已经发布或归档，不能修改',409);};
 const admin=()=>fail(isAdmin(u),'需要绩效管理员权限',403);
 const invalidate=x=>{x.managerConfirmedAt=null;x.employeeConfirmedAt=null;x.goalVersion++;x.components={};};
 const tasksOf=x=>s.tasks.filter(t=>t.assessmentId===x.id);
 const weights=x=>{const ts=tasksOf(x);fail(ts.length&&Math.abs(ts.reduce((v,t)=>v+t.weight,0)-100)<0.001,'目标权重合计必须等于 100%');};
 const log=()=>s.audit.push({id:uid(),at,actorId:u.id,actorName:u.name,action,target,targets:String(target).split(','),reason:b.reason||null,details:structuredClone(b)});
 switch(action){
 case 'submitAssessment':{
 validateMonthlySubmission(s,u,a);fail(a.managerId,'请先核对直属上级',409);a.submissionSequence=(a.submissionSequence||0)+1;const eventId='manager:'+a.id+':'+a.submissionSequence;
 if(a.monthlySubmission)(a.submissionHistory||=[]).push(structuredClone(a.monthlySubmission));if(isMonthlyCollaboration(a)&&Object.keys(a.monthlyCollaborationEvaluations||{}).length){(a.collaborationAssignmentHistory||=[]).push({reviewerIds:monthlyReviewersOf(a),assignmentVersion:a.collaborationAssignmentVersion,evaluations:structuredClone(a.monthlyCollaborationEvaluations),reason:'员工重新提交整月绩效，保留上一轮评分',at});a.monthlyCollaborationEvaluations={};}a.monthlySubmission={id:uid(),eventId,status:'submitted',at,managerId:a.managerId,managerSource:a.managerSource||'configured'};addMessageEvent(s,{id:eventId,kind:'manager_submission',assessmentId:a.id,recipientId:a.managerId,extra:{submissionId:a.monthlySubmission.id}});break;}
 case 'returnAssessment':{active(a);fail(a.managerId===u.id||isAdmin(u),'仅直属上级或管理员可退回',403);fail(a.monthlySubmission?.status==='submitted','尚无整月提交',409);returnMonthly(a,clean(b.reason));addMessageEvent(s,{id:'return:'+a.id+':'+a.monthlySubmission.id,kind:'assessment_returned',assessmentId:a.id,recipientId:a.employeeId});break;}
 case 'openCycle':{
 admin();month(b.month);fail(!s.cycles.some(c=>c.month===b.month),'该月份已开启',409);const c={id:uid(),month:b.month,remindersEnabled:b.remindersEnabled!==false,due:fifthWorkday(b.month,s.calendar),calendarConfirmed:false,openedAt:at,ruleId:null};s.cycles.push(c);target=c.id;
 for(const p of s.people.filter(p=>eligibleForAssessment(s,p)))s.assessments.push(newAssessment(p,c.id));break;}
 case 'setCycleReminders':{admin();const c=s.cycles.find(c=>c.id===b.cycleId);fail(c,'月份不存在');fail(typeof b.enabled==='boolean','提醒开关无效');c.remindersEnabled=b.enabled;c.remindersUpdatedAt=at;c.remindersUpdatedBy=u.id;break;}
 case 'createTask':{
 active(a);fail(!isMonthlyCollaboration(a)||!b.cross,'已取消跨部门任务分类，请刷新后创建普通OKR任务',409);fail(a.managerId===u.id||a.employeeId===u.id||isAdmin(u),'无权建立目标',403);fail(!a.employeeConfirmedAt,'目标已签约，请使用目标变更',409);const task={id:uid(),assessmentId:a.id,title:clean(b.title,160),objective:clean(b.objective,100),description:clean(b.description),formVersion:FORM_TYPE,standard:clean(b.standard),due:date(b.due),weight:finite(b.weight,0.01,100),cross:!!b.cross,status:'planned',reviewerId:null,result:'',attachments:[],versions:[],reviews:[],version:1,createdAt:at};s.tasks.push(task);a.formVersion=FORM_TYPE;invalidate(a);target=task.id;break;}
 case 'changeTask':{
 active(ta);fail(ta.managerId===u.id||isAdmin(u),'仅直属上级可变更目标',403);fail(!ta.components||!Object.values(ta.components).some(c=>c.score!=null),'已有评分，请先撤回评分',409);clean(b.reason);t.versions.push({version:t.version,title:t.title,objective:t.objective,description:t.description,selfEvaluation:structuredClone(t.selfEvaluation||null),managerEvaluation:structuredClone(t.managerEvaluation||null),collaborationEvaluations:structuredClone(t.collaborationEvaluations||{}),reviewerIds:reviewersOf(t),standard:t.standard,due:t.due,weight:t.weight,result:t.result,remark:t.remark||'',attachments:structuredClone(t.attachments),reviews:structuredClone(t.reviews),managerConfirmedAt:ta.managerConfirmedAt,employeeConfirmedAt:ta.employeeConfirmedAt,goalVersion:ta.goalVersion,reason:b.reason,changedBy:u.id,at});Object.assign(t,{title:clean(b.title,160),objective:b.objective?clean(b.objective,100):t.objective||'',description:b.description?clean(b.description):t.description||t.title,selfEvaluation:null,managerEvaluation:null,collaborationEvaluations:{},standard:clean(b.standard),due:date(b.due),weight:finite(b.weight,0.01,100),version:t.version+1,status:'planned',result:'',attachments:[],reviews:[]});invalidate(ta);break;}
 case 'approveGoals':active(a);fail(a.managerId===u.id||isAdmin(u),'仅直属上级可确认目标方案',403);weights(a);fail(!a.employeeConfirmedAt,'该版本已确认',409);a.managerConfirmedAt=at;break;
 case 'confirmGoals':active(a);fail(a.employeeId===u.id,'仅员工本人可确认目标',403);weights(a);fail(a.managerConfirmedAt,'请等待主管确认方案',409);fail(!a.employeeConfirmedAt,'已经确认',409);a.employeeConfirmedAt=at;a.confirmedBy=u.id;break;
 case 'assign':{
 fail(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=200,'请选择任务');const reviewerIds=Array.from(new Set(b.reviewerIds?.length?b.reviewerIds:[b.reviewerId]));fail(reviewerIds.length&&reviewerIds.length<=10,'请选择1—10名验收人');reviewerIds.forEach(id=>actorFor(s,id));
 for(const id of b.ids){const task=s.tasks.find(t=>t.id===id),as=task&&s.assessments.find(a=>a.id===task.assessmentId);active(as);fail(!isMonthlyCollaboration(as),'请按员工分派月度跨部门评分人');fail(as.hrbpId===u.id||isAdmin(u),'仅负责 HRBP 可分派',403);fail(task.cross,'仅跨部门任务需要分派');fail(!reviewerIds.includes(as.employeeId),'不能分派给任务提交人');fail(task.status!=='accepted','已验收任务不能改派',409);const old=reviewersOf(task);if(old.length&&JSON.stringify(old)!==JSON.stringify(reviewerIds)){clean(b.reason);task.submissionVersion=(task.submissionVersion||0)+1;task.collaborationEvaluations={};}task.reviewerIds=reviewerIds;task.reviewerId=reviewerIds[0];}target=b.ids.join(',');break;}
 case 'submit':{
 active(ta);fail(ta.employeeId===u.id,'仅员工本人可提交成果',403);fail(ta.employeeConfirmedAt,'请先完成目标签约',409);fail(['planned','returned'].includes(t.status),'当前状态不能提交',409);fail(!t.cross||reviewersOf(t).length,'等待 HRBP 指定验收人',409);
 if(t.formVersion===FORM_TYPE||b.selfTimeliness!=null||b.selfQuality!=null)t.selfEvaluation={timeliness:score10(b.selfTimeliness),quality:score10(b.selfQuality),at,actorId:u.id};
 t.result=clean(b.result,10000);if(b.remark!=null){fail(typeof b.remark==='string'&&b.remark.length<=2000,'备注不能超过2000字');t.remark=b.remark.trim();}t.status='submitted';t.submissionVersion=(t.submissionVersion||0)+1;t.managerEvaluation=null;t.collaborationEvaluations={};t.submittedAt=at;ta.components={};break;}
 case 'review':{
 active(ta);fail(!isMonthlyCollaboration(ta),'本月采用直接上级评分，无需单独任务验收');fail(t.cross?reviewersOf(t).includes(u.id):ta.managerId===u.id,'不是该任务的验收人',403);fail(t.status==='submitted','任务不在待验收状态',409);fail(['accepted','returned'].includes(b.decision),'验收结论无效');const round=t.submissionVersion||0;
 fail(!t.reviews.some(r=>r.actorId===u.id&&(r.round||0)===round),'本轮已提交验收',409);t.reviews.push({actorId:u.id,name:u.name,decision:b.decision,comment:clean(b.comment),round,at});
 t.status=b.decision==='returned'?'returned':(t.cross?reviewersOf(t):[ta.managerId]).every(id=>t.reviews.some(r=>r.actorId===id&&(r.round||0)===round&&r.decision==='accepted'))?'accepted':'submitted';ta.components={};break;}
 case 'saveRule':{
 admin();fail(b.confirmed===true,'需确认制度已经批准');clean(b.approvalReference);fail(Array.isArray(b.components)&&b.components.length>0&&b.components.length<=8,'至少配置一个模块');const cs=b.components.map((c,i)=>({key:'m'+i,name:clean(c.name,80),weight:finite(c.weight,0.01,100),scorer:c.scorer}));fail(cs.every(c=>['manager','hrbp'].includes(c.scorer)),'评分主体无效');fail(Math.abs(cs.reduce((v,c)=>v+c.weight,0)-100)<0.001,'模块权重须合计 100%');const r={id:uid(),name:clean(b.name,80),components:cs,approvedBy:u.id,approvalReference:b.approvalReference,approvedAt:at,cap:100,redlineZero:true};s.rules.push(r);target=r.id;break;}
 case 'bindRule':{admin();const c=s.cycles.find(c=>c.id===b.cycleId);fail(c,'月份不存在');fail(s.rules.some(r=>r.id===b.ruleId),'规则不存在');const chosen=s.rules.find(r=>r.id===b.ruleId);fail(c.ruleId===chosen.id||ruleAvailable(chosen),'方案已停用或删除，请选择可用方案',409);if(chosen.type===FORM_TYPE)fail(s.assessments.filter(a=>a.cycleId===c.id).every(a=>isMonthlyCollaboration(a)===(chosen.collaborationMode==='monthly')),'评分方案与当月考核结构不一致，请使用月度跨部门评分方案',409);fail(s.assessments.filter(a=>a.cycleId===c.id).every(a=>a.status==='active'&&Object.keys(a.components).length===0),'已评分或已发布的月份不能更换规则',409);fail(!c.ruleId||c.ruleId===b.ruleId||s.assessments.filter(a=>a.cycleId===c.id).every(a=>!Object.keys(a.qualityEvaluations||{}).length&&!Object.keys(a.monthlyCollaborationEvaluations||{}).length&&tasksOf(a).every(t=>!t.managerEvaluation&&!Object.keys(t.collaborationEvaluations||{}).length)),'已有明细评分，请先撤回评分再更换规则',409);c.ruleId=b.ruleId;break;}
 case 'score':{active(a);const c=s.cycles.find(c=>c.id===a.cycleId),r=s.rules.find(r=>r.id===c.ruleId);fail(r,'评分制度尚未配置，不能计分',409);fail(a.employeeConfirmedAt&&tasksOf(a).every(t=>t.status==='accepted'),'目标签约和逐项验收须全部完成',409);fail(Array.isArray(r.components),'此规则采用原表明细评分',409);const component=r.components.find(c=>c.key===b.key);fail(component,'评分模块不存在');fail((component.scorer==='manager'?a.managerId:a.hrbpId)===u.id,'不是该模块的评分人',403);a.components[b.key]={score:finite(b.score,0,100),comment:clean(b.comment),actorId:u.id,at};break;}
 case 'clearScores':active(a);fail(a.managerId===u.id||isAdmin(u),'无权限',403);clean(b.reason);a.components={};a.qualityEvaluations={};if(isMonthlyCollaboration(a)&&Object.keys(a.monthlyCollaborationEvaluations||{}).length){(a.collaborationAssignmentHistory||=[]).push({reviewerIds:monthlyReviewersOf(a),assignmentVersion:a.collaborationAssignmentVersion,evaluations:structuredClone(a.monthlyCollaborationEvaluations),reason:b.reason,actorId:u.id,at});a.monthlyCollaborationEvaluations={};a.collaborationAssignmentVersion++;}for(const task of tasksOf(a)){task.managerEvaluation=null;task.collaborationEvaluations={};}break;
 case 'redline':active(a);admin();a.redline={reason:clean(b.reason),actorId:u.id,at};break;
 case 'publish':{
 active(a);admin();const c=s.cycles.find(c=>c.id===a.cycleId),r=s.rules.find(r=>r.id===c.ruleId);fail(c.calendarConfirmed,'请先核对该月的工作日历',409);fail(r,'评分制度尚未确认，不能发布',409);fail(a.employeeConfirmedAt&&tasksOf(a).length&&tasksOf(a).every(t=>t.status==='accepted'),'目标及验收尚未完成',409);if(r.type===FORM_TYPE){const preview=formPreview(s,a,r);fail(a.redline||preview.ready,preview.blockers.join('；'),409);a.finalScore=preview.finalScore;a.grade=preview.grade;a.gradeReason=preview.gradeReason;a.calculationSnapshot=structuredClone(preview);}else{fail(a.formVersion!==FORM_TYPE,'本考核须绑定原表明细评分规则',409);fail(a.redline||r.components.every(c=>a.components[c.key]?.score!=null),'存在未评分模块，不能按 0 分发布',409);a.finalScore=a.redline?0:Math.min(100,Math.round(r.components.reduce((v,c)=>v+a.components[c.key].score*c.weight/100,0)*100)/100);}const pm=new Date(c.month+'-01T00:00:00Z');pm.setUTCMonth(pm.getUTCMonth()-1);const pc=s.cycles.find(x=>x.month===pm.toISOString().slice(0,7));a.previousScore=s.assessments.find(x=>x.cycleId===pc?.id&&x.employeeId===a.employeeId&&x.status!=='active')?.finalScore??null;a.publishedAt=at;a.status='published';a.ruleSnapshot=structuredClone(r);break;}
 case 'archive':{
 fail(a,'记录不存在',404);admin();fail(a.status==='published','仅已发布结果可以正式归档',409);a.status='archived';a.archivedAt=at;const snapshot={assessment:structuredClone(a),tasks:structuredClone(tasksOf(a)),cycle:structuredClone(s.cycles.find(c=>c.id===a.cycleId)),people:structuredClone(s.people.filter(p=>[a.employeeId,a.managerId,a.hrbpId,a.hrdId,...monthlyReviewersOf(a),...tasksOf(a).flatMap(reviewersOf)].includes(p.id)).map(({feishuOpenId,...p})=>p)),audit:structuredClone(s.audit.filter(e=>(e.targets||[e.target]).some(id=>[a.id,...tasksOf(a).map(t=>t.id)].includes(id))))};s.archives.push({id:uid(),employeeId:a.employeeId,managerId:a.managerId,hrbpId:a.hrbpId,name:a.employeeName,month:snapshot.cycle.month,score:a.finalScore,at,snapshot});break;}
 case 'calendar':{admin();date(b.date);fail(typeof b.workday==='boolean','请选择工作日或休息日');s.calendar[b.date]=b.workday;for(const c of s.cycles){if(s.assessments.filter(a=>a.cycleId===c.id).every(a=>a.status==='active')){c.due=fifthWorkday(c.month,s.calendar);c.calendarConfirmed=false;}}break;}
 case 'confirmCalendar':{admin();const c=s.cycles.find(c=>c.id===b.cycleId);fail(c,'月份不存在');c.calendarConfirmed=true;c.calendarConfirmedBy=u.id;c.calendarConfirmedAt=at;break;}
 case 'importPeople':{admin();fail(Array.isArray(b.people)&&b.people.length>0&&b.people.length<=1000,'请提供 1—1000 条人员');const ids=new Set(),opens=new Set();const next=b.people.map(p=>{const id=clean(p.id,80);fail(!ids.has(id),'人员 ID 重复');ids.add(id);if(p.feishuOpenId){fail(!opens.has(p.feishuOpenId),'飞书 Open ID 重复');opens.add(p.feishuOpenId);}fail(Array.isArray(p.roles)&&p.roles.every(r=>['admin','hrbp','manager','hrd'].includes(r)),'角色无效');return {id,name:clean(p.name,80),dept:clean(p.dept,80),position:typeof p.position==='string'?p.position.trim().slice(0,100):'',managerId:p.managerId||null,hrbpId:p.hrbpId||null,hrdId:p.hrdId||null,roles:p.roles,active:p.active!==false,feishuOpenId:p.feishuOpenId||s.people.find(old=>old.id===id)?.feishuOpenId||null};});for(const p of next){const old=s.people.find(x=>x.id===p.id);if(old&&old.dept===p.dept){for(const key of ['departmentId','departmentPathIds','departmentPath','assessmentPaused','assessmentPauseSource','assessmentPauseReason'])if(old[key]!==undefined)p[key]=structuredClone(old[key]);if(old.hrbpId===p.hrbpId){for(const key of ['hrbpAssignmentSource','hrbpRuleDepartmentId','hrbpRuleDepartmentName','hrbpSelfReviewAuthorized'])if(old[key]!==undefined)p[key]=old[key];}else{p.hrbpAssignmentSource='manual';p.hrbpSelfReviewAuthorized=p.hrbpId===p.id&&old.hrbpSelfReviewAuthorized===true;}}}const bound=next.filter(p=>p.feishuOpenId).map(p=>p.feishuOpenId);fail(new Set(bound).size===bound.length,'飞书 Open ID 重复');fail(next.some(p=>p.id===u.id&&p.roles.includes('admin')&&p.active),'不能移除当前管理员');for(const p of next){fail(!p.managerId||ids.has(p.managerId),'主管不存在');fail(!p.hrbpId||next.some(x=>x.id===p.hrbpId&&x.roles.includes('hrbp')),'HRBP 不存在或无角色');fail(p.hrbpId!==p.id||s.people.some(old=>old.id===p.id&&old.dept===p.dept&&old.hrbpSelfReviewAuthorized===true),'HRBP本人兼任规则尚未明确');fail(!p.hrdId||next.some(x=>x.id===p.hrdId&&x.active&&x.roles.includes('hrd')),'HRD 不存在、停用或无角色');fail(p.managerId!==p.id,'不能将自己设为主管');}for(const old of s.people)if(!ids.has(old.id))next.push({...old,active:false});s.people=next;break;}
 default:if(!schemeMutate(s,u,action,b,{validateRule:(body,actor)=>validateFormRule(body,actor,{legacy:s.assessments.length>0&&s.assessments.every(a=>!isMonthlyCollaboration(a))})})&&!formMutate(s,u,action,b,{a,t,ta,active,admin}))throw new AppError('未知操作',404);
 }
 afterMessageAction(s,u,action,b,{a,t,ta,oldCases});log();return s;
}
export async function readStore(db,key,demo){let row=await db.prepare('SELECT revision,payload FROM workspaces WHERE id=?').bind(key).first();if(!row){const s=demo?demoState():emptyState();await db.prepare('INSERT OR IGNORE INTO workspaces(id,revision,payload,updated_at) VALUES(?,0,?,?)').bind(key,JSON.stringify(s),now()).run();row=await db.prepare('SELECT revision,payload FROM workspaces WHERE id=?').bind(key).first();}return {revision:row.revision,state:JSON.parse(row.payload)};}
export async function writeStore(db,key,revision,state){const result=await db.prepare('UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(state),now(),key,revision).run();fail((result.meta?.changes??result.changes)===1,'记录已被其他人更新，请刷新后重试',409);return revision+1;}
export async function api(request,env,identity){
 try{
 fail(identity,'请先登录',401);const url=new URL(request.url);const path=url.pathname.replace(/^\/api\/?/,'');
 const {key,userId,demo}=identity;let {state:s,revision}=await readStore(env.DB,key,demo);const u=actorFor(s,userId||request.headers.get('x-demo-user')||'lin');
 if(request.method==='GET'&&path==='state')return Response.json({...((env.APP_MESSAGING?.decorate(view(s,u,demo)))||view(s,u,demo)),ruleDrafts:isAdmin(u)?s.ruleDrafts||[]:[],revision});
 if(request.method==='GET'&&(path==='cycle-reports'||path.startsWith('cycle-reports/'))){
  fail(isAdmin(u),'需要管理员权限',403);const reporting=env.APP_MESSAGING?.reports;fail(reporting,'此部署尚未启用月度汇总',409);
  if(path==='cycle-reports'){const cycleId=url.searchParams.get('cycleId'),result=reporting.status(s,cycleId,key);fail(result.progress,'考核月份不存在',404);if(url.searchParams.get('format')!=='xlsx')return Response.json(result);return new Response(sheetsWorkbookBytes(cycleReportSheets(result.progress)),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.progress.month+'_绩效进度与汇总.xlsx')}`,'cache-control':'no-store'}});}
  const match=path.match(/^cycle-reports\/([A-Za-z0-9_-]{1,100})\/xlsx$/);fail(match,'接口不存在',404);const version=reporting.version(match[1],key);fail(version,'汇总版本不存在',404);return new Response(sheetsWorkbookBytes(version.sheets),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(version.month+(version.phase==='complete'?'_正式结果汇总':'_评分汇总待发布')+'.xlsx')}`,'cache-control':'no-store'}});
 }
 if(request.method==='GET'&&path==='app-messaging/directory'){fail(isAdmin(u),'需要管理员权限',403);fail(env.APP_MESSAGING,'当前部署尚未接入飞书人员同步',409);const audit=s.audit.findLast(e=>e.action==='从飞书同步员工与直属上级');return Response.json({demo,lastSync:s.directorySync||(audit?.details?.total!=null?{at:audit.at,counts:audit.details}:null)});}
 if(request.method==='GET'&&path==='app-messaging'){fail(isAdmin(u),'需要管理员权限',403);fail(env.APP_MESSAGING,'当前部署尚未接入自建应用推送',409);return Response.json(env.APP_MESSAGING.status(s.calendar));}
 if(request.method==='GET'&&path==='notifications'){fail(isAdmin(u),'需要管理员权限',403);fail(env.REMINDERS,'此部署尚未接入群提醒',409);return Response.json(env.REMINDERS.status(s.calendar));}
 if(request.method==='GET'&&path==='access-requests'){fail(isAdmin(u),'需要管理员权限',403);return Response.json({requests:await env.ACCESS_REQUESTS?.list()||[]});}
 if(request.method==='GET'&&path.startsWith('file/')){const id=path.slice(5);let task=s.tasks.find(t=>[...t.attachments,...t.versions.flatMap(v=>v.attachments||[])].some(f=>f.id===id));if(!task){for(const ar of s.archives){if(![ar.employeeId,ar.managerId,ar.hrbpId].includes(u.id)&&!isAdmin(u))continue;task=ar.snapshot.tasks.find(t=>t.attachments.some(f=>f.id===id));if(task)break;}}const a=task&&s.assessments.find(a=>a.id===task.assessmentId);fail(task&&a&&taskVisible(u,task,a),'无权访问附件',403);const f=[...task.attachments,...task.versions.flatMap(v=>v.attachments||[])].find(f=>f.id===id),obj=await env.BUCKET.get(key+'/'+id);fail(obj,'附件不存在',404);return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});}
 if(request.method==='GET'&&path.startsWith('archive/')){const ar=s.archives.find(a=>a.id===path.slice(8));fail(ar&&(isAdmin(u)||[ar.employeeId,ar.managerId,ar.hrbpId].includes(u.id)),'无权查看档案',403);return Response.json(ar);}
 fail(request.method==='POST','接口不存在',404);fail(!request.headers.get('origin')||request.headers.get('origin')===url.origin,'来源校验失败',403);
 if(path==='upload'){const taskId=url.searchParams.get('taskId'),t=s.tasks.find(t=>t.id===taskId),a=t&&s.assessments.find(a=>a.id===t.assessmentId);fail(a&&a.employeeId===u.id,'无权上传',403);fail(a.status==='active'&&['planned','returned'].includes(t.status),'当前任务不可上传',409);fail(t.attachments.length<10,'每项任务最多 10 个附件');const length=Number(request.headers.get('content-length')||0);fail(length<=10*1024*1024,'附件不能超过 10MB');const buffer=await request.arrayBuffer();fail(buffer.byteLength>0&&buffer.byteLength<=10*1024*1024,'附件大小须为 1B—10MB');const file={id:uid(),name:clean(decodeURIComponent(request.headers.get('x-file-name')||'附件'),200),size:buffer.byteLength,at:now()};await env.BUCKET.put(key+'/'+file.id,buffer);t.attachments.push(file);s.audit.push({id:uid(),at:now(),actorId:u.id,actorName:u.name,action:'上传附件',target:t.id});await writeStore(env.DB,key,revision,s);return Response.json({ok:true});}
 fail(Number(request.headers.get('content-length')||0)<=2*1024*1024,'请求过大',413);const b=await request.json();fail(b.revision===revision,'页面已过期，请刷新后重试',409);
 if(path==='cycle-reports/refresh'){fail(isAdmin(u),'需要管理员权限',403);fail(env.APP_MESSAGING?.reports,'此部署尚未启用月度汇总',409);env.APP_MESSAGING.reports.sync(s,key);env.APP_MESSAGING.kick(key);return Response.json({ok:true});}
 if(path==='submitAssessment'){
  fail(env.APP_MESSAGING,'请先完成自建应用接入',409);const assessment=s.assessments.find(a=>a.id===b.id);validateMonthlySubmission(s,u,assessment);await env.APP_MESSAGING.prepareSubmission(s,u,assessment);mutate(s,u,path,{id:b.id});await writeStore(env.DB,key,revision,s);env.APP_MESSAGING.kick(key);return Response.json({ok:true,notification:{status:'queued'}});
 }
 if(path.startsWith('app-messaging/')){
  fail(isAdmin(u),'需要管理员权限',403);const svc=env.APP_MESSAGING;fail(svc,'当前部署尚未接入自建应用推送',409);
  if(path==='app-messaging/save')return Response.json({ok:true,config:svc.save(b,u.id)});
  if(path==='app-messaging/check')return Response.json({ok:true,connection:await svc.check(u)});
  if(path==='app-messaging/test')return Response.json({ok:true,receipt:await svc.test(u,key)});
  if(path==='app-messaging/preview-directory')return Response.json({ok:true,preview:await svc.directoryPreview(s)});
  if(path==='app-messaging/apply-directory'){const counts=svc.applyDirectory(s,b.previewId);fail(s.people.some(p=>p.id===u.id&&p.active&&p.roles.includes('admin')),'同步结果不能停用当前管理员',409);s.directorySync={at:now(),counts,actorId:u.id};s.audit.push({id:uid(),at:s.directorySync.at,actorId:u.id,actorName:u.name,action:'从飞书同步员工与直属上级',target:'directory',details:counts});await writeStore(env.DB,key,revision,s);return Response.json({ok:true,counts});}
  if(path==='app-messaging/retry'){svc.retry(b.id,b.confirmedNotReceived===true);return Response.json({ok:true});}
  throw new AppError('接口不存在',404);
 }
 if(path.startsWith('notifications/')){
  fail(isAdmin(u),'需要管理员权限',403);fail(env.REMINDERS,'此部署尚未接入群提醒',409);
  if(path==='notifications/save')return Response.json({ok:true,config:env.REMINDERS.save(b,u.id)});
  const result=path==='notifications/test'?await env.REMINDERS.test(s.calendar):path==='notifications/retry'?await env.REMINDERS.retry(b.id,s.calendar,b.confirmedNotReceived===true):null;
  fail(result,'接口不存在',404);fail(result.sent,result.status==='unknown'?'发送结果不确定，请先查看群内是否收到；系统不会自动重复发送。':'飞书未接受消息，请检查群机器人配置。错误码：'+result.errorCode,502);return Response.json({ok:true,...result});
 }
 if(path==='approveAccess'){
  fail(isAdmin(u),'需要管理员权限',403);fail(env.ACCESS_REQUESTS,'此部署不支持在线开通',409);const pending=await env.ACCESS_REQUESTS.get(b.requestId);fail(pending,'开通申请不存在',404);
  let person=s.people.find(p=>p.id===b.employeeId);fail(!b.employeeId||person,'目标员工不存在，请重新选择',404);
  if(person){fail(person.active,'请先启用该员工');fail(!person.feishuOpenId||person.feishuOpenId===pending.open_id,'该员工已绑定其他飞书身份',409);}
  else {mutate(s,u,'createPerson',{...b,name:pending.name,dept:b.dept||'待分配部门',roles:b.roles||[]});person=s.people.at(-1);}
  person.feishuOpenId=pending.open_id;s.audit.push({id:uid(),at:now(),actorId:u.id,actorName:u.name,action:'绑定飞书登录身份',target:person.id,details:{requestId:pending.id}});
  await writeStore(env.DB,key,revision,s);await env.ACCESS_REQUESTS.consume(pending.id);return Response.json({ok:true});
 }
 mutate(s,u,path,b);await writeStore(env.DB,key,revision,s);env.APP_MESSAGING?.kick(key);return Response.json({ok:true});
 }catch(e){if(!(e instanceof AppError))console.error('API error',e.message);return Response.json({error:e instanceof AppError?e.message:'服务处理失败，请联系 IT'}, {status:e.status||500});}
}



