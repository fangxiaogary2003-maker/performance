import template from './form-template.json' with {type:'json'};
export const isMonthlyCollaboration=a=>a?.collaborationMode==='monthly';
export const monthlyReviewersOf=a=>[...new Set(a?.collaborationReviewerIds||[])];
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10;
export function currentMonthlyEvaluation(a,personId){const e=a.monthlyCollaborationEvaluations?.[personId];return e&&a.monthlySubmission?.status==='submitted'&&e.assignmentVersion===a.collaborationAssignmentVersion&&e.submissionId===a.monthlySubmission.id&&template.collaboration.every(i=>numeric(e.values?.[i.key]))?e:null;}
export function monthlyCollaborationResult(a){
 const ids=monthlyReviewersOf(a),evaluations=ids.map(id=>currentMonthlyEvaluation(a,id)),complete=ids.length===2&&evaluations.every(Boolean),values=complete?Object.fromEntries(template.collaboration.map(i=>[i.key,evaluations.reduce((sum,e)=>sum+e.values[i.key],0)/2])):null;
 return {reviewerIds:ids,expected:2,completed:evaluations.filter(Boolean).length,values,score:values?template.collaboration.reduce((sum,i)=>sum+values[i.key]*i.weight/100,0):null};
}
export function monthlyAssessmentsToRate(s,u,cycleId){return s.assessments.filter(a=>a.cycleId===cycleId&&a.status==='active'&&isMonthlyCollaboration(a)&&a.monthlySubmission?.status==='submitted'&&monthlyReviewersOf(a).includes(u.id)&&!currentMonthlyEvaluation(a,u.id));}
