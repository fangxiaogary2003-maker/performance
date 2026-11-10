import { env } from 'cloudflare:workers';
import { api } from '../../../lib/performance.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const id=request.headers.get('oai-authenticated-user-id');
 return api(request,env,id?{key:'pilot:'+id,userId:request.headers.get('x-demo-user')||'lin',demo:true}:null);
}
export const GET=handle;
export const POST=handle;
