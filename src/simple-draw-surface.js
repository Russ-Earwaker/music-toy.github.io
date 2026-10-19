import {createLineDrawing} from './free-play.js';
import {clamp01} from './free-play-line.js';
import {drawMusicalLine,drawMusicalPoints,paintLinePath} from './free-play-line-visual.js';
import {DRAWGRID_LINE_COLORS as colors} from './drawgrid/dg-line-style.js';
import {installSilenceTools} from './free-play-tools.js';
import {createClearControl,decorateCircularControl} from './circular-control.js';
import {contentPointer} from './surface-coordinates.js';

// The former drawing scene is now an instance-local Container surface. It does
// not hide the board, replace the header, own music, or export on Open/Close.
export function installSimpleDrawSurface(host,api,paintStore){
 const scene=document.createElement('section');scene.className='simple-draw-surface expressive-layout';scene.setAttribute('aria-label','Simple Draw surface');
 scene.innerHTML='<div class="expressive-palette"><div class="free-play-tools expressive-primary" role="group" aria-label="Drawing tools"><button data-reset>Clear</button></div><div class="free-play-lines expressive-context" role="group" aria-label="Tool actions"></div></div><div class="free-play-surface expressive-surface"><canvas aria-label="Draw a line. Release to hear it play." tabindex="0"></canvas><p class="free-play-hint">Draw a line.<br>Let go and hear it come alive.</p></div><p role="status">Draw quietly. Let the line surprise you.</p>';
 host.append(scene);
 const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),status=scene.querySelector('[role=status]'),hint=scene.querySelector('.free-play-hint'),flashes=new Map();
 let active=false,frame=null,pointerId=null,revision=0,birth=-Infinity,morph=null,disposed=false,creating=false;
 const clearButton=createClearControl({button:scene.querySelector('[data-reset]')});
 const geometry=()=>api.getGeometry?.()||{x:0,y:0,width:canvas.clientWidth,height:canvas.clientHeight};
 const morphValue=()=>{if(!morph)return api.lines()[0]?.straightened?1:0;const t=clamp01((performance.now()-morph.at)/650),e=t*t*(3-2*t);return morph.from+(morph.to-morph.from)*e;};
 const tools=installSilenceTools({scene,canvas,api,morphValue,status,paintStore,sceneEvents:false,getGeometry:geometry,onToolChange:controls});
 function controls(){const group=scene.querySelector('.free-play-lines');group.replaceChildren();const line=api.lines()[0];
  canvas.dataset.lineComplete=String(!!line);canvas.setAttribute('aria-label',line?'Musical line. Use Scissors or Black Paint, or Clear to draw again.':'Draw a line. Release to hear it play.');
  if(tools.tool==='Draw'){
   if(line){const b=decorateCircularControl(document.createElement('button'),{label:line.straightened?'Re-coil':'Straighten',icon:line.straightened?'coil':'straighten'});b.onclick=()=>{const from=morphValue();api.setStraightened(line.id,!line.straightened);morph={from,to:line.straightened?0:1,at:performance.now()};tools.syncCoverage();controls();};group.append(b);}
   group.append(clearButton);
  }
  tools.addContextActions(group,line);
 }
 const drawing=createLineDrawing({change:stroke=>{if(stroke?.capped){status.textContent='Let go';hint.hidden=false;hint.textContent='Let go';}},complete:source=>{
  if(creating||api.lines().length)return;creating=true;
  const version=revision;tools.inheritPaint(source);status.textContent='Your line is coming alive.';
  const {started}=api.addLine(source);birth=performance.now();hint.hidden=true;
  Promise.resolve(started).then(()=>{if(version===revision&&!disposed){creating=false;controls();status.textContent='Play with scissors and paint. Clear to draw a new line.';}},error=>{if(version===revision&&!disposed){creating=false;status.textContent=error.message;}});
 }});
 const point=e=>{const p=contentPointer(e,canvas,geometry());return {x:clamp01(p.x),y:clamp01(p.y)};};
 canvas.addEventListener('pointerdown',e=>{e.stopPropagation();if(tools.tool!=='Draw'||pointerId!==null||e.button>0||creating||api.lines().length)return;e.preventDefault();api.unlock();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);hint.hidden=true;drawing.begin(point(e));status.textContent='Keep drawing. The music begins when you let go.';});
 canvas.addEventListener('pointermove',e=>{if(pointerId!==e.pointerId)return;const samples=e.getCoalescedEvents?.();for(const sample of samples?.length?samples:[e])drawing.move(point(sample));});
 canvas.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;const source=drawing.release(point(e));if(!source?.events.length){status.textContent='Try a longer line.';hint.hidden=!!api.lines().length;}});
 const cancel=()=>{pointerId=null;drawing.cancel();tools.cancel();};canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
 scene.addEventListener('keydown',e=>e.stopPropagation());
 clearButton.onclick=()=>{revision++;creating=false;cancel();tools.clearPaint();api.clear();morph=null;flashes.clear();controls();hint.hidden=false;hint.textContent='Draw a line. Let go and hear it come alive.';status.textContent='A fresh string.';};
 // Rendering uses local layout pixels. The board's CSS transform applies zoom
 // afterwards; client rects are only for converting screen pointer positions.
 function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
 const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
 function draw(){if(!active||disposed||!host.isConnected)return;const r=geometry(),now=performance.now();ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);tools.prepareFrame(now);ctx.save();ctx.translate(r.x,r.y);
  const line=api.lines()[0];if(line)drawMusicalLine(ctx,line.source,{width:r.width,height:r.height,phase:line.phase,morph:morphValue(),age:now-birth,flashes,now,color:colors[0],motion:tools.motion,points:false});
  tools.draw(ctx);if(line)drawMusicalPoints(ctx,line.source,{width:r.width,height:r.height,morph:morphValue(),age:now-birth,flashes,now,color:colors[0]});if(drawing.stroke){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle=colors[0];paintLinePath(ctx,drawing.stroke.points,r.width,r.height);ctx.restore();}ctx.restore();frame=requestAnimationFrame(draw);
 }
 const unsubscribe=api.onNote((id,event)=>{if(Number.isInteger(event.nodeIndex))flashes.set(event.nodeIndex,performance.now());});
 controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;
 return {setActive(value){if(active===value){if(active){controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;}return;}active=value;if(active){controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;resize();draw();}else{cancel();cancelAnimationFrame(frame);}},syncSilence:tools.syncCoverage,
  getProof:()=>({drawing:!!drawing.stroke,capped:!!drawing.stroke?.capped,stroke:drawing.stroke,silence:tools.getProof(),lines:api.lines()}),
  dispose(){disposed=true;active=false;cancel();cancelAnimationFrame(frame);observer.disconnect();unsubscribe?.();scene.remove();}};
}
