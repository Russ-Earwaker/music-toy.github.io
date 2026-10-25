// Run explicitly: node tests/simple-paint-assignment.browser.mjs [path-to-Chrome]
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

 await run("document.querySelector('.volume-setup-ok')?.click()");
 await run(`(async()=>{
  const {drumObjects}=await import('./src/simple-drum.js');const {rippleObjects}=await import('./src/simple-ripple.js');const {stringSurfaces}=await import('./src/string-surface.js');
  window.colourQA={drumObjects,rippleObjects,stringSurfaces};const {boardPhysicalObjects}=await import('./src/board-physical-objects.js');boardPhysicalObjects.addCube(900,400);
  drumObjects.create({x:200,y:240,instrument:'PIANO'});drumObjects.create({x:350,y:240,instrument:'KALIMBA'});rippleObjects.create({x:500,y:240,instrument:'PIANO'});
  for(const [kind,y]of [['string',400],['strum',550]])stringSurfaces.create({kind,start:{x:250,y},end:{x:600,y},instrument:'PIANO'});
  for(const [ballMode,x]of [['normal',750],['gravity',950]]){const c=window.SimpleBouncer.create({x,y:250,ballMode});window.SimpleBouncer.setInstrument(c.id,'PIANO');const ball=boardPhysicalObjects.addBall(x,250,{captureId:c.id,ballMode});await window.SimpleBouncer.throwBall(c.id,{ballId:ball.id,launch:{x,y:250,vx:300,vy:-100}});}
 })()`);
 await new Promise(r=>setTimeout(r,700));
 await run("document.querySelector('.volume-setup-ok')?.click();document.querySelector('.toy-spawner-toggle').click();document.querySelector('[data-toy-type=simple-draw]').click()");
 const point={x:700,y:650};
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:850,y:690,button:'left',buttons:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:850,y:690,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,700));
 assert.ok(await run("!!document.querySelector('.simple-draw-surface[data-instrument]')"),'Paint canvas resolves its source instrument');

 await run("window.ToySpawner.close();document.querySelector('.palette-handle').click()");
 await run("import('./src/transport-registry.js').then(({transportRegistry})=>transportRegistry.list().forEach(o=>o.transport.pause()));document.querySelector('.guide-launcher').style.display='none'");
 const click=async point=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});};
 const selectors=['.simple-drum-pad','.simple-ripple-trigger','.surface-body','.surface-hit','.simple-container-handle','.cannon-barrel','.physical-ball','.simple-draw-surface canvas','.simple-drum-object>.art-toy-drag-btn','.simple-ripple-object>.art-toy-drag-btn','.string-surface-handle','[data-presentation=simple-draw] .simple-container-handle'];
 for(const selector of selectors){
  const count=await run('document.querySelectorAll('+JSON.stringify(selector)+').length');assert.ok(count,'target '+selector);
  for(let index=0;index<count;index++){
   for(const slot of [3,0]){
    await run('document.querySelectorAll(".palette-well")['+slot+'].click()');
    const point=await run('(()=>{const n=document.querySelectorAll('+JSON.stringify(selector)+')['+index+'];const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    // Stop ball motion while retaining its captured geometry for repeatable targeting.
    const expected=slot===3?'BELL':'PIANO';
    await click(point);
    const result=await run('(async()=>{const {resolvePaintTarget,paintInstrument}=await import("./src/paint-target.js");const n=document.querySelectorAll('+JSON.stringify(selector)+')['+index+'];const t=resolvePaintTarget(n);return {instrument:paintInstrument(t),id:t?.id,colour:(t?.element||n).style.getPropertyValue("--instrument-colour"),hit:document.elementFromPoint('+point.x+','+point.y+')?.outerHTML.slice(0,140)}})()');
    assert.equal(result.instrument,expected,JSON.stringify({selector,index,point,result}));
    await run('document.querySelectorAll(".palette-well")['+slot+'].click()');
   }
  }
 }
 const stringPoint=await run("(()=>{const r=document.querySelector('.surface-body').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await run("document.querySelector('[data-tool=eyedropper]').click()");await click(stringPoint);
 assert.equal(await run("document.querySelectorAll('.palette-well')[0].getAttribute('aria-pressed')"),'true');
 await run("document.querySelector('[data-tool=randomise]').click()");await click(stringPoint);
 assert.equal(await run("window.colourQA.stringSurfaces.list()[0].authoredState.instrument"),'PIANO');
 await run("document.querySelector('[data-tool=randomise]').click();document.querySelectorAll('.palette-well')[0].click()");
 const cubePoint=await run("(()=>{const r=document.querySelector('.physical-cube').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");await click(cubePoint);
 assert.equal(await run("document.querySelector('.physical-cube').dataset.instrument??null"),null);
 await run("document.querySelectorAll('.palette-well')[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:50,clientY:650}))");await new Promise(r=>setTimeout(r,600));
 await run("const i=document.querySelector('.palette-config input');i.value='#49c6b4';i.dispatchEvent(new Event('input',{bubbles:true}))");
 await run('window.ToySpawner.close()');
 let shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/paint-palette-popup.png'),Buffer.from(shot.data,'base64'));
 await run("document.querySelector('.palette-done').click()");
 await new Promise(r=>setTimeout(r,100));
 assert.ok(await run("[...document.querySelectorAll('[data-instrument=PIANO]')].every(n=>n.style.getPropertyValue('--instrument-colour')==='#49c6b4')"),'repaint then edit shared colour');
 await run("document.querySelectorAll('.palette-well')[1].click();document.querySelectorAll('.palette-well')[0].click()");
 shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/paint-palette-repaint.png'),Buffer.from(shot.data,'base64'));
 await run('window.ToySpawner.close()');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await run("(()=>{const r=document.querySelector('#paint-palette').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&document.querySelectorAll('.palette-well').length===6})()"));
 shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/paint-palette-narrow.png'),Buffer.from(shot.data,'base64'));
 await run("window.Persistence.markDirty();window.Persistence.flushAutosaveNow()");await send('Page.reload');await new Promise(r=>setTimeout(r,1800));
 assert.equal(await run("document.querySelector('.simple-drum-object').dataset.instrument"),'PIANO');
 assert.equal(await run("document.querySelector('.simple-drum-object').style.getPropertyValue('--instrument-colour')"),'#49c6b4');
 console.log('PASS: body/handle repaint, shared edit, narrow palette and reload');
} finally {
 clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();
 // Chrome may still hold its profile briefly; leave the OS temp directory to OS cleanup.
}
