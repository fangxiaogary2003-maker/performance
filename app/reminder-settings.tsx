'use client';
import React,{useState,useEffect} from 'react';
import {appPath} from '../lib/app-path.mjs';
const labels:any={sent:'已发送',sending:'发送中',rejected:'飞书拒绝',unknown:'结果待核对'};
export function ReminderSettings({data}:any){
 const [state,S]=useState<any>(null),[f,F]=useState<any>({}),[busy,B]=useState(false),[message,M]=useState('');
 const headers={'Content-Type':'application/json','x-demo-user':data.user.id};
 async function load(){try{const r=await fetch(appPath('/api/notifications'),{headers,cache:'no-store'}),x=await r.json();if(!r.ok)throw Error(x.error);S(x);F({...x.config,webhook:'',signSecret:'',clearSigningSecret:false});}catch(e:any){M(e.message);}}
 useEffect(()=>{load();},[data.user.id]);
 const set=(k:string,v:any)=>F((x:any)=>({...x,[k]:v}));
 async function action(action:string,body:any={}){B(true);M('');try{const r=await fetch(appPath('/api/notifications/'+action),{method:'POST',headers,body:JSON.stringify({...body,revision:data.revision})}),x=await r.json();if(!r.ok)throw Error(x.error);await load();M(action==='save'?'提醒设置已保存':action==='test'?'测试卡片已发送到配置的群':'当天提醒已重发');}catch(e:any){M(e.message);if(action!=='save')await load();}finally{B(false);}}
 return <section className="panel reminder-settings"><div className="panel-heading"><h3>飞书全员群提醒</h3><span className={'badge '+(state?.config.enabled?'accepted':'planned')}>{state?.config.enabled?'已启用':'待配置／已停用'}</span></div><div className="setting-bottom">
 <p>每月前5个工作日，依次提醒员工填报、员工补齐、上级评分、HRBP及跨部门评价、全流程核对。按公司工作日历计算，不限于自然月的1—7日。</p>
 {state?.demo&&<p className="notice-inline">演示环境只预览和保存设置，不向真实群发送消息。</p>}
 {state?.configurationError&&<p className="notice-inline">{state.configurationError}</p>}
 {message&&<p role="status" className="notice-inline">{message}</p>}
 {state&&<><form onSubmit={e=>{e.preventDefault();action('save',{...f,configRevision:state.config.revision});}}>
 <label className="field">接收提醒的全员群名称<input required value={f.groupName||''} onChange={e=>set('groupName',e.target.value)} placeholder="例如：公司全员群"/></label>
 <label className="field">群自定义机器人 Webhook<input type="password" autoComplete="off" value={f.webhook||''} onChange={e=>set('webhook',e.target.value)} placeholder={state.config.configured?'已保存，留空保持原值':'从全员群的自定义机器人设置中复制'}/><small>地址仅保存在服务器，保存后不回显。请核对机器人所在群。</small></label>
 <label className="field">机器人签名密钥（启用签名校验时填写）<input type="password" autoComplete="new-password" value={f.signSecret||''} onChange={e=>set('signSecret',e.target.value)} placeholder={state.config.signatureConfigured?'已保存，留空保持原值':'机器人安全设置中的签名密钥'}/></label>
 {state.config.signatureConfigured&&<label className="check-label"><input type="checkbox" checked={!!f.clearSigningSecret} onChange={e=>set('clearSigningSecret',e.target.checked)}/>清除旧签名密钥（仅机器人已关闭签名校验时）</label>}
 <label className="field">每天推送时间（北京时间）<select value={f.hour??9} onChange={e=>set('hour',Number(e.target.value))}>{[7,8,9,10,11,12].map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label>
 <label className="check-label"><input type="checkbox" checked={!!f.atAll} onChange={e=>set('atAll',e.target.checked)}/>正式提醒时 @所有人（需群允许机器人使用）</label>
 <label className="check-label"><input type="checkbox" checked={!!f.enabled} onChange={e=>set('enabled',e.target.checked)}/>启用每月定时推送</label>
 <div className="button-row"><button className="primary" disabled={busy}>保存提醒设置</button><button type="button" disabled={busy||!state.config.configured||state.demo} onClick={()=>action('test')}>向已配置群发送测试卡片</button><button type="button" disabled={busy} onClick={load}>刷新状态</button></div></form>
 <p className="subtle">测试会发送到“{state.config.groupName||'尚未配置'}”，不会@所有人。程序会记录发送结果；网络结果不确定时需核对群消息后再手动重发。</p>
 <details><summary>本月推送安排与记录</summary>{state.plan.schedule.map((x:any)=><div className="setting-row" key={x.date}><div><b>{x.date} {String(x.hour).padStart(2,'0')}:00</b><p>第{x.day}个工作日 · {x.title}</p></div></div>)}{!state.delivery.length&&<p>尚无发送记录。</p>}{state.delivery.map((x:any)=><div className="setting-row" key={x.id}><div><b>{x.date} · {x.stage==='test'?'测试卡片':'第'+x.stage+'个工作日'}</b><p>{labels[x.status]||x.status}{x.error_code?' · 错误码 '+x.error_code:''}</p></div>{['rejected','unknown'].includes(x.status)&&x.stage!=='test'&&x.date===state.plan.date&&<button disabled={busy} onClick={()=>{if(x.status==='unknown'&&!window.confirm('请先检查全员群消息。确定这条提醒尚未收到，要重新发送吗？'))return;action('retry',{id:x.id,confirmedNotReceived:x.status==='unknown'});}}>{x.status==='unknown'?'确认未收到并重发':'重试当天提醒'}</button>}</div>)}</details></>}
 </div></section>;
}
