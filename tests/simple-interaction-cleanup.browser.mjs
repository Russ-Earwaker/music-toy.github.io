// Run explicitly: node tests/simple-interaction-cleanup.browser.mjs [path-to-Chrome]
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
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9307','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},60000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9307/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
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

 await new Promise(r=>setTimeout(r,1200));await run("document.querySelector('.volume-setup-ok')?.click()");
 const click=async selector=>{for(let i=0;i<50;i++){if(await run('!!document.querySelector('+JSON.stringify(selector)+')'))break;await new Promise(r=>setTimeout(r,100));}const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse('mousePressed',p.x,p.y);await mouse('mouseReleased',p.x,p.y);await new Promise(r=>setTimeout(r,250));};
 const mouse=async(type,x,y)=>{await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1});await new Promise(r=>setTimeout(r,50));};
 const drag=async(a,b,mid)=>{await mouse('mousePressed',a.x,a.y);await mouse('mouseMoved',b.x,b.y);if(mid)await mid();await mouse('mouseReleased',b.x,b.y);};
 const center=selector=>run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await run(`(async()=>{
  const {boardPhysicalObjects:physical}=await import('./src/board-physical-objects.js');
  const {drumObjects:drums}=await import('./src/simple-drum.js');const {rippleObjects:ripples}=await import('./src/simple-ripple.js');const {stringSurfaces:strings}=await import('./src/string-surface.js');
  const {getZoomState}=await import('./src/zoom/ZoomCoordinator.js');window.qa={physical,drums,ripples,strings,getZoomState};
 })()`);
 await click('.toy-spawner-toggle');await click('[data-toy-type="physical-cube"]');await click('[data-shape-type="circle"]');
 assert.equal(await run('window.BouncerBoard.activeShapeType'),'circle');
 const count=()=>run('qa.physical.list("cube").length');let before=await count();
 await drag({x:500,y:450},{x:500,y:450});assert.equal(await count(),before+1);
 for(let i=0;i<3;i++){
  const start=await run('qa.getZoomState().targetX');before=await count();
  await drag({x:400,y:450},{x:480,y:490});await new Promise(r=>setTimeout(r,180));
  assert.equal(await count(),before);assert.equal(await run('window.BouncerBoard.activeShapeType'),'circle');assert.ok(Math.abs(await run('qa.getZoomState().targetX')-start)>50);
 }
 console.log('PASS real pointer click places; three pans move board without placement; Circle stays active');
 await click('[data-toy-type="physical-cube"]');assert.equal(await run('window.BouncerBoard.activeShapeType'),null);
 await click('[data-toy-type="physical-cube"]');assert.equal(await run('document.querySelectorAll(".shape-choice[aria-pressed=true]").length'),0);
 await click('[data-shape-type="star"]');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await run('window.BouncerBoard.activeShapeType'),null);assert.equal(await run('!!document.querySelector(".shape-palette")'),false);
 console.log('PASS close/reopen and Escape cancel Shape placement');
 for(const shapeType of ['cube','circle','triangle','diamond','hexagon','star']){
  const id=await run(`(()=>{const o=qa.physical.addCube(0,0,{shapeType:${JSON.stringify(shapeType)}});return o.id})()`);
  // Put each Shape at a known screen position using the actual zoom transform.
  await run(`(()=>{const n=document.getElementById(${JSON.stringify(id)}),r=n.getBoundingClientRect(),z=qa.getZoomState();qa.physical.update(n.id,{x:(650-r.x-r.width/2)/z.effectiveScale,y:(400-r.y-r.height/2)/z.effectiveScale});})()`);
  const from=await center('[id="'+id+'"]'),trash=await center('.toy-spawner-trash');
  await drag(from,{x:from.x+35,y:from.y+25});assert.ok(await run(`!!qa.physical.get(${JSON.stringify(id)})`));assert.ok(Math.abs((await center('[id="'+id+'"]')).x-from.x)>30);
  await drag(await center('[id="'+id+'"]'),trash,async()=>{assert.ok(await run('document.querySelector(".toy-spawner-trash").dataset.hover==="true"'),'shared trash hover');});
  assert.equal(await run(`qa.physical.get(${JSON.stringify(id)})`),null);assert.equal(await run(`!!document.getElementById(${JSON.stringify(id)})`),false);assert.equal(await run(`window.BoardObjects.get(${JSON.stringify(id)})`),null);
 }
 console.log('PASS all six Shapes move, survive outside drops, highlight shared trash, and delete canonical objects and DOM');
 await run(`(async()=>{const {transportRegistry,MAIN_TRANSPORT_ID}=await import('./src/transport-registry.js');qa.transport=transportRegistry.get(MAIN_TRANSPORT_ID);})()`);assert.equal(await run('qa.transport.state'),'playing');const tickBefore=await run('qa.transport.currentTick');
 const ids=await run(`(()=>{const ids=[];ids.push(['drums',qa.drums.create({x:100,y:150,periodLoops:2}).id]);ids.push(['ripples',qa.ripples.create({x:300,y:150,periodLoops:3}).id]);for(const kind of ['string','strum'])ids.push(['strings',qa.strings.create({kind,start:{x:100,y:kind==='string'?350:550},end:{x:400,y:kind==='string'?350:550},periodLoops:4}).id]);return ids;})()`);
 for(const [store,id]of ids){
  assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelectorAll('.simple-loop-period button').length`),4);
  const initial=await run(`qa.${store}.get(${JSON.stringify(id)}).authoredState.periodLoops`);
  assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelector('.simple-loop-period [aria-pressed=true]').textContent`),String(initial));
  for(let n=1;n<=4;n++){
   await run(`document.getElementById(${JSON.stringify(id)}).querySelector('[data-period="${n}"]').click()`);
   assert.equal(await run(`qa.${store}.get(${JSON.stringify(id)}).authoredState.periodLoops`),n);
   assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelectorAll('.simple-loop-period [aria-pressed=true]').length`),1);
  }
  assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelectorAll('select[aria-label$="period"]').length`),0);
 }
 assert.equal(await run('qa.transport.state'),'playing');assert.ok(await run('qa.transport.currentTick')>=tickBefore);
 console.log('PASS Ripple, Drum, String, Strum: initial selection, every button updates canonical period, exactly one selected, no period dropdown');
 await run('window.Persistence.markDirty();window.Persistence.flushAutosaveNow()');
 await send('Page.reload');await new Promise(r=>setTimeout(r,1800));
 for(const [,id]of ids)assert.equal(await run(`document.getElementById(${JSON.stringify(id)}).querySelector('.simple-loop-period [aria-pressed=true]').textContent`),'4');
 console.log('PASS save/reload restores all four loop selectors');
 await run(`document.querySelector('.volume-setup-ok')?.click();window.panTo?.(0,0);for(const c of document.querySelectorAll('.expressive-toy'))c.dataset.controlsVisible='1'`);await new Promise(r=>setTimeout(r,400));
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/simple-interaction-cleanup.png'),Buffer.from(shot.data,'base64'));
}finally{clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
