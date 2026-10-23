import {linePresentation,cutEnds,stringSegments} from './free-play-line-visual.js';
import {paintShapes,paintShapeContains,drawPaintShapes} from './free-play-silence.js';
import {createScissorsStroke,nearestCutGap} from './free-play-scissors.js';
import {decorateCircularControl} from './circular-control.js';
import {contentPointer} from './surface-coordinates.js';
import {surfacePaint,restoreSurfacePaint} from './free-play-surface-paint.js';
import {collectScenePaint,evaluateScenePaint,topPaintAt,paintOwnerAt} from './free-play-paint.js';
import {planSilenceChaos} from './free-play-chaos.js';
import {healLineCuts,wipeLinePaint} from './free-play-silence-reset.js';

export function installSilenceTools({scene,controlsRoot=scene,canvas,api,morphValue,status,paintStore,sceneEvents=true,allowPaint=true,onToolChange=()=>{},getGeometry=()=>({x:0,y:0,width:canvas.clientWidth,height:canvas.clientHeight})}){
 const readPaint=paintStore?.get||surfacePaint,writePaint=paintStore?.set||restoreSurfacePaint;
 let tool='Draw',gesture=null,hover=null,serial=0,signature=null,lastPlan=null,flight=null;
 const motion=new Map(),fading=[],births=new Map(),toolbar=controlsRoot.querySelector('.free-play-tools');
 const randomButton=decorateCircularControl(document.createElement('button'),{label:'Randomise',asset:'T_ButtonRandom'});randomButton.hidden=true;randomButton.classList.add('free-play-random');
 const emptyWipe=decorateCircularControl(document.createElement('button'),{label:'Wipe all paint',asset:'T_ButtonClear'});emptyWipe.hidden=true;
 function showBulkActions(){for(const button of controlsRoot.querySelectorAll('[data-silence-action]'))button.hidden=button.dataset.silenceAction!==tool;emptyWipe.hidden=tool!=='Black Paint'||!!api.lines().length;}
 for(const name of allowPaint?['Draw','Scissors','Black Paint']:['Draw','Scissors']){
  const button=decorateCircularControl(document.createElement('button'),{label:name,icon:{Draw:'draw',Scissors:'scissors','Black Paint':'paint'}[name]});button.dataset.tool=name;button.setAttribute('aria-pressed',String(name===tool));
  button.onclick=()=>{const next=!allowPaint&&name==='Scissors'&&tool==='Scissors'?'Draw':name;tool=next;gesture=null;canvas.dataset.tool=next;for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===next));randomButton.hidden=next==='Draw';randomButton.setAttribute('aria-label',`Randomise ${next}`);randomButton.title=next==='Scissors'?'Random Cuts':'Random Paint';showBulkActions();status.textContent={Draw:'Line controls.',Scissors:'Swipe to snip. Tap near a cut to heal. Tap Scissors again for line controls.','Black Paint':'Splat to hush. Tap a blot to remove it.'}[next];onToolChange(next);};
  toolbar.insertBefore(button,controlsRoot.querySelector('[data-reset]'));
 }
 toolbar.insertBefore(randomButton,controlsRoot.querySelector('[data-reset]'));
 if(allowPaint)toolbar.insertBefore(emptyWipe,controlsRoot.querySelector('[data-reset]'));
 const rect=getGeometry;
 const position=e=>contentPointer(e,canvas,rect());
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
 const logical=p=>{const r=rect();return {x:p.x*r.width,y:p.y*r.height};};
 const candidates=()=>views().flatMap(line=>nodes(line).map(n=>({...n,lineId:line.id,progress:n.pathDistance/line.source.path.totalLength,x:n.x*line.width,y:n.y*line.height})));
 const paths=()=>views().map(line=>({lineId:line.id,segments:stringSegments(line.source,line.morph,line.height,1,motion,performance.now()).map(segment=>segment.map(p=>({...p,x:p.x*line.width,y:p.y*line.height})))}));
 function applyCuts(hits){
  const changes=new Map();for(const hit of hits){if(!changes.has(hit.lineId))changes.set(hit.lineId,{});changes.get(hit.lineId)[hit.id]=true;}
  for(const [id,cuts]of changes)api.setSilence(id,{cuts});syncMotion(performance.now());
  hits.forEach((hit,i)=>{const state=motion.get(hit.id);if(state)state.cutAt=performance.now()+Math.min(i*18,90);});
 }
 function snip(p){applyCuts(gesture.stroke.add(logical(p),candidates()));}
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
   if(!allowPaint&&selected==='Black Paint')continue;
   const button=decorateCircularControl(document.createElement('button'),{label:`${name} in line ${number}`,icon:'heal',asset:selected==='Black Paint'?'T_ButtonClear':undefined});button.title=selected==='Scissors'?'Heal All':'Wipe All';button.dataset.silenceAction=selected;button.dataset.lineId=lineId;button.hidden=tool!==selected;
   button.onclick=()=>action(lineId);group.append(button);
  }
 }
 function inheritPaint(source){
  const stamps=allPaint();
  source.events.forEach(event=>{event.paintCovered=stamps.some(s=>paintShapes(s).some(shape=>paintShapeContains(shape,event)));});
  source.paint=(paintStore?stamps:readPaint()).map(s=>({...s,owner:undefined,notes:[],eventIndices:source.events.flatMap((e,i)=>paintShapes(s).some(shape=>paintShapeContains(shape,e))?[i]:[])}));
  writePaint([]);signature=null;
 }
 function nearCut(p){const gaps=views().flatMap(line=>nodes(line).filter(n=>n.scissorMuted).map(node=>({id:node.id,lineId:line.id,anchors:[{x:node.x*line.width,y:node.y*line.height},...cutEnds(line.source,node,line.morph,line.width,line.height,motion,performance.now())]})));return nearestCutGap(logical(p),gaps);}
 randomButton.onclick=()=>{
  if(!allowPaint&&tool!=='Scissors')return;
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
  gesture={pointer:e.pointerId,start:p,previous:p,lastStamp:p,stamps:1,removing:!!existing,stroke:tool==='Scissors'?createScissorsStroke(logical(p)):null};hover=p;
  if(tool==='Black Paint'){if(existing)removePaint(existing);else paint(p);}
 });
 canvas.addEventListener('pointermove',e=>{
  hover=position(e);if(!gesture||e.pointerId!==gesture.pointer)return;
  const p=hover,r=rect();if(tool==='Scissors'){const samples=e.getCoalescedEvents?.()||[];for(const sample of [...samples,e])snip(position(sample));}
  if(!gesture.removing&&Math.hypot((p.x-gesture.lastStamp.x)*r.width,(p.y-gesture.lastStamp.y)*r.height)>24&&tool==='Black Paint'&&gesture.stamps<64){paint(p);gesture.stamps++;gesture.lastStamp=p;}
  gesture.previous=p;
 });
 canvas.addEventListener('pointerup',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;const p=position(e);
  if(tool==='Scissors'){
   snip(p);
   const gap=!gesture.stroke.isSwipe?nearCut(p):null;
   if(gap){api.setSilence(gap.lineId,{cuts:{[gap.id]:false}});syncMotion(performance.now());status.textContent='Mended. The music returns on its next beat.';}
   else applyCuts(gesture.stroke.finish(candidates(),paths()));
  }gesture=null;
 });
 for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{gesture=null;});
 canvas.addEventListener('pointerleave',()=>{hover=null;});
 function reset(){writePaint([]);motion.clear();fading.length=0;births.clear();signature=null;flight=null;lastPlan=null;}
 if(sceneEvents){window.addEventListener('scene:new',reset);window.addEventListener('scene:load',()=>{motion.clear();fading.length=0;signature=null;flight=null;});}
 return {selectDraw(){tool='Draw';gesture=null;canvas.dataset.tool=tool;for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));randomButton.hidden=true;showBulkActions();},get tool(){return tool;},get hasSurfacePaint(){return !!readPaint().length;},motion,syncCoverage,inheritPaint,addLineActions,addContextActions(group,line){group.append(randomButton);if(allowPaint)group.append(emptyWipe);if(line)addLineActions(group,line.id,1);showBulkActions();},clearPaint:reset,cancel(){gesture=null;},prepareFrame(now){syncCoverage();syncMotion(now);randomButton.disabled=!api.lines().length;showBulkActions();emptyWipe.disabled=!readPaint().length;},getProof(){return {tool,lastPlan,paint:evaluateScenePaint(api.lines(),allPaint()),motion:[...motion]};},draw(ctx){
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
  for(const line of lines)for(const node of nodes(line)){const t=(now-(motion.get(node.id)?.mendAt??-Infinity))/350;if(t<0||t>=1)continue;ctx.save();ctx.translate(node.x*r.width,node.y*r.height);ctx.globalAlpha=1-t;ctx.strokeStyle='#efffc8';ctx.lineWidth=2;const size=5+Math.sin(t*Math.PI)*10;ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(size,0);ctx.moveTo(0,-size);ctx.lineTo(0,size);ctx.stroke();ctx.restore();}
  if(!hover||tool==='Draw')return;ctx.save();ctx.strokeStyle='#d6fff0';ctx.fillStyle='#d6fff0';ctx.globalAlpha=.65;ctx.lineWidth=2;
  if(tool==='Scissors'){const gap=nearCut(hover);if(gap){ctx.beginPath();ctx.arc(hover.x*r.width,hover.y*r.height,14,0,Math.PI*2);ctx.stroke();}ctx.font='22px system-ui';ctx.fillText('✂',hover.x*r.width+8,hover.y*r.height-8);}
  else{ctx.beginPath();ctx.arc(hover.x*r.width,hover.y*r.height,22,0,Math.PI*2);ctx.stroke();}ctx.restore();
 }};
}
