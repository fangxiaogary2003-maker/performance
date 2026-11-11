import template from './form-template.json' with {type:'json'};
export const isMonthlyCollaboration=a=>a?.collaborationMode==='monthly';
export const monthlyReviewersOf=a=>[...new Set(a?.collaborationReviewerIds||[])];
export function pilotCollaborationOverride(a,pilot=null){const o=a?.pilotCollaborationOverride,ids=a?.collaborationReviewerIds;return !!(pilot?.active===true&&o?.enabled===true&&pilot.id===o.workspaceId&&/^pilot-[A-Za-z0-9_-]{1,80}$/.test(pilot.id)&&o.assessmentId===a.id&&o.reviewerId===a.employeeId&&o.authorizedBy===a.employeeId&&Array.isArray(ids)&&ids.length===2&&ids.every(id=>id===o.reviewerId));}
export const requiredMonthlyReviewers=(a,pilot=null)=>pilotCollaborationOverride(a,pilot)?1:2;
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10;
export function currentMonthlyEvaluation(a,personId){const e=a.monthlyCollaborationEvaluations?.[personId];return e&&a.monthlySubmission?.status==='submitted'&&e.assignmentVersion===a.collaborationAssignmentVersion&&e.submissionId===a.monthlySubmission.id&&template.collaboration.every(i=>numeric(e.values?.[i.key]))?e:null;}
export function monthlyCollaborationResult(a,pilot=null){
 const ids=monthlyReviewersOf(a),expected=requiredMonthlyReviewers(a,pilot),evaluations=ids.map(id=>currentMonthlyEvaluation(a,id)),complete=ids.length===expected&&evaluations.every(Boolean),values=complete?Object.fromEntries(template.collaboration.map(i=>[i.key,evaluations.reduce((sum,e)=>sum+e.values[i.key],0)/expected])):null;
 return {reviewerIds:ids,expected,completed:evaluations.filter(Boolean).length,values,score:values?template.collaboration.reduce((sum,i)=>sum+values[i.key]*i.weight/100,0):null};
}
export function monthlyAssessmentsToRate(s,u,cycleId){return s.assessments.filter(a=>a.cycleId===cycleId&&a.status==='active'&&isMonthlyCollaboration(a)&&a.monthlySubmission?.status==='submitted'&&monthlyReviewersOf(a).includes(u.id)&&!currentMonthlyEvaluation(a,u.id));}
