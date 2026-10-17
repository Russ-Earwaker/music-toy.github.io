import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=resolve('.'), output=resolve('resources/debug-output/polish-qa');
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
  '--remote-debugging-port=9241','--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','inherit'],windowsHide:true});
browser.on('error',error=>console.error('Chrome launch',error));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try{
  let pages;
  for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9241/json/list',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await delay(100);}}
  assert.ok(pages,'Chrome debugging endpoint');
  console.log('Chrome connected');
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await Promise.race([new Promise(r=>socket.addEventListener('open',r,{once:true})),delay(10000).then(()=>{throw Error('CDP connection timeout');})]);
  let serial=0;const requests=new Map(),errors=[];
  socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(method+' timeout')),30000);requests.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await call('Runtime.enable');await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('rhythmake_volume_setup_done_v1','1');"});
  await call('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  console.log('Page navigated');
  for(let i=0;i<120;i++){if(await evaluate('!!window.MusicToyFactory?.create'))break;await delay(500);}
  await evaluate(`(async()=>{
    const p=window.MusicToyFactory.create('loopgrid',{x:400,y:400});
    p.dataset.musicalRole='percussion';
    await new Promise(r=>setTimeout(r,1000));
    document.dispatchEvent(new CustomEvent('arrange:request'));
  })()`);
  for(let i=0;i<120;i++){const text=await evaluate("document.querySelector('.arrangement-result [role=status]')?.textContent");if(text==='Arrangement ready')break;if(text&&!text.startsWith('Arranging'))throw Error(text);await delay(500);}
  const setup=await evaluate(`(async()=>{
    const {structureToyModel:s}=await import('./src/structure-toys.js');
    const {connectionModel:m}=await import('./src/connections.js');
    const phrases=s.list().filter(q=>q.autoArrangePhrase);
    const rows=phrases.map(q=>m.list('sequence').filter(c=>c.from.objectId===q.id).sort((a,b)=>a.from.portId.localeCompare(b.from.portId)).map(c=>{const p=document.getElementById(c.to.objectId);return {id:p.id,x:parseFloat(p.style.left),y:parseFloat(p.style.top)};}));
    window.__polishNotes=[];window.__polishFlashes=[];
    window.addEventListener('toy:note',e=>window.__polishNotes.push(e.detail));
    for(const p of document.querySelectorAll('.toy-panel[data-toy=drawgrid]'))p.addEventListener('drawgrid:playcol',e=>window.__polishFlashes.push({...e.detail,at:window.Heartbeats.transport().currentTick}));
    await window.Heartbeats.transport().play();
    return {rows,structures:s.list().map(q=>({id:q.id,name:q.name,type:q.type,autoArrangePhrase:q.autoArrangePhrase})),status:document.querySelector('.arrangement-result [role=status]').textContent};
  })()`);
  console.log('Stress scene created:',setup.rows.length,'horizontal phrases');
  assert.equal(setup.status,'Arrangement ready');assert.equal(setup.rows.length,3);
  for(const row of setup.rows){assert.equal(row.length,4);for(let i=1;i<row.length;i++){assert.ok(row[i].x>row[i-1].x);assert.equal(row[i].y,row[0].y);}}
  await evaluate(`window.centerBoardOnWorldPoint?.(${setup.rows[1][0].x+1600},${setup.rows[1][0].y+240},.3,{duration:0})`);
  for(let i=0;i<12;i++){
    await evaluate(`(async()=>{const z=await import('./src/zoom/ZoomCoordinator.js');z.setGestureTransform({scale:${[.3,1.2,.6][i%3]},x:0,y:0});z.commitGesture({scale:${[.3,1.2,.6][i%3]},x:0,y:0});window.Heartbeats.transport().setBpm(${[120,180,90][i%3]});})()`);
    await call('Emulation.setDeviceMetricsOverride',{width:i%2?1280:900,height:i%2?800:650,deviceScaleFactor:i%2?1:2,mobile:false});await delay(800);
  }
  const reset=await evaluate(`(async()=>{const t=window.Heartbeats.transport();t.pause();document.querySelector('[data-action=return-to-start]').click();const paused=t.getState();await t.play();await new Promise(r=>setTimeout(r,500));document.querySelector('[data-action=return-to-start]').click();return {paused,playing:t.getState()};})()`);
  assert.equal(reset.paused.currentTick,0);assert.equal(reset.paused.state,'paused');
  assert.equal(reset.playing.mapping.originTick,0);assert.ok(reset.playing.currentTick<16);assert.equal(reset.playing.state,'playing');
  const transportUI=await evaluate(`(()=>{const p=document.querySelector('[data-action=toggle-play]').getBoundingClientRect(),s=document.querySelector('[data-action=return-to-start]').getBoundingClientRect();return {play:{x:p.x,y:p.y,width:p.width,height:p.height},start:{x:s.x,y:s.y,width:s.width,height:s.height},clickable:document.elementFromPoint(s.x+s.width/2,s.y+s.height/2)?.dataset.action};})()`);
  assert.equal(transportUI.clickable,'return-to-start');
  assert.ok(Math.abs(transportUI.play.x+transportUI.play.width/2-transportUI.start.x-transportUI.start.width/2)<1);
  assert.ok(transportUI.start.y>=transportUI.play.y+transportUI.play.height);
  console.log('Zoom, resize, tempo, paused/playing reset passed');
  // Several complete 16-bar loops, with actual audio admission and visual events.
  await evaluate('window.Heartbeats.transport().setBpm(200)');
  await evaluate('window.__polishNotes.length=0;window.__polishFlashes.length=0');
  for(let i=1;i<=3;i++){await delay(quick?2000:45000);console.log('Loop stress:',i*(quick?2:45),'seconds');}
  const result=await evaluate(`(async()=>{const {getPlaybackInstance}=await import('./src/playback-instances.js');const {drawGridPlaybackLoopInfo}=await import('./src/drawgrid/dg-playback-phase.js');const t=window.Heartbeats.transport();const phase=[...document.querySelectorAll('.toy-panel[data-toy=drawgrid]')].map(p=>({id:p.id,phase:drawGridPlaybackLoopInfo({currentTick:t.currentTick,barLen:240/t.bpm},getPlaybackInstance(p.id))?.phase01}));t.pause();return {phase,notes:window.__polishNotes,flashes:window.__polishFlashes,tick:t.currentTick};})()`);
  await evaluate(`window.centerBoardOnElement?.(document.getElementById('${setup.rows[1][0].id}'),.4,{duration:0})`);
  await delay(300);
  const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,'stress.png'),Buffer.from(screenshot.data,'base64'));
  const report={setup,reset,result,errors};await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  const snapshot=await evaluate('window.Persistence.getSnapshot()');
  await writeFile(resolve(output,'stress.scene.json'),JSON.stringify(snapshot,null,2));
  assert.ok(result.flashes.length>0);assert.deepEqual(errors,[]);
  const drawIds=new Set(result.phase.map(p=>p.id));
  const key=e=>JSON.stringify([e.toyId,e.occurrenceId??e.occurrence?.occurrenceId,e.col,e.when,e.note]);
  const admitted=new Map();
  for(const n of result.notes.filter(n=>drawIds.has(n.toyId))){const k=key(n);admitted.set(k,(admitted.get(k)||0)+1);}
  for(const flash of result.flashes){const k=key(flash);assert.ok(admitted.get(k)>0,'flash belongs to its audio admission '+k);admitted.set(k,admitted.get(k)-1);}
  assert.ok([...admitted.values()].reduce((a,b)=>a+b,0)<=4,'all committed DrawGrid notes flash (allow final pending frame)');
  const reload=await evaluate(`(async()=>{const before=window.Persistence.getSnapshot();await window.Persistence.applySnapshot(before);await new Promise(r=>setTimeout(r,1200));const after=window.Persistence.getSnapshot();return {before,after};})()`);
  const authored=s=>({toys:s.toys.map(t=>({id:t.id,masterToyId:t.masterToyId,sharedDefinitionId:t.sharedDefinitionId,nodes:t.state?.nodes,steps:t.state?.steps})).sort((a,b)=>a.id.localeCompare(b.id)),connections:[...s.connections].sort((a,b)=>a.id.localeCompare(b.id)),structures:s.structureToys.map(q=>({id:q.id,type:q.type,autoArrangePhrase:q.autoArrangePhrase,sharedChildren:q.sharedChildren})).sort((a,b)=>a.id.localeCompare(b.id))});
  assert.deepEqual(authored(reload.after),authored(reload.before));
  await writeFile(resolve(output,quick?'ui-report.json':'full-report.json'),JSON.stringify({setup,reset,transportUI,validation:{flashes:result.flashes.length,drawGridNotes:result.notes.filter(n=>drawIds.has(n.toyId)).length,finalTick:result.tick,arrangementLoops:result.tick/6144,saveReload:true,errors}},null,2));
  await unlink(resolve(output,'report.json'));
  console.log(JSON.stringify({phrases:setup.rows.length,flashes:result.flashes.length,notes:result.notes.length,tick:result.tick,errors}));
}finally{socket?.close();browser.kill();server.close();}
