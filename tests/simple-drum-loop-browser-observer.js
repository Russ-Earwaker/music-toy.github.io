import {drumObjects} from '../src/simple-drum.js';
import {rippleObjects} from '../src/simple-ripple.js';
import {containerToyModel} from '../src/container-toys.js';
import {connectionModel} from '../src/connections.js';
import {transportRegistry,MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {ensureAudioContext,getToyGain,resumeAudioContextIfNeeded} from '../src/audio-core.js';
const box=document.createElement('aside');box.style.cssText='position:fixed;left:15px;top:85px;z-index:30000;background:#102136;color:white;padding:8px;font:12px monospace;width:420px;max-height:220px;overflow:auto';
const status=document.createElement('output');status.setAttribute('aria-label','Drum loop QA');status.style.whiteSpace='pre-wrap';
let markerPulseObserved=false,notes=[],peak=0,analyser,samples,flashes=[],active=new Set();
function button(name,fn){const b=document.createElement('button');b.textContent=name;b.onclick=fn;box.append(b);}
button('Observe kit audio',async()=>{await resumeAudioContextIfNeeded();if(!analyser){analyser=ensureAudioContext().createAnalyser();analyser.fftSize=2048;samples=new Float32Array(2048);getToyGain('master').connect(analyser);}});
button('Reset kit observations',()=>{notes=[];peak=0;flashes=[];active.clear();});
button('Disconnect kit Ripple',()=>{for(const o of rippleObjects.list()){const p=connectionModel.getParent(o.id);if(p)connectionModel.disconnect(p.id);}});
box.append(status);document.body.append(box);
window.addEventListener('toy:note',e=>{notes.push({id:e.detail.toyId,instrument:e.detail.instrument,when:e.detail.when,tick:transportRegistry.get(MAIN_TRANSPORT_ID).audioTimeToTick(e.detail.when)});});
function render(){
 markerPulseObserved ||= [...document.querySelectorAll('.has-hit')].some(c=>c.getAnimations().length>0);
 if(analyser){analyser.getFloatTimeDomainData(samples);for(const v of samples)peak=Math.max(peak,Math.abs(v));}
 const t=transportRegistry.get(MAIN_TRANSPORT_ID),drums=drumObjects.list();
 for(const o of drums){const pad=document.getElementById(o.id)?.querySelector('.simple-drum-pad'),hit=!!pad?.getAnimations().length;if(hit&&!active.has(o.id))flashes.push({id:o.id,tick:t.currentTick});hit?active.add(o.id):active.delete(o.id);}
 const counts=new Map();for(const n of notes){const key=n.id+':'+n.when;counts.set(key,(counts.get(key)||0)+1);}
 status.textContent=JSON.stringify({tick:t.currentTick,state:t.state,bpm:t.bpm,peak,drums:drums.map(o=>({id:o.id,label:o.authoredState.label,x:o.transform.x,y:o.transform.y,instrument:o.authoredState.instrument,volume:o.authoredState.volume,period:o.authoredState.periodLoops,slots:o.authoredState.pattern.authoredNotes.map(n=>n.col)})),ripples:rippleObjects.list().length,cannons:containerToyModel.list().filter(c=>c.presentation.type==='simple-bouncer').map(c=>({id:c.id,collisions:c.interactionData.capture?.collisions?.map(h=>({receiver:h.cubeId,tick:h.tick,policy:h.receiverCapabilities?.triggerReceiver?.soundSource}))})),notes:notes.slice(-40),duplicates:[...counts].filter(([k,n])=>n>1),flashes:flashes.slice(-24),playhead:[...document.querySelectorAll('.drum-playhead')].map(c=>({tick:Number(c.dataset.tick),x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy'))})),markerPulseObserved,markerPulses:[...document.querySelectorAll('.has-hit')].filter(c=>c.getAnimations().length).length},null,1);requestAnimationFrame(render);
}render();
