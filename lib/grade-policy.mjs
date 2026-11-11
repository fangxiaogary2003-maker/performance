export const GRADING_POLICY_ID='five-band-module-floor-v1';
export const GRADE_BANDS=[{minimum:90,label:'优秀'},{minimum:85,label:'良好'},{minimum:75,label:'合格'},{minimum:70,label:'待改进'},{minimum:0,label:'不合格'}];
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
export function gradeBand(total){if(!numeric(total))return null;const score=round(total);return GRADE_BANDS.find(b=>score>=b.minimum)?.label||'不合格';}
export function gradingRuleFields(){return {gradingPolicy:GRADING_POLICY_ID,gradeBands:structuredClone(GRADE_BANDS),gateEnabled:true,gateOutcome:'module_band',gradeOrder:'gate_first',gatePassScore:75,gateFailScore:70};}
export function evaluateGrade({total,work,quality,redline=false}){
 if(redline)return {grade:'不合格',gradeReason:'触碰红线，最终得分归零，等级为不合格。',gateStatus:'redline'};
 if(!numeric(total)||!numeric(work)||!numeric(quality))return {grade:null,gradeReason:'评分尚未齐全，不将缺评分按0分判定。',gateStatus:'missing'};
 const modules=[['工作事项',round(work)],['核心素质',round(quality)]],lowest=Math.min(...modules.map(([,v])=>v)),lowNames=modules.filter(([,v])=>v<75).map(([name,v])=>`${name} ${v} 分`).join('、');
 if(lowest<70)return {grade:'不合格',gradeReason:lowNames+'；存在模块低于70分，最终等级为不合格。',gateStatus:'below_70'};
 if(lowest<75)return {grade:gradeBand(total)==='不合格'?'不合格':'待改进',gradeReason:lowNames+'；存在模块在70至不足75分，最终等级最多为待改进。',gateStatus:'below_75'};
 return {grade:gradeBand(total),gradeReason:'工作事项与核心素质均达到75分，按综合总分五档标准判定等级。',gateStatus:'passed'};
}
