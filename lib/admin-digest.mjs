import {shanghaiTime} from './reminder-plan.mjs';
import {assessmentPushDate,MONTHLY_PUSH_DAY} from './monthly-push-policy.mjs';
export const ADMIN_DIGEST_POLICY_ID='admin-until-complete-17-v3';
export const ADMIN_DIGEST_HOUR=17;
export function adminDigestWindow(cycle,report,now=new Date()){
 const today=shanghaiTime(now),startDate=assessmentPushDate(cycle.month);
 return {date:today.date,hour:ADMIN_DIGEST_HOUR,startDate,endDate:null,overdue:today.date>cycle.due,eligible:report.counts.total>0&&!report.allPublished&&today.date>=startDate&&today.hour===ADMIN_DIGEST_HOUR};
}
export const adminDigestPolicy={id:ADMIN_DIGEST_POLICY_ID,hour:ADMIN_DIGEST_HOUR,startDay:MONTHLY_PUSH_DAY,timeZone:'Asia/Shanghai',includesWeekends:true,includesOverdue:true,stopWhen:'all_results_published',scope:'company',instantCompletionMessages:false};
