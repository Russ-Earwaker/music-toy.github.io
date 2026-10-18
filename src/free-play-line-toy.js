import {ensurePlaybackInstance,getPlaybackInstance,removePlaybackInstance} from './playback-instances.js';
import {getPanelTransport} from './panel-transport.js';
import {audioTimeToTick} from './audio-core.js';
import {triggerInstrument,cancelScheduledToySources} from './audio-samples.js';
import {admittedToyVisual} from './playback-visual-events.js';
import {initToyUI} from './toyui.js';
import {createLineSource,lineEventsInWindow,linePlaybackPhase,LINE_DURATION_TICKS} from './free-play-line.js';
import {drawMusicalLine} from './free-play-line-visual.js';

export function initializeFreePlayLine(panel){
 if(panel.__freePlayLineBuilt)return;panel.__freePlayLineBuilt=true;
 initToyUI(panel,{toyName:'Line',defaultInstrument:'PIANO'});
 const canvas=document.createElement('canvas');canvas.className='free-play-line-preview';canvas.style.cssText='display:block;width:100%;height:240px;touch-action:none';panel.querySelector('.toy-body').append(canvas);
 const ctx=canvas.getContext('2d'),flashes=new Map();let frame=null,disposed=false;
 panel.__audioToyId=panel.id;panel.dataset.audiotoyid=panel.id;
 panel.__freePlayLineState=createLineSource([]);panel.__seqRev=0;
 ensurePlaybackInstance(panel.id,{active:true,loopLengthTicks:LINE_DURATION_TICKS});
 panel.__getFreePlayLineSnapshot=()=>structuredClone(panel.__freePlayLineState);
 panel.__applyFreePlayLineSnapshot=state=>{
  // Rebuild derived geometry/events at this persistence boundary, never use
  // DrawGrid columns or a second cached musical representation.
  panel.__freePlayLineState=createLineSource(state?.path?.points||[],state?.path?.metric);
  panel.dataset.musicalRole='melody';panel.dataset.instrument=state?.instrument||'PIANO';
  panel.__freePlayLineState.instrument=panel.dataset.instrument;
  panel.__seqRev++;panel.__forceSchedulerReset=true;
 };
 panel.__sequencerStep=()=>{};
 panel.__sequencerEventsInWindow=(from,to,instance)=>lineEventsInWindow(panel.__freePlayLineState,instance,from,to);
 panel.__sequencerScheduleEvent=(event,when)=>{
  triggerInstrument(panel.dataset.instrument,event.note,when,panel.id,{
   // Preserve the source register. Sample auditions otherwise default to the
   // instrument's base octave and flatten cross-octave contours.
   pitchShift:true,octave:Math.floor(event.midi/12)-1,
   onPlaybackScheduled:admission=>{
    admittedToyVisual(panel,{nodeIndex:event.nodeIndex,eventId:event.eventKey},admission,audioTimeToTick);
    panel.dispatchEvent(new CustomEvent('freeplay-line:admitted',{bubbles:true,detail:{nodeIndex:event.nodeIndex,note:admission.note,when:admission.when,eventTick:event.eventTick,offsetTick:event.offsetTick,toyId:admission.occurrence?.instanceToyId||panel.id,occurrenceId:admission.occurrence?.occurrenceId}}));
   },
  });
 };
 const onVisual=e=>{if(Number.isInteger(e.detail.nodeIndex))flashes.set(e.detail.nodeIndex,performance.now());};
 panel.addEventListener('toy:playback-visual',onVisual);
 function draw(){
  if(disposed)return;
  // The full-screen playground draws these same canonical sources itself.
  if(!document.body.classList.contains('free-play-active')){
   const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
   const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
   drawMusicalLine(ctx,panel.__freePlayLineState,{width:r.width,height:r.height,phase:linePlaybackPhase(getPlaybackInstance(panel.id),getPanelTransport(panel)?.currentTick||0),flashes,now:performance.now()});
  }frame=requestAnimationFrame(draw);
 }
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);cancelScheduledToySources(panel.id);removePlaybackInstance(panel.id);panel.removeEventListener('toy:playback-visual',onVisual);}
 panel.addEventListener('toy:remove',dispose,{once:true});
 panel.__toyInstance={dispose};
 if(panel.__pendingFreePlayLineState){panel.__applyFreePlayLineSnapshot(panel.__pendingFreePlayLineState);delete panel.__pendingFreePlayLineState;}
 frame=requestAnimationFrame(draw);
}
