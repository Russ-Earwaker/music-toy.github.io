import {renderQuality,simplePaintDrawEffects} from '../../runtime-config.js';
import {installPaintGestureParticles} from '../../simple-paint-particles.js';
import {createPaintRenderState} from './paint-render-state.js';

// Stable input interface: begin(worldPoint), move(worldPoint), release(), stop().
// Standard remains its existing implementation; only the adapter selects a backend.
export const resolveHighPaintBackend=value=>value==='particles'?'particles':'fluid';
export function installPaintPresentation(options={},dependencies={}) {
 const win=options.window??globalThis.window;
 const config={getInstrument:()=> 'PIANO',...options,window:win};
 const quality=options.quality??renderQuality;
 const standard=dependencies.standard??installPaintGestureParticles;
 const highBackend=resolveHighPaintBackend(options.highBackend??new URLSearchParams(win.location?.search??globalThis.location?.search??'').get('highBackend'));
 const loadHigh=dependencies.loadHigh??(highBackend==='particles'?()=>import('./high/high-paint-renderer.js'):()=>import('./fluid/high-fluid-renderer.js'));
 const warn=dependencies.warn??console.warn;
 const capture=createPaintRenderState(config);
 let renderer=null,pending=[],loading=null,effectiveQuality=quality,lastState=null,disposed=false;
 function useStandard(reason){
  if(reason)warn('[Rhythmake] High Paint unavailable; using Standard.',reason);
  renderer?.destroy?.();renderer?.stop();effectiveQuality='standard';
  renderer=standard(config);for(const state of pending)deliver(state);pending=[];
 }
 function deliver(state){
  if(renderer.consume)renderer.consume(state);
  else if(state.event==='begin'||state.event==='move')renderer[state.event](state.pointer);
  else renderer[state.event]?.();
 }
 function fallback(error){
  // Replay only the current visual gesture. Musical input is never replayed.
  const state=lastState;
  pending=state?.pointer&&state.event!=='stop'?[{...state,event:'begin'},...(state.drawing?[]:[{...state,event:'release'}])]:[];
  useStandard(error);
 }
 function send(event,point){
  if(disposed)return;
  const state=lastState=capture(event,point);
  if(renderer){deliver(state);return;}
  if(event==='stop'){pending=[];return;}
  if(quality!=='high'||state.reduced){useStandard();deliver(state);return;}
  pending.push(state);
  if(!loading){
   loading=loadHigh().then(module=>{
    if(disposed||renderer)return;
    renderer=module.installHighPaintRenderer({...config,onFailure:fallback});
    const events=pending;pending=[];for(const item of events)deliver(item);
   }).catch(error=>{if(!disposed)useStandard(error);})
    .finally(()=>{loading=null;});
  }
 }
 const hidden=()=>{if((config.document??globalThis.document).hidden)send('stop');};
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 const changed=()=>{if(motion.matches&&effectiveQuality==='high'){send('stop');useStandard();}};
 (config.document??globalThis.document).addEventListener('visibilitychange',hidden);
 motion.addEventListener?.('change',changed);
 return {begin:p=>send('begin',p),move:p=>send('move',p),release:()=>send('release'),stop:()=>send('stop'),
  refresh:()=>renderer?.refresh?.(),
  destroy(){send('stop');disposed=true;renderer?.destroy?.();motion.removeEventListener?.('change',changed);(config.document??globalThis.document).removeEventListener?.('visibilitychange',hidden);},
  getProof:()=>({...renderer?.getProof?.(),requestedQuality:quality,effectiveQuality,highBackend,loading:!!loading,presentation:lastState}),
  get ready(){return loading??Promise.resolve();}};
}


// Production uses the existing SVG line feedback while medium experiments are disabled.
// Experiments call installPaintPresentation directly and retain quality/backend selection.
export function installProductionPaintPresentation(options={},dependencies={}){
 if(simplePaintDrawEffects)return installPaintPresentation(options,dependencies);
 const noop=()=>{};
 return {begin:noop,move:noop,release:noop,stop:noop,refresh:noop,destroy:noop,ready:Promise.resolve(),getProof:()=>({effectsEnabled:false,effectiveQuality:'none'})};
}
