import {ensure} from './errors.mjs';
export function departmentLineage(id,departments){
 const byId=new Map(departments.map(d=>[d.open_department_id||d.id,d])),ids=[],names=[],seen=new Set();
 while(id&&id!=='0'){ensure(!seen.has(id),'部门组织树存在循环',409);seen.add(id);ids.push(id);const d=byId.get(id);if(!d)break;names.push(d.name);id=d.parent_department_id||d.parent||null;}
 return {ids,path:names.reverse().join(' > ')};
}
export function hrbpForPerson(s,p){
 const rules=s.hrbpRules||[],path=p.departmentPathIds?.length?p.departmentPathIds:p.departmentId?[p.departmentId]:[];
 for(const departmentId of path){const matches=rules.filter(r=>r.departmentId===departmentId);ensure(new Set(matches.map(r=>r.hrbpId)).size<=1,'同一部门存在不同HRBP规则，请管理员核对',409);
  if(matches.length){const target=s.people.find(x=>x.id===matches[0].hrbpId&&x.active&&x.roles.includes('hrbp'));
   if(!target)return {hrbpId:null,issue:'负责HRBP不存在、停用或缺少角色'};
   if(target.id===p.id&&matches[0].allowSelfReview!==true)return {hrbpId:null,issue:'HRBP本人兼任规则尚未明确'};
   return {hrbpId:target.id,ruleDepartmentId:departmentId,ruleDepartmentName:matches[0].departmentName||null,selfReviewAuthorized:target.id===p.id&&matches[0].allowSelfReview===true};
  }
 }
 return {hrbpId:null,issue:'所属部门尚未配置HRBP规则'};
}
export function applyHrbpRules(s,{force=false}={}){
 const counts={},pending=[];
 for(const p of s.people.filter(p=>p.active)){
  const manual=p.hrbpAssignmentSource==='manual'||(!p.hrbpAssignmentSource&&p.hrbpId);
  if(manual&&!force){const target=s.people.find(x=>x.id===p.hrbpId&&x.active&&x.roles.includes('hrbp'));if(target&&(target.id!==p.id||p.hrbpSelfReviewAuthorized===true)){counts[target.id]=(counts[target.id]||0)+1;p.hrbpIssue=null;continue;}p.hrbpId=null;p.hrbpSelfReviewAuthorized=false;p.hrbpIssue='员工例外HRBP已失效，请核对';pending.push({id:p.id,issue:p.hrbpIssue});continue;}
  const resolved=hrbpForPerson(s,p);p.hrbpId=resolved.hrbpId;p.hrbpAssignmentSource='department_rule';p.hrbpIssue=resolved.issue||null;p.hrbpRuleDepartmentId=resolved.ruleDepartmentId||null;p.hrbpRuleDepartmentName=resolved.ruleDepartmentName||null;p.hrbpSelfReviewAuthorized=resolved.selfReviewAuthorized===true;
  if(p.hrbpId)counts[p.hrbpId]=(counts[p.hrbpId]||0)+1;else pending.push({id:p.id,issue:p.hrbpIssue});
 }
 return {counts,pending};
}
