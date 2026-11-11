'use client';
import React,{useEffect,useState} from 'react';
import {RefreshCw,Users} from 'lucide-react';
import {appPath} from '../lib/app-path.mjs';

export function DirectorySync({data,onRefresh}:any){
 const [status,S]=useState<any>(null),[preview,P]=useState<any>(null),[busy,B]=useState(''),[message,M]=useState(''),[error,E]=useState('');
 const headers={'Content-Type':'application/json','x-demo-user':data.user.id};
 async function load(){const r=await fetch(appPath('/api/app-messaging/directory'),{headers,cache:'no-store'}),x=await r.json();if(!r.ok)throw Error(x.error||'读取同步状态失败');S(x);}
 useEffect(()=>{load().catch(e=>E(e.message));},[data.user.id,data.revision]);
 async function sync(apply=false){
  B(apply?'apply':'preview');M('');E('');if(!apply)P(null);
  try{
   const r=await fetch(appPath('/api/app-messaging/'+(apply?'apply-directory':'preview-directory')),{method:'POST',headers,body:JSON.stringify({revision:data.revision,...(apply?{previewId:preview.id}:{})})}),x=await r.json();
   if(!r.ok){if(r.status===409){P(null);await onRefresh?.();}throw Error(x.error||'同步失败，请重试');}
   if(apply){P(null);M(`同步完成：新增 ${x.counts.added} 人，更新 ${x.counts.updated} 人。`);await onRefresh?.();await load();}
   else P(x.preview);
  }catch(e:any){E(e.message);}finally{B('');}
 }
 const last=status?.lastSync;
 return <section className="panel directory-sync" aria-label="飞书人员同步">
  <div className="panel-heading"><h3><Users size={17}/>飞书人员同步</h3><button className="primary" disabled={!!busy||data.demo} onClick={()=>sync()}><RefreshCw size={15}/>{busy==='preview'?'正在读取飞书…':'同步飞书人员'}</button></div>
  <div className="setting-bottom">
   <p>从飞书自建应用读取姓名、部门、岗位、直属上级及在职状态。HRBP 按已配置的部门规则匹配，员工手工例外和已生成的考核关系保留。</p>
   <p className="subtle">{last?`最近同步：${new Date(last.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · ${last.counts.total} 个通讯录账号`:`当前系统 ${data.people.length} 人 · 点击同步获取飞书最新名单`}</p>
   {data.demo&&<p className="notice-inline">演示环境不读取真实飞书通讯录。</p>}
   {message&&<p role="status" className="notice-inline">{message}</p>}{error&&<p role="alert" className="notice-inline">{error}</p>}
   {preview&&<div className="directory-preview">
    <h4>核对飞书名单</h4><p>本次读取 {preview.count} 人，其中在职可用 {preview.activeCount} 人。{preview.changes&&`新增 ${preview.changes.added} 人，匹配已有 ${preview.changes.matched} 人，缺少直属上级 ${preview.changes.missingManager} 人。`}</p>
    <div className="table-scroll"><table className="people-table"><thead><tr><th>姓名</th><th>部门 / 岗位</th><th>直属上级</th><th>状态</th></tr></thead><tbody>{preview.people.map((p:any,i:number)=><tr key={i}><td>{p.name}</td><td>{p.dept}<small>{p.position||'岗位未填写'}</small></td><td>{p.manager}</td><td>{p.active?'在职可用':'停用 / 离职'}</td></tr>)}</tbody></table></div>
    <p className="subtle">核对应用可读范围后同步。没有直属上级的账号保留待核对；同步后可在下方为符合条件的新员工生成本月考核单。</p>
    <div className="button-row"><button className="primary" disabled={!!busy} onClick={()=>sync(true)}>{busy==='apply'?'正在同步…':'确认同步到系统'}</button><button disabled={!!busy} onClick={()=>P(null)}>取消</button></div>
   </div>}
  </div>
 </section>;
}
