import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
export async function adapters(directory){
 const dir=resolve(directory);await mkdir(join(dir,'attachments'),{recursive:true});
 const sql=new DatabaseSync(join(dir,'performance.sqlite'));sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);');
 sql.exec('CREATE TABLE IF NOT EXISTS login_requests(id TEXT PRIMARY KEY,open_id TEXT UNIQUE NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL);');
 const DB={
  prepare(query){return {
   bind(...args){return {
    async first(){return sql.prepare(query).get(...args)||null;},
    async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}};}
   };}
  };}
 };
 const path=key=>{if(!/^[a-zA-Z0-9:_/-]+$/.test(key)||key.includes('..'))throw Error('Invalid file key');return join(dir,'attachments',...key.split('/'));};
 const BUCKET={async put(key,buffer){const f=path(key);await mkdir(resolve(f,'..'),{recursive:true});await writeFile(f,new Uint8Array(buffer));},async get(key){try{return{body:await readFile(path(key))};}catch(e){if(e.code==='ENOENT')return null;throw e;}}};
 return {DB,BUCKET,sql,dir};
}
