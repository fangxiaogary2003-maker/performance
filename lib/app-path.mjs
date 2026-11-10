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
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))q.set('month',month);
 if(['mine','team','review','assign','archives','overview'].includes(page))q.set('page',page);
 return fallback+(q.size?'?'+q:'');}catch{return fallback;}
}
