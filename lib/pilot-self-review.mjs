// This server-written exception belongs to one explicitly authorized all-self trial.
export function pilotSelfManagerAuthorized(a,pilot=null){
 const o=a?.pilotSelfManagerOverride,id=a?.employeeId;
 return !!(typeof id==='string'&&id.length>0&&typeof a?.id==='string'&&a.id.length>0&&a.collaborationMode==='monthly'&&pilot?.active===true&&/^pilot-[A-Za-z0-9_-]{1,80}$/.test(pilot.id||'')&&o?.enabled===true&&o.source==='explicit_user_single_person_test'&&o.workspaceId===pilot.id&&o.assessmentId===a.id&&o.actorId===id&&o.authorizedBy===id&&typeof o.authorizedAt==='string'&&Number.isFinite(Date.parse(o.authorizedAt))&&a.managerId===id&&a.hrbpId===id&&a.hrbpSelfReviewAuthorized===true&&pilot.employeeId===id&&pilot.managerId===id&&pilot.hrbpId===id&&pilot.ownerId===id&&pilot.authorizedBy===id);
}
