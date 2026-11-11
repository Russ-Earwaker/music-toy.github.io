// Run: node tests/beat-swarm-baseline.browser.mjs [path-to-Chrome] [--touch]
import assert from 'node:assert/strict';
import { verifyAuthoredMusicPlaythrough } from './beat-swarm-music-qa.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const musicQa=process.argv.includes('--music-qa');
const resetQa=process.argv.includes('--reset-qa');
const spawnQa=process.argv.includes('--spawn-qa');
const spawnResizeQa=process.argv.includes('--spawn-resize-qa');
const debugPort=resetQa?9337:musicQa?9336:spawnResizeQa?9335:spawnQa?9334:(process.argv.includes('--touch')?9332:9331);
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
const browser=spawn(process.argv.slice(2).find(x=>!x.startsWith('--'))||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:'ignore'});
let ws,spawnWatcher;
const deadline=setTimeout(()=>{browser.kill();process.exitCode=1;console.error('Browser QA timed out');ws?.close();server.closeAllConnections();server.close();},600000);
try {
 let pages;
 for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json',{signal:AbortSignal.timeout(500)})).json();if(pages.length)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(pages?.length,'Chrome debugging connection');
 const page=pages.find(p=>p.type==='page'&&!p.url.startsWith('chrome-extension:'));
 assert.ok(page,'Application page target');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let serial=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const errors=[];ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 // The app already loads its local html2canvas vendor copy.
 await send('Network.setBlockedURLs',{urls:['*cdnjs.cloudflare.com*']});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__qaSamplesReady=false;window.addEventListener('samples-ready',()=>window.__qaSamplesReady=true);"});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
 for(let i=0;i<100;i++){if(await run('!!window.ContainerToys'))break;await new Promise(r=>setTimeout(r,100));}

 const touch=process.argv.includes('--touch');if(touch)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));const snapshot=()=>run('BeatSwarmMode.getGameplaySnapshot()');
 const click=async selector=>{for(let i=0;i<100;i++){if(await run(`!!document.querySelector(${JSON.stringify(selector)})`))break;await sleep(50);}
 const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}};
 await sleep(800);await run("document.querySelector('.volume-setup-ok')?.click()");
 await click('#ui-mode [data-ui-mode=advanced]');await click('.toy-spawner-game');await click('[data-toy-type=beat-swarm]');
 if(musicQa) await run("window.__qaMix=null;window.addEventListener('beat-swarm:music-system-event',e=>{if(e.detail.type==='music_mix_debug'){window.__qaMix=e.detail;queueMicrotask(()=>window.__qaMix=null)}});for(const Source of [AudioBufferSourceNode,OscillatorNode]){const start=Source.prototype.start;Source.prototype.start=function(...args){if(window.__qaMix)window.__musicQa?.push({...window.__qaMix,type:'audio_sample_started',audio:{when:args[0],now:this.context.currentTime,state:this.context.state,duration:this.buffer?.duration,kind:Source.name}});return start.apply(this,args)}}");
 if(musicQa) await run("window.__musicQa=[];window.addEventListener('beat-swarm:music-system-event',e=>{if(['lead_ball_physical_impact','lead_ball_route_sample','music_mix_debug','music_authoring_lane_audio_suppressed','music_missile_rewrite_committed_to_theme','pinball_bouncer_rewrite_committed_to_theme','lead_ball_rewrite_committed_to_theme','lead_ball_literal_loop_executed'].includes(e.detail.type))window.__musicQa.push(e.detail)})");
 await sleep(400);await run("document.querySelector('.volume-setup-ok')?.click()");
 if(resetQa){
  await run("BeatSwarmMode.setPlayerMusicTheme('bassDrive',{autogenerated:false,data:{toyType:'simpleRhythm',steps:8,active:[true,false,false,false,false,false,false,false],patternChain:[[true,false,false,false,false,false,false,false]],instrumentId:'DRUM KICK',note:'C4'}})");
  assert.ok((await snapshot()).authoredLayers.foundation>0);
  await run('BeatSwarmMode.reset()');
  const reset=await snapshot();assert.equal(reset.authoredLayers.foundation,0);assert.equal(reset.authoredLayers.accent,0);assert.equal(reset.authoredLayers.lead,0);assert.deepEqual(reset.music.completedIds,[]);assert.equal(reset.corridor.phase,'prelaunch');
  await run('BeatSwarmMode.exit()');assert.deepEqual(errors,[]);console.log('PASS explicit reset clears authored layers before fresh prelaunch');
 } else if(spawnResizeQa){
  // Isolated placement fixture; the full menu/control/music regression runs separately with --spawn-qa.
  await run("BeatSwarmMode.exit();BeatSwarmMode.enter({weaponGateIntro:false,weaponGateSequence:'missiles_bouncers'})");
  await run("import('./src/audio-core.js').then(m=>m.start())");
  const fixture=await run('BeatSwarmMode.startFullScoreArrangementTest()');assert.equal(fixture.active,true);
  await run("import('./src/audio-core.js').then(m=>m.stop())");
  const samples=[];
  for(const [width,height] of [[1600,900],[1920,1080],[1000,900]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(200);
   const entries=await run('BeatSwarmMode.getSpawnEntryDiagnostics().filter(e=>e.type.startsWith("director:"))');assert.equal(entries.length,3);
   for(const entry of entries){const b=entry.currentBounds,r=entry.currentVisibleRect,m=entry.marginWorld;
    const outside=entry.side==='left'?b.right<r.left-m:entry.side==='right'?b.left>r.right+m:entry.side==='top'?b.bottom<r.top-m:b.top>r.bottom+m;
    assert.ok(outside,'hidden formation restages as a whole after resize');
   }
   const visibleBodies=await run("[...document.querySelectorAll('.is-director-musical-formation')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight}).length");
   assert.equal(visibleBodies,0,'actual enemy DOM bodies remain outside after resize');
   samples.push({width,height,entries});
  }
  assert.ok(samples.some(s=>s.entries.some(e=>e.resizeRestagings?.length)),'resize expansion exercises restaging');
  fs.mkdirSync('artifacts/beat-swarm-offscreen',{recursive:true});fs.writeFileSync('artifacts/beat-swarm-offscreen/resize-outside.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
  await run("import('./src/audio-core.js').then(m=>m.start())");await sleep(12000);
  const entered=await run('BeatSwarmMode.getSpawnEntryDiagnostics().filter(e=>e.type.startsWith("director:"))');assert.ok(entered.every(e=>e.firstIntersectionFrame!=null),'all three ring formations enter using existing AI');assert.ok(await run("[...document.querySelectorAll('.is-director-musical-formation')].some(e=>{const r=e.getBoundingClientRect();return r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight})"),'actual enemy bodies enter the display');
  fs.writeFileSync('artifacts/beat-swarm-offscreen/resize-entries.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
  fs.writeFileSync('artifacts/beat-swarm-offscreen/resize-qa.json',JSON.stringify({samples,entered},null,2));await run('BeatSwarmMode.exit()');assert.deepEqual(errors,[]);console.log('PASS hidden formation resize restaging and existing approach at three sizes');
 }else{
 const spawnObservations=new Map(),spawnFailures=[],spawnPhotos=[];let watching=false;
 if(spawnQa){
  fs.mkdirSync('artifacts/beat-swarm-offscreen',{recursive:true});
  spawnWatcher=setInterval(async()=>{if(watching)return;watching=true;try{
   const entries=await run('BeatSwarmMode.getSpawnEntryDiagnostics()');
   for(const entry of entries){
    const key=entry.formationId+':'+entry.spawnFrame;spawnObservations.set(key,entry);
    const b=entry.initialBounds,r=entry.visibleRect,m=entry.marginWorld;
    const ok=entry.side==='left'?b.right<r.left-m:entry.side==='right'?b.left>r.right+m:entry.side==='top'?b.bottom<r.top-m:b.top>r.bottom+m;
    if(!ok)spawnFailures.push(entry);
    if(entry.type.startsWith('director:')&&spawnPhotos.length<8){
     const phase=entry.firstIntersectionFrame==null?'outside':'entering';
     if(spawnPhotos.filter(photo=>photo.phase===phase).length<4&&!spawnPhotos.some(photo=>photo.key===key&&photo.phase===phase)&& (phase==='entering'||entry.currentBounds)){
      const name='artifacts/beat-swarm-offscreen/'+entry.side+'-'+spawnPhotos.length+'-'+phase+'.png';
      fs.writeFileSync(name,Buffer.from((await send('Page.captureScreenshot')).data,'base64'));spawnPhotos.push({key,phase,name,entry});
     }
    }
   }
  }catch(error){spawnFailures.push(String(error));}finally{watching=false;}},80);
 }
 let width=1280,height=900,held=false;
 const anchor=()=>({x:width*.5,y:height*.75});
 const down=async()=>{const p=anchor();if(touch)await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});else await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});held=true;};
 const steer=async(x,y,mag=1)=>{if(!held)await down();const len=Math.hypot(x,y)||1,p={x:anchor().x+x/len*70*mag,y:anchor().y+y/len*70*mag};if(touch)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});else await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,buttons:1});};
 const up=async()=>{if(!held)return;if(touch)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await send('Input.dispatchMouseEvent',{type:'mouseReleased',...anchor(),button:'left',clickCount:1});held=false;};
 const first=await snapshot();assert.equal(first.corridor.phase,'prelaunch');const start=first.corridor.progress;
 await sleep(500);assert.equal((await snapshot()).corridor.progress,start,'no timer launch');
 await steer(-1,0);await sleep(900);assert.equal((await snapshot()).corridor.phase,'prelaunch','pulling alone does not launch');await up();await sleep(200);
 assert.equal((await snapshot()).corridor.phase,'gate','release launches');
 const launched=await snapshot();await sleep(500);assert.ok((await snapshot()).corridor.progress>launched.corridor.progress,'forward motion continues without holding input');
 await steer(0,-1);await sleep(400);const upper=await snapshot();await steer(0,1);await sleep(400);assert.ok((await snapshot()).corridor.y>upper.corridor.y,'vertical drag steers');await up();
 const measurements=[];
 for(const [w,h] of [[1600,900],[1920,1080],[1000,900]]){
  const before=await snapshot();width=w;height=h;await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(200);
  const after=await snapshot();assert.equal(after.cameraScale,before.cameraScale);
  assert.ok(Math.abs(after.playerWorld.x-before.playerWorld.x-(after.corridor.progress-before.corridor.progress)/after.cameraScale)<2,'resize preserves world scrolling: '+JSON.stringify({before,after}));
  await run('window.__BEAT_SWARM_PROJECTILE_REMOVALS=[]');await sleep(3800);
  const removals=await run('(window.__BEAT_SWARM_PROJECTILE_REMOVALS||[]).filter(x=>x.kind==="standard"&&x.removalReason==="max_range")');
  assert.ok(removals.length,'existing musical firing reaches full travel budget');for(const r of removals)assert.ok(Math.abs(r.distanceTravelled-2090)<1e-7);
  measurements.push({width,height,...removals[0]});
 }
 for(let i=0;i<55;i++){const state=await snapshot();if(!state.corridor)break;if(i%10===0)console.log('CORRIDOR',touch?'touch':'mouse',state.corridor.nextGateIndex);await sleep(1000);}
 assert.equal((await snapshot()).corridor,null,'existing corridor hands off to arena');
 const interaction=()=>run('({rockets:BeatSwarmMode.getMusicMissileEventSnapshot(),bumpers:BeatSwarmMode.getPinballBouncerEventSnapshot(),lead:BeatSwarmMode.getLeadBallEventSnapshot()})');
 const played=[];const musicPhases=[];let lastCompleted=0;
 for(let i=0;i<700;i++){const state=await snapshot(),objects=await interaction();if(i%40===0){played.push({current:state.music.current?.id,completed:state.music.completedIds,lead:objects.lead.hitCount});console.log('PLAY',touch?'touch':'mouse',played.at(-1));}if(musicQa&&state.music.completedIds.length>lastCompleted){lastCompleted=state.music.completedIds.length;await up();const from=await run('window.__musicQa.length');await sleep(lastCompleted>=5?65000:28000);musicPhases.push({completed:lastCompleted,themes:await run('BeatSwarmMode.getPlayerMusicThemes()'),events:await run('window.__musicQa.slice('+from+')')});console.log('MUSIC PHASE',lastCompleted,musicPhases.at(-1).events.filter(e=>e.type==='music_mix_debug').reduce((a,e)=>{a[e.payload.lane]=(a[e.payload.lane]||0)+1;return a},{}));}if(state.music.completedIds.length>=5)break;
 const pickups=[...objects.rockets.interactionTargets,...objects.bumpers.interactionTargets.filter(x=>x.active!==false),...objects.lead.interactionTargets];const carrier=state.targets.find(t=>t.rocketCarrier||t.leadCarrier),target=pickups[0]||carrier?.world;
 if(target){const dx=target.x-state.playerWorld.x,dy=target.y-state.playerWorld.y;await steer(dx,dy,Math.min(1,Math.hypot(dx,dy)/180));}else await up();await sleep(250);}
 await up();const final=await snapshot();assert.ok(final.authoredLayers.foundation>0);assert.ok(final.authoredLayers.accent>0);assert.ok(final.authoredLayers.lead>=8);assert.ok(final.authoredLayers.weapon.activeNotes>0);assert.deepEqual(final.music.completedIds.slice(0,5),['foundation-rockets-1','foundation-rockets-2','accent-bouncer-1','accent-bouncer-2','lead-ball-1']);
 if(spawnQa){
  await sleep(15000);
  const naturalEntries=[...spawnObservations.values()];
  fs.writeFileSync('artifacts/beat-swarm-offscreen/natural-flow-spawns.json',JSON.stringify(naturalEntries,null,2));
  if(!naturalEntries.some(e=>e.type.startsWith('director:'))){
   console.log('EXPLICIT QA: existing full-score arrangement fixture after natural flow');
   const fixture=await run('BeatSwarmMode.startFullScoreArrangementTest()');assert.equal(fixture.active,true);
   await sleep(12000);
  }
  clearInterval(spawnWatcher);spawnWatcher=null;while(watching)await sleep(100);
  assert.deepEqual(spawnFailures,[],'spawned bodies must be entirely outside the actual camera bounds plus margin');
  const entries=[...spawnObservations.values()];fs.writeFileSync('artifacts/beat-swarm-offscreen/spawn-observations.json',JSON.stringify({entries,photos:spawnPhotos},null,2));console.log('OBSERVED TYPES',Array.from(new Set(entries.map(e=>e.type))));assert.ok(entries.some(e=>e.type.startsWith('director:')),'normal director formations observed');
  assert.ok(entries.some(e=>e.type.startsWith('director:')&&e.firstIntersectionFrame!=null),'existing director approach enters the view');
  assert.ok(spawnPhotos.some(p=>p.phase==='outside'));assert.ok(spawnPhotos.some(p=>p.phase==='entering'));
  fs.writeFileSync('artifacts/beat-swarm-offscreen/spawn-observations.json',JSON.stringify({entries,photos:spawnPhotos},null,2));
  console.log('SPAWN QA',entries.length,'entries',spawnPhotos.length,'screenshots',Array.from(new Set(entries.map(e=>e.side))));
 }
 if(musicQa){fs.mkdirSync('artifacts/beat-swarm-music',{recursive:true});const data={musicPhases,events:await run('window.__musicQa'),final};fs.writeFileSync('artifacts/beat-swarm-music/playthrough.json',JSON.stringify(data,null,2));console.log('PERSISTENCE',verifyAuthoredMusicPlaythrough(data));}
 const dir=musicQa?'artifacts/beat-swarm-music':spawnQa?'artifacts/beat-swarm-offscreen':'artifacts/beat-swarm-baseline';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/'+(touch?'touch':'mouse')+'-qa.json',JSON.stringify({measurements,played,final},null,2));fs.writeFileSync(dir+'/'+(touch?'touch':'mouse')+'.png',Buffer.from((await send('Page.captureScreenshot')).data,'base64'));
 await run('BeatSwarmMode.exit()');assert.equal((await snapshot()).rafActive,false);assert.equal((await snapshot()).projectileCount,0);
 await click('.toy-spawner-game');await click('[data-toy-type=beat-swarm]');await sleep(100);assert.equal((await snapshot()).corridor.phase,'prelaunch');assert.equal((await snapshot()).corridor.nextGateIndex,0);
 await run('BeatSwarmMode.reset()');assert.equal((await snapshot()).corridor.phase,'prelaunch');await sleep(550);assert.equal((await snapshot()).corridor.phase,'prelaunch');assert.equal(await run("getComputedStyle(document.querySelector('.beat-swarm-weapon-gate-intro')).opacity"),'1');assert.equal(await run("!!document.querySelector('.beat-swarm-weapon-gate-intro .beat-swarm-weapon-gate-gameplay')"),true);await run('BeatSwarmMode.exit()');
 assert.deepEqual(errors,[]);console.log('PASS',touch?'touch':'mouse','baseline pull/release, forced forward, vertical steering, range at three sizes, full five-stage flow, reset/exit, zero keyboard input');
}
}finally{clearInterval(spawnWatcher);clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();}
