// Optional local QA overlay, loaded only by a test server. Uses production APIs.
import {ensureAudioContext,getToyGain,resumeAudioContextIfNeeded} from '../src/audio-core.js';
import {screenToWorld} from '../src/board-viewport.js';
import {rippleObjects} from '../src/simple-ripple.js';
import {boardPhysicalObjects} from '../src/board-physical-objects.js';
const overlay=document.createElement('aside');overlay.id='ripple-qa';overlay.style.cssText='position:fixed;left:150px;top:80px;z-index:30000;background:#102136;color:white;padding:8px;font:12px monospace;width:390px;max-height:160px;overflow:auto';
const fixtures=document.createElement('button');fixtures.textContent='Set up radial receivers';
const observe=document.createElement('button');observe.textContent='Observe production audio';
const clear=document.createElement('button');clear.textContent='Reset audio observations';
const status=document.createElement('output');status.style.cssText='display:block;white-space:pre-wrap';status.setAttribute('aria-label','Ripple QA observations');overlay.append(fixtures,observe,clear,status);document.body.append(overlay);
let analyser,samples,peak=0,notes=[],fixtureIds=[],artId=null;
fixtures.onclick=()=>{
 const origin=screenToWorld({x:650,y:500});
 fixtureIds=[150,300,450].map((d,i)=>window.BoardObjects.create('cube',{x:origin.x+d,y:origin.y,sourceMidi:[60,64,67][i]}).id);
 const art=window.BoardObjects.create('decorative-art',{showControlsOnSpawn:false});artId=art.id;window.BoardObjects.move(art.id,origin.x+220,origin.y);
 render();
};
observe.onclick=async()=>{await resumeAudioContextIfNeeded();if(!analyser){analyser=ensureAudioContext().createAnalyser();analyser.fftSize=2048;samples=new Float32Array(analyser.fftSize);getToyGain('master').connect(analyser);}render();};
clear.onclick=()=>{peak=0;notes=[];render();};
window.addEventListener('toy:note',e=>{notes.push({toyId:e.detail.toyId,note:e.detail.note,instrument:e.detail.instrument,when:e.detail.when});render();});
function render(){
 status.textContent=JSON.stringify({peak:Number(peak.toFixed(6)),notes,receivers:(fixtureIds.length?fixtureIds:boardPhysicalObjects.list('cube').map(o=>o.id)).map(id=>{const o=boardPhysicalObjects.get(id);return {id,pitch:o?.sourceMidi,x:o?.x,y:o?.y};}),artPresent:!!document.querySelector('.art-toy-panel:not(.internal-art-anchor-ghost)'),ripples:rippleObjects.list().map(o=>({id:o.id,...o.transform,...o.authoredState})),paintCount:document.querySelectorAll('[data-presentation="simple-draw"]').length,cannonCount:document.querySelectorAll('[data-presentation="simple-bouncer"]').length},null,1);
}
setInterval(()=>{if(analyser){analyser.getFloatTimeDomainData(samples);for(const v of samples)peak=Math.max(peak,Math.abs(v));}render();},100);
