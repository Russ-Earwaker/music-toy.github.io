// Run explicitly: node tests/simple-cleanup-pass.browser.mjs [path-to-Chrome]
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
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9311','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},90000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9311/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
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
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html?preset=simple-playtest`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}

 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const mouse=async(type,x,y)=>{await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1});await pause(45);};
 const center=selector=>run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const click=async selector=>{const p=await center(selector);await mouse('mousePressed',p.x,p.y);await mouse('mouseReleased',p.x,p.y);await pause(200);};
 const drag=async(a,b,during)=>{await mouse('mousePressed',a.x,a.y);await mouse('mouseMoved',b.x,b.y);if(during)await during();await mouse('mouseReleased',b.x,b.y);};
 await pause(1200);await run("document.querySelector('.volume-setup-ok')?.click();document.querySelector('.guide-launcher').style.display='none'");
 await run(`(async()=>{const {drumObjects}=await import('./src/simple-drum.js');const {boardPhysicalObjects}=await import('./src/board-physical-objects.js');const {getZoomState}=await import('./src/zoom/ZoomCoordinator.js');const {transportRegistry,MAIN_TRANSPORT_ID}=await import('./src/transport-registry.js');window.qa={drums:drumObjects,physical:boardPhysicalObjects,getZoomState,transport:transportRegistry.get(MAIN_TRANSPORT_ID)};})()`);
 await click('.toy-spawner-toggle');await click('[data-toy-type="simple-drum"]');
 let before=await run('qa.drums.list().length'),pan=await run('qa.getZoomState().targetX');
 await drag({x:450,y:450},{x:530,y:490});assert.equal(await run('qa.drums.list().length'),before);assert.ok(await run('document.body.classList.contains("simple-drum-armed")'));assert.ok(await run('qa.getZoomState().targetX')>pan+50);
 await drag({x:550,y:400},{x:550,y:400});assert.equal(await run('qa.drums.list().length'),before+1);assert.equal(await run('document.body.classList.contains("simple-drum-armed")'),false);assert.equal(await run('document.querySelector("[data-toy-type=simple-drum]").getAttribute("aria-pressed")'),'false');
 await drag({x:700,y:450},{x:700,y:450});assert.equal(await run('qa.drums.list().length'),before+1);
 await click('[data-toy-type="simple-drum-set"]');assert.equal(await run('qa.drums.list().length'),before+7);assert.equal(await run('document.body.classList.contains("simple-drum-armed")'),false);
 console.log('PASS Drum drag pans without placement; one click creates one and exits; Drum Set creates six and remains inactive');
 await run('window.ToySpawner.close()');
 const ids=await run(`(async()=>{const {connectionModel}=await import('./src/connections.js');const ids=[];for(const ballMode of ['normal','gravity']){const c=window.SimpleBouncer.create({x:ballMode==='normal'?500:800,y:250,ballMode});connectionModel.connect('transport',{objectId:'main-heartbeat',portId:'output'},{objectId:c.id,portId:'input'});const ball=qa.physical.addBall(c.bounds.x,c.bounds.y,{captureId:c.id,ballMode});await window.SimpleBouncer.throwBall(c.id,{ballId:ball.id,launch:{x:c.bounds.x,y:c.bounds.y,vx:300,vy:-100}});ids.push(c.id);}return ids;})()`);
 await pause(250);
 for(const id of ids){
  const selector='[id="'+id+'"]';await run(`document.getElementById(${JSON.stringify(id)}).dataset.controlsVisible='1'`);
  assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelectorAll('.simple-loop-period button').length`),4);
  const sourceOrigin=await run(`import('./src/playback-instances.js').then(m=>m.getPlaybackInstance(window.SimpleBouncer.panels(${JSON.stringify(id)})[0].id)?.sourcePhaseOriginTick)`);
  const phase=await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).capture.phaseOffsetTick`),first=await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).capture.firstLaunchTick`),tick=await run('qa.transport.currentTick');
  for(const period of [2,3,4]){
   await run(`document.getElementById(${JSON.stringify(id)}).querySelector('[data-period="${period}"]').click()`);await pause(150);
   assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).capture.durationTicks`),period*384);
   assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).bars`),period);
   assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).capture.phaseOffsetTick`),phase);assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).capture.firstLaunchTick`),first);
   assert.equal(await run(`import('./src/playback-instances.js').then(m=>m.getPlaybackInstance(window.SimpleBouncer.panels(${JSON.stringify(id)})[0].id)?.sourcePhaseOriginTick)`),sourceOrigin);assert.equal(await run('qa.transport.state'),'playing');assert.ok(await run('qa.transport.currentTick')>=tick);
  }
 }
 console.log('PASS Ball and Gravity Ball share loop buttons; live edits retain Heartbeat tick, playing state and launch origin');
 await run('window.Persistence.markDirty();window.Persistence.flushAutosaveNow()');await send('Page.reload');await pause(1800);
 for(const id of ids)assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(id)}).bars`),4);
 console.log('PASS both Ball periods persist through reload');
 for(const quality of ['standard','high']){
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html?preset=simple-playtest&quality=${quality}`});await pause(2200);
  await run("document.querySelector('.volume-setup-ok')?.click();document.querySelector('.guide-launcher').style.display='none';for(const o of window.BoardObjects.list())window.BoardObjects.remove(o.id);window.panTo?.(0,0);window.ToySpawner.open()");await pause(250);
  const count=await run('window.ContainerToys.list().filter(c=>c.presentation.type==="simple-draw").length');
  await click('[data-toy-type="simple-draw"]');
  await mouse('mousePressed',400,500);for(let i=1;i<=8;i++)await mouse('mouseMoved',400+i*30,500+Math.sin(i)*30);
  assert.equal(await run('document.querySelectorAll(".simple-paint-gesture-particles,.high-fluid-board-effects,.high-quality-board-effects").length'),0);
  assert.ok(await run('!!document.querySelector(".simple-draw-creation-stroke path[d]")'));
  await mouse('mouseReleased',640,530);await pause(900);
  assert.equal(await run('window.ContainerToys.list().filter(c=>c.presentation.type==="simple-draw").length'),count+1);
  const proof=await run(`(()=>{const c=window.ContainerToys.list().filter(c=>c.presentation.type==='simple-draw').at(-1),card=document.getElementById(c.id);return {id:c.id,authored:!!c.interactionData.gesture,scissors:card.dataset.paintState,children:c.internalObjectIds.length}})()`);
  assert.equal(proof.authored,true);assert.equal(proof.scissors,'AUTHORED_SCISSORS');assert.ok(proof.children>0);
  assert.equal(await run(`import('./src/transport-registry.js').then(m=>m.transportRegistry.get(m.MAIN_TRANSPORT_ID).state)`),'playing');
  console.log(`PASS ${quality} production Paint: SVG feedback, no experimental medium, authored line/music created, playback and Scissors active`);
 }
 // Direct experiment API remains usable even when the production flag is off.
 assert.equal(await run(`(async()=>{const {installPaintPresentation}=await import('./src/simple-paint/presentation/paint-presentation.js');const effect=installPaintPresentation({quality:'standard',worldToScreen:p=>p,getInstrument:()=> 'PIANO'});effect.begin({x:500,y:400});const active=!!document.querySelector('.simple-paint-gesture-particles');effect.destroy();return active;})()`),true);
 console.log('PASS direct experimental renderer remains available');
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/experiments/simple-paint-fluid/index.html`});for(let i=0;i<100;i++){if(await run('document.querySelector("#status")?.textContent.startsWith("Ready")'))break;await pause(100);}assert.equal(await run('document.querySelector("#status")?.textContent.startsWith("Ready")'),true);console.log('PASS experimental particle/liquid comparison page loads both renderers');
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});await pause(2000);
 const advanced=await run(`(async()=>{const {uiMode}=await import('./src/ui-mode.js');const c=window.SimpleBouncer.create({x:500,y:250});uiMode.set('advanced');return {id:c.id,title:document.querySelector('.palette-handle span').textContent,random:!!document.querySelector('#paint-palette [data-tool=randomise]'),dropdown:!!document.getElementById(c.id).querySelector('.bouncer-period select')};})()`);assert.equal(advanced.title,'PAINT');assert.equal(advanced.random,true);assert.equal(advanced.dropdown,true);
 await run(`import('./src/ui-mode.js').then(m=>m.uiMode.set('simple'))`);assert.equal(await run('document.querySelector(".palette-handle span").textContent'),'SOUND');assert.equal(await run('!!document.querySelector("#paint-palette [data-tool=randomise]")'),false);assert.equal(await run(`document.getElementById(${JSON.stringify(advanced.id)}).querySelectorAll('.simple-loop-period button').length`),4);
 await run(`document.querySelector('.volume-setup-ok')?.click();window.ToySpawner.close();document.querySelector('.guide-launcher').style.display='none';document.querySelector('.palette-handle').click();document.getElementById(${JSON.stringify(advanced.id)}).dataset.controlsVisible='1'`);await pause(200);console.log('PASS Advanced retains Paint/Randomise/length dropdown; switching back restores Simple Sound and loop buttons');
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/simple-cleanup-pass.png'),Buffer.from(shot.data,'base64'));
}finally{clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
