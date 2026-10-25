// Run explicitly: node tests/palette-audition-shuffle.browser.mjs [path-to-Chrome]
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rhythmake-ui-'));
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);
 });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=spawn(process.argv[2]||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9298','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},45000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9298/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(pages?.length,'Chrome debugging connection');
 const page=pages.find(p=>p.type==='page'&&!p.url.startsWith('chrome-extension:'));
 assert.ok(page,'Application page target');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let serial=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 // The app already loads its local html2canvas vendor copy.
 await send('Network.setBlockedURLs',{urls:['*cdnjs.cloudflare.com*']});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}
 await new Promise(r=>setTimeout(r,700));
 await run("document.querySelector('.volume-setup-ok')?.click();window.ToySpawner.close();document.querySelector('.guide-launcher').style.display='none';document.querySelector('.palette-handle').click()");
 await run(`(async()=>{
 const audio=await import('./src/audio-core.js');const {drumObjects}=await import('./src/simple-drum.js');drumObjects.create({x:500,y:300,instrument:'PIANO'});
 window.qaNotes=[];window.qaPeak=0;window.qaAudio=audio;
 window.addEventListener('toy:note',e=>{if(e.detail.toyId==='paint-palette-preview')qaNotes.push(e.detail)});
 const a=audio.ensureAudioContext().createAnalyser();a.fftSize=2048;audio.getToyGain('paint-palette-preview').connect(a);const data=new Float32Array(a.fftSize);
 window.qaAudioTimer=setInterval(()=>{a.getFloatTimeDomainData(data);for(const v of data)qaPeak=Math.max(qaPeak,Math.abs(v));},10);
 })()`);
 const baseline=await run('JSON.stringify(window.BoardObjects.snapshot())');
 const transportState="import('./src/transport-registry.js').then(m=>m.transportRegistry.list().map(o=>({id:o.id,tick:o.transport.currentTick,state:o.transport.state})))";
 const phase=await run(transportState);
 const pointFor=selector=>run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 const click=async point=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});};
 for(let i=0;i<6;i++){
  await click(await pointFor('.palette-well:nth-child('+(i+1)+')'));await new Promise(r=>setTimeout(r,160));
  assert.equal(await run('qaNotes.length'),i+1,'one preview per tap');
  assert.equal(await run('document.querySelectorAll(".palette-well")['+i+'].getAttribute("aria-pressed")'),'true');
 }
 await click(await pointFor('.palette-well:nth-child(6)'));await new Promise(r=>setTimeout(r,100));
 assert.equal(await run('qaNotes.length'),7);assert.equal(await run('document.querySelector("#paint-palette").dataset.equipped'),'');
 const first=await pointFor('.palette-well');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...first,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,600));await send('Input.dispatchMouseEvent',{type:'mouseReleased',...first,button:'left',clickCount:1});
 assert.equal(await run('!!document.querySelector(".palette-config[open]")'),true);assert.equal(await run('qaNotes.length'),7);
 await run("document.querySelector('.palette-done').click()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...first,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:first.x+16,y:first.y,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:first.x+16,y:first.y,button:'left',clickCount:1});
 assert.equal(await run('qaNotes.length'),7,'cancelled drag has no preview');
 assert.equal(await run('JSON.stringify(window.BoardObjects.snapshot())'),baseline,'audition leaves authored board untouched');
 assert.deepEqual(await run(transportState),phase);
 assert.ok(await run('qaPeak>0.00001'),'real audio reaches preview bus');
 console.log('Audio proof:',await run('JSON.stringify({notes:qaNotes.map(n=>({instrument:n.instrument,note:n.note})),peak:qaPeak,state:qaAudio.ensureAudioContext().state})'));
 const beforeColour=await run("localStorage.getItem('rhythmake:instrument-colours')");
 await click(await pointFor('.palette-well'));await new Promise(r=>setTimeout(r,100));
 await click(await pointFor('.palette-shuffle'));
 const slots=await run("JSON.parse(localStorage.getItem('rhythmake:paint-slots'))");assert.equal(new Set(slots).size,6);assert.equal(await run('document.querySelector("#paint-palette").dataset.equipped'),'');
 assert.equal(await run('qaNotes.length'),8,'Shuffle is silent');assert.equal(await run('JSON.stringify(window.BoardObjects.snapshot())'),baseline);
 assert.equal(await run("localStorage.getItem('rhythmake:instrument-colours')"),beforeColour);
 assert.ok(await run("import('./src/instrument-catalog.js').then(m=>JSON.parse(localStorage.getItem('rhythmake:paint-slots')).every(id=>m.getInstrumentEntries().some(e=>e.id===id)))"));
 await run("document.querySelector('.palette-well').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,clientX:50,clientY:500}))");await new Promise(r=>setTimeout(r,600));
 await run("const i=document.querySelector('.palette-config input');i.value='#5599bb';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.palette-done').click()");
 assert.equal(await run("document.querySelector('.palette-well').style.getPropertyValue('--paint')"),'#5599bb');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await run("(()=>{const r=document.querySelector('.palette-shuffle').getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/palette-shuffle-narrow.png'),Buffer.from(shot.data,'base64'));
 await send('Page.reload');await new Promise(r=>setTimeout(r,1800));
 assert.deepEqual(await run("JSON.parse(localStorage.getItem('rhythmake:paint-slots'))"),slots);assert.equal(await run("document.querySelector('#paint-palette').dataset.equipped"),'');
 console.log('PASS: previews, unequip, hold/drag suppression, unchanged board/transport, silent distinct Shuffle, shared colours and reload');
} finally {clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
