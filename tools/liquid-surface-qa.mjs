// Developer-only real Chromium QA. Uses Node's built-in CDP WebSocket client.
// Run from the repo root: node tools/liquid-surface-qa.mjs [tests|compare|baseline|benchmark]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';

const mode=process.argv[2]||'tests',root=process.cwd(),optics=mode.startsWith('optics'),depth=mode.startsWith('depth'),out=path.join(root,depth?'artifacts/liquid-depth':optics?'artifacts/liquid-optics':'artifacts/liquid-audit');
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const servers=[];let ws,chrome;
for(const [port,baseline] of [[9191,false],[9192,true]]){
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname);
  let file=path.join(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(baseline&&relative.startsWith('/src/simple-paint/presentation/fluid/')){
   const saved=path.join(root,depth?'artifacts/liquid-depth-baseline':optics?'artifacts/liquid-optics-baseline':'artifacts/liquid-audit-baseline',path.basename(file));
   if(fs.existsSync(saved))file=saved;
  }
  fs.readFile(file,(error,data)=>{
   res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
   res.writeHead(error?404:200).end(error?'missing':data);
  });
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));servers.push(server);
}
let serial=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{
 const id=++serial,timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},300000);
 pending.set(id,value=>{clearTimeout(timeout);value.error?reject(Error(JSON.stringify(value.error))):resolve(value.result);});
 ws.send(JSON.stringify({id,method,params}));
});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function navigate(url,ready){await send('Page.navigate',{url});for(let i=0;i<2400;i++){if(await evaluate(ready))return;await sleep(250);}throw Error('Page not ready: '+url);}
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.data,'base64'));}
try{
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless','--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle='+(process.env.FLUID_ANGLE||'d3d11'),'--enable-unsafe-swiftshader',
  '--remote-debugging-port=9236','--window-size=1520,980','--user-data-dir='+path.join(out,'chrome-profile'), 'about:blank'
 ],{stdio:'ignore'});
 let target;
 for(let i=0;i<80;i++){try{target=(await(await fetch('http://127.0.0.1:9236/json')).json()).find(p=>p.type==='page');if(target)break;}catch{}await sleep(200);}
 if(!target)throw Error('Chrome debug endpoint unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
 ws.onmessage=event=>{const value=JSON.parse(event.data);if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}};
 if(mode==='depth'||mode==='depth-before'){
  const baseline=mode==='depth-before',prefix=baseline?'before-':'';
  await navigate('http://127.0.0.1:'+(baseline?9192:9191)+'/experiments/simple-paint-fluid/index.html',"window.paintComparisonQA?.ready()");
  const results=[];
  for(const background of ['grid','art']){
   const held=await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'press',background,hold:true})})`);results.push(held);await screenshot(prefix+background+'-press-hold');console.log(prefix+background,'hold');
   for(const name of (baseline?['press']:['press','slow','fast','loop']))for(const after of [0,500,1000,2000,4000,6000]){
    const result=await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name,after,background})})`);results.push(result);const label=prefix+background+'-'+name+'-'+after+'ms';await screenshot(label);console.log(label);
   }
   if(!baseline)for(const name of ['press','slow','loop']){await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name,background,hold:name==='press',debug:9})})`);await screenshot(background+'-'+name+'-depth');}
  }
  if(!baseline){
   for(const scale of [.5,2]){await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'slow',background:'art',scale})})`);await screenshot('art-slow-zoom-'+scale);}
   await evaluate("window.paintComparisonQA.snapshot({name:'press',background:'dark',hold:true})");await screenshot('dark-press-hold');
  }
  fs.writeFileSync(path.join(out,prefix+'comparison.json'),JSON.stringify(results,null,2));
 }else if(mode==='optics'||mode==='optics-baseline'){
  const baseline=mode==='optics-baseline',prefix=baseline?'before-':'';
  await navigate('http://127.0.0.1:'+(baseline?9192:9191)+'/experiments/simple-paint-fluid/index.html',"window.paintComparisonQA?.ready()");
  const results=[];
  for(const background of ['dark','grid','art'])for(const after of [0,500,1000,2000,4000]){
   const result=await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'longCurve',after,background})})`);
   if(result.proofs[1]?.backend!=='gpu-field')throw Error('GPU comparison fell back to Standard');
   results.push(result);const name=prefix+background+'-'+after+'ms';await screenshot(name);console.log(name);
  }
  if(!baseline){
   for(const background of ['grid','art'])for(const [label,debug] of [['height',1],['memory',2],['normals',5],['refraction',6],['edges',7],['untinted',8]]){
    await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'longCurve',after:2000,background,debug})})`);await screenshot(background+'-'+label+'-2000ms');console.log(background,label);
   }
   for(const scale of [.5,2]){await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'longCurve',after:1000,background:'art',scale})})`);await screenshot('art-zoom-'+scale);}
  }
  fs.writeFileSync(path.join(out,prefix+'comparison.json'),JSON.stringify(results,null,2));
 }else if(mode==='optics-audit'){
  for(const [version,port] of [['before',9192],['after',9191]]){
   await navigate(`http://127.0.0.1:${port}/tests/simple-paint-optics.browser.html?version=${version}`,"document.title.startsWith('PASS')||document.title.startsWith('FAIL')");
   const result=await evaluate('window.opticsAudit');fs.writeFileSync(path.join(out,version+'-audit.json'),JSON.stringify(result,null,2));console.log(version,JSON.stringify(result));
   if(Object.values(result.checks).some(value=>!value))throw Error(version+' optical audit failed');
   if(version==='after'){
    const before=JSON.parse(fs.readFileSync(path.join(out,'before-audit.json'),'utf8'));
    for(let i=0;i<result.metrics.recovery.length;i++)if(result.metrics.recovery[i].physical.hash!==before.metrics.recovery[i].physical.hash)throw Error('Optical pass changed physical field at release age '+result.metrics.recovery[i].age);
    for(const i of [2,3])for(const mode of ['dark','grid','art'])if(result.metrics.recovery[i].backgrounds[mode].contrastSum<before.metrics.recovery[i].backgrounds[mode].contrastSum*1.5)throw Error('Insufficient '+mode+' perceptual contrast gain at '+result.metrics.recovery[i].age+'s');
    console.log('Physical state hashes identical at every age; +1s/+2s composited contrast gain exceeds 1.5x on all backgrounds.');
   }
  }
 }else if(mode==='baseline-audit'){
  await navigate('http://127.0.0.1:9192/tests/simple-paint-surface-audit.browser.html',"document.title.startsWith('PASS')||document.title.startsWith('FAIL')");
  // The saved engine predates synthetic field writes and debug render modes;
  // collect its recovery/path/rotation measurements before those newer checks.
  const result=await evaluate('window.surfaceAudit');
  fs.writeFileSync(path.join(out,'before-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }else if(mode==='benchmark'||mode==='optics-benchmark'||mode==='depth-benchmark'){
  const results=[];
  for(const [version,port] of [['before',9192],['after',9191],['after-repeat',9191],['before-repeat',9192]]){
   await navigate(`http://127.0.0.1:${port}/experiments/simple-paint-fluid/benchmark.html?warmup=60&frames=120`,"document.title.startsWith('Complete')||document.title.startsWith('FAIL')");
   const result=await evaluate("document.querySelector('#result').textContent");results.push({version,result:JSON.parse(result)});console.log(version,result);
  }
  fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(results,null,2));
 }else if(mode==='compare'||mode==='baseline'){
  const baseline=mode==='baseline',prefix=baseline?'before-':'';
  await navigate('http://127.0.0.1:'+(baseline?9192:9191)+'/experiments/simple-paint-fluid/index.html',"window.paintComparisonQA?.ready()");
  const results=[];
  for(const name of (baseline?['longCurve']:['longCurve','diagonal','turn','longStraight','vertical','shallow','tightCurve','slowLong'])){
   const ages=name==='longCurve'?[0,500,1000,2000,4000]:[0];
   for(const after of ages){
    const result=await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name,after,scale:1})})`);
    if(result.proofs[1]?.backend!=='gpu-field')throw Error('GPU comparison fell back to Standard');
    results.push(result);const label=prefix+name+'-'+after+'ms';await screenshot(label);console.log(label);
   }
  }
  for(const scale of (baseline?[]:[.5,2])){const result=await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'longCurve',after:1000,scale})})`);results.push(result);await screenshot('longCurve-zoom-'+scale);console.log('zoom',scale);}
  for(const [label,debug] of (baseline?[]:[['height',1],['memory',2],['velocity',3],['domain',4],['normals',5]])){
   await evaluate(`window.paintComparisonQA.snapshot(${JSON.stringify({name:'diagonal',after:0,scale:1,debug,reference:false})})`);await screenshot('diagnostic-'+label);console.log(label);
  }
  fs.writeFileSync(path.join(out,prefix+'comparison.json'),JSON.stringify(results,null,2));
 }else{
  for(const file of (depth?['simple-paint-fluid.browser.html','simple-paint-surface-audit.browser.html','simple-paint-depth.browser.html','simple-paint-optics.browser.html']:['simple-paint-fluid.browser.html','simple-paint-surface-audit.browser.html',...(optics?['simple-paint-optics.browser.html']:[])])){
   await navigate('http://127.0.0.1:9191/tests/'+file,"document.title.startsWith('PASS')||document.title.startsWith('FAIL')");
   const result=await evaluate("document.querySelector('#result').textContent");console.log(file,result);fs.writeFileSync(path.join(out,file+'.txt'),result);
   await screenshot(file.replace('.browser.html',''));if(!result.startsWith('PASS'))throw Error(file+' failed');
  }
 }
}finally{
 if(ws?.readyState===WebSocket.OPEN){await Promise.race([send('Browser.close').catch(()=>{}),sleep(1500)]);ws.close();}
 for(const complete of pending.values())complete({error:{message:'QA browser closed'}});pending.clear();
 for(const server of servers){server.closeAllConnections();server.close();}
}
