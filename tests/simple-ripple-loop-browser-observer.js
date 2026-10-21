import {ensureAudioContext,getToyGain,resumeAudioContextIfNeeded} from '../src/audio-core.js';
import {rippleObjects} from '../src/simple-ripple.js';
import {boardPhysicalObjects} from '../src/board-physical-objects.js';
import {transportRegistry,MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {connectionModel} from '../src/connections.js';
import {heartbeatModel} from '../src/heartbeats.js';
const t=transportRegistry.get(MAIN_TRANSPORT_ID),box=document.createElement('aside');
box.style.cssText='position:fixed;left:15px;top:80px;z-index:30000;background:#102136;color:white;padding:8px;font:12px monospace;width:420px;max-height:210px;overflow:auto';
const output=document.createElement('output');output.setAttribute('aria-label','Ripple loop QA');output.style.whiteSpace='pre-wrap';
let notes=[],flashes=[],peak=0,analyser,samples,lastFlash=new Map();
function button(name,fn){const b=document.createElement('button');b.textContent=name;b.onclick=fn;box.append(b);}
button('Radial Cube fixtures',()=>{for(const [i,x]of [800,950,1100].entries())window.BoardObjects.create('cube',{x,y:440,sourceMidi:[60,64,67][i]});});
button('Twin note fixtures',()=>{for(const y of [380,500])window.BoardObjects.create('cube',{x:1200,y,sourceMidi:72});});
button('Observe loop audio',async()=>{await resumeAudioContextIfNeeded();if(!analyser){analyser=ensureAudioContext().createAnalyser();analyser.fftSize=2048;samples=new Float32Array(2048);getToyGain('master').connect(analyser);}});
button('Reset loop observations',()=>{notes=[];flashes=[];peak=0;lastFlash.clear();});
button('Disconnect Ripple',()=>{for(const o of rippleObjects.list()){const p=connectionModel.getParent(o.id);if(p)connectionModel.disconnect(p.id);}});
button('Reconnect Ripple',()=>{for(const o of rippleObjects.list())connectionModel.connect('transport',{objectId:heartbeatModel.target().id,portId:'output'},{objectId:o.id,portId:'input'});});
button('Move first Cube',()=>{const o=boardPhysicalObjects.list('cube')[0];if(o)window.BoardObjects.move(o.id,1200,440);});
button('Tempo 60',()=>t.setBpm(60));button('Tempo 120',()=>t.setBpm(120));
box.append(output);document.body.append(box);
window.addEventListener('toy:note',e=>{if(!rippleObjects.get(e.detail.toyId))return;notes.push({id:e.detail.toyId,note:e.detail.note,when:e.detail.when,tick:t.audioTimeToTick(e.detail.when)});});
function render(){
 if(analyser){analyser.getFloatTimeDomainData(samples);for(const v of samples)peak=Math.max(peak,Math.abs(v));}
 for(const o of boardPhysicalObjects.list('cube')){const n=document.getElementById(o.id),v=Number(n?.style.getPropertyValue('--cube-flash'));if(v>0&&!lastFlash.get(o.id))flashes.push({id:o.id,tick:t.currentTick});lastFlash.set(o.id,v>0);}
 output.textContent=JSON.stringify({tick:t.currentTick,state:t.state,bpm:t.bpm,peak,notes:notes.slice(-24),flashes:flashes.slice(-24),cubes:boardPhysicalObjects.list('cube').map(o=>({id:o.id,x:o.x,y:o.y})),ripples:rippleObjects.list().map(o=>({id:o.id,x:o.transform.x,y:o.transform.y,period:o.authoredState.periodLoops,connected:!!connectionModel.getTransportId(o.id)})),rings:[...document.querySelectorAll('.simple-ripple-wave')].map(n=>Number(n.getAttribute('r')))},null,1);
 requestAnimationFrame(render);
}render();
