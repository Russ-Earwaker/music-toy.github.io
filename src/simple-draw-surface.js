import {createLineDrawing} from './free-play.js';
import {clamp01} from './free-play-line.js';
import {drawMusicalLine,paintLinePath} from './free-play-line-visual.js';
import {DRAWGRID_LINE_COLORS as colors} from './drawgrid/dg-line-style.js';
import {installSilenceTools} from './free-play-tools.js';
import {decorateCircularControl} from './circular-control.js';
import {contentPointer} from './surface-coordinates.js';
import {expressiveControl} from './expressive-toy-chrome.js';

// The former drawing scene is now an instance-local Container surface. It does
// not hide the board, replace the header, own music, or export on Open/Close.
export function installSimpleDrawSurface(host,api,paintStore){
 const scene=document.createElement('section');scene.className='simple-draw-surface';scene.setAttribute('aria-label','Simple Draw surface');
 scene.innerHTML='<div class="simple-draw-controls"><div class="free-play-tools"><button data-reset>Clear</button></div><div class="free-play-lines" aria-label="Line controls"></div></div><div class="free-play-surface expressive-toy-canvas"><canvas aria-label="Draw a line. Release to hear it play." tabindex="0"></canvas><p class="free-play-hint">Draw a line.<br>Let go and hear it come alive.</p></div><p role="status">Draw quietly. Let the line surprise you.</p>';
 host.append(scene);
 const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),status=scene.querySelector('[role=status]'),hint=scene.querySelector('.free-play-hint'),flashes=new Map();
 let active=false,frame=null,pointerId=null,revision=0,birth=-Infinity,morph=null,disposed=false,creating=false;
 const controlsRoot=scene.querySelector('.simple-draw-controls'),group=controlsRoot.querySelector('.free-play-lines');
 const clearButton=expressiveControl(scene.querySelector('[data-reset]'),{kind:'clear',label:'Clear'});
 const geometry=()=>api.getGeometry?.()||{x:0,y:0,width:canvas.clientWidth,height:canvas.clientHeight};
 const morphValue=()=>{if(!morph)return api.lines()[0]?.straightened?1:0;const t=clamp01((performance.now()-morph.at)/650),e=t*t*(3-2*t);return morph.from+(morph.to-morph.from)*e;};
 const tools=installSilenceTools({scene,controlsRoot,canvas,api,morphValue,status,paintStore,sceneEvents:false,allowPaint:false,getGeometry:geometry,onToolChange:()=>controls()});
 function controls(){group.replaceChildren();const line=api.lines()[0];
  const drawButton=controlsRoot.querySelector('[data-tool="Draw"]');drawButton.hidden=!!line||creating;drawButton.disabled=!!line||creating;
  if(tools.tool==='Draw'){
   if(line){const b=decorateCircularControl(document.createElement('button'),{label:line.straightened?'Re-coil':'Straighten',icon:line.straightened?'coil':'straighten'});b.onclick=()=>{const from=morphValue();api.setStraightened(line.id,!line.straightened);morph={from,to:line.straightened?0:1,at:performance.now()};tools.syncCoverage();controls();};group.append(b);}
   group.append(clearButton);
  }
  tools.addContextActions(group,line);
 }
 const drawing=createLineDrawing({change:stroke=>{if(stroke?.capped){status.textContent='Let go';hint.hidden=false;hint.textContent='Let go';}},complete:source=>{
  if(creating||api.lines().length)return;
  const version=revision;creating=true;controls();tools.inheritPaint(source);status.textContent='Your line is coming alive.';
  const {started}=api.addLine(source);birth=performance.now();hint.hidden=true;
  Promise.resolve(started).then(()=>{if(version===revision&&!disposed){creating=false;controls();status.textContent='Play with scissors, or open to edit notes.';}},error=>{if(version===revision&&!disposed){creating=false;controls();status.textContent=error.message;}});
 }});
 const point=e=>{const p=contentPointer(e,canvas,geometry());return {x:clamp01(p.x),y:clamp01(p.y)};};
 canvas.addEventListener('pointerdown',e=>{e.stopPropagation();if(tools.tool!=='Draw'||creating||api.lines().length||pointerId!==null||e.button>0)return;e.preventDefault();api.unlock();pointerId=e.pointerId;canvas.setPointerCapture(pointerId);hint.hidden=true;drawing.begin(point(e));status.textContent='Keep drawing. The music begins when you let go.';});
 canvas.addEventListener('pointermove',e=>{if(pointerId!==e.pointerId)return;const samples=e.getCoalescedEvents?.();for(const sample of samples?.length?samples:[e])drawing.move(point(sample));});
 canvas.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;const source=drawing.release(point(e));if(!source?.events.length){status.textContent='Try a longer line.';hint.hidden=!!api.lines().length;}});
 const cancel=()=>{pointerId=null;drawing.cancel();tools.cancel();};canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
 scene.addEventListener('keydown',e=>e.stopPropagation());
 controlsRoot.addEventListener('keydown',e=>e.stopPropagation());
 clearButton.onclick=()=>{revision++;creating=false;cancel();tools.clearPaint();api.clear();tools.selectDraw();morph=null;flashes.clear();controls();hint.hidden=false;hint.textContent='Draw a line. Let go and hear it come alive.';status.textContent='A fresh string.';};
 // Rendering uses local layout pixels. The board's CSS transform applies zoom
 // afterwards; client rects are only for converting screen pointer positions.
 function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
 const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
 function draw(){if(!active||disposed||!host.isConnected)return;const r=geometry(),now=performance.now();ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);tools.prepareFrame(now);ctx.save();ctx.translate(r.x,r.y);
  const line=api.lines()[0];if(line)drawMusicalLine(ctx,line.source,{width:r.width,height:r.height,phase:line.phase,morph:morphValue(),age:now-birth,flashes,now,color:colors[0],motion:tools.motion});
  tools.draw(ctx);if(drawing.stroke){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle=colors[0];paintLinePath(ctx,drawing.stroke.points,r.width,r.height);ctx.restore();}ctx.restore();frame=requestAnimationFrame(draw);
 }
 const unsubscribe=api.onNote((id,event)=>{if(Number.isInteger(event.nodeIndex))flashes.set(event.nodeIndex,performance.now());});
 controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;
 return {setActive(value){if(active===value){if(active){controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;}return;}active=value;if(active){controls();hint.hidden=!!api.lines().length||tools.hasSurfacePaint;resize();draw();}else{cancel();cancelAnimationFrame(frame);}},syncSilence:tools.syncCoverage,
  getProof:()=>({drawing:!!drawing.stroke,capped:!!drawing.stroke?.capped,stroke:drawing.stroke,silence:tools.getProof(),lines:api.lines()}),
  dispose(){disposed=true;active=false;cancel();cancelAnimationFrame(frame);observer.disconnect();unsubscribe?.();controlsRoot.remove();scene.remove();}};
}
