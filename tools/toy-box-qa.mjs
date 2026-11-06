// Real Chromium smoke checks and screenshots. Run: node tools/toy-box-qa.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'artifacts/toy-box');fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 let file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 fs.readFile(file,(error,data)=>{res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.writeHead(error?404:200).end(error?'missing':data);});
});
await new Promise(r=>server.listen(9194,'127.0.0.1',r));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=9238','--user-data-dir='+path.join(process.env.TEMP,'rhythmake-toy-box-qa-'+process.pid),'about:blank'],{stdio:'ignore'});
let ws,serial=0;const pending=new Map(),errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,v=>v.error?reject(Error(JSON.stringify(v.error))):resolve(v.result));ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function check(expression){assert.equal(await evaluate(expression),true,expression);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function size(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
const click=type=>evaluate(`document.querySelector('.toy-box-item[data-toy-type="${type}"]').click()`);
async function pointer(type,x,y){await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});}
try{
 let target;for(let i=0;i<80;i++){try{target=(await(await fetch('http://127.0.0.1:9238/json')).json()).find(p=>p.type==='page');if(target)break;}catch{}await sleep(200);}
 assert.ok(target,'Chrome starts');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 ws.onmessage=e=>{const v=JSON.parse(e.data);if(v.id){pending.get(v.id)?.(v);pending.delete(v.id);}if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails.text+': '+v.params.exceptionDetails.exception?.description);};
 await send('Runtime.enable');await send('Page.enable');await size(1440,900);
 await send('Page.navigate',{url:'http://127.0.0.1:9194/?preset=simple-playtest'});
 let ready=false;for(let i=0;i<160;i++){ready=await evaluate(`document.querySelectorAll('.toy-box-item[data-toy-type]').length===9 && !!window.BouncerBoard`);if(ready)break;await sleep(250);}
 if(!ready){console.log('Load failure',errors,await evaluate(`({title:document.title,text:document.body.innerText.slice(0,500),cards:document.querySelectorAll('.toy-box-item').length})`));await shot('load-failure');}assert.ok(ready,'app loads');
 await sleep(800);
 await evaluate(`document.querySelector('.volume-setup-ok')?.click()`);await sleep(300);
 await check(`getComputedStyle(document.querySelector('.simple-music-grouped')).position==='fixed'`);
 await check(`getComputedStyle(document.querySelector('.simple-music-grouped')).display!=='none'`);
 await check(`getComputedStyle(document.querySelector('.simple-creation-items')).gridTemplateColumns.split(' ').length===3`);
 await check(`document.querySelectorAll('.toy-preview').length===9`);
 await check(`[...document.querySelectorAll('.simple-creation-items')].every(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===3)`);
 await check(`getComputedStyle(document.querySelector('.preview-ball')).animationName==='toy-ball'`);
 await check(`getComputedStyle(document.querySelector('.toy-spawner-toggle')).display==='none'`);
 await shot('desktop');
 await click('physical-ball');await check(`window.BouncerBoard.activeMode==='ball'`);
 await check(`document.querySelector('[data-toy-type="physical-ball"]').getAttribute('aria-pressed')==='true'`);
 await pointer('mousePressed',500,400);await pointer('mouseMoved',610,420);await pointer('mouseReleased',610,420);
 await click('simple-ripple');await check(`!window.BouncerBoard.activeMode&&document.body.classList.contains('simple-ripple-armed')`);
 await pointer('mousePressed',600,450);await pointer('mouseReleased',600,450);
 await click('simple-draw');await check(`document.body.classList.contains('simple-draw-creating')`);
 await click('simple-string');await check(`!document.body.classList.contains('simple-draw-creating')&&document.body.classList.contains('string-surface-creating')`);
 await click('simple-strum');await shot('strum-selected');
 await click('physical-cube');
 await check(`document.querySelector('.shape-palette').getBoundingClientRect().right<document.querySelector('.simple-music-grouped').getBoundingClientRect().left`);
 await check(`getComputedStyle(document.querySelector('.shape-choices')).gridTemplateColumns.split(' ').length===3`);
 await check(`document.querySelectorAll('.shape-choice').length===6`);
 const choose=shape=>evaluate(`document.querySelector('.shape-choice[data-shape-type="${shape}"]').click()`);
 const place=async(x,y)=>{await pointer('mousePressed',x,y);await pointer('mouseReleased',x,y);await sleep(100);};
 const count=shape=>evaluate(`document.querySelectorAll('.physical-cube[data-shape-type="${shape}"]').length`);
 await choose('cube');await check(`!!document.querySelector('.shape-palette')&&window.BouncerBoard.activeShapeType==='cube'`);
 const beforeCubes=await count('cube');
 for(const [x,y] of [[300,650],[440,650],[580,650]])await place(x,y);
 assert.equal(await count('cube'),beforeCubes+3);
 await choose('circle');await check(`!!document.querySelector('.shape-palette')&&window.BouncerBoard.activeShapeType==='circle'`);
 for(const [x,y] of [[300,740],[440,740]])await place(x,y);
 assert.equal(await count('circle'),2);
 await choose('circle');await check(`!!document.querySelector('.shape-palette')&&!window.BouncerBoard.activeMode&&document.querySelectorAll('.shape-choice[aria-pressed="true"]').length===0`);
 await place(300,570);assert.equal(await count('circle'),2);
 await shot('no-active-shape');
 await choose('triangle');await click('physical-cube');
 await check(`!document.querySelector('.shape-palette')&&window.BouncerBoard.activeShapeType==='triangle'`);
 await place(580,740);assert.equal(await count('triangle'),1);
 await click('physical-cube');await check(`document.querySelector('.shape-choice[data-shape-type="triangle"]').getAttribute('aria-pressed')==='true'`);
 await shot('shape-choices');
 for(const [shape,x,y] of [['diamond',300,570],['hexagon',440,570],['star',580,570]]){await choose(shape);await place(x,y);assert.equal(await count(shape),1);}
 await shot('all-shapes');
 await click('simple-ripple');await check(`!document.querySelector('.shape-palette')&&!window.BouncerBoard.activeMode&&document.body.classList.contains('simple-ripple-armed')`);
 await click('physical-cube');await choose('star');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await check(`!window.BouncerBoard.activeMode&&!document.querySelector('.shape-palette')`);
 // Exercise Ball, Gravity Ball and Ripple against each real placed receiver in Chromium.
 const triggerResults=await evaluate(`(async()=>{
  const {simulateThrow}=await import('./src/simple-bouncer-physics.js');
  const {boardCollisionBody}=await import('./src/board-collision-body.js');
  const {createRippleObjects,createSimpleRippleController}=await import('./src/simple-ripple.js');
  const shapes=window.BoardObjects.list().filter(o=>o.kind==='cube'),results=[];
  for(const shapeType of ['cube','circle','triangle','diamond','hexagon','star']){
   const shape=shapes.find(o=>o.authoredState.shapeType===shapeType),body=boardCollisionBody(shape),hits=[];
   for(const ballMode of ['normal','gravity']){
    const capture=simulateThrow({cubes:[body],launch:{x:body.x-180,y:body.y-(ballMode==='gravity'?15:0),vx:840,vy:0},ballMode});
    if(!capture.collisions.length||capture.collisions[0].sourceMidi!==shape.capabilities.pitchSource.midi)throw Error(shapeType+' '+ballMode+' collision/pitch failed');
    hits.push(ballMode);
   }
   const objects=createRippleObjects(),emitter=objects.create({x:body.x-150,y:body.y,instrument:'PIANO'}),events=[];
   const controller=createSimpleRippleController({objects,getReceivers:()=>[shape],getClock:()=>({audioTime:0,currentTick:0,bpm:120}),schedule:e=>events.push(e)});
   controller.emit(emitter.id);controller.destroy();
   if(events.length!==1||events[0].sourceMidi!==shape.capabilities.pitchSource.midi||events[0].instrument!=='PIANO')throw Error(shapeType+' Ripple semantics failed');
   results.push({shapeType,triggers:[...hits,'ripple'],pitch:shape.capabilities.pitchSource.midi});
  }
  const {boardPhysicalObjects}=await import('./src/board-physical-objects.js');
  const snapshot=JSON.parse(JSON.stringify(boardPhysicalObjects.authoredSnapshot()));
  boardPhysicalObjects.restore(snapshot);
  if(JSON.stringify(boardPhysicalObjects.authoredSnapshot())!==JSON.stringify(snapshot))throw Error('Shape save roundtrip failed');
  return results;
 })()`);
 fs.writeFileSync(path.join(out,'shape-trigger-results.json'),JSON.stringify(triggerResults,null,2));
 await click('physical-ball');await click('physical-ball');await check(`!window.BouncerBoard.activeMode`);
 await evaluate(`document.querySelector('#paint-palette .palette-handle').click()`);
 await evaluate(`document.querySelector('.palette-well').click()`);
 await check(`document.body.classList.contains('palette-equipped')`);
 await click('physical-ball');await check(`!document.body.classList.contains('palette-equipped')&&window.BouncerBoard.activeMode==='ball'`);
 await evaluate(`document.querySelector('.palette-well').click()`);await check(`!window.BouncerBoard.activeMode`);
 for(const [w,h] of [[1024,768],[768,700],[390,844]]){
  await size(w,h);await sleep(100);
  await check(`(()=>{const a=document.querySelector('#paint-palette').getBoundingClientRect(),b=document.querySelector('.simple-music-grouped').getBoundingClientRect();return a.right<b.left&&b.right<=innerWidth&&b.bottom<=innerHeight})()`);
  await click('physical-cube');
  await check(`document.querySelector('.shape-palette').getBoundingClientRect().left>=0`);
  await shot('width-'+w);await click('physical-cube');
 }
 await click('physical-cube');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await check(`[...document.querySelectorAll('.toy-preview *')].every(e=>getComputedStyle(e).animationName==='none')`);await shot('reduced-motion');
 await size(1440,900);
 await evaluate(`document.querySelector('.toy-box-header').click()`);
 await check(`getComputedStyle(document.querySelector('.simple-music-grouped .toy-spawner-list')).display==='none'`);
 await evaluate(`window.Persistence.markDirty();window.Persistence.flushBeforeRefresh()`);
 await send('Page.navigate',{url:'http://127.0.0.1:9194/'});
 for(let i=0;i<160;i++){if(await evaluate(`!!window.BouncerBoard&&document.querySelectorAll('.toy-box-item[data-toy-type]').length===9`))break;await sleep(250);}
 await evaluate(`document.querySelector('.volume-setup-ok')?.click()`);
 await check(`['cube','circle','triangle','diamond','hexagon','star'].every(shapeType=>window.BoardObjects.list().some(o=>o.kind==='cube'&&o.authoredState.shapeType===shapeType))`);
 await evaluate(`import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('advanced'))`);
 await check(`!document.querySelector('.simple-music-grouped')&&!document.querySelector('.toy-preview')`);
 await check(`getComputedStyle(document.querySelector('.toy-spawner-toggle')).display!=='none'`);
 await evaluate(`import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('simple'))`);
 await check(`document.querySelectorAll('.toy-box-item[data-toy-type]').length===9`);
 await evaluate(`document.querySelector('.toy-spawner-art').click();window.ToySpawner.close()`);
 await check(`!!document.querySelector('.simple-music-grouped')`);
 assert.deepEqual(errors,[],'No uncaught browser errors');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks:'persistent six-shape chooser, exact repeated-placement/switch/deselect/reopen flow, six geometry save roundtrips, Ball/Gravity/Ripple trigger matrix, preset, Advanced isolation, paint coordination, responsive widths, reduced motion',errors},null,2));
 console.log('PASS: Toy Box browser checks; screenshots in artifacts/toy-box');
}finally{
 if(ws?.readyState===1){await Promise.race([send('Browser.close').catch(()=>{}),sleep(1500)]);ws.close();}else chrome.kill();
 server.closeAllConnections();server.close();
}
