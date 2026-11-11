export function applyAssessmentPauses(s){
 for(const p of s.people){const path=p.departmentPathIds?.length?p.departmentPathIds:p.departmentId?[p.departmentId]:[];let rule;
  for(const departmentId of path){rule=(s.assessmentPauseRules||[]).find(r=>r.departmentId===departmentId);if(rule)break;}
  if(rule){p.assessmentPaused=rule.paused===true;p.assessmentPauseSource='department_rule';p.assessmentPauseReason=rule.reason||null;}
  else if(p.assessmentPauseSource==='department_rule'){p.assessmentPaused=false;p.assessmentPauseReason=null;}
 }
}
export function eligibleForAssessment(s,p){
 if(!p.active||p.assessmentPaused||!p.managerId||p.managerId===p.id||!p.hrbpId)return false;
 const manager=s.people.find(x=>x.id===p.managerId&&x.active),hrbp=s.people.find(x=>x.id===p.hrbpId&&x.active&&x.roles.includes('hrbp'));
 return !!manager&&!!hrbp&&(hrbp.id!==p.id||p.hrbpSelfReviewAuthorized===true);
}
