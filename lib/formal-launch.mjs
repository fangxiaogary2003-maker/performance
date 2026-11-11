import {shanghaiTime} from './reminder-plan.mjs';
import {shiftMonth} from './assessment-period.mjs';
export const validFormalLaunchDate=value=>value===null||(typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value));
export function formalLaunchStatus(config,now=new Date()){
 const date=config.formalLaunchDate||null;
 return {date,firstAssessmentMonth:date?shiftMonth(date.slice(0,7),-1):null,phase:date&&shanghaiTime(now).date<date?'scheduled':'active'};
}
export function formalMessageGate(s,event,workspaceId,config,now=new Date()){
 if(workspaceId!=='company'||s.pilotWorkspace||event.kind==='test'||!config.formalLaunchDate)return {eligible:true};
 const launch=formalLaunchStatus(config,now),assessment=s.assessments.find(a=>a.id===event.assessmentId),cycle=s.cycles.find(c=>c.id===(event.cycleId||assessment?.cycleId)),month=cycle?.month||event.month;
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<launch.firstAssessmentMonth)return {eligible:false,permanent:true,reason:'BEFORE_OFFICIAL_LAUNCH_CYCLE'};
 if(launch.phase==='scheduled')return {eligible:false,permanent:false,reason:'FORMAL_NOT_STARTED'};
 return {eligible:true};
}
