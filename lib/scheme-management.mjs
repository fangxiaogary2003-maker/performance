import {ensure} from './errors.mjs';
const stamp=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const draftFields=b=>({name:typeof b.name==='string'?b.name.trim().slice(0,100):'',weights:structuredClone(b.weights||{}),qualityScorer:b.qualityScorer||'manager_hrbp',bonusEnabled:typeof b.bonusEnabled==='boolean'?b.bonusEnabled:'',approvalReference:typeof b.approvalReference==='string'?b.approvalReference.slice(0,3000):'',collaborationMode:'monthly',collaborationScorer:'reviewers',confirmed:false});
export function ruleUsage(s,ruleId){return s.cycles.filter(c=>c.ruleId===ruleId).map(c=>c.month);}
export const ruleAvailable=r=>!r.retiredAt&&!r.removedAt;
export function schemeMutate(s,u,action,b,{validateRule}){
 if(!['saveFormRuleDraft','saveFormRule','copyRuleDraft','setRuleAvailability','removeRule','restoreRule','removeRuleDraft','restoreRuleDraft'].includes(action))return false;
 ensure(u.roles.includes('admin'),'需要绩效管理员权限',403);const at=stamp();s.ruleDrafts||=[];
 const draft=()=>{const d=s.ruleDrafts.find(d=>d.id===b.draftId);ensure(d,'草稿不存在',404);return d;};
 const rule=()=>{const r=s.rules.find(r=>r.id===b.ruleId);ensure(r,'方案不存在',404);return r;};
 if(action==='saveFormRuleDraft'){
  const fields=draftFields(b);ensure(fields.name,'请填写方案名称');
  if(b.draftId){const d=draft();ensure(d.status==='draft','该草稿已批准或删除，不能修改',409);Object.assign(d,fields,{updatedAt:at,updatedBy:u.id});}
  else s.ruleDrafts.push({...fields,id:id(),status:'draft',createdAt:at,createdBy:u.id,updatedAt:at,updatedBy:u.id});
 }else if(action==='copyRuleDraft'){
  const source=b.ruleId?rule():draft();ensure(!source.removedAt&&source.status!=='deleted','请先恢复方案再复制',409);
  s.ruleDrafts.push({...draftFields(source),id:id(),name:(source.name+'（副本）').slice(0,100),sourceRuleId:b.ruleId?source.id:source.sourceRuleId||null,status:'draft',createdAt:at,createdBy:u.id,updatedAt:at,updatedBy:u.id});
 }else if(action==='saveFormRule'){
  const d=b.draftId?draft():null;if(d)ensure(d.status==='draft','该草稿已批准或删除，请刷新',409);
  const r=validateRule(b,u),source=d?.sourceRuleId?s.rules.find(r=>r.id===d.sourceRuleId):null;
  r.familyId=source?.familyId||source?.id||r.id;r.version=1+Math.max(0,...s.rules.filter(x=>(x.familyId||x.id)===r.familyId).map(x=>x.version||1));if(source)r.previousRuleId=source.id;if(d)r.sourceDraftId=d.id;s.rules.push(r);
  if(d)Object.assign(d,{status:'approved',approvedRuleId:r.id,approvedAt:at,approvedBy:u.id});
 }else if(action==='setRuleAvailability'){
  const r=rule();ensure(!r.removedAt,'请先恢复方案',409);ensure(typeof b.enabled==='boolean','启用状态无效');
  if(b.enabled){delete r.retiredAt;delete r.retiredBy;}else{r.retiredAt=at;r.retiredBy=u.id;}
 }else if(action==='removeRule'){
  const r=rule();ensure(!ruleUsage(s,r.id).length,'已绑定月份的方案不能删除，可停用以供历史月份继续使用',409);ensure(!s.archives.some(ar=>ar.snapshot.assessment.ruleSnapshot?.id===r.id),'历史档案使用过的方案不能删除',409);r.removedAt=at;r.removedBy=u.id;
 }else if(action==='restoreRule'){
  const r=rule();delete r.removedAt;delete r.removedBy;
 }else if(action==='removeRuleDraft'){
  const d=draft();ensure(d.status==='draft','只能删除未批准草稿',409);d.status='deleted';d.deletedAt=at;d.deletedBy=u.id;
 }else if(action==='restoreRuleDraft'){
  const d=draft();ensure(d.status==='deleted','草稿不在回收站',409);d.status='draft';delete d.deletedAt;delete d.deletedBy;
 }
 return true;
}
