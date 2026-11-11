// Same public prefix for browser assets, navigation and server-side routing.
export function normalizeBasePath(value=''){
 if(!value||value==='/')return '';
 const path=value.replace(/\/+$/,'');
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(path))throw Error('Invalid application base path');
 return path;
}
export function browserBasePath(){
 if(typeof document==='undefined')return '';
 return normalizeBasePath(document.querySelector('meta[name="app-base-path"]')?.getAttribute('content')||'');
}
export function appPath(path){if(!path.startsWith('/'))throw Error('Application path must begin with /');return browserBasePath()+path;}
export function publicConfig(value){const url=new URL(value);if(url.search||url.hash||url.username||url.password)throw Error('Invalid APP_BASE_URL');return {origin:url.origin,basePath:normalizeBasePath(url.pathname),base:url.origin+normalizeBasePath(url.pathname)};}
export function internalPath(pathname,basePath){return pathname===basePath?'/':pathname.startsWith(basePath+'/')?pathname.slice(basePath.length):null;}
export function safeReturnTo(value,origin,basePath){
 const fallback=basePath+'/';if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return fallback;
 try{const u=new URL(value,origin);if(u.origin!==origin||u.pathname!==fallback)return fallback;
 const q=new URLSearchParams(),month=u.searchParams.get('month'),page=u.searchParams.get('page');
 const pilot=u.searchParams.get('pilot');if(/^pilot-[A-Za-z0-9_-]{1,80}$/.test(pilot||''))q.set('pilot',pilot);
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))q.set('month',month);
 if(u.searchParams.get('focus')==='quality')q.set('focus','quality');
 if(u.searchParams.get('reportFilter')==='all')q.set('reportFilter','all');
 if(['mine','team','review','assign','archives','overview','reports','schemes'].includes(page))q.set('page',page);
 for(const key of ['assessmentId','taskId','reportId','collaborationAssessmentId']){const id=u.searchParams.get(key);if(/^[A-Za-z0-9_-]{1,100}$/.test(id||''))q.set(key,id);}
 return fallback+(q.size?'?'+q:'');}catch{return fallback;}
}

export function workspaceHeaders(actor){const h={'Content-Type':'application/json','x-demo-user':actor};if(typeof location!=='undefined'){const id=new URLSearchParams(location.search).get('pilot');if(/^pilot-[A-Za-z0-9_-]{1,80}$/.test(id||''))h['x-performance-pilot']=id;}return h;}
