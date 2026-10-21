// Optional QA only: observe production events and the real audio output bus.
import {ensureAudioContext,getToyGain,resumeAudioContextIfNeeded,transport} from '../src/audio-core.js';
import {drumObjects} from '../src/simple-drum.js';
const panel=document.createElement('aside');panel.style.cssText='position:fixed;left:150px;top:80px;z-index:30000;background:#102136;color:white;padding:8px;font:12px monospace;width:360px;max-height:140px;overflow:auto';
const observe=document.createElement('button');observe.textContent='Observe Drum audio';
const reset=document.createElement('button');reset.textContent='Reset Drum observations';
const touch=document.createElement('button');touch.textContent='Simulate touch taps';
const status=document.createElement('output');status.setAttribute('aria-label','Drum QA observations');status.style.cssText='display:block;white-space:pre-wrap';panel.append(observe,reset,touch,status);document.body.append(panel);
let analyser,samples,peak=0,notes=[];
observe.onclick=async()=>{await resumeAudioContextIfNeeded();if(!analyser){analyser=ensureAudioContext().createAnalyser();analyser.fftSize=2048;samples=new Float32Array(analyser.fftSize);getToyGain('master').connect(analyser);}render();};
reset.onclick=()=>{peak=0;notes=[];render();};
touch.onclick=()=>{
 for(const pad of document.querySelectorAll('.simple-drum-pad'))for(let i=0;i<3;i++){
  const r=pad.getBoundingClientRect(),base={bubbles:true,cancelable:true,pointerType:'touch',pointerId:100+i,isPrimary:true,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
  pad.dispatchEvent(new PointerEvent('pointerdown',{...base,buttons:1}));pad.dispatchEvent(new PointerEvent('pointerup',{...base,buttons:0}));pad.dispatchEvent(new PointerEvent('click',{...base,detail:1}));
 }
};
window.addEventListener('toy:note',e=>{if(String(e.detail.toyId).startsWith('drum-')){notes.push({id:e.detail.toyId,instrument:e.detail.instrument,note:e.detail.note,when:e.detail.when,observedAt:ensureAudioContext().currentTime});render();}});
function render(){status.textContent=JSON.stringify({peak:Number(peak.toFixed(6)),notes,transport:transport.state,tick:transport.currentTick,drums:drumObjects.list()},null,1);}
setInterval(()=>{if(analyser){analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));}render();},50);
