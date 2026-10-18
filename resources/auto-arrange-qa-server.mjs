import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('.');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.wav':'audio/wav'};
createServer(async(req,res)=>{try{
 if(req.method==='POST'&&['/_qa-proof','/_qa-ux'].includes(req.url)){
  let body='';for await(const chunk of req)body+=chunk;
  await writeFile(resolve(root,'resources/debug-output/'+(req.url==='/_qa-ux'?'arrange-ux-browser-proof.json':'auto-arrange-browser-proof.json')),JSON.stringify(JSON.parse(body),null,2));res.end('saved');return;
 }
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
 if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch(error){res.writeHead(404);res.end(String(error.message));}}).listen(4187,'127.0.0.1',()=>console.log('Isolated QA server http://127.0.0.1:4187'));
