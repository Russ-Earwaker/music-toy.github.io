// Run explicitly: node tests/simple-topbar-playback.browser.mjs [path-to-Chrome]
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
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--autoplay-policy=user-gesture-required','--remote-debugging-port=9315','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},90000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9315/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
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
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('rhythmake_volume_setup_done_v1','1');window.qaTransportEvents=[];document.addEventListener('transport:change',e=>qaTransportEvents.push(e.detail));`});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html?preset=simple-playtest`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}

 const pause=ms=>new Promise(r=>setTimeout(r,ms));await pause(900);
 const click=async selector=>{const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,buttons:0});await pause(40);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await pause(40);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await pause(180);};
 const visible=selector=>run(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'})()`);
 const state=()=>run(`import('./src/audio-core.js').then(m=>({state:m.transport.state,tick:m.transport.currentTick,originTick:m.transport.originTick,originAudioTime:m.transport.originAudioTime,audio:m.peekAudioContext()?.state}))`);
 for(const selector of ['#topbar [data-action=bpm]','.guide-launcher','.guide-task-highlighter','#topbar [data-action=toggle-play]','#topbar [data-action=sound-theme]','#topbar-sound-theme-label','.ui-mode-chrome'])assert.equal(await visible(selector),false,selector);
 assert.equal(await visible('#topbar [data-action=simple-tempo]'),false);assert.equal(await visible('#topbar-master-volume'),true);assert.equal(await visible('[data-action=return-to-start]'),false);
 // Headless Chrome may allow autoplay; explicitly suspend the shared context to verify the restricted path.
 await run("import('./src/audio-core.js').then(m=>m.ensureAudioContext().suspend())");
 const initial=await state();assert.equal(initial.state,'playing');assert.equal(initial.audio,'suspended');assert.equal(await run('qaTransportEvents.filter(e=>e.type==="play").length'),1);
 console.log('PASS Simple Playtest starts logically playing before activation; Guide, Play, Theme, Restart and mode switch hidden');
 await run(`(async()=>{const audio=await import('./src/audio-core.js');window.qaNotes=[];window.qaPeak=0;window.addEventListener('toy:note',e=>{if(e.detail.toyId==='paint-palette-preview')qaNotes.push(e.detail);});const a=audio.ensureAudioContext().createAnalyser();a.fftSize=2048;audio.getToyGain('paint-palette-preview').connect(a);const data=new Float32Array(a.fftSize);window.qaAudioTimer=setInterval(()=>{a.getFloatTimeDomainData(data);for(const v of data)qaPeak=Math.max(qaPeak,Math.abs(v));},10);})()`);
 await click('.palette-handle');assert.equal((await state()).audio,'running');await click('.palette-well');await pause(300);
 assert.ok(await run('qaNotes.length>0&&qaPeak>0.00001'));assert.equal((await state()).state,'playing');assert.equal(await run('qaTransportEvents.filter(e=>e.type==="play").length'),1);
 console.log('PASS first normal interaction unlocks AudioContext; Sound Palette produces measured audio without restarting transport');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});assert.equal((await state()).state,'playing');
 const noReset=await state(),seeks=await run('qaTransportEvents.filter(e=>e.type==="seek").length');await run("document.querySelector('[data-action=return-to-start]').click()");assert.equal((await state()).originAudioTime,noReset.originAudioTime);assert.equal((await state()).originTick,noReset.originTick);assert.equal(await run('qaTransportEvents.filter(e=>e.type==="seek").length'),seeks);
 // Normal build keeps its mode switch and restores Advanced controls.
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});await pause(1600);
 await click('#ui-mode [data-ui-mode=advanced]');for(let i=0;i<30;i++){if(await visible('#guide-button'))break;await pause(100);}
 for(const selector of ['#guide-button','#topbar [data-action=toggle-play]','#topbar [data-action=sound-theme]','[data-action=return-to-start]','.ui-mode-chrome'])assert.equal(await visible(selector),true,selector);
 await click('[data-action=return-to-start]');assert.equal(await run('qaTransportEvents.at(-1).reason'),'return-to-start');assert.equal((await state()).state,'playing');await click('#topbar [data-action=toggle-play]');assert.equal((await state()).state,'paused');
 const paused=await state();await click('#ui-mode [data-ui-mode=simple]');assert.equal((await state()).state,'playing');assert.ok((await state()).tick>=paused.tick);
 for(const selector of ['.guide-launcher','#topbar [data-action=toggle-play]','#topbar [data-action=sound-theme]'])assert.equal(await visible(selector),false,selector);
 const before=await state(),plays=await run('qaTransportEvents.filter(e=>e.type==="play").length');await click('#ui-mode [data-ui-mode=advanced]');await click('#ui-mode [data-ui-mode=simple]');const after=await state();assert.equal(after.originTick,before.originTick);assert.equal(after.originAudioTime,before.originAudioTime);assert.equal(await run('qaTransportEvents.filter(e=>e.type==="play").length'),plays);
 await click('#ui-mode [data-ui-mode=advanced]');await click('#topbar [data-action=toggle-play]');assert.equal((await state()).state,'paused');await click('#ui-mode [data-ui-mode=simple]');assert.equal((await state()).state,'playing');
 console.log('PASS Advanced pause/play unchanged; stopped-to-Simple resumes retained phase; playing mode switches preserve clock mapping');
 await run(`(async()=>{const {drumObjects}=await import('./src/simple-drum.js');const {rippleObjects}=await import('./src/simple-ripple.js');window.qaDrum=drumObjects.create({x:500,y:350});window.qaRipple=rippleObjects.create({x:800,y:450});})()`);
 // Exercise Paint using its normal creation gesture on clear board space.
 await click('.toy-spawner-toggle');await click('[data-toy-type=simple-draw]');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:350,y:650,button:'left',buttons:1});for(let i=1;i<=6;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:350+i*25,y:650+Math.sin(i)*20,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:500,y:645,button:'left',buttons:0});await pause(700);
 assert.ok(await run('window.ContainerToys.list().some(c=>c.presentation.type==="simple-draw"&&c.internalObjectIds.length>0)'));assert.equal((await state()).state,'playing');
 console.log('PASS Simple Paint, Drum and Ripple creation works with shared playback already active');
 await run('window.ToySpawner.close()');
 for(const width of [1280,768,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});await pause(250);
  const audit=await run(`(()=>{const sels=['#topbar-master-volume'],rects=sels.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,left:r.left,right:r.right,top:r.top,bottom:r.bottom}});return {rects,inside:rects.every(r=>r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight),overlap:rects.some((r,i)=>rects.some((o,j)=>j>i&&r.left<o.right&&r.right>o.left&&r.top<o.bottom&&r.bottom>o.top))}})()`);
  assert.equal(audit.inside,true,JSON.stringify(audit));assert.equal(audit.overlap,false,JSON.stringify(audit));assert.equal(await visible('[data-action=return-to-start]'),false);
  const dockOverlap=await run(`(()=>{const a=document.querySelector('#topbar-master-volume').getBoundingClientRect();return [...document.querySelectorAll('.toy-spawner-dock > button')].filter(n=>{const b=n.getBoundingClientRect();return b.width&&b.height&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}).map(n=>n.className)})()`);assert.deepEqual(dockOverlap,[],JSON.stringify({width,audit,dockOverlap}));
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,`artifacts/simple-topbar-${width}.png`),Buffer.from(shot.data,'base64'));
 }
 console.log('PASS compact Simple controls fit without overlap at desktop, tablet and narrow widths');
}finally{clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
