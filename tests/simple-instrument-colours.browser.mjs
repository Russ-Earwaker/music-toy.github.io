// Run explicitly: node tests/simple-instrument-colours.browser.mjs [path-to-Chrome]
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
 await run("document.querySelector('.palette-handle').click();document.querySelector('.palette-well').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:30,clientY:800}));");
 await new Promise(r=>setTimeout(r,600));
 assert.equal(await run("!!document.querySelector('.palette-config[open]')"),true);
 await run("const input=document.querySelector('.palette-config input');input.value='#bf69db';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.palette-done').click()");
 const result=await run(`(async()=>{
 const {instrumentColour}=await import('./src/instrument-colours.js');if(instrumentColour('PIANO')!=='#bf69db')throw Error('palette did not update shared mapping');
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const matching=[...document.querySelectorAll('[data-instrument]')].filter(n=>n.dataset.instrument.toLowerCase()==='piano');
 const audit=matching.map(n=>({class:n.className.baseVal??n.className,colour:n.style.getPropertyValue('--instrument-colour')}));
 return {audit,other:document.querySelector('[data-instrument="KALIMBA"]').style.getPropertyValue('--instrument-colour'),cube:document.querySelector('.physical-cube')?.style.getPropertyValue('--instrument-colour')||'',drum:getComputedStyle(document.querySelector('.simple-drum-pad')).borderTopColor,string:getComputedStyle(document.querySelector('.surface-string')).stroke};
 })()`);
 assert.ok(result.audit.length>=10,JSON.stringify(result));assert.ok(result.audit.every(n=>n.colour==='#bf69db'),JSON.stringify(result));assert.notEqual(result.other,'#bf69db');assert.equal(result.cube,'');assert.equal(result.drum,'rgb(191, 105, 219)');assert.equal(result.string,'rgb(191, 105, 219)');
 console.log(JSON.stringify(result,null,2));
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/simple-instrument-colours.png'),Buffer.from(shot.data,'base64'));
 assert.ok(result.audit.some(n=>n.class.includes('simple-draw-surface')),'Paint included in live update');
 await run("window.Persistence.markDirty();window.Persistence.flushAutosaveNow()");
 await send('Page.reload');await new Promise(r=>setTimeout(r,1800));
 assert.equal(await run("import('./src/instrument-colours.js').then(m=>m.instrumentColour('PIANO'))"),'#bf69db');
 assert.equal(await run("document.querySelector('.simple-drum-object[data-instrument=PIANO]').style.getPropertyValue('--instrument-colour')"),'#bf69db');
 await run("import('./src/instrument-colours.js').then(m=>m.setInstrumentColour('PIANO','#27b5ad'))");
 await new Promise(r=>setTimeout(r,100));
 assert.ok(await run("[...document.querySelectorAll('[data-instrument]')].filter(n=>n.dataset.instrument.toLowerCase()==='piano').every(n=>n.style.getPropertyValue('--instrument-colour')==='#27b5ad')"),'All restored matching presentations update');
 console.log('PASS: Paint and reload persistence; real Simple owners and active physical effects refresh together, other instruments and Cubes stay independent');
} finally {
 clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();
 // Chrome may still hold its profile briefly; leave the OS temp directory to OS cleanup.
}
