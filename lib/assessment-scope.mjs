import template from './form-template.json' with {type:'json'};
import {monthlyCollaborationResult} from './monthly-collaboration.mjs';
import {qualitySelfReviewRequired,qualitySelfReviewComplete} from './quality-self-review.mjs';
export const isRatingsOnly=a=>a?.collaborationMode==='monthly'&&a.assessmentScope==='ratings_only';
const weighted=values=>template.quality.every(i=>typeof values?.[i.key]==='number'&&Number.isFinite(values[i.key])&&values[i.key]>=0&&values[i.key]<=10)?template.quality.reduce((n,i)=>n+values[i.key]*i.weight/100,0):null;
const round=n=>n==null?null:Math.round((n+Number.EPSILON)*100)/100;
export function ratingsOnlyPreview(s,a,chosen){
 const rule=chosen?.type==='okr-form-v1'?chosen:null,w=rule?.weights||template.referenceWeights,monthly=monthlyCollaborationResult(a,s.pilotWorkspace),manager=weighted(a.qualityEvaluations?.manager?.values),hr=weighted(a.qualityEvaluations?.hrbp?.values),managerOnly=rule?.qualityScorer==='manager_only',needManager=managerOnly||w.managerQuality>0,needHr=!managerOnly&&w.hrQuality>0,missing=[];
 if(!rule)missing.push('尚未绑定经批准的评分规则');if(a.monthlySubmission?.status!=='submitted'&&a.status==='active')missing.push('员工尚未提交综合素质自评');
 if(qualitySelfReviewRequired(a)&&!qualitySelfReviewComplete(a))missing.push('综合素质缺员工自评分或自评原因');
 for(const i of template.quality)if(!a.qualityCases?.[i.key]?.trim())missing.push(i.name+'：缺自评原因');
 if(needManager&&manager===null)missing.push('综合素质缺直属上级评分');if(needHr&&hr===null)missing.push('综合素质缺HRBP评分');
 if(monthly.reviewerIds.length!==monthly.expected)missing.push('请HRBP指定两位跨部门评分人');else if(monthly.score===null)missing.push('跨部门五项评分未齐（'+monthly.completed+'/'+monthly.expected+'人完成）');
 const quality=(needManager&&manager===null)||(needHr&&hr===null)?null:round(managerOnly?manager*10:((manager||0)*w.managerQuality/100+(hr||0)*w.hrQuality/100)*10),collaboration=round(monthly.score),moduleScores={quality,collaboration:collaboration===null?null:round(monthly.score*10)};
 return {templateId:'okr-form-v1',assessmentScope:'ratings_only',scoringMode:'independent_modules',workItemsEnabled:false,ruleApproved:!!rule,ruleName:rule?.name||'两项评分（规则待确认）',weights:{managerQuality:managerOnly?100:w.managerQuality,hrQuality:managerOnly?0:w.hrQuality},moduleScores,taskScores:[],crossScores:[],collaborationMode:'monthly',monthlyCollaboration:monthly,okr:null,work:null,quality,collaboration,managerQuality:round(manager),hrQuality:round(hr),bonus:null,referenceTotal:null,finalScore:null,grade:null,gradeReason:'综合素质与跨部门评分分别展示，暂不合成总分或总体等级',gateStatus:null,gradingPolicy:'independent-modules-v1',redline:a.redline||null,blockers:[...new Set(missing)],ready:!!rule&&quality!==null&&collaboration!==null&&missing.length===0};
}
export function enableRatingsOnly(s,sourceFor=null){
 let changed=s.assessmentScope!=='ratings_only';s.assessmentScope='ratings_only';
 for(const a of s.assessments){if(a.status!=='active'||a.collaborationMode!=='monthly'||isRatingsOnly(a))continue;const kinds=['employee','manager','hrbp'],sources=Object.fromEntries(kinds.map(k=>[k,sourceFor?.(s,a,k)]));a.assessmentScope='ratings_only';
  for(const kind of kinds){const draft=a.monthlyFormDrafts?.[kind];if(!draft)continue;if(draft.form?.tasks?.length){a.pausedWorkDrafts||={};a.pausedWorkDrafts[kind]=structuredClone(draft);draft.form.tasks=[];}if(sourceFor&&draft.source===sources[kind])draft.source=sourceFor(s,a,kind);}
  changed=true;
 }return changed;
}
