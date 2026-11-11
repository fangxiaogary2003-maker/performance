import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formalLaunchStatus,formalMessageGate,validFormalLaunchDate} from '../lib/formal-launch.mjs';
test('正式推送按北京时间启用，日历跨年正确，启用前暂停工作流、个人催办及管理员日报',()=>{
 const cfg={formalLaunchDate:'2026-12-01'},s={cycles:[{id:'nov',month:'2026-11'}],assessments:[{id:'a',cycleId:'nov'}]},before=new Date('2026-11-30T15:59:59Z'),after=new Date('2026-11-30T16:00:00Z');
 assert.equal(formalLaunchStatus(cfg,before).phase,'scheduled');assert.equal(formalLaunchStatus(cfg,after).phase,'active');assert.equal(formalLaunchStatus({formalLaunchDate:'2027-01-01'},after).firstAssessmentMonth,'2026-12');
 for(const kind of ['manager_submission','monthly_collaboration','manager_quality','assessment_returned','monthly','cycle_digest']){const e={kind,assessmentId:'a'};assert(!formalMessageGate(s,e,'company',cfg,before).eligible);assert(formalMessageGate(s,e,'company',cfg,after).eligible);}
 assert(formalMessageGate(s,{kind:'test'},'company',cfg,before).eligible);assert(formalMessageGate({...s,pilotWorkspace:{active:true}},{kind:'manager_submission'},'pilot-test',cfg,before).eligible);assert(formalMessageGate(s,{kind:'monthly'},'company',{},before).eligible);
});
test('首期以前的月份永久停止正式推送，不因12月启用恢复，日期只接受月份首日或空值',()=>{
 const cfg={formalLaunchDate:'2026-12-01'},s={cycles:[{id:'oct',month:'2026-10'},{id:'nov',month:'2026-11'}],assessments:[{id:'old',cycleId:'oct'}]},at=new Date('2027-01-04T09:00:00Z');
 for(const event of [{kind:'cycle_digest',cycleId:'oct'},{kind:'manager_submission',assessmentId:'old'},{kind:'monthly',month:'2026-10'},{kind:'monthly'}]){const g=formalMessageGate(s,event,'company',cfg,at);assert(!g.eligible);assert(g.permanent);}
 assert(formalMessageGate(s,{kind:'monthly',month:'2026-11'},'company',cfg,at).eligible);
 for(const value of [null,'2026-12-01','2027-01-01'])assert(validFormalLaunchDate(value));for(const value of ['2026-12-02','2026-13-01',false,undefined,'2026-12'])assert(!validFormalLaunchDate(value));
});
