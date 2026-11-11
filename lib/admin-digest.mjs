import {shanghaiTime} from './reminder-plan.mjs';
export const ADMIN_DIGEST_POLICY_ID='admin-daily-17-v1';
export const ADMIN_DIGEST_HOUR=17;
const nextDate=value=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
export function adminDigestWindow(cycle,report,now=new Date()){
 const today=shanghaiTime(now),start=new Date(cycle.month+'-01T00:00:00Z');start.setUTCMonth(start.getUTCMonth()+1);const startDate=start.toISOString().slice(0,10);
 let endDate=null;
 if(report.allPublished){
  const published=report.rows.map(r=>Date.parse(r.publishedAt||'')).filter(Number.isFinite),last=published.length?shanghaiTime(new Date(Math.max(...published))):null;
  const finalDate=last?(last.hour>=ADMIN_DIGEST_HOUR?nextDate(last.date):last.date):cycle.due;
  endDate=finalDate>cycle.due?finalDate:cycle.due;
 }
 return {date:today.date,hour:ADMIN_DIGEST_HOUR,startDate,endDate,overdue:today.date>cycle.due,eligible:report.counts.total>0&&today.date>=startDate&&(!endDate||today.date<=endDate)&&today.hour===ADMIN_DIGEST_HOUR};
}
export const adminDigestPolicy={id:ADMIN_DIGEST_POLICY_ID,hour:ADMIN_DIGEST_HOUR,timeZone:'Asia/Shanghai',includesWeekends:true,includesOverdue:true,scope:'company',instantCompletionMessages:false};
