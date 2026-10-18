// Opt-in local QA: expose canonical geometry, real audio admissions, and due
// visual events in the DOM. No alternate playback or composition path.
import {getPlaybackInstance} from '../src/playback-instances.js';
import {transportRegistry} from '../src/transport-registry.js';
import {connectionModel} from '../src/connections.js';
import {ensureAudioContext} from '../src/audio-core.js';
import {lineHighlight} from '../src/free-play-line-visual.js';
import {surfacePaint} from '../src/free-play-surface-paint.js';
import {heartbeatModel} from '../src/heartbeats.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
export function observeFreePlay(freePlay,onNote){
 const output=document.createElement('pre');output.dataset.freePlayProof='';output.style.cssText='font:10px monospace;white-space:pre-wrap;max-height:90px;overflow:auto;margin:4px 0;color:#cededc';document.querySelector('.free-play').append(output);
 const admitted=[],visuals=[],errors=[],drawings=[];let down=null,capEvidence=null;
 window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 document.addEventListener('pointerdown',e=>{if(e.target.matches('.free-play canvas'))down={at:performance.now(),admittedBefore:admitted.length,samples:1};},true);
 document.addEventListener('pointermove',e=>{if(down&&e.target.matches('.free-play canvas'))down.samples++;},true);
 document.addEventListener('pointerup',e=>{if(down){drawings.push({...down,durationMs:performance.now()-down.at,admittedBeforeRelease:admitted.length});down=null;}},true);
 document.addEventListener('freeplay-line:admitted',e=>{const t=transportRegistry.get(connectionModel.getTransportId(e.detail.toyId));admitted.push({...e.detail,leadMs:(e.detail.when-ensureAudioContext().currentTime)*1000,scheduledAtTick:t?.currentTick});});
 onNote((id,event)=>{const t=transportRegistry.get(connectionModel.getTransportId(id));visuals.push({id,nodeIndex:event.nodeIndex,note:event.note,eventTick:event.eventTick,dueTick:event.dueTick,observedTick:t?.currentTick});});
 setInterval(()=>{
  const session=freePlay.getSession(),lines=session.lines.map(line=>{const source=line.source,t=transportRegistry.get(MAIN_TRANSPORT_ID);return {...line,transport:{id:t.id,state:t.state,tick:t.currentTick,bpm:t.bpm},highlight:lineHighlight(source,line.phase),grids:line.panelIds.map(id=>{const p=document.getElementById(id);return {id,type:p?.dataset.toy,definitionId:p?.dataset.sharedDefinitionId,metadata:p?.__freePlayDrawGrid,pattern:p?.__seqPattern,editorNotes:p?.__dgAuthoredNotes,sharedNotes:p?.__sharedToyState?.authoredNotes,parent:connectionModel.getParent(id)};})};});
  if(session.capped)capEvidence={length:session.stroke.totalLength,points:session.stroke.points.length,message:document.querySelector('.free-play-hint').textContent};
  const main=transportRegistry.get(MAIN_TRANSPORT_ID);
  output.textContent=JSON.stringify({boardGrids:[...document.querySelectorAll('.toy-panel[data-free-play-stroke-id]')].map(p=>({id:p.id,notes:p.__dgAuthoredNotes,sharedNotes:p.__sharedToyState?.authoredNotes,pattern:p.__seqPattern})),silence:session.silence,surfacePaint:surfacePaint(),drawing:session.drawing,capped:session.capped,capEvidence,stroke:session.stroke,drawings,lines,admitted,visuals,errors,main:main.getState(),heartbeats:heartbeatModel.list().map(h=>({id:h.id,name:h.name})),shell:{headers:document.querySelectorAll('#topbar').length,sceneHeaders:document.querySelectorAll('.free-play header').length,sceneTransportControls:document.querySelectorAll('.free-play [data-stop],.free-play [data-action="toggle-play"],.free-play input[type=range]').length},toys:document.querySelectorAll('.toy-panel').length,now:performance.now()});
 },250);
}
