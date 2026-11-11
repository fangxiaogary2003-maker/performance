import React from 'react';
import {Check} from 'lucide-react';
import {FORM_TEMPLATE} from '../lib/form-engine.mjs';
import {taskSelfComplete} from '../lib/task-self.mjs';
export function MonthlyRhythmSteps({a,tasks}:any){
 const submitted=a?.monthlySubmission?.status==='submitted',published=['published','archived'].includes(a?.status),filled=tasks.length>0&&tasks.every(taskSelfComplete)&&FORM_TEMPLATE.quality.every((i:any)=>a?.qualityCases?.[i.key]?.trim());
 const steps=[['填写绩效表','填写员工总结、自评和典型事例',filled||submitted||published],['月度评分','直属上级、HRBP及指定跨部门评分人完成评价',!!a?.preview?.ready||published],['发布与归档','核对结果，固定保存当月绩效',published]];
 return <div className="timeline">{steps.map(([title,desc,done],i)=><div className={'timeline-step '+(done?'complete':'')} key={String(title)}><span>{done?<Check size={12}/>:i+1}</span><div><b>{title}</b><p>{desc}</p></div></div>)}</div>;
}
