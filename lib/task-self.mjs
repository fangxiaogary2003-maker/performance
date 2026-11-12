import {isRatingsOnly} from './assessment-scope.mjs';
export const validTaskSelfScore=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10;
export const taskSelfComplete=t=>!!t.result?.trim()&&validTaskSelfScore(t.selfEvaluation?.timeliness)&&validTaskSelfScore(t.selfEvaluation?.quality);
export const workItemsEditable=a=>!isRatingsOnly(a)&&a?.status==='active'&&(a.collaborationMode==='monthly'?a.monthlySubmission?.status!=='submitted':!a.employeeConfirmedAt);
