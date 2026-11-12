import {AppError,ensure} from '../lib/errors.mjs';
import {communicationWindow} from '../lib/collaboration-suggestions.mjs';
const prefix='https://open.feishu.cn/open-apis';
const chunks=(items,size=50)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
const messageId=item=>item?.meta_data?.message_id||item?.message_id||item?.id;
const milliseconds=value=>{const n=Number(value);return Number.isFinite(n)?(n<1e12?n*1000:n):Date.parse(value);};
const localDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(milliseconds(value)));
// The search endpoint validates an explicit local offset; canonical UTC Z is rejected.
const searchTime=value=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,19)+'+08:00';
export function collaborationClient({appId,appSecret,transport=fetch,clock=()=>new Date(),maxRequests=200,maxPages=40}={}){
 async function json(url,options={}){
  let response,data;try{response=await transport(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});data=await response.json();}catch{throw new AppError('飞书连接失败，请稍后重试；已保存的绩效不受影响',502);}
  if(!response.ok||(data.code!=null&&data.code!==0)||data.error){const code=String(Number.isInteger(Number(data.code))&&Number(data.code)!==0?Number(data.code):response.status),message=code==='99992402'?'飞书协作信息请求参数未通过校验，请联系管理员':'协作信息读取未完成，请检查飞书用户授权及消息权限';const error=new AppError(message+'（飞书错误码 '+code+'）',502);error.code=code;throw error;}return data;
 }
 async function exchange(code,redirectUri){return json(prefix+'/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:appId,client_secret:appSecret,code,redirect_uri:redirectUri})});}
 async function refresh(refreshToken){return json(prefix+'/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'refresh_token',client_id:appId,client_secret:appSecret,refresh_token:refreshToken})});}
 async function api(token,path,body,signal){const value=await json(prefix+path,{method:body?'POST':'GET',signal,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return value.data||{};}
 const profile=token=>api(token,'/authen/v1/user_info');
 async function groups(token){const items=[],seen=new Set();let page='';for(let i=0;i<20;i++){const q=new URLSearchParams({page_size:'100',user_id_type:'open_id',...(page?{page_token:page}:{})}),data=await api(token,'/im/v1/chats?'+q);items.push(...(data.items||[]).filter(c=>c.chat_mode!=='p2p'&&!c.external).map(c=>({id:c.chat_id,name:c.name||'未命名工作群'})));if(!data.has_more)return {items,complete:true};ensure(data.page_token&&!seen.has(data.page_token),'飞书工作群分页异常',502);seen.add(data.page_token);page=data.page_token;}return {items,complete:false};}
 async function collect({token,ownerOpenId,month,includeP2p,groupIds,signal}){
  const window=communicationWindow(month,clock());ensure(window.eligible,'该工作月份尚未开始',409);const deadline=Date.now()+120000;let requests=0,complete=true;const warnings=new Set(),edges=new Map(),messages=new Map();
  const request=async(path,body)=>{ensure(!signal?.aborted,'协作授权已撤销或范围变化，停止读取',409);if(++requests>maxRequests||Date.now()>deadline){const e=new AppError('本次同步达到读取上限，数据不完整，请 HRBP 手动指定',409);e.partial=true;throw e;}const data=await api(token,path,body,signal);ensure(!signal?.aborted,'协作授权已撤销或范围变化，停止读取',409);return data;};
  const peer=id=>{if(!/^ou_[A-Za-z0-9_-]+$/.test(id||'')||id===ownerOpenId)return null;if(!edges.has(id))edges.set(id,{peerOpenId:id,privateSent:0,privateReceived:0,groupMentions:0,groupReplies:0,days:new Set()});return edges.get(id);};
  async function search(filter,start=window.start,end=window.end,depth=0){
   const found=[],seen=new Set();let page='';
   for(let i=0;i<maxPages;i++){
    const q=new URLSearchParams({page_size:'50',user_id_type:'open_id',...(page?{page_token:page}:{})}),data=await request('/im/v1/messages/search?'+q,{query:'',filter:{...filter,from_types:['user'],time_range:{start_time:searchTime(start),end_time:searchTime(end)}}});
    ensure(Array.isArray(data.items)&&typeof data.has_more==='boolean','飞书搜索返回格式未能核对，本次不生成推荐',502);
    if(data.notice){complete=false;warnings.add('飞书返回搜索范围或可见性提示，统计可能不完整。');}
    for(const item of data.items||[])if(messageId(item))found.push(item);
    if(!data.has_more)return found;ensure(data.page_token&&!seen.has(data.page_token),'飞书消息分页异常',502);seen.add(data.page_token);page=data.page_token;
   }
   if(depth<6&&Date.parse(end)-Date.parse(start)>3600000){const middle=new Date((Date.parse(start)+Date.parse(end))/2).toISOString();return [...await search(filter,start,middle,depth+1),...await search(filter,middle,end,depth+1)];}
   complete=false;warnings.add('部分时间段消息超过读取上限，暂不用于自动推荐。');return found;
  }
  const inWindow=value=>{const time=milliseconds(value);return Number.isFinite(time)&&time>=Date.parse(window.start)&&time<Date.parse(window.end);};
  try{
   if(includeP2p){
    const found=await search({chat_type:'p2p'}),unique=new Map(found.map(m=>[messageId(m),m.meta_data||m])),ids=[...new Set([...unique.values()].map(m=>m.chat_id).filter(Boolean))],chats=new Map();
    for(const batch of chunks(ids)){const data=await request('/im/v1/chats/batch_query?user_id_type=open_id',{chat_ids:batch});for(const chat of data.items||[])chats.set(chat.chat_id,chat);}
    for(const meta of unique.values()){
     if(!meta.message_id||!meta.chat_id||!Number.isFinite(milliseconds(meta.create_time))){complete=false;warnings.add('部分消息的时间或身份字段无法核对。');continue;}if(!inWindow(meta.create_time)||['system','sticker','unknown'].includes(meta.type))continue;const chat=chats.get(meta.chat_id);
     if(!chat||chat.chat_mode!=='p2p'||chat.p2p_target_type==='bot'||!chat.p2p_target_id){complete=false;warnings.add('部分单聊对象无法核对，暂不用于自动推荐。');continue;}
     if(chat.external)continue;const edge=peer(chat.p2p_target_id);if(!edge)continue;
     if(meta.from_id===ownerOpenId)edge.privateSent++;else if(meta.from_id===edge.peerOpenId)edge.privateReceived++;else{complete=false;warnings.add('部分单聊发送者无法核对。');continue;}edge.days.add(localDay(meta.create_time));
    }
   }
   if(groupIds.length){
    const found=await search({chat_type:'group',chat_ids:groupIds,from_ids:[ownerOpenId]}),ids=[...new Set(found.map(messageId))];
    for(const batch of chunks(ids)){const q=new URLSearchParams({user_id_type:'open_id'});for(const id of batch)q.append('message_ids',id);const data=await request('/im/v1/messages/mget?'+q);for(const m of data.items||[])if(m.message_id)messages.set(m.message_id,m);}
    if(ids.some(id=>!messages.has(id))){complete=false;warnings.add('部分群消息不可见或已删除，暂不用于自动推荐。');}
    const parentIds=[...new Set([...messages.values()].filter(m=>m.parent_id&&!messages.has(m.parent_id)).map(m=>m.parent_id))];
    for(const batch of chunks(parentIds)){const q=new URLSearchParams({user_id_type:'open_id'});for(const id of batch)q.append('message_ids',id);const data=await request('/im/v1/messages/mget?'+q);for(const m of data.items||[])if(m.message_id)messages.set(m.message_id,m);}
    for(const id of ids){
     const m=messages.get(id);if(!m||m.deleted||m.sender?.sender_type!=='user'||m.sender?.id!==ownerOpenId||!groupIds.includes(m.chat_id)||!inWindow(m.create_time)||['system','sticker'].includes(m.msg_type))continue;
     const day=localDay(m.create_time),mentioned=new Set((m.mentions||[]).filter(x=>x.id_type!=='app_id'&&/^ou_/.test(x.id||'')).map(x=>x.id));
     for(const id of mentioned){const e=peer(id);if(e){e.groupMentions++;e.days.add(day);}}
     if(m.parent_id){const parent=messages.get(m.parent_id);if(!parent){complete=false;warnings.add('部分被回复消息无法核对。');continue;}if(parent.chat_id===m.chat_id&&parent.sender?.sender_type==='user'){const e=peer(parent.sender.id);if(e){e.groupReplies++;e.days.add(day);}}}
    }
   }
  }catch(error){if(!error.partial)throw error;complete=false;warnings.add(error.message);}
  // Keep counts and calendar dates only. Raw messages, previews, bodies and chat names never leave this function.
  return {month,complete,warnings:[...warnings],through:new Date(Math.floor(Date.parse(window.end)/1000)*1000).toISOString(),requests,edges:[...edges.values()].map(e=>({...e,days:[...e.days].sort()}))};
 }
 return {exchange,refresh,profile,groups,collect};
}
