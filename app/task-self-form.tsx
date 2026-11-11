'use client';
import React from 'react';
import {SelfScoreFields} from './form-sections';
export function MonthlyTaskSelfFields({taskId,form,field,onAction,busy}:any){return <form className="monthly-task-self" onSubmit={e=>{e.preventDefault();onAction('saveTaskSelf',{id:taskId,result:form.result,remark:form.remark,timeliness:form.selfTimeliness,quality:form.selfQuality},false);}}>
 <label className="field">员工总结<textarea required maxLength={10000} value={form.result||''} onChange={e=>field('result',e.target.value)} placeholder="按原表填写这项工作的完成情况"/></label>
 <SelfScoreFields form={form} field={field}/>
 <label className="field">备注（选填）<textarea maxLength={2000} value={form.remark||''} onChange={e=>field('remark',e.target.value)}/></label>
 <p className="subtle">保存后可继续修改；各项总结、自评及六项典型事例填写完整后，统一提交整月绩效。</p>
 <button className="primary full" disabled={busy}>保存员工总结与自评</button>
 </form>;}
