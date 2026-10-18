import {linePresentation,cutEnds} from './free-play-line-visual.js';
import {pointSegmentDistance,paintShapes,paintShapeContains,drawPaintShapes} from './free-play-silence.js';
import {surfacePaint,restoreSurfacePaint} from './free-play-surface-paint.js';
import {collectScenePaint,evaluateScenePaint,topPaintAt,paintOwnerAt} from './free-play-paint.js';
import {planSilenceChaos} from './free-play-chaos.js';
import {healLineCuts,wipeLinePaint} from './free-play-silence-reset.js';

export function installSilenceTools({scene,canvas,api,morphValue,status,paintStore,sceneEvents=true,getGeometry=()=>({x:0,y:0,width:canvas.clientWidth,height:canvas.clientHeight})}){
 const readPaint=paintStore?.get||surfacePaint,writePaint=paintStore?.set||restoreSurfacePaint;
 let tool='Draw',gesture=null,hover=null,serial=0,signature=null,lastPlan=null,flight=null;
 const motion=new Map(),fading=[],births=new Map(),toolbar=scene.querySelector('.free-play-tools');
 const randomButton=document.createElement('button');randomButton.textContent='⚄';randomButton.hidden=true;randomButton.className='free-play-random';
 const emptyWipe=document.createElement('button');emptyWipe.textContent='Wipe all paint';emptyWipe.hidden=true;
 function showBulkActions(){for(const button of scene.querySelectorAll('[data-silence-action]'))button.hidden=button.dataset.silenceAction!==tool;emptyWipe.hidden=tool!=='Black Paint'||!!api.lines().length;}
 for(const name of ['Draw','Scissors','Black Paint']){
  const button=document.createElement('button');button.textContent=name;button.dataset.tool=name;button.setAttribute('aria-pressed',String(name===tool));
  button.onclick=()=>{tool=name;gesture=null;canvas.dataset.tool=name;for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b===button));randomButton.hidden=name==='Draw';randomButton.setAttribute('aria-label',`Randomise ${name}`);randomButton.title=`Randomise ${name}`;showBulkActions();status.textContent={Draw:'Draw a line and let go.',Scissors:'Swipe to snip. Drag an end to its partner to mend, or tap the gap.','Black Paint':'Splat to hush. Tap a blot to remove it.'}[name];};
  toolbar.insertBefore(button,scene.querySelector('[data-reset]'));
 }
 toolbar.insertBefore(randomButton,scene.querySelector('[data-reset]'));
 toolbar.insertBefore(emptyWipe,scene.querySelector('[data-reset]'));
 const rect=getGeometry;
 const position=e=>{const r=canvas.getBoundingClientRect(),g=rect();return {x:((e.clientX-r.left)/r.width*canvas.clientWidth-g.x)/g.width,y:((e.clientY-r.top)/r.height*canvas.clientHeight-g.y)/g.height};};
 const views=()=>{const r=rect();return api.lines().map(line=>({...line,width:r.width,height:r.height,morph:morphValue(line.id,performance.now())}));};
 const nodes=line=>linePresentation(line.source,line.morph).events;
 const allPaint=()=>collectScenePaint(api.lines(),readPaint());
 function commitPaint(stamps){
  const lines=api.lines(),result=evaluateScenePaint(lines,stamps);
  writePaint(result.paint.filter(s=>!s.owner));
  for(const line of lines)api.setSilence(line.id,{paint:result.paint.filter(s=>s.owner===line.id),coveredIds:result.coveredIds});
  window.Persistence?.markDirty?.();return result;
 }
 function syncCoverage(){
  const lines=api.lines(),paint=collectScenePaint(lines,readPaint());
  const key=JSON.stringify([lines.map(l=>[l.id,l.straightened,l.source.events.map(n=>[n.id,n.x,n.y,n.offsetTick])]),paint.map(({notes,...s})=>s)]);
  if(key!==signature){signature=key;commitPaint(paint);}
 }
 function syncMotion(now){
  for(const line of api.lines())for(const event of line.source.events){
   const previous=motion.get(event.id),cut=!!event.scissorMuted;
   if(!previous)motion.set(event.id,{cut,cutAt:-1e9,mendAt:-1e9});
   else if(previous.cut!==cut)motion.set(event.id,{cut,cutAt:cut?now:previous.cutAt,mendAt:cut?-1e9:now});
  }
 }
 function snip(a,b){const r=rect();for(const line of views()){
  const cuts={};for(const n of nodes(line))if(!n.scissorMuted&&pointSegmentDistance({x:n.x*r.width,y:n.y*r.height},{x:a.x*r.width,y:a.y*r.height},{x:b.x*r.width,y:b.y*r.height})<23)cuts[n.id]=true;
  if(Object.keys(cuts).length)api.setSilence(line.id,{cuts});
 }syncMotion(performance.now());}
 function paint(p){
  const lines=api.lines(),stamp={id:`paint-${Date.now()}-${++serial}`,seed:(Date.now()+serial)>>>0,x:p.x,y:p.y,radius:.065,order:Date.now()+serial/1000,space:'surface-v2',owner:paintOwnerAt(lines,p)};
  births.set(stamp.id,performance.now());commitPaint([...allPaint(),stamp]);
 }
 function removePaint(stamp){
  fading.push({stamp,at:performance.now()});commitPaint(allPaint().filter(s=>s.id!==stamp.id));
 }
 function healAll(lineId){
  const line=api.lines().find(l=>l.id===lineId);if(!line)return;
  api.setSilence(lineId,healLineCuts(line));syncMotion(performance.now());
  if(flight){flight.plan={...flight.plan,targets:flight.plan.targets.filter(n=>n.lineId!==lineId)};if(!flight.plan.targets.length)flight=null;}
  status.textContent='All cuts in this line are mended.';
 }
 function wipeAll(lineId){
  const {removed,remaining}=wipeLinePaint(allPaint(),lineId),at=performance.now();
  fading.push(...removed.map(stamp=>({stamp,at})));commitPaint(remaining);
  status.textContent='This line’s paint is wiped away.';
 }
 emptyWipe.onclick=()=>wipeAll(null);
 function addLineActions(group,lineId,number){
  for(const [name,action,selected] of [['Heal all cuts',healAll,'Scissors'],['Wipe all paint',wipeAll,'Black Paint']]){
   const button=document.createElement('button');button.textContent=name;button.dataset.silenceAction=selected;button.dataset.lineId=lineId;button.hidden=tool!==selected;
   button.setAttribute('aria-label',`${name} in line ${number}`);button.onclick=()=>action(lineId);group.append(button);
  }
 }
 function inheritPaint(source){
  const stamps=allPaint();
  source.events.forEach(event=>{event.paintCovered=stamps.some(s=>paintShapes(s).some(shape=>paintShapeContains(shape,event)));});
  source.paint=(paintStore?stamps:readPaint()).map(s=>({...s,owner:undefined,notes:[],eventIndices:source.events.flatMap((e,i)=>paintShapes(s).some(shape=>paintShapeContains(shape,e))?[i]:[])}));
  writePaint([]);signature=null;
 }
 function nearCut(p){let best=null;for(const line of views())for(const node of line.source.events)if(node.scissorMuted){
  const ends=cutEnds(line.source,node,line.morph,line.width,line.height,motion,performance.now());
  ends.forEach((end,index)=>{const distance=Math.hypot(end.x-p.x*line.width,end.y-p.y*line.height);if(distance<28&&(!best||distance<best.distance))best={lineId:line.id,noteId:node.id,distance,end,partner:ends[1-index]};});
 }return best;}
 randomButton.onclick=()=>{
  syncCoverage();const lines=api.lines();if(!lines.length)return;
  const seed=(Date.now()+ ++serial)>>>0,kind=tool==='Scissors'?'scissors':'paint',plan=planSilenceChaos(lines,kind,seed,allPaint());
  lastPlan=plan;
  if(kind==='scissors'){
   for(const p of plan.plans)api.setSilence(p.lineId,p);
   syncMotion(performance.now());
   flight={plan,at:performance.now(),duration:Math.min(1100,200+plan.targets.length*90)};
   plan.targets.forEach((target,i)=>{const state=motion.get(target.id);if(state)state.cutAt=flight.at+(i+1)/(plan.targets.length+1)*flight.duration;});
  }else{for(const [i,stamp] of plan.paint.entries())if(stamp.randomTool==='paint'){stamp.order=Date.now()+i/1000;births.set(stamp.id,performance.now());}commitPaint(plan.paint);}
  status.textContent=kind==='scissors'?'Snip, snip!':'A little paint chaos.';
 };
 canvas.addEventListener('pointerdown',e=>{
  if(tool==='Draw'||gesture||e.button>0)return;e.preventDefault();api.unlock();canvas.setPointerCapture(e.pointerId);syncCoverage();
  scene.querySelector('.free-play-hint').hidden=true;
  const p=position(e),existing=tool==='Black Paint'?topPaintAt(allPaint(),p):null;
  gesture={pointer:e.pointerId,start:p,previous:p,lastStamp:p,stamps:1,removing:!!existing,mend:tool==='Scissors'?nearCut(p):null};hover=p;
  if(tool==='Scissors'&&!gesture.mend)snip(p,p);
  if(tool==='Black Paint'){if(existing)removePaint(existing);else paint(p);}
 });
 canvas.addEventListener('pointermove',e=>{
  hover=position(e);if(!gesture||e.pointerId!==gesture.pointer)return;
  const p=hover,r=rect();if(tool==='Scissors'&&!gesture.mend)snip(gesture.previous,p);
  if(!gesture.removing&&Math.hypot((p.x-gesture.lastStamp.x)*r.width,(p.y-gesture.lastStamp.y)*r.height)>24&&tool==='Black Paint'&&gesture.stamps<64){paint(p);gesture.stamps++;gesture.lastStamp=p;}
  gesture.previous=p;
 });
 canvas.addEventListener('pointerup',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;const p=position(e),m=gesture.mend,r=rect();
  if(m&&(Math.hypot(p.x*r.width-m.partner.x,p.y*r.height-m.partner.y)<30||Math.hypot((p.x-gesture.start.x)*r.width,(p.y-gesture.start.y)*r.height)<8)){
   api.setSilence(m.lineId,{cuts:{[m.noteId]:false}});syncMotion(performance.now());status.textContent='Mended. The music returns on its next beat.';
  }gesture=null;
 });
 for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{gesture=null;});
 canvas.addEventListener('pointerleave',()=>{hover=null;});
 function reset(){writePaint([]);motion.clear();fading.length=0;births.clear();signature=null;flight=null;lastPlan=null;}
 if(sceneEvents){window.addEventListener('scene:new',reset);window.addEventListener('scene:load',()=>{motion.clear();fading.length=0;signature=null;flight=null;});}
 return {get tool(){return tool;},get hasSurfacePaint(){return !!readPaint().length;},motion,syncCoverage,inheritPaint,addLineActions,clearPaint:reset,cancel(){gesture=null;},prepareFrame(now){syncCoverage();syncMotion(now);randomButton.disabled=!api.lines().length;showBulkActions();emptyWipe.disabled=!readPaint().length;},getProof(){return {tool,lastPlan,paint:evaluateScenePaint(api.lines(),allPaint()),motion:[...motion]};},draw(ctx){
  const r=rect(),now=performance.now(),lines=views(),transitioning=lines.some(l=>l.morph>1e-5&&l.morph<1-1e-5);
  // Paint uses settled authored layout, never transient morph/sag positions.
  // During a morph the ink lifts briefly, then lands on the new layout.
  if(!transitioning){
   for(const stamp of allPaint())drawPaintShapes(ctx,paintShapes(stamp),r.width,r.height,Math.min(1,.3+(now-(births.get(stamp.id)??-1e9))/160));
   for(let i=fading.length-1;i>=0;i--){const f=fading[i],t=(now-f.at)/220;if(t>=1)fading.splice(i,1);else drawPaintShapes(ctx,paintShapes(f.stamp),r.width,r.height,.25*(1-t));}
  }
  if(flight){const t=(now-flight.at)/flight.duration;if(t>=1)flight=null;else{
   const liveNodes=new Map(lines.flatMap(line=>nodes(line)).map(n=>[n.id,n]));
   const points=[{x:-.05,y:.1},...flight.plan.targets.map(n=>liveNodes.get(n.id)||n),{x:1.05,y:.1}],index=Math.min(points.length-2,Math.floor(t*(points.length-1))),u=t*(points.length-1)-index,a=points[index],b=points[index+1],arc=Math.sin(u*Math.PI)*.06;
   ctx.save();ctx.translate((a.x+(b.x-a.x)*u)*r.width,(a.y+(b.y-a.y)*u-arc)*r.height);ctx.rotate(Math.sin(t*30)*.22);ctx.font='36px system-ui';ctx.fillStyle='#ecfff8';ctx.fillText('✂',-12,10);ctx.restore();
  }}
  if(!hover||tool==='Draw')return;ctx.save();ctx.strokeStyle='#d6fff0';ctx.fillStyle='#d6fff0';ctx.globalAlpha=.65;ctx.lineWidth=2;
  if(gesture?.mend){ctx.beginPath();ctx.moveTo(gesture.mend.partner.x,gesture.mend.partner.y);ctx.lineTo(hover.x*r.width,hover.y*r.height);ctx.stroke();}
  else if(tool==='Scissors'){ctx.font='22px system-ui';ctx.fillText('✂',hover.x*r.width+8,hover.y*r.height-8);}
  else{ctx.beginPath();ctx.arc(hover.x*r.width,hover.y*r.height,22,0,Math.PI*2);ctx.stroke();}ctx.restore();
 }};
}
