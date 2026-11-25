// Monthly invitation date uses the calendar day in Asia/Shanghai, including weekends.
export const MONTHLY_PUSH_DAY=3;
export const monthPushDate=month=>month+'-'+String(MONTHLY_PUSH_DAY).padStart(2,'0');
export function assessmentPushDate(workMonth){const date=new Date(workMonth+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);return monthPushDate(date.toISOString().slice(0,7));}
