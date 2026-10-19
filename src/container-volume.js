import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {getToyVolumeRaw,isToyMuted} from './audio-core.js';

// A group UI projects canonical child audio state. There is no saved wrapper gain.
export function installContainerVolumeUI(host,panel,{containers,getToy}){
 const children=()=> (containers.get(panel.id)?.internalToyIds||[]).map(getToy).filter(Boolean);
 const audioId=p=>p.__audioToyId||p.dataset.audiotoyid||p.id;
 let mounted=false;
 function sync(){
  const first=children()[0];
  panel.__audioToyId=first?audioId(first):panel.id;
  const volume=first?getToyVolumeRaw(audioId(first)):1,muted=first?isToyMuted(audioId(first)):false;
  panel.dataset.toyVolume=String(volume);panel.dataset.toyMuted=muted?'1':'0';
  if(!mounted){installVolumeUI(host,{panel});mounted=true;}
  syncVolumeUI(panel,{volume,muted});
  for(const control of host.querySelectorAll('input,button'))control.disabled=!first;
 }
 function change(event){
  if(event.detail?.toyId!==panel.id)return;
  const mute=event.type==='toy-mute',value=mute?!!event.detail.muted:Number(event.detail.value);
  if(!mute&&!Number.isFinite(value))return;
  for(const child of children()){
   child.dataset[mute?'toyMuted':'toyVolume']=mute?(value?'1':'0'):String(value);
   window.dispatchEvent(new CustomEvent(event.type,{detail:{toyId:child.id,...(mute?{muted:value}:{value})}}));
  }
  window.Persistence?.markDirty?.();
 }
 window.addEventListener('toy-volume',change);window.addEventListener('toy-mute',change);sync();
 return {sync,dispose(){window.removeEventListener('toy-volume',change);window.removeEventListener('toy-mute',change);}};
}
