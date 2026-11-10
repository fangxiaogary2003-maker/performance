import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {resolve} from 'node:path';
import {publicConfig,internalPath} from '../lib/app-path.mjs';
async function start(t,demo){
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=demo?`http://127.0.0.1:${port}/performance`:'https://performance.example.test/performance';
 const child=spawn(process.execPath,['local/server.mjs'],{env:{...process.env,DEMO_MODE:String(demo),APP_BASE_URL:base,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:resolve('work/server-test-'+port),FEISHU_APP_ID:'test-app',FEISHU_APP_SECRET:'test-only'},stdio:['ignore','pipe','pipe']});
 t.after(()=>{child.kill();});await new Promise((ok,bad)=>{const timeout=setTimeout(()=>bad(Error('Server startup timeout')),5000);child.stdout.on('data',()=>{clearTimeout(timeout);ok();});child.once('exit',code=>{clearTimeout(timeout);bad(Error('Server exit '+code));});});return `http://127.0.0.1:${port}`;
}
test('部署前缀标准化，不接受不安全的路径',()=>{assert.deepEqual(publicConfig('https://example.com/performance/'),{base:'https://example.com/performance',origin:'https://example.com',basePath:'/performance'});assert.equal(internalPath('/performance/api/state','/performance'),'/api/state');assert.equal(internalPath('/api/state','/performance'),null);assert.throws(()=>publicConfig('https://example.com/?x=1'));});
test('子路径下页面、脚本、接口、上传均使用正确地址',async t=>{const base=await start(t,true);assert.equal((await fetch(base+'/api/state')).status,404);assert.equal((await fetch(base+'/performance/health')).status,200);const html=await(await fetch(base+'/performance/')).text();assert(html.includes('content="/performance"'));assert(html.includes('src="/performance/app.js"'));assert(!html.includes('__APP_BASE_PATH__'));assert.equal((await fetch(base+'/performance/app.js')).status,200);const state=await(await fetch(base+'/performance/api/state')).json();assert.equal(state.user.id,'lin');const task=state.tasks.find(t=>t.status==='planned');const upload=await fetch(base+'/performance/api/upload?taskId='+task.id,{method:'POST',headers:{origin:new URL(base).origin,'x-file-name':'test.txt'},body:'test'});assert.equal(upload.status,200);});
test('生产模式忽略演示角色，回调与Cookie被限制在绩效路径',async t=>{const base=await start(t,false);assert.equal((await fetch(base+'/performance/api/state',{headers:{'x-demo-user':'chen'}})).status,401);const login=await fetch(base+'/performance/auth/login',{redirect:'manual'});assert.equal(login.status,302);const url=new URL(login.headers.get('location'));assert.equal(url.searchParams.get('redirect_uri'),'https://performance.example.test/performance/auth/callback');assert.equal(url.searchParams.get('client_id'),'test-app');assert(login.headers.get('set-cookie').includes('Path=/performance;'));assert(login.headers.get('set-cookie').includes('Secure'));const bad=await fetch(base+'/performance/auth/callback?code=bogus&state=forged');assert.equal(bad.status,400);});
