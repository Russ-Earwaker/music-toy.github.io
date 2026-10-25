import {stringRunways,stringLocalPoint,chooseStringSurface} from './string-surface-input.js';
import {stringSegments,stringTap,stringCrossings} from './string-surface.js';
import {createBoardInteractionHint} from './simple-interaction-hint.js';
import {expressiveControl,setExpressiveControlsVisible} from './expressive-toy-chrome.js';
import {decorateCircularControl} from './circular-control.js';
import {installTapOrDrag} from './tap-or-drag.js';
import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {setToyVolume,setToyMuted} from './audio-core.js';
import {openInstrumentPicker,closeInstrumentPicker} from './instrument-picker.js';
import {surfaceRegionIndex} from './receiver-surface.js';
import {drumRingPoint} from './simple-drum-ring.js';

const taughtKinds=new Set();
export function installStringSurfaceBoard({objects,controller,getWorld,getViewport,screenToWorld,unlock=()=>{},canInteract=()=>true,onArm=()=>{},onDirty=()=>{}}){
 const world=getWorld(),root=document.createElement('div');root.className='string-surface-layer';world.append(root);
 const ns='http://www.w3.org/2000/svg',svg=(name,attrs={})=>{const n=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const preview=svg('svg',{class:'string-placement-overlay'}),previewLine=svg('line',{class:'string-placement-preview'});preview.append(previewLine);root.append(preview);preview.style.display='none';
 const cards=new Map(),motions=new Map();let kind=null,gesture=null,teaching=null,frame;
 const point=e=>screenToWorld({x:e.clientX,y:e.clientY});
 function cancel(){if(gesture&&getViewport().hasPointerCapture?.(gesture.pointer))getViewport().releasePointerCapture(gesture.pointer);kind=null;gesture=null;teaching?.dispose();teaching=null;preview.style.display='none';document.body.classList.remove('string-surface-creating');}
 function arm(next='string'){if(!canInteract())return false;if(kind===next){cancel();return false;}cancel();onArm();kind=next;document.body.classList.add('string-surface-creating');teaching=createBoardInteractionHint({getWorld,getViewport,screenToWorld,label:'SWIPE',demo:'swipe'});return true;}
 function render(){
  for(const o of objects.list()){
   let entry=cards.get(o.id);
   if(!entry){
    const card=document.createElement('section');card.id=o.id;card.className='string-surface-object expressive-toy';card.dataset.controlsVisible='0';card.setAttribute('aria-label',o.kind==='strum'?'Strum':'String');
    const surface=svg('svg',{class:'string-surface-lines'}),group=svg('g');surface.append(group);card.append(surface);
    const runways=stringRunways(o).map(()=>svg('rect',{class:'surface-runway',rx:20})),body=svg('rect',{class:'surface-body',rx:12}),cells=[],frets=[];group.append(...runways,body);
    const regions=o.capabilities.playable.surface.regions;
    for(const segment of o.capabilities.playable.surface.segments)for(const region of regions){const cell=svg('rect',{class:'surface-cell','data-lane':segment.lane,'data-region':region.index,rx:3});cells.push({cell,lane:segment.lane,region});group.append(cell);}
    for(let i=0;i<=regions.length;i++){const fret=svg('line',{class:i===0||i===regions.length?'surface-support':'surface-fret'});frets.push(fret);group.append(fret);}
    const paths=[];for(let lane=0;lane<(o.kind==='strum'?4:1);lane++){const path=svg('path',{class:'surface-string','data-lane':lane}),hit=svg('line',{class:'surface-hit','data-lane':lane,tabindex:0,role:'button','aria-label':`Pluck ${o.kind} lane ${lane+1}`});group.append(path,hit);paths.push({path,hit});hit.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();void Promise.resolve(unlock()).then(()=>controller.perform(o.id,[{lane,progress:.5}]));}});}
    const handle=expressiveControl(document.createElement('button'),{kind:'drag',label:`${o.kind} controls`});handle.classList.add('string-surface-handle');card.append(handle);
    const memory=svg('svg',{class:'surface-memory',viewBox:'0 0 128 128','aria-label':'Recorded string performance'});card.append(memory);
    const controls=document.createElement('div');controls.className='expressive-toy-controls surface-controls';card.append(controls);
    const instrument=decorateCircularControl(document.createElement('button'),{label:'Choose string instrument',asset:'T_ButtonInstruments'});instrument.onclick=async()=>{const result=await openInstrumentPicker({panel:card,toyId:o.id});if(result&&objects.get(o.id))objects.update(o.id,{instrument:result.value||result});};controls.append(instrument);
    const volume=document.createElement('div');volume.className='art-toy-volume';card.dataset.toyVolume=String(o.authoredState.volume);card.dataset.toyMuted=o.authoredState.muted?'1':'0';controls.append(volume);installVolumeUI(volume,{panel:card});
    const period=document.createElement('select');period.setAttribute('aria-label','String period');for(let i=1;i<=4;i++){const option=document.createElement('option');option.value=i;option.textContent=i+(i===1?' loop':' loops');period.append(option);}period.onchange=()=>objects.update(o.id,{periodLoops:Number(period.value)});controls.append(period);
    if(o.kind==='string'){const mode=document.createElement('select');mode.setAttribute('aria-label','String note or chord');for(const value of ['note','chord']){const option=document.createElement('option');option.value=value;option.textContent=value==='note'?'Note':'Chord';mode.append(option);}mode.onchange=()=>objects.update(o.id,{mode:mode.value});controls.append(mode);}
    const clear=expressiveControl(document.createElement('button'),{kind:'clear',label:'Clear String pattern'});clear.onclick=()=>controller.clearPattern(o.id);controls.append(clear);
    const offMove=installTapOrDrag(handle,{getPosition:()=>objects.get(o.id).transform,screenToWorld,canInteract,move:(x,y)=>objects.update(o.id,{x,y}),onTap:()=>setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1'),onDragStart:e=>window.ToySpawner?.beginPanelDrag?.({panel:card,pointerId:e.pointerId,remove:()=>objects.remove(o.id)}),onDragMove:e=>window.ToySpawner?.updatePanelDrag?.({clientX:e.clientX,clientY:e.clientY}),onDragEnd:(e,canceled)=>window.ToySpawner?.endPanelDrag?.({clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,canceled})});
    card.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')setExpressiveControlsVisible(card,false);});root.append(card);entry={card,group,paths,body,cells,frets,runways,memory,offMove};cards.set(o.id,entry);
   }
   const {card,group,paths,body,cells,frets,runways,memory}=entry,length=o.bounds.length;stringRunways(o).forEach((r,i)=>{for(const k of ['x','y','width','height'])runways[i].setAttribute(k,r[k]);});card.dataset.instrument=o.authoredState.instrument;card.dataset.mode=o.authoredState.mode;
   const local=o.capabilities.playable.surface,top=local.segments[0].a.y-16,bottom=local.segments.at(-1).a.y+16;
   for(const [k,v]of Object.entries({x:-length/2-16,y:top,width:length+32,height:bottom-top}))body.setAttribute(k,v);
   cells.forEach(({cell,lane,region})=>{for(const [k,v]of Object.entries({x:-length/2+length*region.start,y:local.segments[lane].a.y-11,width:length*(region.end-region.start),height:22}))cell.setAttribute(k,v);});
   frets.forEach((fret,i)=>{const progress=i===local.regions.length?1:local.regions[i].start;for(const [k,v]of Object.entries({x1:-length/2+length*progress,x2:-length/2+length*progress,y1:top+4,y2:bottom-4}))fret.setAttribute(k,v);});
   Object.assign(card.style,{left:o.transform.x+'px',top:o.transform.y+'px'});group.setAttribute('transform',`rotate(${o.transform.rotation*180/Math.PI})`);
   const segments=o.capabilities.playable.surface.segments;
   paths.forEach(({hit},i)=>{const s=segments[i];for(const [k,v]of Object.entries({x1:s.a.x,y1:s.a.y,x2:s.b.x,y2:s.b.y}))hit.setAttribute(k,v);});
   const start=stringSegments(o)[0].a,x=start.x-o.transform.x-74,y=start.y-o.transform.y-31;card.style.setProperty('--surface-handle-x',x+'px');card.style.setProperty('--surface-handle-y',y+'px');
   card.querySelector('[aria-label="String period"]').value=o.authoredState.periodLoops;const mode=card.querySelector('[aria-label="String note or chord"]');if(mode)mode.value=o.authoredState.mode;
   setToyVolume(o.id,o.authoredState.volume);setToyMuted(o.id,o.authoredState.muted);syncVolumeUI(card,{volume:o.authoredState.volume,muted:o.authoredState.muted});
   const signature=JSON.stringify([o.authoredState.recordedEvents,o.authoredState.periodLoops]);if(entry.signature!==signature){entry.signature=signature;memory.replaceChildren(svg('circle',{cx:64,cy:64,r:58,class:'surface-memory-track'}));const clusters=new Map();for(const n of o.authoredState.recordedEvents)if(n.gestureId){if(!clusters.has(n.gestureId))clusters.set(n.gestureId,[]);clusters.get(n.gestureId).push(n);}for(const notes of clusters.values())if(notes.length>1){const points=notes.sort((a,b)=>a.order-b.order).map(n=>{const p=drumRingPoint(n.offsetTick,o.authoredState.periodLoops),r=54+n.lane*2;return `${64+r*Math.sin(p.angle)},${64-r*Math.cos(p.angle)}`;}).join(' ');memory.append(svg('polyline',{points,class:'surface-memory-group'}));}for(const n of o.authoredState.recordedEvents){const p=drumRingPoint(n.offsetTick,o.authoredState.periodLoops),r=54+n.lane*2,angle=p.angle;memory.append(svg('circle',{cx:64+r*Math.sin(angle),cy:64-r*Math.cos(angle),r:2.2,class:'surface-memory-hit','data-lane':n.lane,'data-gesture':n.gestureId||'','data-order':n.order??0}));}entry.playhead=svg('circle',{r:3,class:'surface-memory-head'});memory.append(entry.playhead);}
  }
  for(const [id,e]of cards)if(!objects.get(id)){closeInstrumentPicker(e.card);e.offMove();e.card.remove();cards.delete(id);for(const key of motions.keys())if(key.startsWith(id+':'))motions.delete(key);}
 }
 function demo(o){if(taughtKinds.has(o.kind))return;const entry=cards.get(o.id),runways=stringRunways(o),x=-o.bounds.length/4,y=runways[0].y+runways[0].height/2,end=runways[1].y+runways[1].height/2,path=`M ${x} ${y} C ${x} ${y+24} ${x} ${end-24} ${x} ${end}`,d=svg('g',{class:'surface-performance-demo','aria-hidden':'true'}),line=svg('path',{d:path,class:'surface-demo-trail'}),dot=svg('circle',{r:6}),motion=svg('animateMotion',{path,dur:'1.8s',keyTimes:'0;.2;.8;1',keyPoints:'0;.06;.94;1',calcMode:'linear',repeatCount:3}),label=svg('text',{x:x+12,y:y-18});label.textContent=o.kind==='strum'?'STRUM':'PLUCK';dot.append(motion);d.append(line,dot,label);entry.group.append(d);entry.demo=d;entry.demoUntil=performance.now()+5500;entry.card.dataset.runwayNew='1';}
 const off=objects.subscribe(e=>{if(e.type==='restore')motions.clear();render();if(e.type==='add'){cards.get(e.object.id).revealUntil=performance.now()+5500;demo(e.object);}onDirty();}),offHits=controller.subscribe(e=>{motions.set(e.sourceId+':'+e.lane,{at:performance.now(),progress:e.progress,region:e.region});const o=objects.get(e.sourceId);if(o&&e.activationSource==='manual')taughtKinds.add(o.kind);});
 function animate(){
  const now=performance.now();for(const o of objects.list()){const e=cards.get(o.id);e.paths.forEach(({path},lane)=>{const s=o.capabilities.playable.surface.segments[lane],m=motions.get(o.id+':'+lane),age=now-(m?.at??-1e6),strength=age<800?6*Math.exp(-age/180)*Math.sin(age*.08):0;
   path.setAttribute('d',Array.from({length:33},(_,i)=>{const t=i/32,bend=strength*Math.sin(t*Math.PI)*Math.exp(-Math.pow((t-(m?.progress??.5))*3,2));return `${i?'L':'M'}${s.a.x+(s.b.x-s.a.x)*t} ${s.a.y+bend}`;}).join(' '));});
   e.card.dataset.runwayNew=now<(e.revealUntil||0)?'1':'0';
   if(e.demo&&now>e.demoUntil){e.demo.remove();e.demo=null;e.card.dataset.runwayNew='0';}
   e.cells.forEach(({cell,lane,region})=>{const m=motions.get(o.id+':'+lane);cell.classList.toggle('is-hover',e.hover?.lane===lane&&e.hover.region===region.index);cell.classList.toggle('is-pressed',gesture?.owner===o.id&&e.hover?.lane===lane&&e.hover.region===region.index);cell.classList.toggle('is-sounding',m?.region===region.index&&now-m.at<400);});
   e.card.dataset.performing=gesture?.owner===o.id?'1':'0';
   const phase=controller.phase(o.id),p=drumRingPoint(phase.tick,o.authoredState.periodLoops);e.playhead.setAttribute('cx',p.x);e.playhead.setAttribute('cy',p.y);
  }frame=requestAnimationFrame(animate);
 }
 function pick(p,target,coarse=false){return chooseStringSurface(objects.list(),p,{targetId:target?.closest?.('.string-surface-object')?.id,selectedIds:new Set([...cards].filter(([,e])=>e.card.dataset.controlsVisible==='1').map(([id])=>id)),coarse});}
 function highlight(owner,p){for(const [id,entry]of cards){const o=objects.get(id),hit=id===owner&&Math.abs(stringLocalPoint(o,p).x)<=o.bounds.length/2?stringTap(o,p,16):null;entry.card.dataset.runwayHover=id===owner?'1':'0';entry.hover=hit?{lane:hit.lane,region:surfaceRegionIndex(o.capabilities.playable.surface,hit.progress)}:null;entry.cells.forEach(({cell,lane,region})=>{const active=entry.hover?.lane===lane&&entry.hover.region===region.index;cell.classList.toggle('is-hover',active);cell.classList.toggle('is-pressed',active&&gesture?.owner===id);});}}
 function queueHits(g,hits,time){
  if(!hits.length)return;for(const h of hits)g.seen.add(h.lane);
  const id=g.owner;cards.get(id)?.demo?.remove();if(g.firstHitTime==null){g.firstHitTime=hits[0].time??time;g.timing=controller.beginGesture(id,{elapsedMs:Math.max(0,time-g.firstHitTime)});}
  g.queue=g.queue.then(async()=>{await unlock();if(!objects.get(id))return;const played=await controller.perform(id,hits.map(h=>({...h,delayMs:Math.max(0,(h.time??time)-g.firstHitTime)})),{gesture:g.timing});if(played.length)taughtKinds.add(objects.get(id).kind);});
 }
 function down(e){
  if(e.button>0||gesture||!canInteract()||!getViewport().contains(e.target))return;
  if(e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.container-toy,.heartbeat-toy,.simple-ripple-object,.simple-drum-object,.physical-object,.surface-controls'))return;
  const p=point(e),near=pick(p,e.target,e.pointerType==='touch'||e.pointerType==='pen');if(!kind&&!near)return;
  if(kind&&e.target.closest?.('.string-surface-object'))return;
  e.preventDefault();e.stopImmediatePropagation();teaching?.dispose();teaching=null;gesture={pointer:e.pointerId,kind,owner:near?.object.id,start:p,previous:p,started:e.timeStamp,previousTime:e.timeStamp,seen:new Set(),timing:{},queue:Promise.resolve()};getViewport().setPointerCapture?.(e.pointerId);
  if(kind){preview.style.display='block';for(const [k,v]of Object.entries({x1:p.x,y1:p.y,x2:p.x,y2:p.y}))previewLine.setAttribute(k,v);}
  else{highlight(near.object.id,p);if(near.playable)queueHits(gesture,[near.hit],e.timeStamp);}
 }
 function move(e){const g=gesture,p=point(e);if(!g){if(!e.buttons){const hit=pick(p,e.target,e.pointerType==='touch');highlight(hit?.object.id,p);}return;}if(e.pointerId!==g.pointer)return;e.preventDefault();e.stopImmediatePropagation();
  if(g.kind){previewLine.setAttribute('x2',p.x);previewLine.setAttribute('y2',p.y);}else {const o=objects.get(g.owner);if(!o){cancel();return;}highlight(o.id,p);const hits=stringCrossings(o,g.previous,p).filter(h=>!g.seen.has(h.lane)).map(h=>({...h,time:g.previousTime+h.t*(e.timeStamp-g.previousTime)}));queueHits(g,hits,e.timeStamp);}
  g.previous=p;g.previousTime=e.timeStamp;
 }
 function up(e){if(e.pointerId!==gesture?.pointer)return;move(e);const g=gesture,p=point(e);gesture=null;if(getViewport().hasPointerCapture?.(e.pointerId))getViewport().releasePointerCapture(e.pointerId);
  if(g.kind){const next=g.kind,start=g.start;cancel();if(Math.hypot(p.x-start.x,p.y-start.y)>=60&&Math.hypot(p.x-start.x,p.y-start.y)<=2400)objects.create({kind:next,start,end:p});}
  else highlight(null,p);
 }
 const escape=e=>{if(e.key==='Escape')cancel();},volume=e=>{if(objects.get(e.detail?.toyId))objects.update(e.detail.toyId,e.type==='toy-volume'?{volume:e.detail.value}:{muted:e.detail.muted});};
 const handlers={lostpointercapture:e=>{if(e.pointerId===gesture?.pointer)cancel();},pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,blur:cancel,keydown:escape,'scene:new':cancel,'scene:load':cancel,'toy-volume':volume,'toy-mute':volume};
 for(const [type,fn]of Object.entries(handlers))window.addEventListener(type,fn,['pointerdown','pointermove','pointerup'].includes(type));render();animate();
 return {arm,cancel,get activeKind(){return kind;},dispose(){cancel();off();offHits();cancelAnimationFrame(frame);for(const e of cards.values())e.offMove();root.remove();for(const [type,fn]of Object.entries(handlers))window.removeEventListener(type,fn,['pointerdown','pointermove','pointerup'].includes(type));}};
}
