import {ensure} from './errors.mjs';
import {monthlyReviewersOf} from './monthly-collaboration.mjs';
export const validPilotKey=id=>/^pilot-[A-Za-z0-9_-]{1,80}$/.test(id||'');
export function authorizePilot(company,pilot,userId,key){
 ensure(validPilotKey(key)&&pilot.pilotWorkspace?.id===key&&pilot.pilotWorkspace.active===true,'试跑未开启或已结束',403);
 const owner=company.people.find(p=>p.id===pilot.pilotWorkspace.authorizedBy&&p.active&&p.roles.includes('admin')),person=company.people.find(p=>p.id===userId&&p.active),copy=pilot.people.find(p=>p.id===userId&&p.active);
 ensure(owner&&person&&copy&&person.feishuOpenId===copy.feishuOpenId,'无权进入此试跑',403);
 ensure(userId===pilot.pilotWorkspace.ownerId||pilot.assessments.some(a=>[a.employeeId,a.managerId,a.hrbpId,a.hrdId,...monthlyReviewersOf(a)].includes(userId)),'你不是这次试跑的参与人',403);return copy;
}
export function pilotManager(s,a){
 const p=s.pilotWorkspace;if(!p)return null;
 ensure(p.active===true&&validPilotKey(p.id)&&p.authorizedBy&&p.employeeId===a.employeeId&&p.managerId===a.managerId&&p.hrbpId===a.hrbpId,'试跑关系已变更，请管理员核对',409);
 const manager=s.people.find(x=>x.id===p.managerId&&x.active&&x.feishuOpenId);ensure(manager&&manager.id!==a.employeeId,'试跑上级未配置或停用',409);return manager;
}
export function workspaceMessageBase(base,key,s){if(!s.pilotWorkspace)return base;ensure(key===s.pilotWorkspace.id&&validPilotKey(key),'试跑消息工作区不匹配',409);const u=new URL(base);u.searchParams.set('pilot',key);return u.href;}
export const pilotPublic=s=>s.pilotWorkspace?{id:s.pilotWorkspace.id,title:s.pilotWorkspace.title,active:s.pilotWorkspace.active,employee:s.people.find(p=>p.id===s.pilotWorkspace.employeeId)?.name,manager:s.people.find(p=>p.id===s.pilotWorkspace.managerId)?.name,hrbp:s.people.find(p=>p.id===s.pilotWorkspace.hrbpId)?.name}:null;
