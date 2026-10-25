import {drawMusicalLine} from './free-play-line-visual.js';
import {DRAWGRID_LINE_COLORS as colors} from './drawgrid/dg-line-style.js';
import {installSilenceTools} from './free-play-tools.js';
import {decorateCircularControl} from './circular-control.js';
import {expressiveControl} from './expressive-toy-chrome.js';
import {simplePaintState} from './simple-paint-state.js';

// Authored canvas only. Empty Draw actions use the same free-board pipeline as creation.
export function installSimpleDrawSurface(host,api,paintStore){
 const scene=document.createElement('section');scene.className='simple-draw-surface';scene.setAttribute('aria-label','Simple Draw surface');
 scene.innerHTML='<div class="simple-draw-controls"><div class="free-play-tools"><button data-reset>Clear</button></div><div class="free-play-lines" aria-label="Line controls"></div></div><div class="free-play-surface expressive-toy-canvas"><canvas aria-label="Paint line. Swipe scissors to cut." tabindex="0"></canvas><p class="free-play-hint" hidden></p></div><p role="status"></p>';
 host.append(scene);
 const canvas=scene.querySelector('canvas'),ctx=canvas.getContext('2d'),status=scene.querySelector('[role=status]'),flashes=new Map();
 let active=false,frame=null,morph=null,disposed=false,lastState=null;
 const controlsRoot=scene.querySelector('.simple-draw-controls'),group=controlsRoot.querySelector('.free-play-lines');
 const clearButton=expressiveControl(scene.querySelector('[data-reset]'),{kind:'clear',label:'Clear'});
 const coilChrome=document.createElement('div');coilChrome.className='simple-draw-canvas-controls';canvas.parentElement.append(coilChrome);
 group.classList.add('simple-draw-scissors-actions');
 const geometry=()=>api.getGeometry?.()||{x:0,y:0,width:canvas.clientWidth,height:canvas.clientHeight};
 const morphValue=()=>{if(!morph)return api.lines()[0]?.straightened?1:0;const t=Math.max(0,Math.min(1,(performance.now()-morph.at)/650)),e=t*t*(3-2*t);return morph.from+(morph.to-morph.from)*e;};
 const state=()=>simplePaintState(!!api.lines().length,!!api.isDrawing?.());
 const tools=installSilenceTools({scene,controlsRoot,canvas,api,morphValue,status,paintStore,sceneEvents:false,allowPaint:false,scissorsToggle:false,getGeometry:geometry,onToolChange:()=>controls()});
 function controls(){
  const view=state(),line=api.lines()[0];lastState=view.state;scene.dataset.paintState=view.state;const card=host.closest('[data-presentation="simple-draw"]');if(card)card.dataset.paintState=view.state;
  if(view.scissors&&tools.tool!=='Scissors')tools.selectScissors();
  if(!view.scissors&&tools.tool!=='Draw')tools.selectDraw();
  canvas.parentElement.hidden=!view.canvas;
  group.replaceChildren();coilChrome.replaceChildren();
  const scissors=controlsRoot.querySelector('[data-tool="Scissors"]');
  scissors.hidden=!view.scissors;scissors.setAttribute('aria-pressed',String(view.scissorsSelected));
  const drawButton=controlsRoot.querySelector('[data-tool="Draw"]');drawButton.hidden=!view.draw;drawButton.disabled=!view.draw;drawButton.setAttribute('aria-pressed',String(view.drawSelected));
  clearButton.hidden=!view.clear;
  if(view.coil){const b=decorateCircularControl(document.createElement('button'),{label:line.straightened?'Coil':'Uncoil',icon:line.straightened?'coil':'straighten'});b.classList.add('art-toy-btn');b.onclick=()=>{const from=morphValue();api.setStraightened(line.id,!line.straightened);morph={from,to:line.straightened?0:1,at:performance.now()};tools.syncCoverage();controls();};coilChrome.append(b);}
  tools.addContextActions(group,line);
 }
 controlsRoot.querySelector('[data-tool="Draw"]').onclick=()=>{if(state().draw&&!state().drawSelected){tools.selectDraw();api.armDraw?.();controls();}};
 clearButton.onclick=()=>{
  tools.cancel();const result=api.clear();if(result?.ok===false){status.textContent=result.reason;return;}
  tools.clearPaint();tools.selectDraw();morph=null;flashes.clear();controls();status.textContent='Ready to draw on the board.';
 };
 scene.addEventListener('keydown',e=>e.stopPropagation());controlsRoot.addEventListener('keydown',e=>e.stopPropagation());
 function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
 const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
 function draw(){
  if(!active||disposed||!host.isConnected)return;
  if(lastState!==state().state)controls();
  if(state().canvas){const r=geometry(),now=performance.now();ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);tools.prepareFrame(now);ctx.save();ctx.translate(r.x,r.y);
   const line=api.lines()[0];drawMusicalLine(ctx,line.source,{width:r.width,height:r.height,phase:line.phase,morph:morphValue(),age:Infinity,flashes,now,color:colors[0],motion:tools.motion});tools.draw(ctx);ctx.restore();
  }
  frame=requestAnimationFrame(draw);
 }
 const unsubscribe=api.onNote((id,event)=>{if(Number.isInteger(event.nodeIndex))flashes.set(event.nodeIndex,performance.now());});
 controls();
 return {setActive(value){if(active===value){if(active)controls();return;}active=value;if(active){controls();resize();draw();}else{tools.cancel();cancelAnimationFrame(frame);}},syncSilence:tools.syncCoverage,
  getProof:()=>({state:state().state,drawing:!!api.isDrawing?.(),silence:tools.getProof(),lines:api.lines()}),
  dispose(){disposed=true;active=false;tools.cancel();cancelAnimationFrame(frame);observer.disconnect();unsubscribe?.();controlsRoot.remove();scene.remove();}};
}
