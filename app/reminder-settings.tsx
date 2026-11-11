'use client';
import React,{useState,useEffect} from 'react';
import {appPath,workspaceHeaders} from '../lib/app-path.mjs';
const statusLabel:any={sent:'已发送',queued:'待发送',sending:'发送中',retry:'自动重试中',blocked:'待开通／身份待核对',unknown:'结果待核对',cancelled:'待办已变化，取消发送'};
const kindLabel:any={manager_quality:'核心素质待上级评分',pilot_invitation:'试跑填写邀请',goal_confirmation:'工作事项待上级确认',goal_confirmed:'上级已确认工作事项',manager_submission:'员工提交后通知上级',monthly_collaboration:'月度跨部门评分',task_review:'历史任务待验收',task_returned:'任务退回',assessment_returned:'整月退回',monthly:'考核待办催办',cycle_digest:'管理员17:00全员进度日报',cycle_summary:'旧版即时汇总通知（已停用）',test:'测试卡片'};
export function ReminderSettings({data,onPeople}:any){
 const [state,S]=useState<any>(null),[f,F]=useState<any>({}),[busy,B]=useState(false),[message,M]=useState('');
 const headers=workspaceHeaders(data.user.id);
 async function load(){try{const r=await fetch(appPath('/api/app-messaging'),{headers,cache:'no-store'}),x=await r.json();if(!r.ok)throw Error(x.error);S(x);F({...x.config});}catch(e:any){M(e.message);}}
 useEffect(()=>{load();},[data.user.id]);
 async function action(name:string,body:any={}){B(true);M('');try{const r=await fetch(appPath('/api/app-messaging/'+name),{method:'POST',headers,body:JSON.stringify({...body,revision:data.revision})}),x=await r.json();if(!r.ok)throw Error(x.error);
  await load();M(name==='check'?'接入检查已更新':name==='test'?(x.receipt?.status==='sent'?'测试卡片已发送到你的飞书':'测试消息状态：'+(statusLabel[x.receipt?.status]||'待处理')):'设置已保存');
 }catch(e:any){M(e.message);}finally{B(false);}}
 return <section className="panel reminder-settings"><div className="panel-heading"><h3>飞书自建应用与个人待办</h3><span className={'badge '+(state?.connection?.ready?'accepted':'planned')}>{state?.connection?.ready?'接入检查通过':'待开通／待检查'}</span></div><div className="setting-bottom">
 <p>员工提交整月绩效后，从飞书通讯录核对直属上级并发送个人评分卡片。月度跨部门评分通知 HRBP 指定的两位评分人；按公司工作日历向当前责任人推送待办，管理员从考核开始每天北京时间17:00统一收到正式考核全员进度、未完成名单与卡点。评分齐全和结果发布时仍自动生成汇总表，管理员完成通知统一放入17:00日报。</p>
 <p className="subtle">应用 ID：{state?.appId||'—'} · 使用服务器已有应用凭证。</p>
 <p className="subtle">{state?.formalLaunch?.date&&<>正式推送{state.formalLaunch.phase==='scheduled'?'将于':'已于'} {state.formalLaunch.date} 启用，首期考核 {state.formalLaunch.firstAssessmentMonth} 月工作；此前月份不补发。独立测试不受正式启用日期限制。</>}</p>
 {state?.demo&&<p className="notice-inline">演示环境不读取真实通讯录、不发送真实消息。</p>}{message&&<p role="status" className="notice-inline">{message}</p>}
 {state&&<><div className="button-row"><button disabled={busy||state.demo} onClick={()=>action('check')}>检查应用权限与机器人</button><button disabled={busy||state.demo} onClick={()=>action('test')}>发送测试卡片给我</button><button disabled={busy} onClick={load}>刷新接入状态</button></div>
 <details open={!state.connection?.ready}><summary>需要开通的应用能力与权限</summary><p>在飞书自建应用中开启机器人能力，发布应用版本，将应用可用范围和通讯录可读范围设置为实际考核员工及其直属上级。</p>
 {state.connection&&<p>机器人：{state.connection.botEnabled?'已开启':'尚未开启／不可用'}{state.connection.botCode?'（'+state.connection.botCode+'）':''} · 检查时间：{new Date(state.connection.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>}
 <div className="table-scroll"><table className="people-table"><thead><tr><th>权限</th><th>用途</th><th>检查结果</th></tr></thead><tbody>{state.requiredScopes.map((x:any)=><tr key={x.scope}><td><code>{x.scope}</code></td><td>{x.name}</td><td>{!state.connection?'尚未检查':state.connection.missing.some((m:any)=>m.scope===x.scope)?'待开通':'已具备'}</td></tr>)}</tbody></table></div></details>
 <form onSubmit={e=>{e.preventDefault();action('save',{...f,configRevision:state.config.revision});}}><label className="field">个人待办催办时间（北京时间）<select value={f.hour??9} onChange={e=>F({...f,hour:Number(e.target.value)})}>{[7,8,9,10,11,12].map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label><label className="check-label"><input type="checkbox" checked={!!f.workflowEnabled} onChange={e=>F({...f,workflowEnabled:e.target.checked})}/>提交、退回及评分待办通知</label><label className="check-label"><input type="checkbox" checked={!!f.monthlyEnabled} onChange={e=>F({...f,monthlyEnabled:e.target.checked})}/>前5个工作日、截止日及逾期工作日向当前责任人催办</label><label className="check-label"><input type="checkbox" checked={!!f.adminDigestEnabled} onChange={e=>F({...f,adminDigestEnabled:e.target.checked})}/>每天17:00向管理员汇总，直至全员完成（北京时间）</label><p className="subtle">日报从次月1日开始，包含周末；未完成则逾期继续发送。当月全员评分并发布结果后立即停止。与个人催办开关独立，独立测试单不单独发送管理员日报。</p><div className="button-row"><button className="primary" disabled={busy}>保存推送设置</button></div></form>
 <div className="directory-link"><p>员工与直属上级的同步、预览和最近同步时间已集中到人员管理。</p><button onClick={onPeople}>前往人员管理同步</button></div><details><summary>发送记录与重试</summary>{!state.delivery.length&&<p>尚无消息发送记录。</p>}{state.delivery.map((x:any)=><div className="setting-row" key={x.id}><div><b>{x.recipient_name} · {kindLabel[x.kind]||'绩效待办'}</b><p>{statusLabel[x.status]||x.status}{x.error_code?' · '+x.error_code:''}</p></div>{['blocked','unknown'].includes(x.status)&&<button disabled={busy} onClick={()=>{if(x.status==='unknown'&&!window.confirm('请先核对收件人的飞书消息，确认尚未收到后再重发。'))return;action('retry',{id:x.id,confirmedNotReceived:x.status==='unknown'});}}>核对后重试</button>}</div>)}</details></>}
 </div></section>;
}
