import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {getToyVolumeRaw,isToyMuted} from './audio-core.js';

// Project child audio state; empty Paint retains settings to apply to its next line.
export function installContainerVolumeUI(host,panel,{containers,getToy}){
 const children=()=> (containers.get(panel.id)?.internalToyIds||[]).map(getToy).filter(Boolean);
 const audioId=p=>p.__audioToyId||p.dataset.audiotoyid||p.id;
 let mounted=false;
 function sync(){
  const first=children()[0];
  panel.__audioToyId=first?audioId(first):panel.id;
  const c=containers.get(panel.id),paint=c?.presentation.type==='simple-draw',saved=c?.presentation.state.audioSettings;
  const volume=first?getToyVolumeRaw(audioId(first)):(saved?.volume??(paint ? .65 : 1)),muted=first?isToyMuted(audioId(first)):(saved?.muted??false);
  panel.dataset.toyVolume=String(volume);panel.dataset.toyMuted=muted?'1':'0';
  if(!mounted){installVolumeUI(host,{panel});mounted=true;}
  syncVolumeUI(panel,{volume,muted});
  for(const control of host.querySelectorAll('input,button'))control.disabled=!first&&!paint;
 }
 function change(event){
  if(event.detail?.toyId!==panel.id)return;
  const mute=event.type==='toy-mute',value=mute?!!event.detail.muted:Number(event.detail.value);
  if(!mute&&!Number.isFinite(value))return;
  const c=containers.get(panel.id);
  if(c?.presentation.type==='simple-draw'){
   const saved=c.presentation.state.audioSettings||{volume:Number(panel.dataset.toyVolume??.65),muted:panel.dataset.toyMuted==='1'};
   containers.setPresentation(panel.id,{state:{audioSettings:{...saved,...(mute?{muted:value}:{volume:value})}}});
  }
  for(const child of children()){
   child.dataset[mute?'toyMuted':'toyVolume']=mute?(value?'1':'0'):String(value);
   window.dispatchEvent(new CustomEvent(event.type,{detail:{toyId:child.id,...(mute?{muted:value}:{value})}}));
  }
  window.Persistence?.markDirty?.();
 }
 window.addEventListener('toy-volume',change);window.addEventListener('toy-mute',change);sync();
 return {sync,dispose(){window.removeEventListener('toy-volume',change);window.removeEventListener('toy-mute',change);}};
}
