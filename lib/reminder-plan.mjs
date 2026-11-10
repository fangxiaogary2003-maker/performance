import {ensure} from './errors.mjs';
export const REMINDER_STAGES=[
 {day:1,title:'填写上月绩效',body:'全体员工请填写上月工作总结、时效与质量自评、核心素质典型事例，并补齐交付证据。跨部门验收人由 HRBP 指定。',page:'mine',button:'填写我的绩效'},
 {day:2,title:'补齐员工填报',body:'请尚未完成填报的员工补齐上月绩效并提交成果；需要补充的退回事项请及时处理。已完成的员工无需重复填写。',page:'mine',button:'检查我的绩效'},
 {day:3,title:'直属上级评分',body:'请直属上级完成所负责员工的任务时效、质量及核心素质评分。员工请及时补齐影响验收的交付材料。',page:'team',button:'进入团队评分'},
 {day:4,title:'HRBP及跨部门评价',body:'请 HRBP 与指定跨部门验收人完成对应验收、协作评价及核心素质评分；相关审批人请及时处理加分申请。',page:'review',button:'查看待我验收'},
 {day:5,title:'完成月度考核与核对',body:'今天是本轮考核截止日。请各角色补齐尚未完成的填写、验收、评分及审批；绩效管理员核对完整性后发布归档。缺评不会按0分自动结算。',page:'overview',button:'进入绩效工作台'}
];
export function firstWorkdays(month,calendar={}){
 ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'月份无效');
 const out=[],d=new Date(month+'-01T00:00:00Z');
 while(d.toISOString().slice(0,7)===month&&out.length<5){const date=d.toISOString().slice(0,10),override=calendar[date];if(override===true||(override!==false&&![0,6].includes(d.getUTCDay())))out.push(date);d.setUTCDate(d.getUTCDate()+1);}
 return out;
}
export function previousMonth(month){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);}
export function shanghaiTime(value=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}
export function reminderPlan(calendar={},date=new Date(),hour=9){
 const today=shanghaiTime(date),month=today.date.slice(0,7),dates=firstWorkdays(month,calendar),index=dates.indexOf(today.date);
 return {date:today.date,assessmentMonth:previousMonth(month),due:dates[4]||null,eligible:index>=0&&today.hour>=hour&&today.hour<18,stage:index<0?null:REMINDER_STAGES[index],schedule:dates.map((d,i)=>({date:d,hour,...REMINDER_STAGES[i]}))};
}
export function reminderCard(plan,base,{atAll=true,test=false}={}){
 const target=new URL(base);ensure(target.protocol==='https:'||['localhost','127.0.0.1'].includes(target.hostname),'提醒入口须使用HTTPS');
 target.searchParams.set('month',plan.assessmentMonth);target.searchParams.set('page',plan.stage?.page||'mine');
 const title=test?'绩效提醒 · 群机器人测试':`${plan.assessmentMonth} 绩效提醒 · ${plan.stage.title}`;
 return {msg_type:'interactive',card:{config:{wide_screen_mode:true},header:{template:'green',title:{tag:'plain_text',content:title}},elements:[
  {tag:'div',text:{tag:'lark_md',content:`${atAll?'<at id=all></at>\n':''}${test?'这是一条机器人连接测试，不代表已经开始全员考核。':plan.stage.body}\n\n**考核月份：${plan.assessmentMonth}**\n**截止日期：${plan.due||'请查看系统工作日历'}（第5个工作日）**`}},
  {tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:plan.stage?.button||'进入绩效系统'},type:'primary',url:target.href}]},
  {tag:'note',elements:[{tag:'plain_text',content:'北京时间 · 按公司工作日历发送；请在绩效系统内完成填写和评分。'}]}
 ]}};
}
