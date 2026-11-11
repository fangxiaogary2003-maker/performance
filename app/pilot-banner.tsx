import React from 'react';
import {appPath} from '../lib/app-path.mjs';
export function PilotBanner({pilot}:any){return pilot?<section className="pilot-banner" role="status"><div><b>{pilot.title||'小范围流程试跑'}</b><p>员工：{pilot.employee} · 直属上级：{pilot.manager} · HRBP：{pilot.hrbp}</p><small>测试内容单独保存，结果不计入正式绩效。</small></div><a href={appPath('/')}>返回正式工作台</a></section>:null;}
