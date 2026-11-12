import {createHash} from 'node:crypto';
import {ensure} from './errors.mjs';
import {shiftMonth} from './assessment-period.mjs';
export const COLLABORATION_POLICY='communication-metadata-v1';
export const COLLABORATION_CONSENT_VERSION='collaboration-suggestions-2026-11-v1';
export const COLLABORATION_SCOPES=['contact:user.base:readonly','search:message','im:message:readonly','im:message.p2p_msg:get_as_user','im:message.group_msg:get_as_user','im:chat:read'];
export function communicationWindow(month,now=new Date()){
 ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''),'工作月份无效');
 const start=new Date(month+'-01T00:00:00+08:00'),end=new Date(shiftMonth(month,1)+'-01T00:00:00+08:00'),until=new Date(Math.min(now.getTime(),end.getTime()));
 return {month,start:start.toISOString(),end:until.toISOString(),monthEnd:end.toISOString(),eligible:until>start,closed:now>=end};
}
export const canReviewSuggestions=(u,a)=>!!(u?.active&&(u.roles.includes('admin')||a?.hrbpId===u.id));
export function suggestionList(s,a,summary,now=new Date()){
 ensure(a,'考核不存在',404);const employee=s.people.find(p=>p.id===a.employeeId),cycle=s.cycles.find(c=>c.id===a.cycleId);
 const base={assessmentId:a.id,month:cycle?.month,policy:COLLABORATION_POLICY,sourceAt:summary?.syncedAt||null,candidates:[],recommendedIds:[]};
 if(!summary?.authorized)return {...base,status:'not_authorized',message:'员工尚未授权，可继续由HRBP手动指定。'};
 if(!summary.syncedAt)return {...base,status:'not_synced',message:'员工已授权，尚未同步本月协作统计。'};
 if(!summary.complete)return {...base,status:'incomplete',message:'本次读取数据不完整，暂不自动推荐，请同步完整数据或手动指定。'};
 if(summary.month!==cycle?.month)return {...base,status:'not_synced',message:'尚无本工作月份的协作统计。'};
 const people=new Map(s.people.filter(p=>p.active&&p.id!==a.employeeId&&p.dept!==a.department&&p.feishuOpenId&&p.feishuOpenId!==employee?.feishuOpenId).map(p=>[p.feishuOpenId,p]));
 const candidates=(summary.edges||[]).filter(e=>people.has(e.peerOpenId)).map(e=>{
  const person=people.get(e.peerOpenId),days=[...new Set(e.days||[])].length,mutual=Math.min(e.privateSent||0,e.privateReceived||0),direct=(e.groupMentions||0)+(e.groupReplies||0);
  // Repeated short messages are capped. This ranks candidate familiarity, never performance.
  const relevance=days*10+Math.min(mutual,30)*2+Math.min(direct,30)*3+Math.min((e.privateSent||0)+(e.privateReceived||0),60);
  return {id:person.id,name:person.name,dept:person.dept,relevance,evidence:{days,privateSent:e.privateSent||0,privateReceived:e.privateReceived||0,groupMentions:e.groupMentions||0,groupReplies:e.groupReplies||0},reason:`${days}个协作日；单聊发出${e.privateSent||0}条、收到${e.privateReceived||0}条；主动@ ${e.groupMentions||0}次、回复${e.groupReplies||0}次`};
 }).filter(c=>c.evidence.days>=2&&((c.evidence.privateSent>0&&c.evidence.privateReceived>0)||(c.evidence.groupMentions+c.evidence.groupReplies)>=2)).sort((a,b)=>b.relevance-a.relevance||a.id.localeCompare(b.id));
 const digest=createHash('sha256').update(JSON.stringify({workspaceId:summary.workspaceId||'company',policy:COLLABORATION_POLICY,assessmentId:a.id,month:cycle.month,employeeDept:a.department,hrbpId:a.hrbpId,assignmentVersion:a.collaborationAssignmentVersion||0,consentRevision:summary.consentRevision,syncedAt:summary.syncedAt,candidates})).digest('hex');
 return {...base,status:candidates.length>=2?'ready':'insufficient',message:candidates.length>=2?'建议两位候选人，须由HRBP复核确认后生效。':'可核实的协作对象不足两人，请HRBP补充或手动指定。',candidates:candidates.slice(0,8),recommendedIds:candidates.slice(0,2).map(p=>p.id),digest,coverage:{complete:true,through:summary.through,closed:communicationWindow(cycle.month,now).closed}};
}
export function reviewEvidence(s,u,a,summary,digest,chosen,now=new Date()){
 ensure(canReviewSuggestions(u,a),'只有本单HRBP或管理员可以复核推荐',403);const current=suggestionList(s,a,summary,now);ensure(current.digest&&current.digest===digest,'推荐依据已更新，请刷新后复核',409);ensure(current.status==='ready'||current.status==='insufficient','当前没有可复核的推荐',409);
 return {workspaceId:summary.workspaceId||'company',policy:COLLABORATION_POLICY,sourceDigest:current.digest,sourceAt:current.sourceAt,suggestedReviewerIds:current.recommendedIds,chosenReviewerIds:[...chosen],reviewedBy:u.id,reviewedAt:now.toISOString()};
}
