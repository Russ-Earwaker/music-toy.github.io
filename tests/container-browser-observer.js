import {containerToyModel} from '../src/container-toys.js';
import {connectionModel} from '../src/connections.js';
import {getPlaybackInstance} from '../src/playback-instances.js';
// Opt-in local QA, no commands or alternate scheduling path.
export function observeContainers({getSurfaceProof=()=>[]}={}){
 const proof=document.createElement('pre');proof.dataset.containerProof='';proof.style.cssText='position:fixed;bottom:8px;left:8px;max-width:500px;max-height:65px;overflow:auto;background:#102030;color:white;z-index:1000;font:9px monospace';document.body.append(proof);
 const admitted=[],errors=[],boundsInteractions=[],creationStates=[];
 new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.matches?.('.simple-draw-creation-stroke'))))creationStates.push({containers:containerToyModel.list().length,temporaryStroke:!!document.querySelector('.simple-draw-creation-stroke')});}).observe(document.body,{childList:true,subtree:true});
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>{if(!e.target.closest?.('canvas,.board-viewport'))return;queueMicrotask(()=>{boundsInteractions.push({type,buttons:e.buttons,temporaryStroke:!!document.querySelector('.simple-draw-creation-stroke'),containers:containerToyModel.snapshot().map(c=>({id:c.id,bounds:c.bounds}))});if(boundsInteractions.length>256)boundsInteractions.shift();});},true);
 document.addEventListener('drawgrid:note-admitted',e=>admitted.push(e.detail));window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 setInterval(()=>{proof.textContent=JSON.stringify({surfaces:getSurfaceProof(),containers:containerToyModel.snapshot(),connections:connectionModel.snapshot().connections,admitted,errors,boundsInteractions,creationStates,toys:[...document.querySelectorAll('.toy-panel[data-toy]')].map(p=>({id:p.id,notes:p.__dgAuthoredNotes,strokes:p.__drawToy?.getState?.().strokes,metadata:p.__freePlayDrawGrid,instance:getPlaybackInstance(p.id),visible:containerToyModel.isVisible(p.id),x:parseFloat(p.style.left),y:parseFloat(p.style.top)}))});},250);
}
