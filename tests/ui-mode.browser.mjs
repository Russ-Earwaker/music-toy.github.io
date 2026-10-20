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
 assert.equal(await run('document.documentElement.dataset.uiMode'),'simple',await run('JSON.stringify({url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,250),scripts:document.scripts.length})'));
 await run("document.querySelector('.volume-setup-ok')?.click()");
 for (const width of [1920,1366,1024,768,390]) {
  for (const coarse of [false,true]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:coarse});
   await send('Emulation.setTouchEmulationEnabled',{enabled:coarse,maxTouchPoints:1});
   await new Promise(r=>setTimeout(r,150));
   const audit=await run(`(()=>{
    const group=document.querySelector('#ui-mode'),rect=group.closest('.ui-mode-chrome').getBoundingClientRect();
    const visible=n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const overlaps=[...document.querySelectorAll('#topbar button:not(.ui-mode-button),#topbar input,#topbar select,.toy-spawner-dock > button,.simple-palette-label,#guide-button,.guide-task-highlighter-text')].filter(visible).filter(n=>{const r=n.getBoundingClientRect();return rect.left<r.right&&rect.right>r.left&&rect.top<r.bottom&&rect.bottom>r.top;}).map(n=>n.getAttribute('aria-label')||n.className);
    return {visible:visible(group),inside:rect.left>=0&&rect.right<=innerWidth,overlaps,unique:document.querySelectorAll('#ui-mode').length===1&&!!group.closest('#topbar')&&!group.closest('.topbar-controls'),hits:[...group.children].every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.ui-mode-button')===n;})};
   })()`);
   assert.ok(audit.visible&&audit.inside&&audit.unique&&audit.hits&&!audit.overlaps.length,JSON.stringify({width,coarse,...audit}));
   const boardBefore=await run("JSON.stringify(document.querySelector('.board-viewport').getBoundingClientRect().toJSON())");
   for(const mode of ['advanced','simple']) {
    const point=await run(`(()=>{const r=document.querySelector('#ui-mode [data-ui-mode="${mode}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    if(coarse){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}
    assert.equal(await run('document.documentElement.dataset.uiMode'),mode);
    assert.equal(await run(`document.querySelector('#ui-mode [data-ui-mode="${mode}"]').getAttribute('aria-pressed')`),'true');
   }
   assert.equal(await run("JSON.stringify(document.querySelector('.board-viewport').getBoundingClientRect().toJSON())"),boardBefore);
   if(process.env.RHYTHMAKE_UI_QA_SCREENSHOTS && coarse && [1366,390].includes(width)) {
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(os.tmpdir(),`rhythmake-header-${width}.png`),Buffer.from(screenshot.data,'base64'));
   }
  }
  console.log('Header QA:',width,'mouse + touch passed');
 }
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await run("document.querySelector('.toy-spawner-toggle').click()");
 assert.deepEqual(await run("[...document.querySelectorAll('.toy-spawner-item')].map(n=>n.dataset.toyType)"),['simple-draw','simple-bouncer']);
 for(let i=0;i<2;i++){
  await run("document.querySelector('.toy-spawner-item').click()");
  assert.equal(await run("document.querySelector('.toy-spawner-menu').classList.contains('open')"),true);
  // Trusted board input exercises the canonical Paint creation route.
  const point=await run(`(()=>{for(let y=180;y<innerHeight-100;y+=100)for(let x=180;x<innerWidth-450;x+=180){const clear=(x,y)=>{const n=document.elementFromPoint(x,y);return n?.closest('.board-viewport')&&!n.closest('.toy-panel,.container-toy,.structure-toy,.heartbeat-toy,button');};if(clear(x,y)&&clear(x+150,y+40))return{x,y};}return null;})()`);
  assert.ok(point,'Empty board drawing space');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+150,y:point.y+40,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+150,y:point.y+40,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,700));
 }
 assert.equal(await run('window.ContainerToys.list().length'),2,await run("JSON.stringify({body:document.body.className,armed:document.body.classList.contains('simple-draw-creating'),hit:document.elementFromPoint(200,200)?.outerHTML.slice(0,300),hint:document.querySelector('.simple-draw-creation-hint')?.textContent})"));
 assert.equal(await run("[...document.querySelectorAll('[data-container-action=\"open\"]')].every(n=>getComputedStyle(n).display==='none')"),true);
 await run("document.querySelector('.toy-spawner-art').click()");
 assert.deepEqual(await run("['.toy-spawner-toggle','.toy-spawner-art'].map(s=>document.querySelector(s).getAttribute('aria-pressed'))"),['false','true']);
 const artCount=await run("document.querySelectorAll('[data-art-toy]').length");
 await run("document.querySelector('.toy-spawner-item').click()");
 assert.equal(await run("document.querySelectorAll('[data-art-toy]').length"),artCount+1);
 assert.equal(await run("document.querySelector('.toy-spawner-menu').classList.contains('open')"),true);
 await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
 assert.equal(await run("(()=>{const r=document.querySelector('.toy-spawner-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"),true);
 const change=mode=>run(`import('./src/ui-mode.js').then(({uiMode})=>uiMode.set('${mode}'))`);
 await change('advanced');
 assert.notEqual(await run("getComputedStyle(document.querySelector('.toy-spawner-logic')).display"),'none');
 assert.equal(await run("[...document.querySelectorAll('[data-container-action=\"open\"]')].every(n=>getComputedStyle(n).display!=='none')"),true);
 await run("document.querySelector('.toy-spawner-logic').click();document.querySelector('[data-toy-type=repeat]').click()");
 await run("document.querySelector('.toy-spawner-toggle').click();document.querySelector('[data-toy-type=drawgrid]').click()");
 const live=await run(`(async()=>{
  const {uiMode}=await import('./src/ui-mode.js');
  const {connectionModel:model}=await import('./src/connections.js');
  const {structureToyModel:structures}=await import('./src/structure-toys.js');
  const repeat=structures.list().find(s=>s.type==='repeat');
  const container=window.ContainerToys.list()[0];
  const {MAIN_TRANSPORT_ID}=await import('./src/transport-registry.js');
  model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:repeat.id,portId:'input'});
  model.connect('sequence',{objectId:repeat.id,portId:'child:0'},{objectId:container.id,portId:'input'});
  const transport=window.Heartbeats.transport();await transport.play();
  const mapping=JSON.stringify(transport.getState().mapping),phase=transport.heartbeatPhaseOriginTick;
  const graph=JSON.stringify(model.snapshot()),owners=JSON.stringify(window.ContainerToys.list().map(c=>c.internalObjectIds));
  const identity=[...document.querySelectorAll('.container-toy')];
  for(let i=0;i<20;i++)document.querySelector('#ui-mode [data-ui-mode="'+(i%2?'advanced':'simple')+'"]').click();
  const result={playing:transport.state==='playing',mapping:JSON.stringify(transport.getState().mapping)===mapping,phase:transport.heartbeatPhaseOriginTick===phase,graph:JSON.stringify(model.snapshot())===graph,owners:JSON.stringify(window.ContainerToys.list().map(c=>c.internalObjectIds))===owners,identity:identity.every(n=>document.getElementById(n.id)===n)};
  transport.pause();return result;
 })()`);
 assert.ok(Object.values(live).every(Boolean),JSON.stringify(live));
 await run('window.ContainerToys.open(window.ContainerToys.list()[0].id,true)');
 await change('simple');
 assert.equal(await run('window.ContainerToys.list().every(c=>!c.presentation.state.open)'),true);
 assert.equal(await run("[...document.querySelectorAll('[data-toy=drawgrid]:not([data-container-owner])')].some(n=>getComputedStyle(n).visibility!=='hidden')"),true);
 await change('advanced');
 await run("window.__ArtInternal.enter(document.querySelector('[data-art-toy]').id)");
 assert.equal(await run('window.__ArtInternal.isActive()'),true);
 await change('simple');assert.equal(await run('window.__ArtInternal.isActive()'),false);
 await change('advanced');await send('Page.reload');await new Promise(r=>setTimeout(r,1500));
 assert.equal(await run("document.querySelector('#ui-mode [aria-pressed=true]').dataset.uiMode"),'advanced');
 console.log('PASS: canonical Paint/Art creation, persistent exclusive panels, two containers, mode visibility, narrow layout, close-on-Simple and reload');
} finally {
 clearTimeout(deadline);ws?.close();browser.kill();server.closeAllConnections();server.close();
 // Chrome may still hold its profile briefly; leave the OS temp directory to OS cleanup.
}
