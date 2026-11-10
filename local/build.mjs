import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('selfhost/public',{recursive:true});
await build({entryPoints:['local/entry.tsx'],bundle:true,minify:true,format:'esm',outdir:'selfhost/public',entryNames:'app',define:{'process.env.NODE_ENV':'"production"'},target:'es2022'});
await writeFile('selfhost/public/index.html','<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>绩效工作台</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('Self-hosted frontend built. Runtime: node local/server.mjs (Node 24+)');
