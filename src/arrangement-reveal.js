import {instrumentColour} from './instrument-colours.js';

// Presentation only: provenance follows shared definitions, never a privileged
// board copy. No audio, transport, source data or connection model is changed.
export function arrangementPresentation(result,panels){
 const report=result.inputReport||{},unused=new Set((report.unused||[]).map(e=>e.id));
 const authored=report.authoredSourceIds||(report.inputs||[]).filter(e=>!e.generated&&!e.empty&&!unused.has(e.id)&&!e.reason).map(e=>e.id);
 const definitions=new Set(authored.map(id=>panels.find(p=>p.id===id)?.dataset.sharedDefinitionId||report.inputs?.find(e=>e.id===id)?.definitionId||id));
 const visible=new Set(result.created||[]);
 const mine=panels.filter(p=>visible.has(p.id)&&definitions.has(p.dataset.sharedDefinitionId||p.id)).map(p=>p.id);
 return {authoredIds:mine,usedCount:new Set(panels.filter(p=>mine.includes(p.id)).map(p=>p.dataset.sharedDefinitionId||p.id)).size,
  addedCount:(report.generated||[]).length};
}

export function createArrangementReveal({getPanels,getStructures=()=>[]}){
 let flashed=[],timer;
 function clear(){clearTimeout(timer);for(const p of flashed){p.classList.remove('arrange-authored','arrange-added');p.style.removeProperty?.('--arrange-delay');}flashed=[];}
 function show(result,{onlyAuthored=false}={}){
  clear();if(!result)return;
  const panels=getPanels(),presentation=arrangementPresentation(result,panels),mine=new Set(presentation.authoredIds),visible=new Set(result.created||[]);
  for(const p of panels){if(!visible.has(p.id)||onlyAuthored&&!mine.has(p.id))continue;
   p.style.setProperty('--relationship-colour',instrumentColour(p.dataset.instrument||''));void p.offsetWidth;
   p.classList.add(mine.has(p.id)?'arrange-authored':'arrange-added');flashed.push(p);
  }
  if(!onlyAuthored)for(const [i,p]of getStructures().filter(p=>visible.has(p.id)).entries()){
   p.style.setProperty('--arrange-delay',Math.min(i*35,350)+'ms');p.classList.add('arrange-added');flashed.push(p);
  }
  timer=setTimeout(clear,2100);
  return presentation;
 }
 return {show,clear};
}
