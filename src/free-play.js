import {createLineSource,clamp01,LINE_MAX_LENGTH} from './free-play-line.js';
import {DRAWGRID_LINE_COLORS as colors} from './drawgrid/dg-line-style.js';
import {installSilenceTools} from './free-play-tools.js';
import {drawMusicalLine,paintLinePath} from './free-play-line-visual.js';

// No audition callback exists in this input layer. Only a completed stroke
// crosses into the musical model; cancel/lost capture never creates a source.
export function createLineDrawing({complete,change=()=>{}}){
 let stroke=null;
 return {
  begin(point){if(stroke)return false;stroke={points:[point],metric:{width:1,height:1},totalLength:0,capped:false};change(stroke);return true;},
  move(point){if(stroke&&!stroke.capped){const last=stroke.points.at(-1),p={x:clamp01(point.x),y:clamp01(point.y)},length=Math.hypot(p.x-last.x,p.y-last.y);if(length<1e-9)return;const remaining=LINE_MAX_LENGTH-stroke.totalLength,t=Math.min(1,remaining/length);stroke.points.push({x:last.x+(p.x-last.x)*t,y:last.y+(p.y-last.y)*t});stroke.totalLength=length>=remaining?LINE_MAX_LENGTH:stroke.totalLength+length;stroke.capped=stroke.totalLength>=LINE_MAX_LENGTH;change(stroke);}},
  release(point){if(!stroke)return null;this.move(point);const finished=stroke;stroke=null;change(null);const source=createLineSource(finished.points);if(source.events.length)complete(source);return source;},
  cancel(){stroke=null;change(null);},
  get stroke(){return stroke;},
 };
}
export function installFreePlay(api){
 const entry=document.createElement('button');entry.className='free-play-entry';entry.textContent='Free Play';document.body.append(entry);
 const scene=document.createElement('section');scene.className='free-play';scene.hidden=true;scene.setAttribute('aria-label','Free Play');
 scene.innerHTML=`<div class="free-play-tools"><span class="free-play-draw-label">Free Play · Draw</span><button data-reset>Clear</button><button data-exit>Back to Board</button></div>
 <div class="free-play-surface"><canvas aria-label="Draw a line. Release to hear it play." tabindex="0"></canvas><p class="free-play-hint">Draw a line.<br><span>Let go and hear it come alive.</span></p></div>
 <div class="free-play-lines" aria-label="Your lines"></div><footer><p role="status">Draw quietly. Let the line surprise you.</p></footer>`;
 document.body.append(scene);
 const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),status=scene.querySelector('[role=status]'),hint=scene.querySelector('.free-play-hint');
 const births=new Map(),flashes=new Map(),obscured=new Map();let active=false,pointerId=null,frame=null,revision=0,drawn=0;
 function obscure(el){if(el!==scene&&!el.matches('#topbar,.scene-manager-overlay,.feedback-support-overlay')&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)&&!obscured.has(el)){obscured.set(el,el.inert);el.inert=true;el.classList.add('free-play-obscured');}}
 function restoreShell(){for(const [el,inert]of obscured){el.inert=inert;el.classList.remove('free-play-obscured');}obscured.clear();document.body.classList.remove('free-play-active');}
 new MutationObserver(records=>{if(active)for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)obscure(node);}).observe(document.body,{childList:true});
 const morphs=new Map();
 function refreshLineControls(){const host=scene.querySelector('.free-play-lines');host.replaceChildren();api.lines().forEach((line,i)=>{const button=document.createElement('button');button.textContent=`${line.straightened?'Re-coil':'Straighten'} ${i+1}`;button.onclick=()=>{const previous=morphValue(line.id,performance.now());api.setStraightened(line.id,!line.straightened);silenceTools.syncCoverage();morphs.set(line.id,{from:previous,to:line.straightened?0:1,at:performance.now()});refreshLineControls();};const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Delete line ${i+1}`);remove.onclick=()=>{api.deleteLine(line.id);births.delete(line.id);flashes.delete(line.id);morphs.delete(line.id);refreshLineControls();hint.hidden=!!api.lines().length;};const group=document.createElement('span');group.className='free-play-line-actions';group.append(button,remove);silenceTools.addLineActions(group,line.id,i+1);host.append(group);});}
 function morphValue(id,now){const m=morphs.get(id);if(!m)return api.lines().find(l=>l.id===id)?.straightened?1:0;const t=clamp01((now-m.at)/650),e=t*t*(3-2*t);return m.from+(m.to-m.from)*e;}
 const silenceTools=installSilenceTools({scene,canvas,api,morphValue,status});
 const drawing=createLineDrawing({change:stroke=>{if(stroke?.capped){status.textContent='Let go';hint.hidden=false;hint.textContent='Let go';}},complete:source=>{
  const version=revision;
  try{
   silenceTools.inheritPaint(source);
   const {id,started}=api.addLine(source);drawn++;births.set(id,performance.now());hint.hidden=true;refreshLineControls();status.textContent='Your line is coming alive.';
   Promise.resolve(started).then(()=>{if(version===revision){refreshLineControls();status.textContent='Draw another line to play together.';}},error=>{if(version===revision)status.textContent=`Could not play this line: ${error.message}`;});
  }catch(error){status.textContent=`Could not play this line: ${error.message}`;}
 }});
 function point(e){const r=canvas.getBoundingClientRect();return {x:clamp01((e.clientX-r.left)/r.width),y:clamp01((e.clientY-r.top)/r.height)};}
 canvas.addEventListener('pointerdown',e=>{
  if(silenceTools.tool!=='Draw'||pointerId!==null||e.button>0)return;e.preventDefault();api.unlock();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);hint.hidden=true;
  drawing.begin(point(e));status.textContent='Keep drawing. The music begins when you let go.';
 });
 canvas.addEventListener('pointermove',e=>{if(pointerId!==e.pointerId)return;const samples=e.getCoalescedEvents?.();for(const sample of samples?.length?samples:[e])drawing.move(point(sample));});
 canvas.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;const source=drawing.release(point(e));if(!source?.events.length){status.textContent='Try a longer line.';hint.hidden=!!api.lines().length;}});
 function cancel(e){if(e&&pointerId!==e.pointerId)return;pointerId=null;drawing.cancel();silenceTools.cancel();}
 canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
 scene.addEventListener('keydown',e=>e.stopPropagation());
 function enter(){if(active)return;active=true;scene.hidden=false;api.enter();for(const el of document.body.children)obscure(el);document.body.classList.add('free-play-active');hint.hidden=!!api.lines().length||silenceTools.hasSurfacePaint;refreshLineControls();resize();draw();}
 function exit(){silenceTools.syncCoverage();api.synchronize();active=false;cancel();scene.hidden=true;restoreShell();cancelAnimationFrame(frame);api.reveal();}
 entry.onclick=enter;scene.querySelector('[data-exit]').onclick=exit;
 scene.querySelector('[data-reset]').onclick=()=>{revision++;cancel();silenceTools.clearPaint();api.clear();births.clear();flashes.clear();morphs.clear();refreshLineControls();drawn=0;hint.hidden=false;hint.innerHTML='Draw a line.<br><span>Let go and hear it come alive.</span>';status.textContent='A fresh page. Draw a line.';};
 function resize(){const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
 new ResizeObserver(()=>{if(active)resize();}).observe(canvas);
 function draw(){
  if(!active)return;const r=canvas.getBoundingClientRect(),now=performance.now();ctx.clearRect(0,0,r.width,r.height);
  silenceTools.prepareFrame(now);
  api.lines().forEach((line,i)=>drawMusicalLine(ctx,line.source,{width:r.width,height:r.height,phase:line.phase,morph:morphValue(line.id,now),age:now-(births.get(line.id)??-Infinity),flashes:flashes.get(line.id),now,color:colors[i%colors.length],motion:silenceTools.motion}));
  silenceTools.draw(ctx);
  if(drawing.stroke){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle=colors[api.lines().length%colors.length];paintLinePath(ctx,drawing.stroke.points,r.width,r.height);ctx.restore();}
  frame=requestAnimationFrame(draw);
 }
 api.onNote((id,event)=>{if(!Number.isInteger(event.nodeIndex))return;if(!flashes.has(id))flashes.set(id,new Map());flashes.get(id).set(event.nodeIndex,performance.now());});
 for(const type of ['scene:new','scene:load'])window.addEventListener(type,()=>{revision++;active=false;cancel();scene.hidden=true;restoreShell();cancelAnimationFrame(frame);births.clear();flashes.clear();api.forget();});
 return {enter,syncSilence:silenceTools.syncCoverage,getSession:()=>({silence:silenceTools.getProof(),drawing:!!drawing.stroke,capped:!!drawing.stroke?.capped,stroke:drawing.stroke,drawn,lines:api.lines().map(line=>({...line,morph:morphValue(line.id,performance.now()),nodes:line.source.events.length}))})};
}
