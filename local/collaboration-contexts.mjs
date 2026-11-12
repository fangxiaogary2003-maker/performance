import {createHash} from 'node:crypto';
import {ensure} from '../lib/errors.mjs';
import {pilotCollaborationBinding} from '../lib/pilot-collaboration.mjs';
import {validPilotKey} from '../lib/pilot-workspace.mjs';
import {COLLABORATION_CONSENT_VERSION} from '../lib/collaboration-suggestions.mjs';
import {collaborationService} from './collaboration-service.mjs';
export function collaborationContexts(sql,options){
 const main=collaborationService(sql,options),children=new Map(),version=b=>COLLABORATION_CONSENT_VERSION+':'+createHash('sha256').update(JSON.stringify(b)).digest('hex');
 const read=id=>{const row=sql.prepare('SELECT payload FROM workspaces WHERE id=?').get(id);return row?JSON.parse(row.payload):null;};
 function clear(key,keepVersion=null){const prefix=key+':',rows=sql.prepare('SELECT employee_id,consent_version FROM collaboration_consents WHERE substr(employee_id,1,?)=?').all(prefix.length,prefix).filter(r=>r.consent_version!==keepVersion);sql.exec('BEGIN IMMEDIATE');try{for(const r of rows){sql.prepare("UPDATE collaboration_consents SET status='revoked',revision=revision+1,token_cipher=NULL,scopes='[]',include_p2p=0,group_ids='[]',last_error=NULL WHERE employee_id=? AND token_cipher IS NOT NULL").run(r.employee_id);sql.prepare('DELETE FROM collaboration_monthly_stats WHERE employee_id=?').run(r.employee_id);}if(!keepVersion)sql.prepare('DELETE FROM collaboration_oauth_states WHERE substr(employee_id,1,?)=?').run(prefix.length,prefix);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}if(!keepVersion||children.get(key)?.version!==keepVersion){children.get(key)?.service.abortAll();children.delete(key);}}
 function forWorkspace(company,pilot,key){const binding=pilotCollaborationBinding(company,pilot,key);ensure(binding,'此试跑尚未开通协作推荐，或员工、HRBP关系已变化',409);const consentVersion=version(binding);clear(key,consentVersion);if(!children.has(key)){
  const contextCheck=()=>{const liveCompany=read('company'),livePilot=read(key),current=pilotCollaborationBinding(liveCompany,livePilot,key);ensure(current&&version(current)===consentVersion,'试跑已结束或协作授权范围变化，已停止读取',409);return {company:liveCompany,pilot:livePilot};};
  children.set(key,{version:consentVersion,service:collaborationService(sql,{...options,workspaceId:key,subjectId:binding.employeeId,consentVersion,contextCheck})});
 }return children.get(key).service;}
 async function tickPilots(){const company=read('company');if(!company)return;const keys=new Set(sql.prepare("SELECT id FROM workspaces WHERE id LIKE 'pilot-%'").all().map(r=>r.id));for(const r of sql.prepare("SELECT employee_id FROM collaboration_consents WHERE instr(employee_id,':')>0").all())keys.add(r.employee_id.split(':')[0]);for(const key of keys){if(!validPilotKey(key))continue;const pilot=read(key);if(!pilotCollaborationBinding(company,pilot,key)){clear(key);continue;}try{await forWorkspace(company,pilot,key).tick(pilot,null);}catch{ /* Each employee sees their own safe sync status. */ }}}
 return {...main,forWorkspace,tickPilots};
}
