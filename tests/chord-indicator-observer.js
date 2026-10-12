// Test-only observer, loaded into the normal board by the browser harness.
import {getPanelTransport} from '../src/panel-transport.js';
import {getPlaybackInstance} from '../src/playback-instances.js';
import {instrumentMusicalRole} from '../src/audio-samples.js';
window.__chordIndicatorObservations=[];
window.__readChordIndicatorStatus=()=>[...document.querySelectorAll('.toy-panel[id]')].map(panel=>({
  toyId:panel.id,role:instrumentMusicalRole(panel.dataset.instrument,panel.dataset.toy,panel.dataset.musicalRole),
  label:panel.querySelector('.toy-active-chord:not([hidden])')?.textContent||null,
  playing:getPanelTransport(panel)?.state==='playing',width:panel.offsetWidth,height:panel.offsetHeight,
}));
const signatures=new WeakMap();
new MutationObserver(records=>{
  const panels=new Set();
  for(const record of records){
    const target=record.target.nodeType===1?record.target:record.target.parentElement;
    const badge=target?.closest('.toy-active-chord');
    if(badge)panels.add(badge.closest('.toy-panel'));
    for(const added of record.addedNodes)if(added.nodeType===1)
      for(const badge of added.matches('.toy-active-chord')?[added]:added.querySelectorAll('.toy-active-chord'))panels.add(badge.closest('.toy-panel'));
  }
  for(const panel of panels){
    if(!panel?.isConnected)continue;
    const badge=panel.querySelector('.toy-active-chord'),signature=badge.textContent+'|'+badge.hidden;
    if(signatures.get(panel)===signature)continue;signatures.set(panel,signature);
    const transport=getPanelTransport(panel),instance=getPlaybackInstance(panel.id);
    window.__chordIndicatorObservations.push({toyId:panel.id,masterToyId:panel.dataset.masterToyId||null,
      label:badge.hidden?null:badge.textContent,currentTick:transport?.currentTick,playing:transport?.state==='playing',
      role:instrumentMusicalRole(panel.dataset.instrument,panel.dataset.toy,panel.dataset.musicalRole),
      occurrenceId:instance?.occurrenceId,context:instance?.context,startTick:instance?.startTick,endTick:instance?.endTick,
      width:panel.offsetWidth,height:panel.offsetHeight});
  }
}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
