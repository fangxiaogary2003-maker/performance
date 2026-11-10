// Shared business engine: Cloudflare D1 and self-hosted SQLite use the same CAS store.
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(ok,msg,status=400)=>{if(!ok)throw new AppError(msg,status);};
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const monthNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const clean=(v,max=2000)=>{fail(typeof v==='string'&&v.trim().length>0&&v.length<=max,'请填写完整内容，且不要超过长度限制');return v.trim();};
const date=(v)=>{fail(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日期无效');return v;};
const month=(v)=>{fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(v),'月份无效');return v;};
const finite=(v,min,max)=>{fail(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,`数值须在 ${min}—${max} 之间`);return v;};
export function fifthWorkday(m,calendar={}){month(m);let d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);let count=0;for(let i=0;i<70;i++){const key=d.toISOString().slice(0,10),over=calendar[key];if(over===true||(over!==false&&d.getUTCDay()!==0&&d.getUTCDay()!==6))count++;if(count===5)return key;d.setUTCDate(d.getUTCDate()+1);}throw new AppError('日历配置异常');}
export function emptyState(){return {people:[],cycles:[],assessments:[],tasks:[],calendar:{},rules:[],audit:[],archives:[]};}
export function demoState(){
 const s=emptyState(); s.people=[
 {id:'lin',name:'林悦',dept:'产品设计部',managerId:'zhou',hrbpId:'chen',roles:[],active:true},
 {id:'zhou',name:'周宁',dept:'产品设计部',managerId:null,hrbpId:'chen',roles:['manager'],active:true},
 {id:'chen',name:'陈嘉',dept:'人力资源部',managerId:null,hrbpId:null,roles:['hrbp','admin'],active:true},
 {id:'xu',name:'许航',dept:'研发工程部',managerId:null,hrbpId:'chen',roles:[],active:true},
 {id:'he',name:'何澄',dept:'品牌市场部',managerId:'zhou',hrbpId:'chen',roles:[],active:true}];
 const current=monthNow(),d=new Date(current+'-01');d.setUTCMonth(d.getUTCMonth()-1);const previous=d.toISOString().slice(0,7);
 for(const m of [previous,current]){const c={id:'c-'+m,month:m,due:fifthWorkday(m),calendarConfirmed:false,openedAt:now(),ruleId:null};s.cycles.push(c);for(const person of s.people.filter(p=>['lin','he'].includes(p.id)))s.assessments.push({id:'a-'+m+'-'+person.id,cycleId:c.id,employeeId:person.id,employeeName:person.name,department:person.dept,managerId:person.managerId,hrbpId:person.hrbpId,status:'active',goalVersion:1,managerConfirmedAt:now(),employeeConfirmedAt:m===previous?now():null,components:{},redline:null});}
 const last=s.assessments.find(a=>a.employeeId==='lin'),cur=s.assessments.find(a=>a.employeeId==='lin'&&a.cycleId==='c-'+current);
 const add=(a,title,standard,weight,cross,status,reviewerId=null,result='')=>{s.tasks.push({id:uid(),assessmentId:a.id,title,standard,due:a===cur?current+'-25':previous+'-28',weight,cross,status,reviewerId,result,attachments:[],versions:[],reviews:[],version:1,createdAt:now()});};
 add(cur,'T2 新品结构方案设计','交付完整三维模型、关键尺寸图和结构评审纪要；通过研发可制造性评审。',50,true,'planned','xu');
 add(cur,'包装与说明书设计优化','完成包装信息检查、说明书改版与物料签样，归档确认记录。',30,true,'planned');
 add(cur,'设计规范知识库更新','补充 3 个项目案例，整理可复用的结构设计检查项。',20,false,'planned');
 add(last,'T2 结构样机交付','样机装配完成，提交测试报告并通过研发验收。',60,true,'submitted','xu','已完成样机装配及首轮测试，关键尺寸与图纸一致，请验收。');
 add(last,'产品视觉物料交付','交付主视觉与详情页源文件，经品牌部门确认。',40,true,'returned','he','首版设计已提交，待补充移动端适配图。');
 s.tasks.at(-1).reviews.push({actorId:'he',name:'何澄',decision:'returned',comment:'请补充移动端适配图和最终源文件。',at:now()});
 const h=s.assessments.find(a=>a.employeeId==='he'&&a.cycleId==='c-'+current);add(h,'11 月品牌活动视觉','完成全渠道活动视觉素材并按期上线。',100,true,'planned','lin');
 s.audit.push({id:uid(),at:now(),actorId:'system',actorName:'系统',action:'初始化虚构试点数据',target:'试点工作区'});return s;
}
export const isAdmin=u=>u.roles.includes('admin');
export const canManage=(u,a)=>isAdmin(u)||a.managerId===u.id||a.hrbpId===u.id;
export const canSee=(u,a,s)=>u.id===a.employeeId||canManage(u,a)||s.tasks.some(t=>t.assessmentId===a.id&&t.reviewerId===u.id);
export const taskVisible=(u,t,a)=>u.id===a.employeeId||canManage(u,a)||t.reviewerId===u.id;
export function actorFor(s,id){const u=s.people.find(p=>p.id===id&&p.active);fail(u,'人员未导入或账号未获授权',403);return u;}
export function view(s,u,demo){
 const visible=s.assessments.filter(a=>canSee(u,a,s));
 const assessments=visible.map(a=>canManage(u,a)?a:u.id===a.employeeId?{...a,components:a.status==='active'?{}:a.components}:{id:a.id,cycleId:a.cycleId,employeeId:a.employeeId,employeeName:a.employeeName,department:a.department,reviewOnly:true});
 const tasks=s.tasks.filter(t=>{const a=s.assessments.find(a=>a.id===t.assessmentId);return a&&taskVisible(u,t,a);});
 const protectedAssessment=visible.filter(a=>canManage(u,a));
 const audit=s.audit.filter(e=>isAdmin(u)||e.actorId===u.id||tasks.some(t=>(e.targets||[e.target]).includes(t.id))||protectedAssessment.some(a=>a.id===e.target)).slice(-100).reverse();
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 return {user:u,demo,people:s.people.filter(p=>p.active).map(({feishuOpenId,...p})=>p),cycles:s.cycles,assessments,tasks,calendar:isAdmin(u)?s.calendar:undefined,rules:s.rules,archives:s.archives.filter(a=>isAdmin(u)||a.employeeId===u.id||a.managerId===u.id||a.hrbpId===u.id).map(({snapshot,...a})=>a),audit,overdueTaskIds:tasks.filter(t=>t.due<today&&t.status!=='accepted'&&s.assessments.find(a=>a.id===t.assessmentId)?.status==='active').map(t=>t.id)};
}
export function mutate(s,u,action,b={}){
 const at=now();let target=b.id||b.assessmentId||b.cycleId||action;
 const a=s.assessments.find(a=>a.id===(b.assessmentId||b.id));
 const t=s.tasks.find(t=>t.id===b.id); const ta=t&&s.assessments.find(a=>a.id===t.assessmentId);
 const active=x=>{fail(x,'记录不存在',404);fail(x.status==='active','考核已经发布或归档，不能修改',409);};
 const admin=()=>fail(isAdmin(u),'需要绩效管理员权限',403);
 const invalidate=x=>{x.managerConfirmedAt=null;x.employeeConfirmedAt=null;x.goalVersion++;x.components={};};
 const tasksOf=x=>s.tasks.filter(t=>t.assessmentId===x.id);
 const weights=x=>{const ts=tasksOf(x);fail(ts.length&&Math.abs(ts.reduce((v,t)=>v+t.weight,0)-100)<0.001,'目标权重合计必须等于 100%');};
 const log=()=>s.audit.push({id:uid(),at,actorId:u.id,actorName:u.name,action,target,targets:String(target).split(','),reason:b.reason||null,details:structuredClone(b)});
 switch(action){
 case 'openCycle':{
 admin();month(b.month);fail(!s.cycles.some(c=>c.month===b.month),'该月份已开启',409);const c={id:uid(),month:b.month,due:fifthWorkday(b.month,s.calendar),calendarConfirmed:false,openedAt:at,ruleId:null};s.cycles.push(c);target=c.id;
 for(const p of s.people.filter(p=>p.active&&p.managerId))s.assessments.push({id:uid(),cycleId:c.id,employeeId:p.id,employeeName:p.name,department:p.dept,managerId:p.managerId,hrbpId:p.hrbpId,status:'active',goalVersion:1,managerConfirmedAt:null,employeeConfirmedAt:null,components:{},redline:null});break;}
 case 'createTask':{
 active(a);fail(a.managerId===u.id||a.employeeId===u.id||isAdmin(u),'无权建立目标',403);fail(!a.employeeConfirmedAt,'目标已签约，请使用目标变更',409);const task={id:uid(),assessmentId:a.id,title:clean(b.title,160),standard:clean(b.standard),due:date(b.due),weight:finite(b.weight,0.01,100),cross:!!b.cross,status:'planned',reviewerId:null,result:'',attachments:[],versions:[],reviews:[],version:1,createdAt:at};s.tasks.push(task);invalidate(a);target=task.id;break;}
 case 'changeTask':{
 active(ta);fail(ta.managerId===u.id||isAdmin(u),'仅直属上级可变更目标',403);fail(!ta.components||!Object.values(ta.components).some(c=>c.score!=null),'已有评分，请先撤回评分',409);clean(b.reason);t.versions.push({version:t.version,title:t.title,standard:t.standard,due:t.due,weight:t.weight,result:t.result,attachments:structuredClone(t.attachments),reviews:structuredClone(t.reviews),managerConfirmedAt:ta.managerConfirmedAt,employeeConfirmedAt:ta.employeeConfirmedAt,goalVersion:ta.goalVersion,reason:b.reason,changedBy:u.id,at});Object.assign(t,{title:clean(b.title,160),standard:clean(b.standard),due:date(b.due),weight:finite(b.weight,0.01,100),version:t.version+1,status:'planned',result:'',attachments:[],reviews:[]});invalidate(ta);break;}
 case 'approveGoals':active(a);fail(a.managerId===u.id||isAdmin(u),'仅直属上级可确认目标方案',403);weights(a);fail(!a.employeeConfirmedAt,'该版本已确认',409);a.managerConfirmedAt=at;break;
 case 'confirmGoals':active(a);fail(a.employeeId===u.id,'仅员工本人可确认目标',403);weights(a);fail(a.managerConfirmedAt,'请等待主管确认方案',409);fail(!a.employeeConfirmedAt,'已经确认',409);a.employeeConfirmedAt=at;a.confirmedBy=u.id;break;
 case 'assign':{
 fail(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=200,'请选择任务');const reviewer=actorFor(s,b.reviewerId);
 for(const id of b.ids){const task=s.tasks.find(t=>t.id===id),as=task&&s.assessments.find(a=>a.id===task.assessmentId);active(as);fail(as.hrbpId===u.id||isAdmin(u),'仅负责 HRBP 可分派',403);fail(task.cross,'仅跨部门任务需要分派');fail(reviewer.id!==as.employeeId,'不能分派给任务提交人');if(task.status==='accepted')fail(false,'已验收任务不能改派',409);if(task.reviewerId&&task.reviewerId!==reviewer.id)clean(b.reason);task.reviewerId=reviewer.id;}target=b.ids.join(',');break;}
 case 'submit':active(ta);fail(ta.employeeId===u.id,'仅员工本人可提交成果',403);fail(ta.employeeConfirmedAt,'请先完成目标签约',409);fail(['planned','returned'].includes(t.status),'当前状态不能提交',409);fail(!t.cross||t.reviewerId,'等待 HRBP 指定验收人',409);t.result=clean(b.result,10000);t.status='submitted';t.submittedAt=at;ta.components={};break;
 case 'review':active(ta);fail(t.cross?t.reviewerId===u.id:ta.managerId===u.id,'不是该任务的验收人',403);fail(t.status==='submitted','任务不在待验收状态',409);fail(['accepted','returned'].includes(b.decision),'验收结论无效');t.reviews.push({actorId:u.id,name:u.name,decision:b.decision,comment:clean(b.comment),at});t.status=b.decision;ta.components={};break;
 case 'saveRule':{
 admin();fail(b.confirmed===true,'需确认制度已经批准');clean(b.approvalReference);fail(Array.isArray(b.components)&&b.components.length>0&&b.components.length<=8,'至少配置一个模块');const cs=b.components.map((c,i)=>({key:'m'+i,name:clean(c.name,80),weight:finite(c.weight,0.01,100),scorer:c.scorer}));fail(cs.every(c=>['manager','hrbp'].includes(c.scorer)),'评分主体无效');fail(Math.abs(cs.reduce((v,c)=>v+c.weight,0)-100)<0.001,'模块权重须合计 100%');const r={id:uid(),name:clean(b.name,80),components:cs,approvedBy:u.id,approvalReference:b.approvalReference,approvedAt:at,cap:100,redlineZero:true};s.rules.push(r);target=r.id;break;}
 case 'bindRule':{admin();const c=s.cycles.find(c=>c.id===b.cycleId);fail(c,'月份不存在');fail(s.rules.some(r=>r.id===b.ruleId),'规则不存在');fail(s.assessments.filter(a=>a.cycleId===c.id).every(a=>a.status==='active'&&Object.keys(a.components).length===0),'已评分或已发布的月份不能更换规则',409);c.ruleId=b.ruleId;break;}
 case 'score':{active(a);const c=s.cycles.find(c=>c.id===a.cycleId),r=s.rules.find(r=>r.id===c.ruleId);fail(r,'评分制度尚未配置，不能计分',409);fail(a.employeeConfirmedAt&&tasksOf(a).every(t=>t.status==='accepted'),'目标签约和逐项验收须全部完成',409);const component=r.components.find(c=>c.key===b.key);fail(component,'评分模块不存在');fail((component.scorer==='manager'?a.managerId:a.hrbpId)===u.id,'不是该模块的评分人',403);a.components[b.key]={score:finite(b.score,0,100),comment:clean(b.comment),actorId:u.id,at};break;}
 case 'clearScores':active(a);fail(a.managerId===u.id||isAdmin(u),'无权限',403);clean(b.reason);a.components={};break;
 case 'redline':active(a);admin();a.redline={reason:clean(b.reason),actorId:u.id,at};break;
 case 'publish':{
 active(a);admin();const c=s.cycles.find(c=>c.id===a.cycleId),r=s.rules.find(r=>r.id===c.ruleId);fail(c.calendarConfirmed,'请先核对该月的工作日历',409);fail(r,'评分制度尚未确认，不能发布',409);fail(a.employeeConfirmedAt&&tasksOf(a).length&&tasksOf(a).every(t=>t.status==='accepted'),'目标及验收尚未完成',409);fail(a.redline||r.components.every(c=>a.components[c.key]?.score!=null),'存在未评分模块，不能按 0 分发布',409);a.finalScore=a.redline?0:Math.min(100,Math.round(r.components.reduce((v,c)=>v+a.components[c.key].score*c.weight/100,0)*100)/100);a.publishedAt=at;a.status='published';a.ruleSnapshot=structuredClone(r);break;}
 case 'archive':{
 fail(a,'记录不存在',404);admin();fail(a.status==='published','仅已发布结果可以正式归档',409);a.status='archived';a.archivedAt=at;const snapshot={assessment:structuredClone(a),tasks:structuredClone(tasksOf(a)),cycle:structuredClone(s.cycles.find(c=>c.id===a.cycleId)),people:structuredClone(s.people.filter(p=>[a.employeeId,a.managerId,a.hrbpId,...tasksOf(a).map(t=>t.reviewerId)].includes(p.id)).map(({feishuOpenId,...p})=>p)),audit:structuredClone(s.audit.filter(e=>(e.targets||[e.target]).some(id=>[a.id,...tasksOf(a).map(t=>t.id)].includes(id))))};s.archives.push({id:uid(),employeeId:a.employeeId,managerId:a.managerId,hrbpId:a.hrbpId,name:a.employeeName,month:snapshot.cycle.month,score:a.finalScore,at,snapshot});break;}
 case 'calendar':{admin();date(b.date);fail(typeof b.workday==='boolean','请选择工作日或休息日');s.calendar[b.date]=b.workday;for(const c of s.cycles){if(s.assessments.filter(a=>a.cycleId===c.id).every(a=>a.status==='active')){c.due=fifthWorkday(c.month,s.calendar);c.calendarConfirmed=false;}}break;}
 case 'confirmCalendar':{admin();const c=s.cycles.find(c=>c.id===b.cycleId);fail(c,'月份不存在');c.calendarConfirmed=true;c.calendarConfirmedBy=u.id;c.calendarConfirmedAt=at;break;}
 case 'importPeople':{admin();fail(Array.isArray(b.people)&&b.people.length>0&&b.people.length<=1000,'请提供 1—1000 条人员');const ids=new Set(),opens=new Set();const next=b.people.map(p=>{const id=clean(p.id,80);fail(!ids.has(id),'人员 ID 重复');ids.add(id);if(p.feishuOpenId){fail(!opens.has(p.feishuOpenId),'飞书 Open ID 重复');opens.add(p.feishuOpenId);}fail(Array.isArray(p.roles)&&p.roles.every(r=>['admin','hrbp','manager'].includes(r)),'角色无效');return {id,name:clean(p.name,80),dept:clean(p.dept,80),managerId:p.managerId||null,hrbpId:p.hrbpId||null,roles:p.roles,active:p.active!==false,feishuOpenId:p.feishuOpenId||s.people.find(old=>old.id===id)?.feishuOpenId||null};});const bound=next.filter(p=>p.feishuOpenId).map(p=>p.feishuOpenId);fail(new Set(bound).size===bound.length,'飞书 Open ID 重复');fail(next.some(p=>p.id===u.id&&p.roles.includes('admin')&&p.active),'不能移除当前管理员');for(const p of next){fail(!p.managerId||ids.has(p.managerId),'主管不存在');fail(!p.hrbpId||next.some(x=>x.id===p.hrbpId&&x.roles.includes('hrbp')),'HRBP 不存在或无角色');fail(p.managerId!==p.id,'不能将自己设为主管');}for(const old of s.people)if(!ids.has(old.id))next.push({...old,active:false});s.people=next;break;}
 default:throw new AppError('未知操作',404);
 }
 log();return s;
}
export async function readStore(db,key,demo){let row=await db.prepare('SELECT revision,payload FROM workspaces WHERE id=?').bind(key).first();if(!row){const s=demo?demoState():emptyState();await db.prepare('INSERT OR IGNORE INTO workspaces(id,revision,payload,updated_at) VALUES(?,0,?,?)').bind(key,JSON.stringify(s),now()).run();row=await db.prepare('SELECT revision,payload FROM workspaces WHERE id=?').bind(key).first();}return {revision:row.revision,state:JSON.parse(row.payload)};}
export async function writeStore(db,key,revision,state){const result=await db.prepare('UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(state),now(),key,revision).run();fail((result.meta?.changes??result.changes)===1,'记录已被其他人更新，请刷新后重试',409);return revision+1;}
export async function api(request,env,identity){
 try{
 fail(identity,'请先登录',401);const url=new URL(request.url);const path=url.pathname.replace(/^\/api\/?/,'');
 const {key,userId,demo}=identity;let {state:s,revision}=await readStore(env.DB,key,demo);const u=actorFor(s,userId||request.headers.get('x-demo-user')||'lin');
 if(request.method==='GET'&&path==='state')return Response.json({...view(s,u,demo),revision});
 if(request.method==='GET'&&path.startsWith('file/')){const id=path.slice(5);let task=s.tasks.find(t=>[...t.attachments,...t.versions.flatMap(v=>v.attachments||[])].some(f=>f.id===id));if(!task){for(const ar of s.archives){if(![ar.employeeId,ar.managerId,ar.hrbpId].includes(u.id)&&!isAdmin(u))continue;task=ar.snapshot.tasks.find(t=>t.attachments.some(f=>f.id===id));if(task)break;}}const a=task&&s.assessments.find(a=>a.id===task.assessmentId);fail(task&&a&&taskVisible(u,task,a),'无权访问附件',403);const f=[...task.attachments,...task.versions.flatMap(v=>v.attachments||[])].find(f=>f.id===id),obj=await env.BUCKET.get(key+'/'+id);fail(obj,'附件不存在',404);return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});}
 if(request.method==='GET'&&path.startsWith('archive/')){const ar=s.archives.find(a=>a.id===path.slice(8));fail(ar&&(isAdmin(u)||[ar.employeeId,ar.managerId,ar.hrbpId].includes(u.id)),'无权查看档案',403);return Response.json(ar);}
 fail(request.method==='POST','接口不存在',404);fail(!request.headers.get('origin')||request.headers.get('origin')===url.origin,'来源校验失败',403);
 if(path==='upload'){const taskId=url.searchParams.get('taskId'),t=s.tasks.find(t=>t.id===taskId),a=t&&s.assessments.find(a=>a.id===t.assessmentId);fail(a&&a.employeeId===u.id,'无权上传',403);fail(a.status==='active'&&['planned','returned'].includes(t.status),'当前任务不可上传',409);fail(t.attachments.length<10,'每项任务最多 10 个附件');const length=Number(request.headers.get('content-length')||0);fail(length<=10*1024*1024,'附件不能超过 10MB');const buffer=await request.arrayBuffer();fail(buffer.byteLength>0&&buffer.byteLength<=10*1024*1024,'附件大小须为 1B—10MB');const file={id:uid(),name:clean(decodeURIComponent(request.headers.get('x-file-name')||'附件'),200),size:buffer.byteLength,at:now()};await env.BUCKET.put(key+'/'+file.id,buffer);t.attachments.push(file);s.audit.push({id:uid(),at:now(),actorId:u.id,actorName:u.name,action:'上传附件',target:t.id});await writeStore(env.DB,key,revision,s);return Response.json({ok:true});}
 fail(Number(request.headers.get('content-length')||0)<=2*1024*1024,'请求过大',413);const b=await request.json();fail(b.revision===revision,'页面已过期，请刷新后重试',409);mutate(s,u,path,b);await writeStore(env.DB,key,revision,s);return Response.json({ok:true});
 }catch(e){if(!(e instanceof AppError))console.error('API error',e.message);return Response.json({error:e instanceof AppError?e.message:'服务处理失败，请联系 IT'}, {status:e.status||500});}
}



