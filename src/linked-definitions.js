// Scene format owns definitions independently of visible editor IDs. The
// projection is a compatibility adapter for the existing toy factory/compiler.
import {repairDrawgridPhraseStrokes} from './drawgrid/dg-phrase-chunks.js';
export function storeLinkedDefinitions(snapshot,records=[]){
 const snap=structuredClone(snapshot),known=new Map(records.map(r=>[r.id,r]));
 const toys=new Map(snap.toys.map(t=>[t.id,t]));
 snap.sharedToyDefinitions=[];snap.sharedSequenceDefinitions=[];
 const definitions=new Map();
 for(const view of snap.toys){
  if(!view.sharedDefinitionId&&!view.masterToyId)continue;
  const source=toys.get(view.masterToyId)||view,id=view.sharedDefinitionId||source.sharedDefinitionId||'toy-definition:'+source.id;
  view.sharedDefinitionId=id;
  if(!definitions.has(id)){
   const record=known.get(id),definition={id,type:source.type,name:record?.name||source.toyName,serial:record?.serial||source.instanceSerial||0,bus:record?.bus||'shared-audio:'+id,state:record?.state||source.state,volume:source.volume,muted:source.muted};
   // Ownership/fill tags are authored metadata, not the transient editor cache.
   definition.state={...definition.state,...Object.fromEntries(Object.entries(source.state||{}).filter(([k])=>k.startsWith('autoArrange')))};
   definitions.set(id,definition);snap.sharedToyDefinitions.push(definition);
  }
  delete view.masterToyId;delete view.state;delete view.volume;delete view.muted;delete view.instanceSerial;
 }
 const structures=new Map(snap.structureToys.map(s=>[s.id,s])),seen=new Set();
 for(const view of snap.structureToys){
  if(!view.sharedDefinitionId&&!view.masterStructureId)continue;
  const source=structures.get(view.masterStructureId)||view,id=view.sharedDefinitionId||source.sharedDefinitionId||'sequence-definition:'+source.id;view.sharedDefinitionId=id;
  if(!seen.has(id)){seen.add(id);snap.sharedSequenceDefinitions.push({id,type:'sequence',name:source.sharedName||source.name,children:source.sharedChildren,serial:source.structureInstanceSerial||0,autoArrangePhrase:source.autoArrangePhrase});}
  delete view.masterStructureId;delete view.sharedChildren;delete view.sharedName;delete view.structureInstanceSerial;delete view.autoArrangePhrase;
 }
 return snap;
}

export function projectLinkedDefinitions(snapshot){
 if(!snapshot?.sharedToyDefinitions&&!snapshot?.sharedSequenceDefinitions)return snapshot;
 const snap=structuredClone(snapshot),toys=new Map((snap.sharedToyDefinitions||[]).map(d=>[d.id,d])),sequences=new Map((snap.sharedSequenceDefinitions||[]).map(d=>[d.id,d]));
 for(const sequence of sequences.values())if(sequence.autoArrangePhrase&&sequence.children?.length===4){const children=sequence.children.map(slot=>toys.get(slot.toyDefinitionId));if(children.every(Boolean)){const repaired=repairDrawgridPhraseStrokes(children.map(d=>d.state));children.forEach((d,i)=>{d.state=repaired[i];});}}
 const representatives=new Map();
 for(const view of snap.toys||[]){
  const d=toys.get(view.sharedDefinitionId);if(!d)continue;
  const first=representatives.get(d.id);view.state=first?{}:structuredClone(d.state);view.toyName=d.name;
  if(first){view.masterToyId=first;view.instanceNumber=view.linkedCopyNumber||view.instanceNumber;}
  else{representatives.set(d.id,view.id);delete view.masterToyId;view.instanceSerial=d.serial;view.volume=d.volume;view.muted=d.muted;view.sharedDefinitionData=d;}
 }
 representatives.clear();
 for(const view of snap.structureToys||[]){
  const d=sequences.get(view.sharedDefinitionId);if(!d)continue;
  const first=representatives.get(d.id);
  if(first){view.masterStructureId=first;view.structureInstanceNumber=view.linkedCopyNumber||view.structureInstanceNumber;}
  else{representatives.set(d.id,view.id);delete view.masterStructureId;Object.assign(view,{sharedName:d.name,sharedChildren:d.children,structureInstanceSerial:d.serial,autoArrangePhrase:d.autoArrangePhrase});}
 }
 return snap;
}
