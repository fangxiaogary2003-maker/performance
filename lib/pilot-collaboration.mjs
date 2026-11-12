import {validPilotKey} from './pilot-workspace.mjs';
export function pilotCollaborationBinding(company,pilot,key=pilot?.pilotWorkspace?.id){
 const p=pilot?.pilotWorkspace,c=p?.collaborationRecommendations;
 if(!company||!p?.active||!validPilotKey(key)||p.id!==key||c?.enabled!==true||c.version!==1)return null;
 const owner=company.people.find(x=>x.id===p.authorizedBy&&x.active&&x.roles.includes('admin')),employee=company.people.find(x=>x.id===p.employeeId&&x.active),copy=pilot.people.find(x=>x.id===p.employeeId&&x.active),a=pilot.assessments.find(x=>x.id===c.assessmentId&&x.status==='active');
 if(!owner||c.enabledBy!==owner.id||!employee?.feishuOpenId||copy?.feishuOpenId!==employee.feishuOpenId||c.employeeId!==employee.id||a?.employeeId!==employee.id||a.hrbpId!==p.hrbpId||a.hrbpId!==c.hrbpId||employee.hrbpId!==a.hrbpId)return null;
 const hr=company.people.find(x=>x.id===a.hrbpId&&x.active),hrCopy=pilot.people.find(x=>x.id===a.hrbpId&&x.active);
 if(!hr?.feishuOpenId||hrCopy?.feishuOpenId!==hr.feishuOpenId)return null;
 return {workspaceId:key,employeeId:employee.id,employeeOpenId:employee.feishuOpenId,assessmentId:a.id,hrbpId:hr.id,hrbpOpenId:hr.feishuOpenId,ownerId:owner.id};
}
