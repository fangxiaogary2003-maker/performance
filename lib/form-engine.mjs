import template from './form-template.json' with {type:'json'};
import {ensure} from './errors.mjs';
export const FORM_TYPE='okr-form-v1';
export const FORM_TEMPLATE=template;
export const reviewersOf=t=>Array.from(new Set(t.reviewerIds?.length?t.reviewerIds:t.reviewerId?[t.reviewerId]:[]));
const stamp=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const text=(v,max=3000)=>{ensure(typeof v==='string'&&v.trim()&&v.length<=max,'请填写完整说明');return v.trim();};
export const score10=v=>{ensure(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10,'各项分数须为 0—10 分');return v;};
const percent=v=>{ensure(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100,'权重须为 0—100');return v;};
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const complete=(values,items)=>!!values&&items.every(i=>typeof values[i.key]==='number'&&Number.isFinite(values[i.key])&&values[i.key]>=0&&values[i.key]<=10);
const weighted=(values,items)=>complete(values,items)?items.reduce((v,i)=>v+values[i.key]*i.weight/100,0):null;
const fresh=(e,t)=>e&&(e.taskVersion??t.version)===t.version&&(e.submissionVersion??0)===(t.submissionVersion||0);
const freshScore=(t)=>fresh(t.managerEvaluation,t)?t.managerEvaluation:null;
export function formPreview(s,a,chosen){
 const rule=chosen?.type===FORM_TYPE?chosen:null;
 const p=rule||{...template.referenceWeights,weights:template.referenceWeights,collaborationScorer:'reviewers',qualityScorer:'manager_hrbp',crossAggregation:'equal',noCross:'block',bonusEnabled:true,gateEnabled:true,gateOutcome:'needs_improvement',gradeOrder:'total_first'};
 const w=p.weights,ts=s.tasks.filter(t=>t.assessmentId===a.id),missing=[];
 if(!rule)missing.push('尚未绑定经批准的评分规则');
 if(!ts.length)missing.push('尚无工作目标');
 if(Math.abs(ts.reduce((v,t)=>v+t.weight,0)-100)>0.001)missing.push('目标权重合计不是100%');
 if(!a.employeeConfirmedAt)missing.push('员工尚未确认目标');
 const detail=ts.map(t=>{const e=freshScore(t),score=e?(e.timeliness+e.quality)/2:null;if(score===null&&w.work>0&&w.okr>0)missing.push(t.title+'：缺上级时效/质量评分');if(t.status!=='accepted')missing.push(t.title+'：尚未验收通过');return {id:t.id,title:t.title,weight:t.weight,score,selfScore:t.selfEvaluation?(t.selfEvaluation.timeliness+t.selfEvaluation.quality)/2:null};});
 const okr=detail.length&&detail.every(t=>t.score!==null)?detail.reduce((v,t)=>v+t.score*t.weight/100,0):null;
 const cross=ts.filter(t=>t.cross).map(t=>{
  const expected=p.collaborationScorer==='manager'?['manager']:reviewersOf(t).map(x=>'reviewer:'+x);
  const vals=expected.map(key=>{const e=t.collaborationEvaluations?.[key];return fresh(e,t)?weighted(e.values,template.collaboration):null;});
  const value=expected.length&&vals.every(v=>v!==null)?vals.reduce((v,x)=>v+x,0)/vals.length:null;
  if(value===null&&w.work>0&&w.collaboration>0)missing.push(t.title+'：跨部门五项评价未齐');return {id:t.id,title:t.title,weight:t.weight,score:value,expected:expected.length};
 });
 let collaboration=null;
 if(cross.length&&cross.every(t=>t.score!==null)){const denom=p.crossAggregation==='task_weight'?cross.reduce((v,t)=>v+t.weight,0):cross.length;collaboration=denom?cross.reduce((v,t)=>v+t.score*(p.crossAggregation==='task_weight'?t.weight:1),0)/denom:null;}
 if(!cross.length&&p.noCross==='block'&&w.work>0&&w.collaboration>0)missing.push('无跨部门任务的计分方式需HR处理');
 if(!cross.length&&p.noCross==='okr_only'&&w.work>0&&okr===null)missing.push('无跨部门任务时需完成全部OKR上级评分');
 const work=!cross.length&&p.noCross==='okr_only'?(okr===null?null:okr*10):(w.okr>0&&okr===null)||(w.collaboration>0&&collaboration===null)?null:((okr||0)*w.okr/100+(collaboration||0)*w.collaboration/100)*10;
 const managerQuality=weighted(a.qualityEvaluations?.manager?.values,template.quality),hrQuality=weighted(a.qualityEvaluations?.hrbp?.values,template.quality);
 const needManager=p.qualityScorer==='manager_only'||w.managerQuality>0,needHR=p.qualityScorer==='manager_hrbp'&&w.hrQuality>0;
 if(needManager&&managerQuality===null&&w.quality>0)missing.push('核心素质缺上级评分');
 if(needHR&&hrQuality===null&&w.quality>0)missing.push('核心素质缺HRBP评分');
 for(const item of template.quality)if(w.quality>0&&!a.qualityCases?.[item.key]?.trim())missing.push(item.name+'：缺当月典型事例');
 const quality=(needManager&&managerQuality===null)||(needHR&&hrQuality===null)?null:p.qualityScorer==='manager_only'?managerQuality*10:((managerQuality||0)*w.managerQuality/100+(hrQuality||0)*w.hrQuality/100)*10;
 const bonus=a.bonus;let bonusScore=0;
 if(p.bonusEnabled&&bonus){if(bonus.status==='approved')bonusScore=bonus.points;else if(bonus.status!=='rejected'){bonusScore=null;missing.push('特殊加分尚未完成上级与HRD双审批');}}
 const referenceTotal=(w.work>0&&work===null)||(w.quality>0&&quality===null)||bonusScore===null?null:Math.min(100,round((work||0)*w.work/100+(quality||0)*w.quality/100+bonusScore));
 let grade=null,finalScore=referenceTotal;
 if(a.redline){finalScore=0;grade='不合格（红线）';}
 else if(finalScore!==null){const gateFailed=p.gateEnabled&&(work<75||quality<75);if(p.gradeOrder==='total_first'&&finalScore<70)grade='不合格';else if(gateFailed)grade=p.gateOutcome==='unqualified'?'不合格（双门槛）':'待改进（双门槛）';else grade=finalScore>=90?'优秀':finalScore>=75?'合格':finalScore>=70?'待改进':'不合格';}
 return {templateId:FORM_TYPE,ruleApproved:!!rule,ruleName:rule?.name||'原表参考口径（待确认）',weights:w,taskScores:detail,crossScores:cross,okr:okr===null?null:round(okr),collaboration:collaboration===null?null:round(collaboration),managerQuality:managerQuality===null?null:round(managerQuality),hrQuality:hrQuality===null?null:round(hrQuality),work:work===null?null:round(work),quality:quality===null?null:round(quality),bonus:bonusScore,referenceTotal,finalScore:rule?finalScore:null,grade:rule?grade:null,blockers:[...new Set(missing)],ready:!!rule&&finalScore!==null&&missing.length===0};
}
export function validateFormRule(b,u){
 ensure(b.confirmed===true,'评分制度需明确批准后才能生效');
 const w={};for(const k of ['work','quality','okr','collaboration','managerQuality','hrQuality'])w[k]=percent(b.weights?.[k]);
 for(const [x,y]of [['work','quality'],['okr','collaboration'],['managerQuality','hrQuality']])ensure(Math.abs(w[x]+w[y]-100)<0.001,'每组权重须合计100%');
 ensure(['reviewers','manager'].includes(b.collaborationScorer),'请确认跨部门数字评分主体');
 ensure(['manager_hrbp','manager_only'].includes(b.qualityScorer),'请确认核心素质评分主体');
 ensure(['equal','task_weight'].includes(b.crossAggregation),'请确认跨部门任务的汇总方式');
 ensure(['block','okr_only'].includes(b.noCross),'请确认无跨部门任务的处理方式');
 ensure(typeof b.bonusEnabled==='boolean'&&typeof b.gateEnabled==='boolean','请确认加分及双门槛是否启用');
 ensure(!b.gateEnabled||(w.work>0&&w.quality>0),'启用双门槛时工作事项与核心素质权重均须大于0');
 ensure(['needs_improvement','unqualified'].includes(b.gateOutcome)&&['total_first','gate_first'].includes(b.gradeOrder),'请确认双门槛不通过的等级和判断顺序');
 return {id:id(),type:FORM_TYPE,name:text(b.name,100),approvalReference:text(b.approvalReference),approvedBy:u.id,approvedAt:stamp(),weights:w,collaborationScorer:b.collaborationScorer,qualityScorer:b.qualityScorer,crossAggregation:b.crossAggregation,noCross:b.noCross,bonusEnabled:b.bonusEnabled,gateEnabled:b.gateEnabled,gateOutcome:b.gateOutcome,gradeOrder:b.gradeOrder,cap:100,redlineZero:true,templateSnapshot:structuredClone(template)};
}
export function newAssessment(p,cycleId){return {id:id(),cycleId,employeeId:p.id,employeeName:p.name,department:p.dept,position:p.position||'',managerId:p.managerId,hrbpId:p.hrbpId,hrdId:p.hrdId||null,status:'active',goalVersion:1,managerConfirmedAt:null,employeeConfirmedAt:null,components:{},redline:null,formVersion:FORM_TYPE,qualityCases:{},qualityEvaluations:{}};}
export function formMutate(s,u,action,b,ctx){
 const {a,t,ta,active,admin}=ctx,at=stamp();
 const asEmployee=x=>ensure(x.employeeId===u.id,'仅员工本人可填写',403);
 const manager=x=>ensure(x.managerId===u.id,'仅直属上级可评分',403);
 const writeValues=(values,items)=>Object.fromEntries(items.map(i=>[i.key,score10(values?.[i.key])]));
 switch(action){
 case 'saveTaskSelf':active(ta);asEmployee(ta);ensure(['planned','returned'].includes(t.status),'提交后不能修改自评',409);t.selfEvaluation={timeliness:score10(b.timeliness),quality:score10(b.quality),at,actorId:u.id};t.result=text(b.result,10000);if(b.remark!=null){ensure(typeof b.remark==='string'&&b.remark.length<=2000,'备注不能超过2000字');t.remark=b.remark.trim();}ta.formVersion=FORM_TYPE;break;
 case 'scoreTask':active(ta);manager(ta);ensure(t.status==='accepted'&&ta.employeeConfirmedAt,'请先完成签约与任务验收',409);t.managerEvaluation={timeliness:score10(b.timeliness),quality:score10(b.quality),comment:text(b.comment),actorId:u.id,at,taskVersion:t.version,submissionVersion:t.submissionVersion||0};ta.formVersion=FORM_TYPE;break;
 case 'scoreCollaboration':{
  active(ta);ensure(t.cross&&t.status==='accepted','请先验收通过跨部门任务',409);
  const kind=b.kind==='manager'?'manager':'reviewer';ensure(kind==='manager'?ta.managerId===u.id:reviewersOf(t).includes(u.id),'不是该评价的指定评分人',403);
  t.collaborationEvaluations||={};t.collaborationEvaluations[kind==='manager'?'manager':'reviewer:'+u.id]={values:writeValues(b.values,template.collaboration),comment:text(b.comment),actorId:u.id,kind,at,taskVersion:t.version,submissionVersion:t.submissionVersion||0};ta.formVersion=FORM_TYPE;break;
 }
 case 'saveQualityCases':{
  active(a);ensure(a.employeeId!==u.id||a.monthlySubmission?.status!=='submitted','整月已提交，请等待上级退回后再修改',409);ensure(a.employeeId===u.id||a.managerId===u.id||u.roles.includes('admin'),'无权填写典型事例',403);const cases=Object.fromEntries(template.quality.map(i=>[i.key,text(b.cases?.[i.key],4000)]));
  if(JSON.stringify(cases)!==JSON.stringify(a.qualityCases||{}))a.qualityEvaluations={};a.qualityCases=cases;a.formVersion=FORM_TYPE;break;
 }
 case 'scoreQuality':{
  active(a);ensure(['manager','hrbp'].includes(b.kind),'评价身份无效');ensure((b.kind==='manager'?a.managerId:a.hrbpId)===u.id,'不是该模块的评分人',403);
  ensure(template.quality.every(i=>a.qualityCases?.[i.key]?.trim()),'请先补齐当月典型事例',409);a.qualityEvaluations||={};a.qualityEvaluations[b.kind]={values:writeValues(b.values,template.quality),comment:text(b.comment),at,actorId:u.id};a.formVersion=FORM_TYPE;break;
 }
 case 'requestBonus':{
  active(a);asEmployee(a);ensure(typeof b.points==='number'&&b.points>0&&b.points<=10,'申请加分须大于0且不超过10');if(a.bonus)(a.bonusHistory||=[]).push(structuredClone(a.bonus));a.bonus={id:id(),points:b.points,reason:text(b.reason),status:'pending_manager',requestedAt:at,requestedBy:u.id,approvals:{}};a.formVersion=FORM_TYPE;break;
 }
 case 'approveBonus':{
  active(a);const bonus=a.bonus;ensure(bonus&&['pending_manager','pending_hrd'].includes(bonus.status),'没有待处理的加分申请',409);ensure(['approve','reject'].includes(b.decision),'审批结论无效');
  const kind=bonus.status==='pending_manager'?'manager':'hrd',expected=kind==='manager'?a.managerId:a.hrdId;ensure(expected&&expected===u.id,'不是当前加分审批人',403);ensure(a.managerId!==a.hrdId,'上级与HRD须由不同人员审批',409);
  bonus.approvals[kind]={actorId:u.id,decision:b.decision,comment:text(b.comment),at};bonus.status=b.decision==='reject'?'rejected':kind==='manager'?'pending_hrd':'approved';break;
 }
 case 'clearRedline':active(a);admin();text(b.reason);a.redline=null;break;
 case 'saveFormRule':admin();s.rules.push(validateFormRule(b,u));break;
 case 'saveFormRuleDraft':admin();(s.ruleDrafts||=[]).push({...structuredClone(b),id:id(),name:text(b.name,100),status:'draft',at,actorId:u.id,confirmed:false});break;
 case 'enrollCycle':{
  admin();const cycle=s.cycles.find(c=>c.id===b.cycleId);ensure(cycle,'考核月份不存在');ensure(s.assessments.filter(a=>a.cycleId===cycle.id).every(a=>a.status==='active'),'本月已有发布结果，不能扩大名单',409);
  for(const p of s.people.filter(p=>p.active&&p.managerId))if(!s.assessments.some(a=>a.cycleId===cycle.id&&a.employeeId===p.id))s.assessments.push(newAssessment(p,cycle.id));break;
 }
 case 'createPerson':{
  admin();const personId=b.personId?.trim()||id();ensure(/^[A-Za-z0-9_-]{1,100}$/.test(personId),'员工编号只能使用字母、数字、下划线和短横线');ensure(!s.people.some(p=>p.id===personId),'员工编号已存在');
  s.people.push({id:personId,name:text(b.name,80),dept:text(b.dept,80),roles:[],active:true,managerId:null,hrbpId:null,hrdId:null});
  formMutate(s,u,'savePerson',{...b,personId},{...ctx});break;
 }
 case 'savePerson':{
  admin();const p=s.people.find(p=>p.id===b.personId);ensure(p,'人员不存在');const roles=Array.isArray(b.roles)?b.roles:p.roles;ensure(roles.every(r=>['admin','hrbp','manager','hrd'].includes(r)),'角色无效');ensure(p.id!==u.id||(roles.includes('admin')&&b.active!==false),'不能停用或移除自己的管理员权限');
  const managerId=b.managerId||null,hrbpId=b.hrbpId||null,hrdId=b.hrdId||null;ensure(managerId!==p.id,'不能将自己设为直属上级');for(const ref of [managerId,hrbpId,hrdId].filter(Boolean))ensure(s.people.some(x=>x.id===ref&&x.active),'关联人员不存在或已停用');
  if(hrbpId)ensure(s.people.find(x=>x.id===hrbpId).roles.includes('hrbp'),'HRBP需要相应角色');if(hrdId)ensure(s.people.find(x=>x.id===hrdId).roles.includes('hrd'),'HRD需要相应角色');
  Object.assign(p,{name:text(b.name,80),dept:text(b.dept,80),position:typeof b.position==='string'?b.position.trim().slice(0,100):p.position||'',managerId,hrbpId,hrdId,roles,active:b.active!==false});break;
 }
 default:return false;
 }
 return true;
}
