import {isMonthlyCollaboration,monthlyAssessmentsToRate} from './monthly-collaboration.mjs';
import {reviewersOf} from './form-engine.mjs';
const adminPages=['overview','mine','review','team','assign','archives','people','bonus','reports','schemes','settings'];
export function workspaceAccess(s,u){
 if(u.roles.includes('admin'))return {mode:'admin',pages:s.pilotWorkspace?adminPages.filter(p=>!['people','settings'].includes(p)):adminPages,defaultPage:s.pilotWorkspace?'mine':'overview'};
 const team=s.assessments.filter(a=>a.employeeId!==u.id&&(a.managerId===u.id||a.hrbpId===u.id));
 const bonusPending=s.assessments.some(a=>a.status==='active'&&((a.bonus?.status==='pending_manager'&&a.managerId===u.id)||(a.bonus?.status==='pending_hrd'&&a.hrdId===u.id)));
 const professional=u.roles.some(r=>['manager','hrbp','hrd'].includes(r))||s.assessments.some(a=>a.managerId===u.id||a.hrbpId===u.id)||bonusPending;
 if(!professional)return {mode:'employee',pages:['mine'],defaultPage:'mine'};
 const pages=['mine'];if(team.length)pages.push('team');
 if(s.assessments.some(a=>isMonthlyCollaboration(a)&&monthlyAssessmentsToRate(s,u,a.cycleId).length)||s.tasks.some(t=>{const a=s.assessments.find(a=>a.id===t.assessmentId);return a?.status==='active'&&!isMonthlyCollaboration(a)&&t.status==='submitted'&&(reviewersOf(t).includes(u.id)||(!t.cross&&a.managerId===u.id));}))pages.push('review');
 if(s.assessments.some(a=>isMonthlyCollaboration(a)&&a.status==='active'&&a.hrbpId===u.id)||s.tasks.some(t=>t.cross&&t.status!=='accepted'&&s.assessments.some(a=>a.id===t.assessmentId&&a.status==='active'&&a.hrbpId===u.id)))pages.push('assign');
 if(s.archives.some(a=>[a.employeeId,a.managerId,a.hrbpId].includes(u.id)))pages.push('archives');
 if(bonusPending)pages.push('bonus');
 return {mode:'professional',pages,defaultPage:pages.includes('bonus')?'bonus':pages.includes('team')?'team':'mine'};
}
export function workspaceEntry(access,requested){return access.pages.includes(requested)?requested:access.defaultPage;}
