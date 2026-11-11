export function shiftMonth(month,offset){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('月份无效');
 const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);
}
export const currentMonth=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(now);
export const assessmentMonthNow=(now=new Date())=>shiftMonth(currentMonth(now),-1);
export function defaultCycleId(cycles,now=new Date()){
 const preferred=assessmentMonthNow(now);return cycles.find(c=>c.month===preferred)?.id||[...cycles].filter(c=>c.month<=preferred).sort((a,b)=>b.month.localeCompare(a.month))[0]?.id||[...cycles].sort((a,b)=>b.month.localeCompare(a.month))[0]?.id||'';
}
export function periodLabel(month){if(!month)return '未选择月份';const next=shiftMonth(month,1);return `${month.replace('-','年')}月工作（${next.slice(0,4)!==month.slice(0,4)?next.slice(0,4)+'年':''}${Number(next.slice(5))}月填报）`;}
export function periodDescription(month){if(!month)return '';return `填写 ${month.replace('-','年')}月实际完成的工作；填报及评分在 ${shiftMonth(month,1).replace('-','年')}月进行。`;}
export function ensureCurrentPeriods(s,admin,open,now=new Date()){
 if(!admin)return false;let changed=false;
 for(const month of [assessmentMonthNow(now),currentMonth(now)])if(!s.cycles.some(c=>c.month===month)){open({month,remindersEnabled:month===currentMonth(now)});changed=true;}
 return changed;
}
