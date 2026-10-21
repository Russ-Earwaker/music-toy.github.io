import {boardPhysicalObjects} from '../src/board-physical-objects.js';
import {rippleObjects} from '../src/simple-ripple.js';
import {containerToyModel} from '../src/container-toys.js';
import {ensureAudioContext,getToyGain,resumeAudioContextIfNeeded} from '../src/audio-core.js';
const box=document.createElement('aside');box.style.cssText='position:fixed;left:15px;top:90px;z-index:30000;background:#102136;color:white;padding:8px;font:12px monospace;width:420px;max-height:210px;overflow:auto';
const button=document.createElement('button');button.textContent='Observe starter audio';const status=document.createElement('output');status.setAttribute('aria-label','Trigger starter QA');status.style.whiteSpace='pre-wrap';box.append(button,status);document.body.append(box);
let analyser,samples,peak=0,notes=[],previews=[],lastPreview='',flashes=[],flashed=new Set();
button.onclick=async()=>{await resumeAudioContextIfNeeded();analyser??=ensureAudioContext().createAnalyser();analyser.fftSize=2048;samples=new Float32Array(2048);getToyGain('master').connect(analyser);};
function record(value){if(!value||value===lastPreview)return;lastPreview=value;const points=value.split(' ');previews.push({count:points.length,start:points[0],next:points[1],end:points.at(-1)});}
new MutationObserver(records=>{for(const r of records)if(r.target.classList.contains('physical-creation-prediction')){record(r.oldValue);record(r.target.getAttribute('points'));}}).observe(document.getElementById('board'),{subtree:true,attributes:true,attributeFilter:['points'],attributeOldValue:true});
window.addEventListener('toy:note',e=>{notes.push({id:e.detail.toyId,note:e.detail.note,instrument:e.detail.instrument,when:e.detail.when});});
function render(){if(analyser){analyser.getFloatTimeDomainData(samples);for(const v of samples)peak=Math.max(peak,Math.abs(v));}
 const cubes=boardPhysicalObjects.list('cube');for(const c of cubes){const v=Number(document.getElementById(c.id)?.style.getPropertyValue('--cube-flash'));if(v>0&&!flashed.has(c.id)){flashed.add(c.id);flashes.push(c.id);}}
 const cannons=containerToyModel.list().filter(c=>c.presentation.type==='simple-bouncer').map(c=>({id:c.id,launch:c.interactionData.launch,collisions:c.interactionData.capture?.collisions?.map(h=>({id:h.cubeId,tick:h.tick})),previewMatches:!!lastPreview&&c.interactionData.capture?.trajectory?.map(p=>p.x+','+p.y).join(' ')===lastPreview}));
 status.textContent=JSON.stringify({cubes:cubes.map(c=>({id:c.id,x:c.x,y:c.y,pitch:c.sourceMidi})),balls:boardPhysicalObjects.list('ball').length,ripples:rippleObjects.list().length,cannons,previewSamples:previews.slice(-5),previewVisible:!!document.querySelector('.physical-creation-prediction')?.getAttribute('points'),flashes,notes:notes.slice(-10),peak},null,1);requestAnimationFrame(render);
}render();
