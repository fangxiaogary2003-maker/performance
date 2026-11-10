import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {adapters} from './adapter.mjs';
import {feishuClient} from './feishu-client.mjs';
import {applicationMessaging} from './application-messaging.mjs';
import {api,readStore,writeStore,mutate,actorFor,monthNow} from '../lib/performance.mjs';
import {publicConfig,internalPath,safeReturnTo} from '../lib/app-path.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const demo=process.env.DEMO_MODE==='true';
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4310);
const {origin,basePath,base}=publicConfig(process.env.APP_BASE_URL||`http://127.0.0.1:${port}`);
if(!demo&&(!base.startsWith('https://')||!process.env.FEISHU_APP_ID||!process.env.FEISHU_APP_SECRET))throw Error('Production requires HTTPS APP_BASE_URL, FEISHU_APP_ID and FEISHU_APP_SECRET. Use DEMO_MODE=true for a loopback-only demo.');
if(demo&&!['127.0.0.1','::1','localhost'].includes(host))throw Error('Demo server must bind to loopback.');
const env=await adapters(process.env.DATA_DIR||join(root,'data'));
env.APP_MESSAGING=applicationMessaging(env.sql,{env,client:feishuClient({appId:process.env.FEISHU_APP_ID,appSecret:process.env.FEISHU_APP_SECRET}),appId:process.env.FEISHU_APP_ID||'演示应用',base,demo});
const rand=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex');
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1)];}));
const cookie=(name,value,seconds)=>`${name}=${value}; Path=${basePath||'/'}; HttpOnly; SameSite=Lax; Max-Age=${seconds}${demo?'':'; Secure'}`;
const redirect=(res,url,cs)=>{res.writeHead(302,{'Location':url,'Set-Cookie':cs||[],'Cache-Control':'no-store'});res.end();};
const send=(res,status,msg)=>{res.writeHead(status,{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'});res.end(msg);};
let ticking=false;
async function tick(){if(ticking||demo||process.env.AUTO_OPEN_CYCLES!=='true')return;ticking=true;try{const {state,revision}=await readStore(env.DB,'company',false);const month=monthNow(),admin=state.people.find(p=>p.active&&p.roles.includes('admin'));if(admin&&!state.cycles.some(c=>c.month===month)){mutate(state,admin,'openCycle',{month});await writeStore(env.DB,'company',revision,state);}}catch(e){console.error('Cycle scheduler:',e.message);}finally{ticking=false;}}
const rate=new Map();
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://*.feishu.cn https://*.larksuite.com");
 try{
 const publicUrl=new URL(req.url,origin),path=internalPath(publicUrl.pathname,basePath),cs=cookies(req);
 if(path===null){send(res,404,'页面不存在');return;}
 if(publicUrl.pathname===basePath&&basePath){redirect(res,basePath+'/');return;}
 const url=new URL(path+publicUrl.search,origin);
 if(url.pathname==='/health'){send(res,200,'ok');return;}
 if(url.pathname==='/auth/login'&&!demo){
 const peer=req.socket.remoteAddress||'';const key=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)?String(req.headers['x-real-ip']||peer):peer;
 for(const [k,v]of rate)if(Date.now()-v.at>60000)rate.delete(k);
 const old=rate.get(key)||{at:Date.now(),n:0};old.n++;rate.set(key,old);if(old.n>60){send(res,429,'登录请求过多，请稍后重试');return;}
 const state=rand();env.sql.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());env.sql.prepare('INSERT INTO oauth_states(id,expires,return_to) VALUES(?,?,?)').run(hash(state),Date.now()+600000,safeReturnTo(url.searchParams.get('return_to'),origin,basePath));
 const auth=new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');auth.search=new URLSearchParams({client_id:process.env.FEISHU_APP_ID,response_type:'code',redirect_uri:base+'/auth/callback',scope:process.env.FEISHU_SCOPE||'contact:user.base:readonly',state}).toString();redirect(res,auth.href,cookie('oauth_state',state,600));return;}
 if(url.pathname==='/auth/callback'&&!demo){
 const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||state!==cs.oauth_state||!code){send(res,400,'登录校验失败，请重新登录');return;}
 const stored=env.sql.prepare('DELETE FROM oauth_states WHERE id=? AND expires>? RETURNING id,return_to').get(hash(state),Date.now());if(!stored){send(res,400,'登录请求已失效');return;}
 const tokenResponse=await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:process.env.FEISHU_APP_ID,client_secret:process.env.FEISHU_APP_SECRET,code,redirect_uri:base+'/auth/callback'}),signal:AbortSignal.timeout(15000)});const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token){send(res,502,'飞书授权失败，请检查应用配置及授权范围');return;}
 const profileResponse=await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});const profile=await profileResponse.json();if(!profileResponse.ok||profile.code!==0||!profile.data?.open_id){send(res,502,'无法获取飞书身份');return;}
 const {state:s}=await readStore(env.DB,'company',false);const u=s.people.find(p=>p.active&&p.feishuOpenId===profile.data.open_id);if(!u){
 const existing=env.sql.prepare('SELECT id FROM login_requests WHERE open_id=?').get(profile.data.open_id);const id=existing?.id||rand().slice(0,16);
 env.sql.prepare('INSERT INTO login_requests(id,open_id,name,created_at) VALUES(?,?,?,?) ON CONFLICT(open_id) DO UPDATE SET name=excluded.name').run(id,profile.data.open_id,profile.data.name||'飞书用户',new Date().toISOString());
 res.setHeader('Set-Cookie',cookie('oauth_state','',0));send(res,403,`飞书身份认证成功。\n账号尚未开通，请将此开通编号告诉系统管理员：${id}\n管理员绑定人员及角色后，可重新登录。`);return;}
 const session=rand();env.sql.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());env.sql.prepare('INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)').run(hash(session),u.id,Date.now()+8*3600000);redirect(res,safeReturnTo(stored.return_to,origin,basePath),[cookie('perf_session',session,8*3600),cookie('oauth_state','',0)]);return;}
 if(url.pathname==='/auth/logout'){if(cs.perf_session)env.sql.prepare('DELETE FROM sessions WHERE id=?').run(hash(cs.perf_session));redirect(res,basePath+'/',cookie('perf_session','',0));return;}
 const session=!demo&&cs.perf_session?env.sql.prepare('SELECT user_id FROM sessions WHERE id=? AND expires>?').get(hash(cs.perf_session),Date.now()):null;
 if(url.pathname.startsWith('/api/')){
 const parts=[];let length=0;for await(const part of req){length+=part.length;if(length>11*1024*1024){send(res,413,'请求超过大小限制');return;}parts.push(part);}
 const requestHeaders=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!=null&&!['host','oai-authenticated-user-id','oai-authenticated-user-email'].includes(k))requestHeaders.set(k,Array.isArray(v)?v.join(','):v);
 const request=new Request(url,{method:req.method,headers:requestHeaders,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})});
 const identity=demo?{key:'demo',userId:requestHeaders.get('x-demo-user')||'lin',demo:true}:session?{key:'company',userId:session.user_id,demo:false}:null;
 const result=await api(request,env,identity);res.writeHead(result.status,Object.fromEntries(result.headers));if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end();return;
 }
 if(!['/','/app.js','/app.css','/favicon.svg'].includes(url.pathname)){send(res,404,'页面不存在');return;}
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);let bytes;try{bytes=await readFile(join(root,'selfhost/public',file));if(file==='index.html')bytes=Buffer.from(bytes.toString('utf8').replaceAll('__APP_BASE_PATH__',basePath));}catch{send(res,404,'请先构建前端：node local/build.mjs');return;}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8'});res.end(bytes);
 }catch(e){console.error('Request failed:',e.message);if(!res.headersSent)send(res,500,'服务处理失败，请联系 IT');else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>{console.log(`绩效工作台 Local: http://${host}:${port} (${demo?'虚构数据演示':'生产飞书登录'})`);});
let reminding=false;
async function remind(){if(demo||reminding)return;reminding=true;try{const {state}=await readStore(env.DB,'company',false);await env.APP_MESSAGING.flush('company');}catch(e){console.error('Reminder scheduler:',e.message);}finally{reminding=false;}}
const timer=setInterval(()=>{tick();remind();},60000);timer.unref();await tick();await remind();
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{clearInterval(timer);server.close(()=>{env.sql.close();process.exit(0);});});
