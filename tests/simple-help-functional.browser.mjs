// Run explicitly: node tests/simple-help-functional.browser.mjs [path-to-Chrome]
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
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--autoplay-policy=user-gesture-required','--remote-debugging-port=9324','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},90000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9324/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
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
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}

 const pause=ms=>new Promise(r=>setTimeout(r,ms));await pause(1300);
 const mouse=async(type,x,y)=>{await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1});await pause(40);};
 const center=selector=>run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const click=async selector=>{const p=await center(selector);await mouse('mousePressed',p.x,p.y);await mouse('mouseReleased',p.x,p.y);await pause(150);};
 const drag=async(a,b)=>{await mouse('mousePressed',a.x,a.y);await mouse('mouseMoved',b.x,b.y);await mouse('mouseReleased',b.x,b.y);await pause(150);};
 const visible=selector=>run(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'})()`);
 const labels=()=>run('[...document.querySelectorAll(".toy-help-callout")].map(n=>n.textContent)');
 const countFor=selector=>run(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});return [...document.querySelectorAll('.toy-help-callout')].filter(n=>n.__helpTarget===t).length})()`);
 const clock=()=>run("import('./src/audio-core.js').then(m=>({state:m.transport.state,tick:m.transport.currentTick,origin:m.transport.originAudioTime}))");
 const forbidden=['[data-action=bpm]','[data-action=simple-tempo]','.metro-arm','.bpm-label','#topbar-bpm-panel','.topbar-bpm-slider','.topbar-bpm-value'];
 async function auditNoTiming(){for(const selector of forbidden)assert.equal(await visible(selector),false,selector);const before=await clock();await run("document.querySelector('#topbar').__bpmState.setOpen(true);document.querySelector('[data-action=bpm]').click()");assert.equal(await visible('#topbar-bpm-panel'),false);assert.equal((await clock()).origin,before.origin);assert.equal((await clock()).state,'playing');}
 await auditNoTiming();
 const authored=await run('JSON.stringify(window.BoardObjects.snapshot())');
 await click('.toy-spawner-help');await click('.toy-spawner-toggle');await click('.palette-handle');await click('[data-toy-type=physical-cube]');await pause(150);
 await run("window.previewProof=[...document.querySelectorAll('.toy-spawner-menu .toy-preview')].flatMap(n=>n.getAnimations({subtree:true})).map(a=>({a,node:a.effect.target,time:a.currentTime,start:a.startTime}))");
 await drag({x:600,y:250},{x:650,y:280});
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:250,deltaX:0,deltaY:-60});await pause(250);
 await run("document.documentElement.classList.add('zoom-commit-freeze')");await pause(80);
 assert.equal(await run('previewProof.length>0&&previewProof.every(p=>p.node.isConnected&&p.node.getAnimations().includes(p.a)&&p.a.currentTime>p.time&&p.a.startTime===p.start)'),true,'pan, zoom and atomic freeze preserve preview identity and phase');
 await run("document.documentElement.classList.remove('zoom-commit-freeze')");await pause(80);
 assert.equal(await run('previewProof.every(p=>p.node.getAnimations().includes(p.a)&&p.a.currentTime>p.time)'),true,'release preserves animations');
 console.log('PASS preview DOM, animation identity and phase survive pan, zoom, freeze and release');
 const copy={box:'Create toys to use on the board.',shapes:'Choose which shape to place on the board.',sound:'Tap a sound to select it, then tap or swipe over toys to apply it. Tap empty space to put it down.',eye:"Copy a toy's sound into the palette.",shuffle:'Fill the palette with a new set of sounds.',hold:'Tap and hold a sound to choose a different sound.',place:'Place shapes that trigger sound when hit.',trigger:'Place toys that trigger sounds.',loop:'Place toys that play on a loop.'};
 for(const text of Object.values(copy).filter(t=>t!==copy.loop))assert.equal((await labels()).filter(l=>l===text).length,1,text);
 assert.equal(await countFor('.toy-spawner-menu'),1);assert.equal(await countFor('.shape-palette'),1);assert.equal(await countFor('#paint-palette'),1);
 assert.equal(await run('[...document.querySelectorAll(".toy-help-callout")].filter(n=>n.__helpTarget?.matches(".toy-box-item,.shape-choice,.palette-well,.simple-creation-group h3")).length'),0);
 assert.equal(await run('[...document.querySelectorAll(".toy-help-callout")].filter(n=>n.__helpTarget?.closest("#paint-palette")).length'),4);
 assert.deepEqual(await run('[...document.querySelectorAll(".simple-creation-group")].map(n=>n.dataset.simpleCategory)'),['place','trigger','loop']);
 assert.deepEqual(await run('[...document.querySelectorAll("[data-simple-category=loop] .toy-spawner-name")].map(n=>n.textContent)'),['Paint','Drum','Drum Set','String','Strum']);
 assert.equal(await visible('.heartbeat-main .heartbeat-title'),false);
 const assertPositions=async()=>{for(const [selector,dir] of [['.toy-spawner-menu','top'],['#paint-palette','top'],['[data-simple-category=place]','left'],['[data-simple-category=trigger]','left']])assert.equal(await run(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});return [...document.querySelectorAll('.toy-help-callout')].find(n=>n.__helpTarget===t)?.dataset.position})()`),dir,selector);};
 assert.equal((await labels()).includes(copy.loop),false);
 await click('[data-toy-type=physical-cube]');assert.equal((await labels()).includes(copy.loop),true);await click('[data-toy-type=physical-cube]');assert.equal((await labels()).includes(copy.loop),false);
 await assertPositions();
 assert.equal(await run('getComputedStyle(document.querySelector("[data-simple-category=loop] .simple-creation-items")).gridTemplateColumns.split(" ").length'),3);
 await send('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false});await pause(200);await assertPositions();
 const compactShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/simple-taxonomy-1024.png'),Buffer.from(compactShot.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await pause(200);
 const after=await labels(),before=JSON.parse(fs.readFileSync(path.join(root,'artifacts/simple-help-before.json'),'utf8'));assert.ok(after.length<=before.count/2);
 fs.writeFileSync(path.join(root,'artifacts/simple-help-functional-audit.json'),JSON.stringify({before:before.count,after:after.length,labels:after},null,2));console.log(`PASS open-palettes Help density: ${before.count} -> ${after.length}; one Toy Box, one Shapes, four Sound Palette explanations`);
 assert.equal(await run('JSON.stringify(window.BoardObjects.snapshot())'),authored);
 assert.equal(await run('[...document.querySelectorAll(".toy-help-callout")].some(n=>n.textContent.replace(/[.]/g,"").trim().toLowerCase()===n.__helpTarget?.textContent.trim().toLowerCase())'),false);
 for(const text of ['Shape','Ball','Ripple','Drum','String','Strum','Volume','Loop Length','Clear','Draw','Scissors','Tempo','Master Volume'])assert.equal(after.includes(text),false,text);
 assert.equal(after.some(l=>/metronome|bpm|tempo/i.test(l)),false);
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/simple-help-functional.png'),Buffer.from(shot.data,'base64'));
 await click('[data-shape-type=triangle]');await drag({x:450,y:350},{x:450,y:350});assert.ok((await labels()).includes('Drag this shape to move it.'));
 await run("window.dragPreviewProof=[...document.querySelectorAll('[data-toy-type=physical-ball] .toy-preview,[data-toy-type=simple-ripple] .toy-preview,[data-toy-type=simple-strum] .toy-preview')].flatMap(n=>n.getAnimations({subtree:true})).map(a=>({a,node:a.effect.target,time:a.currentTime,start:a.startTime}))");
 const shapeDrag=await center('.physical-cube');await drag(shapeDrag,{x:shapeDrag.x+30,y:shapeDrag.y+15});
 assert.equal(await run('dragPreviewProof.length>0&&dragPreviewProof.every(p=>p.node.isConnected&&p.node.getAnimations().includes(p.a)&&p.a.currentTime>p.time&&p.a.startTime===p.start)'),true,'toy drag preserves Ball, Ripple and Strum previews');
 await click('[data-toy-type=physical-cube]');assert.equal((await labels()).includes(copy.shapes),false);
 await click('.palette-handle');assert.equal((await labels()).includes(copy.eye),false);assert.equal((await labels()).includes(copy.shuffle),false);
 await run('window.ToySpawner.close()');await click('.toy-spawner-help');assert.deepEqual(await labels(),[]);await click('.toy-spawner-help');
 const ids=await run(`(async()=>{const {drumObjects}=await import('./src/simple-drum.js');const {rippleObjects}=await import('./src/simple-ripple.js');window.qa={drumObjects,rippleObjects};return [drumObjects.create({x:600,y:450}).id,rippleObjects.create({x:950,y:450}).id]})()`);
 for(const id of ids){await run(`document.getElementById(${JSON.stringify(id)}).dataset.controlsVisible='1'`);await pause(180);assert.equal(await countFor('[id="'+id+'"] .expressive-toy-controls'),1);assert.equal(await countFor('[id="'+id+'"] .simple-loop-period'),0);await run(`document.getElementById(${JSON.stringify(id)}).dataset.controlsVisible='0'`);await pause(120);assert.equal(await countFor('[id="'+id+'"] .expressive-toy-controls'),0);}
 await click('.toy-spawner-toggle');await click('[data-toy-type=simple-draw]');await drag({x:300,y:600},{x:550,y:640});await pause(700);
 const paint=await run('window.ContainerToys.list().find(c=>c.presentation.type==="simple-draw")?.id');assert.ok(paint);await run(`window.ContainerToys.move(${JSON.stringify(paint)},450,420);document.getElementById(${JSON.stringify(paint)}).dataset.controlsVisible='1'`);await pause(200);
 assert.ok((await labels()).includes('Cut or restore notes in this melody.'));assert.ok((await labels()).includes('Stretch or restore the drawn melody.'));
 await click('[id="'+paint+'"] [data-reset]');assert.ok((await labels()).includes('Draw on the board to make a melody.'));assert.equal((await labels()).includes('Cut or restore notes in this melody.'),false);
 assert.equal(await run('[...document.querySelectorAll(".toy-help-overlay,.toy-help-callout,.toy-help-connector")].every(n=>getComputedStyle(n).pointerEvents==="none")'),true);
 await run('window.ToySpawner.close();window.panBy(60,30)');await pause(200);
 const target=await center('.physical-cube');assert.equal(await run(`!!document.elementFromPoint(${target.x},${target.y}).closest('.toy-help-overlay')`),false);
 await drag(await center('.physical-cube'),await center('.toy-spawner-trash'));assert.equal(await visible('.physical-cube'),false);assert.equal(await run('[...document.querySelectorAll(".toy-help-callout")].some(n=>!n.__helpTarget?.isConnected)'),false);
 console.log('PASS functional toy controls, Paint state changes, pointer transparency, placement, pan and drag-to-trash cleanup');
 for(const width of [1280,768,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});await pause(180);await auditNoTiming();assert.equal(await run('(()=>{const r=document.querySelector("#topbar-master-volume").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()'),true);assert.equal(await run('[...document.querySelectorAll(".toy-help-callout")].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})'),true);}
 const narrow=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'artifacts/simple-help-functional-narrow.png'),Buffer.from(narrow.data,'base64'));await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await pause(180);
 const modeBefore=await clock();await click('#ui-mode [data-ui-mode=advanced]');assert.equal(await visible('[data-action=bpm]'),true);await click('[data-action=bpm]');assert.equal(await visible('#topbar-bpm-panel'),true);assert.equal(await visible('.topbar-bpm-slider'),true);assert.equal(await visible('.topbar-bpm-value'),true);assert.equal(await visible('.metro-arm'),true);assert.equal((await clock()).origin,modeBefore.origin);assert.equal(await run('!!document.querySelector(".toy-help-controls")'),true);
 await click('#ui-mode [data-ui-mode=simple]');await auditNoTiming();assert.equal(await run('!!document.querySelector(".toy-help-controls")'),false);
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html?preset=simple-playtest`});await pause(1700);await auditNoTiming();await click('.toy-spawner-help');assert.equal((await labels()).some(l=>/tempo|bpm|metronome/i.test(l)),false);console.log('PASS full timing UI absent in normal Simple/Playtest at all widths; Advanced panel/slider/readout and Help remain available');
}finally{clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
