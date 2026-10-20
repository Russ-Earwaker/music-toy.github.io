// Run explicitly: node tests/simple-bouncer.browser.mjs [path-to-Chrome]
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
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9299','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},60000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9299/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(pages?.length,'Chrome debugging connection');
 const page=pages.find(p=>p.type==='page'&&!p.url.startsWith('chrome-extension:'));
 assert.ok(page,'Application page target');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let serial=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 // The app already loads its local html2canvas vendor copy.
 await send('Network.setBlockedURLs',{urls:['*cdnjs.cloudflare.com*']});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__qaSamplesReady=false;window.addEventListener('samples-ready',()=>window.__qaSamplesReady=true);"});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await run('document.documentElement.dataset.uiMode'),'simple',await run('JSON.stringify({url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,250),scripts:document.scripts.length})'));
 // Bouncer defaults must resolve real samples, including saved lowercase IDs.
 for(let i=0;i<200;i++){if(await run("window.__qaSamplesReady&&window.AudioDebug?.has('PIANO') && window.AudioDebug?.has('KALIMBA')"))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await run("['PIANO','KALIMBA','piano','kalimba'].every(id=>window.AudioDebug?.has(id))"),true,'Canonical and legacy Bouncer sample IDs resolve');
 await run("window.__missingInstruments=[];const originalWarn=console.warn;console.warn=(...args)=>{if(args.join(' ').includes('instrument not found'))window.__missingInstruments.push(args.join(' '));originalWarn(...args);}");
 await run("(async()=>{const {triggerInstrument}=await import('./src/audio-samples.js');for(const id of ['PIANO','KALIMBA','piano','kalimba'])triggerInstrument(id,'C4',undefined,'master',{},0.2);})()");
 assert.deepEqual(await run('window.__missingInstruments'),[],'Sample playback must not fall back to a tone');
 await run("document.querySelector('.volume-setup-ok')?.click()");
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const worldToScreen=async p=>run(`import('./src/board-viewport.js').then(({screenToWorld})=>{const a=screenToWorld({x:0,y:0}),b=screenToWorld({x:100,y:100});return{x:(${p.x}-a.x)*100/(b.x-a.x),y:(${p.y}-a.y)*100/(b.y-a.y)};})`);
 const mouse=async(type,p,buttons=0)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons,clickCount:1});
 const drag=async(a,b)=>{await mouse('mousePressed',a,1);await mouse('mouseMoved',b,1);await mouse('mouseReleased',b);};
 const throwAt=async(start,end)=>drag(await worldToScreen(start),await worldToScreen(end));
 const containers=()=>run("window.ContainerToys.list().filter(c=>c.presentation.type==='simple-bouncer')");
 const objects=kind=>run(`window.SimpleBouncer.objects.list(${JSON.stringify(kind)})`);
 const releaseLock=async()=>{await run('window.Heartbeats.transport().seekTick(window.Heartbeats.transport().currentTick+2000);window.Heartbeats.transport().pause();window.SimpleBouncer.busy()');await sleep(70);};
 await run("document.querySelector('.toy-spawner-toggle').click();document.querySelector('[data-toy-type=\"simple-bouncer\"]').click()");
 assert.equal((await containers()).length,0);let cubes=await objects('cube');assert.equal(cubes.length,3);assert.ok(cubes.every(c=>!('instrument'in c)&&c.color==='#829cab'));
 for(const mode of ['ball','cube']){
  const selector='.toy-spawner-item[data-toy-type=physical-'+mode+']';
  // The Simple Bouncer launcher initially arms Ball.
  if(mode==='cube')await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`),'true');
  await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`),'false','Clicking the active creation button turns its mode off');
 }
 await run("document.querySelector('.toy-spawner-item[data-toy-type=physical-ball]').click()");assert.equal((await objects('ball')).length,0,'Ball selects creation mode only');
 const cube=cubes[0],start={x:cube.x-200,y:cube.y},end={x:cube.x-40,y:cube.y};
 await run("window.__cannonNotes=[];window.addEventListener('toy:note',e=>window.__cannonNotes.push(e.detail))");
 await throwAt(start,end);
 for(let i=0;i<80;i++){if((await containers())[0]?.interactionData.capture)break;await sleep(50);}
 let first=(await containers())[0];assert.ok(first?.interactionData.capture);const firstId=first.id;
 assert.ok(Math.abs(first.bounds.x-start.x)<.01);assert.ok(Math.abs(first.bounds.y-start.y)<.01);assert.equal(first.bounds.width,80);assert.equal(first.interactionData.version,3);
 assert.equal(await run("document.querySelectorAll('.physical-start,.physical-target').length"),0);
 assert.equal(await run(`document.getElementById(${JSON.stringify(firstId)}).querySelectorAll('canvas,.simple-bouncer-surface').length`),0,'No Bouncer canvas/frame');
 const menuVisible=id=>run(`getComputedStyle(document.getElementById(${JSON.stringify(id)}).querySelector('.expressive-toy-controls')).display!=='none'`);
 assert.equal(await menuVisible(firstId),false,'First creation keeps controls hidden');
 const rectCenter=selector=>run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const handleSelector=id=>'[id="'+id+'"] .simple-container-handle';
 // Seek inside the first recording and exercise the real aim control before
 // waiting for any phrase to finish.
 await run(`window.Heartbeats.transport().seekTick(window.SimpleBouncer.data(${JSON.stringify(firstId)}).capture.firstLaunchTick+144)`);
 assert.equal(await run(`window.SimpleBouncer.recording(${JSON.stringify(firstId)})`),true);
 const earlyEnd={x:start.x,y:start.y+96};await drag(await rectCenter('[id="'+firstId+'"] .cannon-aim'),await worldToScreen(earlyEnd));
 assert.ok((await containers())[0].interactionData.direction.y>.99,'Aim remains editable during recording');
 await drag(await rectCenter('[id="'+firstId+'"] .cannon-aim'),await worldToScreen({x:start.x+96,y:start.y}));
 assert.equal(await run(`document.getElementById(${JSON.stringify(firstId)}).querySelector('[aria-label="Simple Bouncer length"]').disabled`),false,'Length remains editable during recording');
 const firstCentre=await rectCenter(handleSelector(firstId)),expectedCentre=await worldToScreen(start);assert.ok(Math.hypot(firstCentre.x-expectedCentre.x,firstCentre.y-expectedCentre.y)<1,'Handle centre equals launch origin');
 const click=async p=>{await mouse('mousePressed',p,1);await mouse('mouseReleased',p);};
 await releaseLock();await click(await rectCenter(handleSelector(firstId)));assert.equal(await menuVisible(firstId),true,'Tap reveals controls');
 for(const mode of ['ball','cube']){
  const local='[id="'+firstId+'"] [data-toy-type=physical-'+mode+']',palette='.toy-spawner-item[data-toy-type=physical-'+mode+']';
  if(await run(`document.querySelector(${JSON.stringify(local)}).getAttribute('aria-pressed')`)!=='true')await run(`document.querySelector(${JSON.stringify(local)}).click()`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(local)}).getAttribute('aria-pressed')`),'true');
  await run(`document.querySelector(${JSON.stringify(local)}).click()`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(local)}).getAttribute('aria-pressed')`),'false');
  assert.equal(await run(`document.querySelector(${JSON.stringify(palette)}).getAttribute('aria-pressed')`),'false','Local toggle also clears palette selection');
 }
 assert.equal(await run(`document.getElementById(${JSON.stringify(firstId)}).querySelectorAll('[aria-label="Clear capture"],[aria-label="Record Throw"],[aria-label="Delete Simple Bouncer"]').length`),0);
 assert.equal(await run(`getComputedStyle(document.getElementById(${JSON.stringify(firstId)}).querySelector('[data-container-action=open]')).display`),'none','Simple hides Advanced actions');
 // Use the classic instrument picker, not a Bouncer-specific instrument list.
 await run(`document.getElementById(${JSON.stringify(firstId)}).querySelector('[aria-label="Choose cannon instrument"]').click()`);
 for(let i=0;i<60;i++){if(await run("!!document.querySelector('.inst-grid button[data-value=PIANO]')"))break;await sleep(50);}
 await run("document.querySelector('.inst-grid button[data-value=PIANO]').click();document.querySelector('.inst-ok').click()");
 for(let i=0;i<60;i++){if(await run(`window.SimpleBouncer.data(${JSON.stringify(firstId)}).instrument==='PIANO'`))break;await sleep(30);}
 assert.equal(await run(`window.SimpleBouncer.data(${JSON.stringify(firstId)}).instrument`),'PIANO');
 const getState=id=>run(`window.SimpleBouncer.panels(${JSON.stringify(id)})[0].__drawToy.getState()`);
 let music=await getState(firstId);assert.equal(music.instrument,'PIANO');assert.ok(music.authoredNotes.length);assert.ok(music.authoredNotes.every(n=>!('instrument'in n)));assert.deepEqual(await objects('cube'),cubes);
 await click(await rectCenter(handleSelector(firstId)));assert.equal(await menuVisible(firstId),false);
 const moved={x:start.x+30,y:start.y-70};await drag(await rectCenter(handleSelector(firstId)),await worldToScreen(moved));
 first=(await containers())[0];assert.ok(Math.abs(first.bounds.x-moved.x)<1&&Math.abs(first.bounds.y-moved.y)<1);assert.deepEqual(first.interactionData.direction,{x:1,y:0});assert.deepEqual(await objects('cube'),cubes);
 const aim=await rectCenter('[id="'+firstId+'"] .cannon-aim');await drag(aim,await worldToScreen({x:cube.x,y:cube.y}));
 first=(await containers())[0];const d=first.interactionData;assert.ok(d.direction.y>0);assert.ok(Math.abs(Math.hypot(d.launch.vx,d.launch.vy)-840)<1e-8);assert.ok(Math.abs(first.bounds.x-moved.x)<1);assert.deepEqual(await objects('cube'),cubes);
 // The visible preview uses the latest authored aim, independently of flight.
 await sleep(40);
 assert.equal(await run(`(()=>{const line=document.querySelector('.physical-path-prediction'),expected=window.SimpleBouncer.prediction(${JSON.stringify(firstId)});return !!line&&line.getAttribute('points')===expected.map(p=>p.x+','+p.y).join(' ')&&expected.length>2;})()`),true,'Live SVG preview matches the current cannon and bounced trajectory');
 // Cube mode places repeatedly and still prioritizes cannon editing.
 await run("document.querySelector('.toy-spawner-item[data-toy-type=physical-cube]').click()");assert.equal((await objects('cube')).length,3);
 for(const p of [{x:cube.x-280,y:cube.y+260},{x:cube.x-160,y:cube.y+260}])await click(await worldToScreen(p));assert.equal((await objects('cube')).length,5);
 assert.deepEqual(await run(`(()=>{const n=document.getElementById(${JSON.stringify(cube.id)}),s=getComputedStyle(n);return {width:s.width,height:s.height,background:s.backgroundColor,radius:s.borderRadius};})()`),{width:'58px',height:'58px',background:'rgb(255, 140, 0)',radius:'0px'},'Classic Bouncer cube styling preserves the current size');
 const cubeBefore=(await objects('cube'))[1];await throwAt(cubeBefore,{x:cubeBefore.x+20,y:cubeBefore.y+10});assert.equal((await objects('cube')).length,5,'Cube drag must not place another cube');
 const beforeAimCount=(await objects('cube')).length;await drag(await rectCenter('[id="'+firstId+'"] .cannon-aim'),await worldToScreen(cube));assert.equal((await objects('cube')).length,beforeAimCount,'Cannon aim takes precedence over placement');
 // A second cannon shares the same pitch cube but uses its own instrument.
 await run("document.querySelector('.toy-spawner-item[data-toy-type=physical-ball]').click()");
 const secondStart={x:cube.x-200,y:cube.y+120};await throwAt(secondStart,{x:cube.x,y:cube.y});
 for(let i=0;i<80;i++){if((await containers()).length===2&&(await containers()).every(c=>c.interactionData.capture))break;await sleep(50);}
 const second=(await containers()).find(c=>c.id!==firstId);assert.ok(second.interactionData.cubeIds.includes(cube.id));assert.equal(second.interactionData.instrument,'KALIMBA');assert.equal(await menuVisible(second.id),false);
 const firstPanel=await run(`window.SimpleBouncer.panels(${JSON.stringify(firstId)})[0].id`),secondPanel=await run(`window.SimpleBouncer.panels(${JSON.stringify(second.id)})[0].id`);
 await releaseLock();await run('window.__cannonNotes=[];window.Heartbeats.transport().play()');
 for(let i=0;i<70;i++){if(await run(`window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(firstPanel)}&&n.instrument==='PIANO')&&window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(secondPanel)}&&n.instrument==='KALIMBA')`))break;await sleep(60);}
 assert.equal(await run(`window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(firstPanel)}&&n.instrument==='PIANO')&&window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(secondPanel)}&&n.instrument==='KALIMBA')`),true,'Real audio uses each cannon instrument');
 // Keep drag rescheduling from multiplying a single impact's volume.
 await run(`(async()=>{const {ensureAudioContext}=await import('./src/audio-core.js'),{getCurrentPlaybackOccurrence}=await import('./src/playback-context.js'),ctx=ensureAudioContext(),create=ctx.createBufferSource.bind(ctx);window.__editSources=[];ctx.createBufferSource=()=>{const src=create(),owner=getCurrentPlaybackOccurrence()?.instanceToyId;if(owner===${JSON.stringify(firstPanel)}){const rec={start:null,cancelled:false};window.__editSources.push(rec);const start=src.start.bind(src),stop=src.stop.bind(src);src.start=(when,...rest)=>{rec.start=when;return start(when,...rest)};src.stop=(when,...rest)=>{if(when===undefined||when<=rec.start)rec.cancelled=true;return stop(when,...rest)};}return src;};const d=window.SimpleBouncer.data(${JSON.stringify(firstId)});window.Heartbeats.transport().seekTick((d.capture.phaseOffsetTick||0)+d.capture.durationTicks*20);for(let i=0;i<20;i++)window.SimpleBouncer.setAim(${JSON.stringify(firstId)},{x:${cube.x}+i*.01,y:${cube.y}});for(let i=0;i<20;i++)window.SimpleBouncer.objects.update(${JSON.stringify(cube.id)},{x:${cube.x}+i*.01});})()`);
 const voices=await run(`(async()=>{const {ensureAudioContext}=await import('./src/audio-core.js'),now=ensureAudioContext().currentTime,groups={};for(const s of window.__editSources)if(!s.cancelled&&s.start>now+.01){const key=s.start.toFixed(4);groups[key]=(groups[key]||0)+1;}return{created:window.__editSources.length,groups};})()`);
 assert.ok(voices.created>1,'Drag stress exercises repeated note rescheduling');assert.ok(Object.values(voices.groups).every(count=>count===1),JSON.stringify({message:'Cannon/cube drags must not stack impact voices',...voices}));
 await releaseLock();
 if(process.env.RHYTHMAKE_UI_QA_SCREENSHOTS){await click(await rectCenter(handleSelector(firstId)));const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'rhythmake-cannon.png'),Buffer.from(shot.data,'base64'));await click(await rectCenter(handleSelector(firstId)));}
 const saved=await run('({physical:window.SimpleBouncer.objects.snapshot(),captures:window.ContainerToys.list().map(c=>c.interactionData),notes:window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__drawToy.getState())})');
 await run('window.Persistence.markDirty();window.Persistence.flushAutosaveNow()');await send('Page.reload');await sleep(400);
 for(let i=0;i<100;i++){if(await run('!!window.BouncerBoard&&window.ContainerToys.list().length===2&&window.ContainerToys.list().every(c=>window.SimpleBouncer.panels(c.id)[0]?.__drawToy)'))break;await sleep(100);}
 assert.deepEqual(await run('({physical:window.SimpleBouncer.objects.snapshot(),captures:window.ContainerToys.list().map(c=>c.interactionData),notes:window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__drawToy.getState())})'),saved);
 await run("window.__cannonNotes=[];window.addEventListener('toy:note',e=>window.__cannonNotes.push(e.detail))");
 await run("import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('advanced'))");await run(`window.ContainerToys.open(${JSON.stringify(second.id)},true)`);assert.equal(await run(`window.SimpleBouncer.panels(${JSON.stringify(second.id)})[0].dataset.instrument`),'KALIMBA');await run(`window.ContainerToys.open(${JSON.stringify(second.id)},false)`);await run("import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('simple'))");
 async function trashContainer(id){const origin=await rectCenter(handleSelector(id));await mouse('mousePressed',origin,1);await mouse('mouseMoved',{x:origin.x+12,y:origin.y+12},1);const target=await rectCenter('.toy-spawner-trash');await mouse('mouseMoved',target,1);await mouse('mouseReleased',target);await sleep(100);}
 const physicalCubes=await objects('cube'),firstBall=await run(`window.SimpleBouncer.data(${JSON.stringify(firstId)}).ballId`),owned=await run(`window.ContainerToys.list().find(c=>c.id===${JSON.stringify(firstId)}).internalToyIds`);
 await trashContainer(firstId);assert.equal(await run(`!!document.getElementById(${JSON.stringify(firstId)})`),false,'Shared trash deletes cannon');assert.equal(await run(`!!window.SimpleBouncer.objects.get(${JSON.stringify(firstBall)})`),false,'Owned ball deleted');for(const id of owned)assert.equal(await run(`!!document.getElementById(${JSON.stringify(id)})`),false);assert.deepEqual(await objects('cube'),physicalCubes);assert.equal((await containers()).length,1);
 // Paint uses the same drag-to-trash path and must leave no owned DrawGrids.
 await run("document.querySelector('.toy-spawner-toggle').click();document.querySelector('.toy-spawner-item[data-toy-type=simple-draw]').click()");
 const paintStart={x:cube.x-250,y:cube.y+260};await throwAt(paintStart,{x:paintStart.x+120,y:paintStart.y+65});
 for(let i=0;i<100;i++){if(await run("window.ContainerToys.list().some(c=>c.presentation.type==='simple-draw'&&c.internalToyIds.length)"))break;await sleep(70);}
 const paint=await run("window.ContainerToys.list().find(c=>c.presentation.type==='simple-draw')");assert.ok(paint?.internalToyIds.length,'Paint creates owned music');await trashContainer(paint.id);assert.equal(await run(`!!document.getElementById(${JSON.stringify(paint.id)})`),false,'Shared trash deletes Paint');for(const id of paint.internalToyIds)assert.equal(await run(`!!document.getElementById(${JSON.stringify(id)})`),false,'No orphan Paint grids');assert.deepEqual(await objects('cube'),physicalCubes);
 await run("import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('advanced'))");
 await run(`(async()=>{window.ContainerToys.move(${JSON.stringify(second.id)},${secondStart.x},${secondStart.y});window.SimpleBouncer.setAim(${JSON.stringify(second.id)},window.SimpleBouncer.objects.get(${JSON.stringify(cube.id)}));await window.SimpleBouncer.throwBall(${JSON.stringify(second.id)});})()`);await releaseLock();

 const expandedMusic=await getState(second.id);assert.ok(expandedMusic.authoredNotes.length,'Expand test starts with an audible captured phrase');await run(`window.ContainerToys.expand(${JSON.stringify(second.id)})`);
 assert.equal(await run(`!!window.SimpleBouncer.panels(${JSON.stringify(second.id)})[0]`),false);assert.equal(await run(`!!document.getElementById(${JSON.stringify(secondPanel)}).__simpleBouncerLive`),false);
 assert.deepEqual(await run(`document.getElementById(${JSON.stringify(secondPanel)}).__drawToy.getState().authoredNotes`),expandedMusic.authoredNotes);assert.deepEqual(await objects('cube'),physicalCubes);

 await run('window.__cannonNotes=[];window.Heartbeats.transport().play()');
 for(let i=0;i<100;i++){if(await run(`window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(secondPanel)}&&n.instrument==='KALIMBA')`))break;await sleep(60);}
 assert.equal(await run(`window.__cannonNotes.some(n=>n.toyId===${JSON.stringify(secondPanel)}&&n.instrument==='KALIMBA')`),true,'Expand preserves sound through ordinary captured music');
 console.log('PASS: live bounced SVG preview; classic cube styling at 58px; compact cannon; hidden/revealed menu; centre movement; attached aiming; fixed 840 speed; Cube precedence; real cannon-owned instrument audio; shared pitch cube; save/reload; Advanced Open/Expand sound; drag rescheduling; shared-trash deletion of Paint/Bouncer without orphans or shared-cube deletion');
} finally {
 clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();
 // Chrome may still hold its profile briefly; leave the OS temp directory to OS cleanup.
}
