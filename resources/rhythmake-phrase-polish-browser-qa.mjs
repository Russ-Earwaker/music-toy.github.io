import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=resolve('.'), output=resolve('resources/debug-output/phrase-polish-qa');
const quick=process.argv.includes('--quick');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if(!path.startsWith(root+'\\'))throw Error('path');
    const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'};
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
console.log('QA server',port);
const profile=await mkdtemp(resolve(tmpdir(),'rhythmake-polish-'));
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=9252','--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','inherit'],windowsHide:true});
browser.on('error',error=>console.error('Chrome launch',error));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try{
  let pages;
  for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9252/json/list',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await delay(100);}}
  assert.ok(pages,'Chrome debugging endpoint');
  console.log('Chrome connected');
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await Promise.race([new Promise(r=>socket.addEventListener('open',r,{once:true})),delay(10000).then(()=>{throw Error('CDP connection timeout');})]);
  let serial=0;const requests=new Map(),errors=[],warnings=[];
  socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))warnings.push(m.params.args.map(a=>a.description??a.value).join(' '));if(m.id){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(method+' timeout')),30000);requests.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('rhythmake_volume_setup_done_v1','1');"});
  await call('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  console.log('Page navigated');
  for(let i=0;i<120;i++){if(await evaluate('!!window.MusicToyFactory?.create'))break;await delay(500);}
  const seed=await evaluate(`(async()=>{
    const p=window.MusicToyFactory.create('drawgrid',{centerX:600,centerY:400,instrument:'RETRO TRIANGLE',autoCenter:false});
    await new Promise(r=>setTimeout(r,800));p.dataset.musicalRole='melody';p.dispatchEvent(new CustomEvent('toy:role',{bubbles:true}));
    p.dispatchEvent(new CustomEvent('toy-random',{bubbles:true}));await new Promise(r=>setTimeout(r,100));
    (await import('./src/instrument-state.js')).applyToyInstrument(p,'RETRO TRIANGLE');
    const audio=await import('./src/audio-core.js');audio.setToyVolume(p.__audioToyId,.37);
    window.__authoredFirst=p.id;window.__authoredState=p.__drawToy.getState();
    document.dispatchEvent(new CustomEvent('arrange:request'));return {id:p.id,state:window.__authoredState,instrument:p.dataset.instrument};
  })()`);
  for(let i=0;i<100;i++){const s=await evaluate("document.querySelector('.arrangement-result [role=status]')?.textContent");if(s==='Arrangement ready')break;if(s&&!s.startsWith('Arranging'))throw Error(s);await delay(200);}
  await evaluate(`Array.from(document.querySelectorAll('.arrangement-actions button')).find(b=>b.textContent==='Edit Arrangement').click()`);
  await delay(1800);
  const overview=await evaluate(`(async()=>{
    const {connectionModel:m}=await import('./src/connections.js');
    const panels=[...document.querySelectorAll('.toy-panel')].filter(p=>['drawgrid','loopgrid'].includes(p.dataset.toy));
    return {zoom:window.__userBoardZoom,rects:panels.map(p=>{const r=p.getBoundingClientRect();return {id:p.id,left:r.left,top:r.top,right:r.right,bottom:r.bottom};}),width:innerWidth,height:innerHeight};
  })()`);
  for(const r of overview.rects)assert.ok(r.left>=0&&r.top>=0&&r.right<=overview.width&&r.bottom<=overview.height,'Arrangement card outside overview: '+JSON.stringify(r));
  const overviewImage=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,'overview.png'),Buffer.from(overviewImage.data,'base64'));
  const phrase=await evaluate(`(async()=>{
    const {structureToyModel:s}=await import('./src/structure-toys.js'),{connectionModel:m}=await import('./src/connections.js');
    const family=s.list().filter(q=>q.autoArrangePhrase),canonical=family.find(q=>!q.masterStructureId);
    const children=q=>m.list('sequence').filter(e=>e.from.objectId===q.id).sort((a,b)=>Number(a.from.portId.split(':')[1])-Number(b.from.portId.split(':')[1])).map(e=>document.getElementById(e.to.objectId));
    const rows=family.map(q=>children(q).map(p=>({id:p.id,master:p.dataset.masterToyId,x:parseFloat(p.style.left),y:parseFloat(p.style.top)})));
    if(family.some(q=>!m.getParent(q.id)))throw Error('Disconnected phrase source');
    for(const q of family)for(const p of children(q))if(p.dataset.instrument!=='RETRO TRIANGLE')throw Error('Inconsistent initial phrase instrument: '+p.dataset.instrument);
    const orphans=[...document.querySelectorAll('.toy-panel')].filter(p=>['loopgrid','drawgrid'].includes(p.dataset.toy)&&!m.getParent(p.id));
    if(orphans.length)throw Error('Disconnected source bank: '+orphans.map(p=>p.id));
    const a=children(canonical)[2],b=children(family.find(q=>q.masterStructureId))[2];
    const before=JSON.stringify(a.__drawToy.getState().nodes),positions=[a.style.cssText,b.style.cssText],edges=JSON.stringify(m.list());
    a.dispatchEvent(new CustomEvent('toy-random-notes',{bubbles:true}));await new Promise(r=>setTimeout(r,400));
    return {firstBefore:window.__authoredState,firstAfter:document.getElementById(window.__authoredFirst).__drawToy.getState(),rows,sourceIds:children(canonical).map(p=>p.id),firstPreserved:JSON.stringify(document.getElementById(window.__authoredFirst).__drawToy.getState().nodes)===JSON.stringify(window.__authoredState.nodes),
      edited:before!==JSON.stringify(a.__drawToy.getState().nodes),propagated:JSON.stringify(a.__drawToy.getState().nodes)===JSON.stringify(b.__drawToy.getState().nodes),positionsUnchanged:positions[0]===a.style.cssText&&positions[1]===b.style.cssText,edgesUnchanged:edges===JSON.stringify(m.list())};
  })()`);
  await writeFile(resolve(output,'phrase.json'),JSON.stringify(phrase,null,2));
  assert.equal(phrase.rows.length,2);assert.equal(phrase.sourceIds[0],seed.id);assert.ok(phrase.firstPreserved);assert.ok(phrase.edited&&phrase.propagated);assert.ok(phrase.edgesUnchanged);assert.ok(phrase.positionsUnchanged);
  for(const row of phrase.rows){assert.equal(row.length,4);for(let i=1;i<4;i++){assert.ok(row[i].x>row[i-1].x);assert.equal(row[i].y,row[0].y);}}
  console.log('Authored four-chunk phrase and linked edit passed');
  const zoom=await evaluate(`(async()=>{
    window.__setBoardViewportNow(.01,0,0);await new Promise(r=>setTimeout(r,200));
    const state=(await import('./src/zoom/ZoomCoordinator.js')).getZoomState();
    return {state,transform:document.getElementById('board')?.style.transform};
  })()`);
  assert.equal(zoom.state.userBoardZoom,.15);
  assert.ok(Math.abs(zoom.state.effectiveScale-.15*zoom.state.responsiveBaseScale)<1e-8);
  console.log('Extreme zoom',JSON.stringify(zoom));
  const toys=await evaluate(`(async()=>{
    const b=window.MusicToyFactory.create('bouncer',{centerX:400,centerY:600,autoCenter:false,instrument:'tone'});
    const r=window.MusicToyFactory.create('rippler',{centerX:1000,centerY:600,autoCenter:false,instrument:'tone'});
    await new Promise(done=>setTimeout(done,800));
    const bs=b.__getBouncerSnapshot();bs.lastLaunch={x:100,y:200,vx:100,vy:0};bs.loopRec={mode:'replay',pattern:[{offsetTick:0,note:'C4',blockIndex:0},{offsetTick:192,note:'G4',blockIndex:1}],trajectory:[{offsetTick:0,x:100,y:200,r:7},{offsetTick:383,x:200,y:200,r:7}],signature:''};
    bs.blocks.forEach((q,i)=>q.active=i<2);b.__applyBouncerSnapshot(bs);
    const actual=b.__getBouncerSnapshot(),parts=[];actual.blocks.forEach((q,i)=>parts.push(i,Math.round(q.x),Math.round(q.y),Math.round(q.w||36),Math.round(q.h||36),q.active?1:0,q.noteIndex|0));
    actual.edges.forEach((q,i)=>parts.push('edge',i,q.edge,Math.round(q.x),Math.round(q.y),q.active?1:0,q.noteIndex|0));const l=actual.lastLaunch;parts.push('launch',Math.round(l.x),Math.round(l.y),Math.round(l.vx*100),Math.round(l.vy*100));b.__bouncerPlaybackState().signature=parts.join(',');
    const rs=r.__getRipplerSnapshot();rs.instrument='tone';rs.generator={nx:.4,ny:.5,placed:true};rs.blocks.forEach((q,i)=>q.active=i<2);rs.steps=Array.from({length:8},()=>[]);rs.steps[0]=[{idx:0,offsetTick:0}];rs.steps[4]=[{idx:1,offsetTick:192}];r.__applyRipplerSnapshot(rs);
    const bc=window.MusicToyFactory.createInstance(b,{ui:{left:'1800px',top:'600px'}}),rc=window.MusicToyFactory.createInstance(r,{ui:{left:'2500px',top:'600px'}});
    await new Promise(done=>setTimeout(done,600));
    window.__replayIds=[b.id,r.id,bc.id,rc.id];window.__replayCounts={scheduled:[],audio:[],visual:[],rings:[]};
    for(const p of [b,r,bc,rc]){
      p.addEventListener('toy:playback-visual',e=>window.__replayCounts.visual.push(e.detail));
      p.addEventListener('rippler:ring-initiated',e=>window.__replayCounts.rings.push(e.detail));
    }
    window.__PLAYBACK_EVENT_DEBUG=true;window.addEventListener('playback:scheduled',e=>{if(window.__replayIds.includes(e.detail.toyId)&&!e.detail.eventKey.includes(':impact:'))window.__replayCounts.scheduled.push(e.detail);});
    window.addEventListener('toy:note',e=>{if(window.__replayIds.includes(e.detail.toyId))window.__replayCounts.audio.push(e.detail);});
    window.Heartbeats.transport().setBpm(200);await window.Heartbeats.transport().play();return {bouncer:b.id,rippler:r.id,bouncerCopy:bc.id,ripplerCopy:rc.id};
  })()`);
  for(let i=0;i<6;i++){
    await evaluate(`(async()=>{const z=await import('./src/zoom/ZoomCoordinator.js');z.setGestureTransform({scale:${[.15,1,.7][i%3]},x:0,y:0});z.commitGesture({scale:${[.15,1,.7][i%3]},x:0,y:0});window.Heartbeats.transport().setBpm(${i%2?200:140});})()`);
    await call('Emulation.setDeviceMetricsOverride',{width:i%2?1280:960,height:800,deviceScaleFactor:i%2?1:2,mobile:false});await delay(400);
  }
  const resets=await evaluate(`(async()=>{const t=window.Heartbeats.transport();t.pause();t.returnToStart();const paused=t.getState();const visualOrigins={bouncer:document.getElementById(window.__replayIds[0]).__getBouncerReplayPosition(),bouncerCopy:document.getElementById(window.__replayIds[2]).__getBouncerReplayPosition(),rippler:document.getElementById(window.__replayIds[1]).__getRipplerPlaybackVisualState(),ripplerCopy:document.getElementById(window.__replayIds[3]).__getRipplerPlaybackVisualState()};await t.play();await new Promise(r=>setTimeout(r,400));t.returnToStart();const playing=t.getState();t.setBpm(200);window.__replayCounts={scheduled:[],audio:[],visual:[],rings:[]};return {paused,playing,visualOrigins,windowStartAudioTime:t.tickToAudioTime(384)};})()`);
  assert.equal(resets.visualOrigins.bouncer.x,100);assert.equal(resets.visualOrigins.bouncerCopy.x,100);assert.equal(resets.visualOrigins.rippler.rings,0);assert.equal(resets.visualOrigins.ripplerCopy.rings,0);assert.equal(resets.paused.currentTick,0);assert.equal(resets.paused.state,'paused');assert.equal(resets.playing.mapping.originTick,0);assert.equal(resets.playing.state,'playing');
  const duration=quick?5000:62000;
  for(let elapsed=0;elapsed<duration;elapsed+=1000){await delay(1000);if(elapsed%6000===0){await evaluate(`(async()=>{const z=await import('./src/zoom/ZoomCoordinator.js');z.setGestureTransform({scale:${elapsed%12000?.15:1},x:0,y:0});z.commitGesture({scale:${elapsed%12000?.15:1},x:0,y:0});})()`);await call('Emulation.setDeviceMetricsOverride',{width:elapsed%12000?960:1280,height:800,deviceScaleFactor:elapsed%12000?2:1,mobile:false});}}
  await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false});
  const displayRows=phrase.rows,xs=displayRows.flatMap(row=>row.map(p=>p.x)),ys=displayRows.flatMap(row=>row.map(p=>p.y));
  await evaluate(`document.querySelector('.arrangement-result').hidden=true;window.centerBoardOnWorldPoint?.(${(Math.min(...xs)+Math.max(...xs)+800)/2},${(Math.min(...ys)+Math.max(...ys)+480)/2},.2,{duration:500})`);
  await delay(600);
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,quick?'quick.png':'stress.png'),Buffer.from(shot.data,'base64'));
  const replay=await evaluate(`(async()=>{const t=window.Heartbeats.transport(),tick=t.currentTick;const {ensureAudioContext}=await import('./src/audio-core.js');const audioTime=ensureAudioContext().currentTime;
    const counts=window.__replayCounts;t.pause();return {counts,tick,audioTime,bouncer:document.getElementById(window.__replayIds[0]).__getBouncerSnapshot(),states:window.__replayIds.map(id=>{const p=document.getElementById(id);return {id,record:p.__getBouncerSnapshot?.(),hasEvents:p.__ripplerHasRecordedEvents,chain:p.dataset.chainActive};})};})()`);
  await writeFile(resolve(output,'replay.json'),JSON.stringify({toys,resets,replay,warnings},null,2));
  const countSummary={};
  for(const id of Object.values(toys)){
    const audio=replay.counts.audio.filter(e=>e.toyId===id&&e.when>=resets.windowStartAudioTime&&e.when<replay.audioTime-.05);
    const visual=replay.counts.visual.filter(e=>e.toyId===id&&e.when>=resets.windowStartAudioTime&&e.when<replay.audioTime-.05);
    const key=e=>JSON.stringify([e.toyId,e.occurrenceId??e.occurrence?.occurrenceId,e.when,e.note]);
    assert.deepEqual(visual.map(key).sort(),audio.map(key).sort());
    const scheduled=replay.counts.scheduled.filter(e=>e.toyId===id&&e.when>=resets.windowStartAudioTime&&e.when<replay.audioTime-.05);
    countSummary[id]={scheduled:scheduled.length,audio:audio.length,visual:visual.length};assert.equal(scheduled.length,audio.length);
    assert.ok(audio.length>=(quick?4:40),id+' audio='+audio.length);
    if([toys.rippler,toys.ripplerCopy].includes(id)){const rings=replay.counts.rings.filter(e=>e.toyId===id&&e.when>=resets.windowStartAudioTime&&e.when<replay.audioTime-.05);assert.equal(rings.length,audio.length);countSummary[id].rings=rings.length;}
  }
  assert.equal(replay.bouncer.loopRec.mode,'replay');console.log('Long-run playback',JSON.stringify(countSummary));
  await evaluate(`document.dispatchEvent(new CustomEvent('arrange:request'))`);await delay(1000);
  const reload=await evaluate(`(async()=>{const before=window.Persistence.getSnapshot();await window.Persistence.applySnapshot(before);await new Promise(r=>setTimeout(r,1200));return {before,after:window.Persistence.getSnapshot()};})()`);
  const saved=s=>({toys:s.toys.map(p=>({id:p.id,master:p.masterToyId,nodes:p.state?.nodes,loopRec:p.state?.loopRec,steps:p.state?.steps})).sort((a,b)=>a.id.localeCompare(b.id)),phrases:s.structureToys.filter(q=>q.autoArrangePhrase).map(q=>({id:q.id,sharedChildren:q.sharedChildren})).sort((a,b)=>a.id.localeCompare(b.id))});
  assert.deepEqual(saved(reload.after),saved(reload.before));
  assert.equal(reload.after.structureToys.filter(q=>q.autoArrangePhrase).length,2);
  const ownership=await evaluate(`(async()=>{
    window.Heartbeats.transport().pause();
    const {structureToyModel:s}=await import('./src/structure-toys.js'),{connectionModel:m}=await import('./src/connections.js');
    const root=s.list().find(q=>q.autoArrange?.root),fixture=window.Persistence.getSnapshot();
    const family=s.list().filter(q=>q.autoArrangePhrase),children=q=>m.list('sequence').filter(e=>e.from.objectId===q.id).sort((a,b)=>a.from.portId.localeCompare(b.from.portId)).map(e=>document.getElementById(e.to.objectId));
    const a=children(family.find(q=>!q.masterStructureId)),b=children(family.find(q=>q.masterStructureId));
    const instruments=a.map(p=>p.dataset.instrument);
    (await import('./src/instrument-state.js')).applyToyInstrument(a[2],'PIANO');await new Promise(r=>setTimeout(r,400));
    if(b[2].dataset.instrument!=='PIANO'||a.some((p,i)=>i!==2&&p.dataset.instrument!==instruments[i]))throw Error('Chunk instrument edit escaped its definition');
    const header=a[2].querySelector('.toy-header');
    // Synthetic pointer ids have no native capture; exercise the app's tap
    // handlers while leaving native capture to separate real-input QA.
    const capture=a[2].setPointerCapture,release=a[2].releasePointerCapture;
    a[2].setPointerCapture=()=>{};a[2].releasePointerCapture=()=>{};
    header.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:37,clientX:20,clientY:20}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:37,clientX:20,clientY:20}));
    a[2].setPointerCapture=capture;a[2].releasePointerCapture=release;
    const reveal={marker:!!header.querySelector('.linked-copy-marker'),tethers:document.querySelectorAll('.relationship-tethers path').length,flashes:document.querySelectorAll('.relationship-flash').length};
    if(!reveal.marker||!reveal.tethers||reveal.flashes<2)throw Error('Missing linked relationship reveal: '+JSON.stringify(reveal));
    const deleted=a[0].id,definition=a[0].dataset.sharedDefinitionId,notes=JSON.stringify(b[0].__drawToy.getState().nodes);
    window.MusicToyFactory.destroy(a[0],{allowOffBoard:true});await new Promise(r=>setTimeout(r,300));
    if(document.getElementById(deleted)||b[0].dataset.sharedDefinitionId!==definition||JSON.stringify(b[0].__drawToy.getState().nodes)!==notes)throw Error('First chunk deletion lost shared definition');
    const accomp=document.getElementById(root.autoArrange.sourceIds.accompaniment),accompDef=accomp.dataset.sharedDefinitionId;
    window.MusicToyFactory.destroy(accomp,{allowOffBoard:true});await new Promise(r=>setTimeout(r,300));
    const peers=[...document.querySelectorAll('.toy-panel')].filter(p=>p.dataset.sharedDefinitionId===accompDef);
    if(peers.length!==3||peers.some(p=>!m.getParent(p.id)))throw Error('First accompaniment deletion damaged peers');
    const reduced=window.Persistence.getSnapshot();await window.Persistence.applySnapshot(reduced);await new Promise(r=>setTimeout(r,800));
    if(document.getElementById(deleted))throw Error('Reload resurrected deleted view');
    await window.Persistence.applySnapshot(fixture);await new Promise(r=>setTimeout(r,800));
    return {reveal,deleted,remainingAccompaniment:peers.length};
  })()`);
  console.log('Instrument scope, relationship reveal and first-view deletion passed',JSON.stringify(ownership));
  const persisted=await evaluate(`(async()=>{window.__setBoardViewportNow(.15,100,50);await new Promise(r=>setTimeout(r,300));window.Persistence.flushAutosaveNow();return {ids:window.Persistence.getSnapshot().toys.map(p=>p.id).sort(),zoom:JSON.parse(localStorage.getItem('boardViewport')).scale};})()`);
  await call('Page.reload');await delay(2500);
  const pageReload=await evaluate(`({ids:window.Persistence.getSnapshot().toys.map(p=>p.id).sort(),zoom:window.__userBoardZoom})`);
  assert.deepEqual(pageReload.ids,persisted.ids);assert.equal(pageReload.zoom,.15);
  await writeFile(resolve(output,quick?'quick-scene.json':'scene.json'),JSON.stringify(reload.after,null,2));
  await writeFile(resolve(output,quick?'quick-report.json':'report.json'),JSON.stringify({seed,phrase,overview,zoom,ownership,pageReload,toys,resets,countSummary,tick:replay.tick,cycles:replay.tick/384,errors},null,2));
  assert.deepEqual(errors,[]);console.log('Regeneration, reload and browser errors passed');
}finally{socket?.close();browser.kill();server.close();}
