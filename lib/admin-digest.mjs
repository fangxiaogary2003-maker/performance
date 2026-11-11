import {shanghaiTime} from './reminder-plan.mjs';
export const ADMIN_DIGEST_POLICY_ID='admin-period-daily-17-v2';
export const ADMIN_DIGEST_HOUR=17;
export function adminDigestWindow(cycle,report,now=new Date()){
 const today=shanghaiTime(now),start=new Date(cycle.month+'-01T00:00:00Z');start.setUTCMonth(start.getUTCMonth()+1);const startDate=start.toISOString().slice(0,10);
 const endDate=cycle.due,validDeadline=typeof endDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(endDate);
 return {date:today.date,hour:ADMIN_DIGEST_HOUR,startDate,endDate,overdue:today.date>endDate,eligible:validDeadline&&report.counts.total>0&&today.date>=startDate&&today.date<=endDate&&today.hour===ADMIN_DIGEST_HOUR};
}
export const adminDigestPolicy={id:ADMIN_DIGEST_POLICY_ID,hour:ADMIN_DIGEST_HOUR,timeZone:'Asia/Shanghai',includesWeekends:true,includesOverdue:false,scope:'company',instantCompletionMessages:false};
