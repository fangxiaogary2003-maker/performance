import {ensure} from './errors.mjs';
export const activeContact=u=>!u.status?.is_resigned&&!u.status?.is_frozen&&!u.status?.is_exited&&!u.status?.is_unjoin;
export function normalizedDirectory(raw){const departments=new Map(raw.departments.map(d=>[d.open_department_id,d.name]));return raw.users.map(u=>{const primary=u.orders?.find(x=>x.is_primary_dept)?.department_id||u.department_ids?.[0];return {openId:u.open_id,name:u.name,dept:departments.get(primary)||'公司',position:u.job_title||'',leaderOpenId:u.leader_user_id||null,active:activeContact(u)};});}
export function mergeDirectory(s,contacts){
 ensure(contacts.length>0,'通讯录预览为空，不能应用');const opens=new Set();for(const c of contacts){ensure(c.openId&&c.name&&!opens.has(c.openId),'通讯录身份缺失或重复');opens.add(c.openId);}
 const byOpen=new Map(s.people.filter(p=>p.feishuOpenId).map(p=>[p.feishuOpenId,p]));
 let added=0,updated=0;for(const c of contacts){let p=byOpen.get(c.openId);if(!p){p={id:crypto.randomUUID(),name:c.name,dept:c.dept,position:c.position,roles:[],active:c.active,managerId:null,hrbpId:null,hrdId:null,feishuOpenId:c.openId,source:'feishu'};s.people.push(p);byOpen.set(c.openId,p);added++;}else{Object.assign(p,{name:c.name,dept:c.dept,position:c.position||p.position||'',active:p.active!==false&&c.active,directoryCheckedAt:new Date().toISOString()});updated++;}}
 for(const c of contacts){const p=byOpen.get(c.openId),manager=byOpen.get(c.leaderOpenId);ensure(c.leaderOpenId!==c.openId,'通讯录不能将员工自己设为直属上级');p.managerId=manager?.active?manager.id:null;}
 for(const p of s.people.filter(p=>p.active&&s.people.some(x=>x.active&&x.managerId===p.id)))if(!p.roles.includes('manager'))p.roles.push('manager');
 return {added,updated,total:contacts.length,missingManager:contacts.filter(c=>c.active&&!byOpen.get(c.openId).managerId).length};
}
