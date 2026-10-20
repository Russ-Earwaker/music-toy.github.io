// Run explicitly: node tests/ui-mode.browser.mjs [path-to-Chrome]
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
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await run('document.documentElement.dataset.uiMode'),'simple',await run('JSON.stringify({url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,250),scripts:document.scripts.length})'));
 // Bouncer defaults must resolve real samples, including saved lowercase IDs.
 for(let i=0;i<200;i++){if(await run("window.AudioDebug?.has('PIANO') && window.AudioDebug?.has('KALIMBA')"))break;await new Promise(r=>setTimeout(r,100));}
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
 assert.equal((await containers()).length,0,'Palette activation must not create an empty container');
 let cubes=await objects('cube');assert.equal(cubes.length,3);assert.equal(await run('window.BouncerBoard.active'),true);
 assert.equal(await run('window.Persistence.getSnapshot().physicalObjects.length'),3);
 assert.equal(await run('window.SceneDiscardPrompt.hasSceneToys()'),true,'Standalone physical objects count as authored scene content');
 assert.ok(await run("[...document.querySelectorAll('.physical-cube')].some(n=>n.getAnimations().length>0)"),'Seed cubes visibly tumble');
 await run("document.querySelector('[data-toy-type=\"simple-bouncer\"]').click()");assert.equal((await objects('cube')).length,3,'Existing nearby cubes are reused');
 await sleep(700);
 const cube=cubes[0],start={x:cube.x-200,y:cube.y},end={x:cube.x-40,y:cube.y};
 await run(`window.__physicsNotes=[];window.addEventListener('toy:note',e=>window.__physicsNotes.push(e.detail));`);
 await run(`(async()=>{const {getToyGain,ensureAudioContext}=await import('./src/audio-core.js');const a=ensureAudioContext().createAnalyser();a.fftSize=1024;getToyGain('master').connect(a);const samples=new Float32Array(1024);window.__physicsRms=0;const timer=setInterval(()=>{a.getFloatTimeDomainData(samples);window.__physicsRms=Math.max(window.__physicsRms,Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length));},20);window.__stopProbe=()=>{clearInterval(timer);getToyGain('master').disconnect(a);};})()`);
 const beforeCamera=await run("JSON.stringify(document.querySelector('#board').style.transform)");
 await mouse('mousePressed',await worldToScreen(start),1);await mouse('mouseMoved',await worldToScreen(end),1);
 assert.equal((await containers()).length,0);assert.ok(await run("document.querySelector('.physical-launch-preview').getAttribute('d').length>0"));
 await mouse('mouseReleased',await worldToScreen(end));
 for(let i=0;i<60;i++){if((await containers())[0]?.interactionData.capture)break;await sleep(50);}
 let captures=await containers();assert.equal(captures.length,1);const first=captures[0];assert.ok(first.interactionData.cubeIds.includes(cube.id));assert.equal(first.internalToyIds.length,1);
 assert.equal(await run("JSON.stringify(document.querySelector('#board').style.transform)"),beforeCamera,'No automatic camera following');
 assert.ok(cube.x<first.bounds.x,'Struck cube is outside informational chrome');
 assert.ok(first.interactionData.capture.trajectory.some(p=>p.x<first.bounds.x-100),'Ball travels outside UI bounds');
 assert.equal((await objects('ball')).length,1);
 await sleep(1100);assert.ok(await run('window.__physicsNotes.length>0'),'Canonical graph emits collision notes');
 assert.ok(await run('window.__physicsRms>0.0001'),'Board capture produces non-silent audio');await run('window.__stopProbe()');
 if(process.env.RHYTHMAKE_UI_QA_SCREENSHOTS){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'rhythmake-board-bouncer-live.png'),Buffer.from(shot.data,'base64'));}
 await releaseLock();
 async function paletteDrop(type,world){
  await run(`document.querySelector('[data-toy-type="${type}"]').scrollIntoView({block:'nearest'})`);
  const source=await run(`(()=>{const r=document.querySelector('[data-toy-type="${type}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const destination=await worldToScreen(world);
  await mouse('mousePressed',source,1);await mouse('mouseMoved',destination,1);await sleep(30);
  await mouse('mouseReleased',destination);await sleep(100);
 }
 const outside={x:cube.x-260,y:cube.y+240};
 await run("document.querySelector('[data-toy-type=physical-cube]').click()");assert.equal((await objects('cube')).length,3,'Cube button only selects mode');
 const tap=async p=>{const screen=await worldToScreen(p);await mouse('mousePressed',screen,1);await mouse('mouseReleased',screen);};
 await tap(outside);await tap({x:outside.x+100,y:outside.y+100});assert.equal((await objects('cube')).length,5,'Repeated empty taps place cubes');
 const discard=(await objects('cube')).find(c=>Math.abs(c.x-outside.x-100)<1);await run('window.SimpleBouncer.objects.remove('+JSON.stringify(discard.id)+')');
 cubes=await objects('cube');const extra=cubes.find(c=>Math.abs(c.x-outside.x)<1);assert.ok(extra);
 const ballPosition={x:extra.x-200,y:extra.y};
 await run("document.querySelector('[data-toy-type=physical-ball]').click()");assert.equal((await objects('ball')).length,1,'Ball button only selects mode');
 await throwAt(ballPosition,{x:ballPosition.x+150,y:ballPosition.y});
 for(let i=0;i<60;i++){captures=await containers();if(captures.length===2&&captures.every(c=>c.interactionData.capture))break;await sleep(50);}
 assert.equal(captures.length,2);let second=captures.find(c=>c.id!==first.id);assert.ok(second.interactionData.cubeIds.includes(extra.id));
 assert.ok(extra.x<second.bounds.x,'Capture strikes the newly placed cube outside its chrome');
 await releaseLock();
 await run('window.SimpleBouncer.editHandle('+JSON.stringify(second.id)+',"start",'+JSON.stringify({x:cube.x-260,y:cube.y+5})+')');
 await run('window.SimpleBouncer.editHandle('+JSON.stringify(second.id)+',"target",'+JSON.stringify({x:cube.x-100,y:cube.y+5})+')');
 await run(`(()=>{const c=document.getElementById(${JSON.stringify(second.id)}),s=c.querySelector('select');s.value='4';s.dispatchEvent(new Event('change'));c.querySelector('[aria-label="Record Throw"]').click()})()`);await sleep(200);
 captures=await containers();second=captures.find(c=>c.id===second.id);
 assert.equal(second.interactionData.capture.durationTicks,1536);
 assert.ok(Math.abs(second.interactionData.capture.trajectory.at(-1).x-second.interactionData.launch.x)>1500,'Long throws can leave the viewport, and stop at four bars');
 assert.ok(captures.every(c=>c.interactionData.cubeIds.includes(cube.id)),'Two independent captures share one physical cube');
 assert.equal((await objects('cube')).length,4);await releaseLock();
 const beforeNotes=await run('window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__dgAuthoredNotes)');
 const physicalBefore=await objects('cube');
 await run(`window.ContainerToys.move(${JSON.stringify(first.id)},${first.bounds.x+80},${first.bounds.y+100})`);
 assert.deepEqual(await objects('cube'),physicalBefore,'Moving chrome does not move reusable physical objects');
 const movedOrigin=await run(`window.SimpleBouncer.data(${JSON.stringify(first.id)}).startPosition`);
 await run(`(()=>{const d=window.SimpleBouncer.data(${JSON.stringify(first.id)}),t=window.Heartbeats.transport();t.pause();t.seekTick((d.capture.phaseOffsetTick||0)+d.capture.durationTicks*2);})()`);
 assert.deepEqual(await run(`window.SimpleBouncer.ballView(window.SimpleBouncer.objects.get(${JSON.stringify(first.interactionData.ballId)})).position`),movedOrigin,'Later replay loops start at the moved origin');
 await drag(await worldToScreen({x:cube.x,y:cube.y}),await worldToScreen({x:cube.x+40,y:cube.y+15}));
 assert.ok((await containers()).every(c=>c.interactionData.stale));
 assert.deepEqual(await run('window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__dgAuthoredNotes)'),beforeNotes);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
 assert.equal((await objects('cube')).length,3);assert.ok((await containers()).every(c=>c.interactionData.brokenReferences.includes(cube.id)));
 const beforeZoom=await objects('cube');
 await run("window.__setBoardViewportNow?.(.8,80,60)");await send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:2,mobile:false});await sleep(150);
 assert.deepEqual(await objects('cube'),beforeZoom,'Zoom, DPR and viewport changes do not change physical coordinates');
 await run('window.ToySpawner.close()');
 const zoomCube=(await objects('cube'))[0];
 await drag(await worldToScreen(zoomCube),await worldToScreen({x:zoomCube.x+30,y:zoomCube.y-20}));
 const zoomMoved=await run(`window.SimpleBouncer.objects.get(${JSON.stringify(zoomCube.id)})`);
 assert.ok(Math.abs(zoomMoved.x-zoomCube.x-30)<1&&Math.abs(zoomMoved.y-zoomCube.y+20)<1,'Direct manipulation preserves logical drag deltas after zoom and DPR changes');
 const saved=await run('({physical:window.SimpleBouncer.objects.snapshot(),captures:window.ContainerToys.list().map(c=>c.interactionData),notes:window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__dgAuthoredNotes)})');
 await run('window.Persistence.markDirty();window.Persistence.flushAutosaveNow()');await send('Page.reload');await sleep(400);
 for(let i=0;i<100;i++){if(await run('!!window.BouncerBoard&&window.ContainerToys.list().length===2&&window.ContainerToys.list().every(c=>c.interactionData.capture)'))break;await sleep(100);}
 const restored=await run('({physical:window.SimpleBouncer.objects.snapshot(),captures:window.ContainerToys.list().map(c=>c.interactionData),notes:window.ContainerToys.list().map(c=>window.SimpleBouncer.panels(c.id)[0].__dgAuthoredNotes)})');
 assert.deepEqual(restored,saved);assert.equal((await objects('ball')).length,2);
 await run("import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('advanced'))");
 const restoredCaptures=await containers(),id=restoredCaptures[0].id;
 await run(`window.ContainerToys.open(${JSON.stringify(id)},true)`);assert.deepEqual(await run('window.SimpleBouncer.objects.snapshot()'),saved.physical);
 await run(`window.ContainerToys.open(${JSON.stringify(id)},false);window.SimpleBouncer.clear(${JSON.stringify(id)})`);assert.deepEqual(await run('window.SimpleBouncer.objects.snapshot().map(o=>[o.id,o.x,o.y])'),saved.physical.map(o=>[o.id,o.x,o.y]));
 // Exercise real audio after edits, including a silent loop becoming audible.
 await run(`(async()=>{const s=window.SimpleBouncer;for(const cube of s.objects.list('cube'))s.objects.remove(cube.id);s.objects.addCube(300,0,{sourceMidi:77,instrument:'PIANO'});s.objects.addCube(-100,0,{sourceMidi:74,instrument:'KALIMBA'});s.editHandle(${JSON.stringify(id)},'start',{x:0,y:0});s.editHandle(${JSON.stringify(id)},'target',{x:200,y:0});await s.throwBall(${JSON.stringify(id)});})()`);
 await releaseLock();
 const livePanelId=await run(`window.SimpleBouncer.panels(${JSON.stringify(id)})[0].id`);
 await run(`window.__liveImpactNotes=[];window.addEventListener('drawgrid:note-admitted',e=>{if(e.detail.toyId===${JSON.stringify(livePanelId)})window.__liveImpactNotes.push(e.detail)});window.SimpleBouncer.editHandle(${JSON.stringify(id)},'start',{x:0,y:200});`);
 await run(`(async()=>{const d=window.SimpleBouncer.data(${JSON.stringify(id)}),t=window.Heartbeats.transport();t.seekTick((d.capture.phaseOffsetTick||0)+384*10);await t.play();})()`);
 await sleep(650);
 assert.deepEqual(await run('window.__liveImpactNotes'),[],'Moved source misses cubes: no old impact audio');
 assert.equal(await run(`window.SimpleBouncer.panels(${JSON.stringify(id)})[0].__dgAuthoredNotes.length`),0,'Silent flight replaces canonical music');
 await run(`window.SimpleBouncer.editHandle(${JSON.stringify(id)},'start',{x:0,y:0})`);
 for(let i=0;i<70;i++){if(await run(`window.__liveImpactNotes.some(n=>n.sourceMidi===77)&&window.__liveImpactNotes.some(n=>n.sourceMidi===74)&&window.SimpleBouncer.panels(${JSON.stringify(id)})[0].__dgAuthoredNotes.some(n=>n.sourceMidi===77)`))break;await sleep(70);}
 assert.equal(await run('window.__liveImpactNotes.some(n=>n.sourceMidi===77)&&window.__liveImpactNotes.some(n=>n.sourceMidi===74)'),true,'Next flight admits current cube pitches through the real audio path');
 // A drag generates many edits inside one lookahead window. Only one
 // un-cancelled voice may remain at each scheduled onset for this Bouncer.
 await run(`(async()=>{const {ensureAudioContext}=await import('./src/audio-core.js'),{getCurrentPlaybackOccurrence}=await import('./src/playback-context.js'),ctx=ensureAudioContext(),create=ctx.createBufferSource.bind(ctx);window.__editSources=[];ctx.createBufferSource=()=>{const src=create(),owner=getCurrentPlaybackOccurrence()?.instanceToyId;if(owner===${JSON.stringify(livePanelId)}){const rec={start:null,cancelled:false};window.__editSources.push(rec);const start=src.start.bind(src),stop=src.stop.bind(src);src.start=(when,...rest)=>{rec.start=when;return start(when,...rest)};src.stop=(when,...rest)=>{if(when===undefined||when<=rec.start)rec.cancelled=true;return stop(when,...rest)};}return src;};for(let i=0;i<40;i++)window.SimpleBouncer.editHandle(${JSON.stringify(id)},'target',{x:200+i,y:0});})()`);
 const voices=await run(`(async()=>{const {ensureAudioContext}=await import('./src/audio-core.js'),now=ensureAudioContext().currentTime,groups={};for(const s of window.__editSources)if(!s.cancelled&&s.start>now+.01){const key=s.start.toFixed(4);groups[key]=(groups[key]||0)+1;}return{created:window.__editSources.length,groups};})()`);
 assert.ok(voices.created>1,'Stress test must exercise repeated audio rescheduling');
 assert.ok(Object.keys(voices.groups).length,'Stress test must retain a future impact');
 assert.ok(Object.values(voices.groups).every(count=>count===1),JSON.stringify({message:'Repeated dragging must not stack impact voices',...voices}));
 await run(`window.__editSources=[];(()=>{const s=window.SimpleBouncer,cube=s.objects.list('cube').find(c=>c.sourceMidi===77);for(let i=0;i<40;i++)s.objects.update(cube.id,{x:300+i*.1});})()`);
 const cubeVoices=await run(`(async()=>{const {ensureAudioContext}=await import('./src/audio-core.js'),now=ensureAudioContext().currentTime,groups={};for(const s of window.__editSources)if(!s.cancelled&&s.start>now+.01){const key=s.start.toFixed(4);groups[key]=(groups[key]||0)+1;}return{created:window.__editSources.length,groups};})()`);
 assert.ok(cubeVoices.created>1,'Cube drag must exercise repeated rescheduling');
 assert.ok(Object.keys(cubeVoices.groups).length,'Cube drag must retain a future impact');
 assert.ok(Object.values(cubeVoices.groups).every(count=>count===1),JSON.stringify({message:'Repeated cube dragging must not stack impact voices',...cubeVoices}));
 await run('window.Heartbeats.transport().pause()');
 const liveSaved=await run(`({notes:window.SimpleBouncer.panels(${JSON.stringify(id)})[0].__drawToy.getState().authoredNotes,data:window.SimpleBouncer.data(${JSON.stringify(id)})})`);
 assert.ok(liveSaved.notes.some(n=>n.sourceMidi===77),'DrawGrid owns regenerated canonical notes');
 await run('window.Persistence.markDirty();window.Persistence.flushAutosaveNow()');await send('Page.reload');await sleep(400);
 for(let i=0;i<100;i++){if(await run(`!!window.SimpleBouncer?.panels(${JSON.stringify(id)})[0]?.__drawToy`))break;await sleep(100);}
 assert.deepEqual(await run(`({notes:window.SimpleBouncer.panels(${JSON.stringify(id)})[0].__drawToy.getState().authoredNotes,data:window.SimpleBouncer.data(${JSON.stringify(id)})})`),liveSaved,'Automatically updated impacts and music survive reload');
 if(process.env.RHYTHMAKE_UI_QA_SCREENSHOTS){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(os.tmpdir(),'rhythmake-board-bouncer.png'),Buffer.from(shot.data,'base64'));}
 console.log('PASS: board gestures; shared cubes; live impact audio; source/cube drag rescheduling keeps one voice per impact; zoom/DPR invariance; complete scene reload; Clear keeps physical objects');
} finally {
 clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();
 // Chrome may still hold its profile briefly; leave the OS temp directory to OS cleanup.
}
