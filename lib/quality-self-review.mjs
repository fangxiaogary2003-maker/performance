import template from './form-template.json' with {type:'json'};
import {ensure} from './errors.mjs';
const score=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10;
export const qualitySelfReviewRequired=a=>a?.collaborationMode==='monthly'&&a.qualitySelfReviewVersion===1;
export function qualitySelfReviewComplete(a){const e=a?.qualitySelfEvaluation;return !!(e&&e.actorId===a.employeeId&&template.quality.every(i=>score(e.values?.[i.key])&&typeof a.qualityCases?.[i.key]==='string'&&a.qualityCases[i.key].trim()&&e.reasons?.[i.key]===a.qualityCases[i.key]));}
export function saveQualitySelfReview(s,u,a,b,at){
 ensure(a&&a.status==='active'&&qualitySelfReviewRequired(a),'本单尚未启用核心素质自评或已关闭',409);ensure(a.employeeId===u.id&&!u.assessmentPaused,'仅员工本人可填写核心素质自评',403);ensure(a.monthlySubmission?.status!=='submitted','整月已提交，请由上级退回后修改自评',409);
 const values={},reasons={};for(const i of template.quality){ensure(score(b.values?.[i.key]),i.name+'：自评分须为0—10分');ensure(typeof b.cases?.[i.key]==='string'&&b.cases[i.key].trim()&&b.cases[i.key].length<=4000,i.name+'：请填写自评原因（当月事例）');values[i.key]=b.values[i.key];reasons[i.key]=b.cases[i.key].trim();}
 if(JSON.stringify(values)===JSON.stringify(a.qualitySelfEvaluation?.values)&&JSON.stringify(reasons)===JSON.stringify(a.qualityCases)&&qualitySelfReviewComplete(a))return;
 if(a.qualitySelfEvaluation)(a.qualitySelfEvaluationHistory||=[]).push(structuredClone(a.qualitySelfEvaluation));
 if(Object.keys(a.qualityEvaluations||{}).length)(a.qualityEvaluationHistory||=[]).push({evaluations:structuredClone(a.qualityEvaluations),reason:'员工更新核心素质自评',actorId:u.id,at});
 a.qualityCases=reasons;a.qualitySelfEvaluation={values,reasons:structuredClone(reasons),actorId:u.id,at};a.qualityScoringRound=(a.qualityScoringRound||0)+1;a.qualityEvaluations={};
}
// Existing submitted/published records stay intact; unfinished forms retain their drafts.
export function enableQualitySelfReview(s,sourceFor=null){
 let changed=s.qualitySelfReviewEnabled!==true;s.qualitySelfReviewEnabled=true;
 for(const a of s.assessments){if(a.status!=='active'||a.collaborationMode!=='monthly'||a.monthlySubmission?.status==='submitted'||qualitySelfReviewRequired(a))continue;const oldSource=sourceFor?.(s,a,'employee');a.qualitySelfReviewVersion=1;const draft=a.monthlyFormDrafts?.employee;if(sourceFor&&draft?.source===oldSource)draft.source=sourceFor(s,a,'employee');changed=true;}
 return changed;
}
