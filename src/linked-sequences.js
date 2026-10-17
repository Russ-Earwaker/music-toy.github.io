// Canonical storage anchors are internal. All Sequence views can edit the same
// ordered child definitions, with independent local expansions and occurrences.
export function createLinkedSequenceController({model,structures,getToy,getPanels,createToyInstance,removeToy,placeChild,placeInstance,changed=()=>{}}){
 let busy=false,paused=false;
 const edges=id=>model.list('sequence').filter(e=>e.from.objectId===id).sort((a,b)=>Number(a.from.portId.split(':')[1])-Number(b.from.portId.split(':')[1]));
 const root=s=>s?.masterStructureId?structures.get(s.masterStructureId):s;
 const family=s=>structures.list().filter(q=>q.id===root(s)?.id||q.masterStructureId===root(s)?.id);
 const source=p=>p?.dataset.masterToyId?getToy(p.dataset.masterToyId):p;
 const definition=p=>{const s=source(p);if(!s)throw new Error('Missing linked toy definition.');return s.dataset.sharedDefinitionId ||= 'toy-definition:'+s.id;};
 const toyFor=id=>getPanels().find(p=>!p.dataset.masterToyId&&p.dataset.sharedDefinitionId===id);
 function describe(id){return edges(id).map(e=>{
  const p=getToy(e.to.objectId);if(!p||model.list('sequence').some(c=>c.from.objectId===p.id))throw new Error('Linked Sequences currently support direct toy children only.');
  return {slotId:p.dataset.structureMasterChildId||p.id,toyDefinitionId:definition(p)};
 });}
 function initialise(s){
  s=root(s);if(s?.type!=='sequence')throw new Error('Linked Copies currently support Sequence.');
  if(!s.sharedChildren){
   const children=describe(s.id),number=Math.max(s.structureInstanceSerial||0,...family(s).map(q=>q.structureInstanceNumber||0));
   structures.annotate(s.id,{sharedDefinitionId:'sequence-definition:'+s.id,sharedName:s.name,sharedChildren:children,structureInstanceSerial:number});
   for(const [i,e] of edges(s.id).entries()){const p=getToy(e.to.objectId);p.dataset.structureInstanceId=s.id;p.dataset.structureMasterChildId=children[i].slotId;}
  }
  if(!structures.get(s.id).sharedName){const current=structures.get(s.id),suffix=current.linkedCopyNumber||current.structureInstanceNumber;const name=current.name||'Phrase 1';structures.annotate(s.id,{sharedName:suffix&&name.endsWith('.'+suffix)?name.slice(0,-String(suffix).length-1):name});}
  return structures.get(s.id);
 }
 function syncView(view,canonical){
  if (canonical.autoArrangePhrase && !view.autoArrangePhrase) structures.annotate(view.id,{autoArrangePhrase:canonical.autoArrangePhrase});
  const owned=getPanels().filter(p=>p.dataset.structureInstanceId===view.id),wanted=canonical.sharedChildren.filter(slot=>!view.omittedChildSlots?.includes(slot.slotId)).map((slot,i)=>{
   let p=owned.find(p=>p.dataset.structureMasterChildId===slot.slotId);
   if(!p){const toy=toyFor(slot.toyDefinitionId);if(!toy)throw new Error('Missing shared toy '+slot.toyDefinitionId);const at=placeChild?.(view,i,toy)||{x:view.x+400,y:view.y+i*480};p=createToyInstance(toy,{structureInstanceId:view.id,structureMasterChildId:slot.slotId,autoArrangeOwner:view.autoArrange?.owner,ui:{left:at.x+'px',top:at.y+'px'}});}
   return p;
  });
  const before=edges(view.id);if(before.length!==wanted.length||before.some((e,i)=>e.to.objectId!==wanted[i].id||e.from.portId!=='child:'+i)){
   before.forEach(e=>model.disconnect(e.id));structures.annotate(view.id,{outputCount:Math.max(2,wanted.length+1)});
   wanted.forEach((p,i)=>{const result=model.connect('sequence',{objectId:view.id,portId:'child:'+i},{objectId:p.id,portId:'input'});if(!result.ok)throw new Error(result.reason);});
  }
  for(const p of owned)if(!wanted.includes(p)){
   // A membership edit must not discard the last authored toy definition.
   if(!p.dataset.masterToyId){const edge=model.getParent(p.id);if(edge)model.disconnect(edge.id);delete p.dataset.structureInstanceId;delete p.dataset.structureMasterChildId;}
   else removeToy(p);
  }
  const number=view.linkedCopyNumber||view.structureInstanceNumber;
  const base=canonical.sharedName||canonical.name,name=base+(number?'.'+number:'');
  if(view.sharedDefinitionId!==canonical.sharedDefinitionId||view.name!==name)structures.annotate(view.id,{sharedDefinitionId:canonical.sharedDefinitionId,name,linkedCopyNumber:number});
 }
 function sync(){if(busy||paused||structures.isSuspended())return;busy=true;
  try{model.transaction(()=>structures.suspend(()=>{
   for(const canonical of structures.list().filter(s=>!s.masterStructureId&&(s.sharedChildren||family(s).length>1))){const s=initialise(canonical);for(const view of family(s))syncView(view,s);}
  }));}finally{busy=false;}
 }
 function create(id,options={}){let canonical=root(structures.get(typeof id==='string'?id:id.id));if(canonical?.type!=='sequence')throw new Error('Linked Copies currently support Sequence.');describe(canonical.id);
  let copy;busy=true;
  try{model.transaction(()=>structures.suspend(()=>{
   canonical=initialise(canonical);
   const name=canonical.sharedName||canonical.name||'Phrase '+(structures.list().filter(s=>s.type==='sequence'&&!s.masterStructureId).length);
   const number=Math.max(canonical.structureInstanceSerial||0,...family(canonical).map(q=>q.linkedCopyNumber||q.structureInstanceNumber||0))+1;
   structures.annotate(canonical.id,{sharedName:name,name:name+(canonical.linkedCopyNumber?'.'+canonical.linkedCopyNumber:''),structureInstanceSerial:number});canonical=structures.get(canonical.id);
   const desired={x:options.x??canonical.x+440,y:options.y??canonical.y+number*480,width:224,height:Math.max(128,canonical.sharedChildren.length*56+88)},at=placeInstance?.(desired,canonical)||desired;
   copy=structures.createStandalone('sequence',{x:at.x,y:at.y,artOwnerId:canonical.artOwnerId,name:name+'.'+number,autoArrange:options.autoArrange,collapsed:false});
   structures.annotate(copy.id,{masterStructureId:canonical.id,sharedDefinitionId:canonical.sharedDefinitionId,structureInstanceNumber:number,linkedCopyNumber:number,autoArrangePhrase:canonical.autoArrangePhrase});copy=structures.get(copy.id);
   for(const view of family(canonical))syncView(view,canonical);
  }));}finally{busy=false;}changed();return structures.get(copy.id);
 }
 function editView(id){const view=structures.get(id);if(!view)return;let canonical=root(view);if(!canonical?.sharedChildren)return;
  const visible=describe(id);let index=0;
  const children=view.omittedChildSlots?.length?[...canonical.sharedChildren.map(slot=>view.omittedChildSlots.includes(slot.slotId)?slot:visible[index++]).filter(Boolean),...visible.slice(index)]:visible;
  if(JSON.stringify(children)===JSON.stringify(canonical.sharedChildren))return;
  busy=true;try{structures.annotate(canonical.id,{sharedChildren:children});for(const e of edges(id)){const p=getToy(e.to.objectId);p.dataset.structureInstanceId=id;p.dataset.structureMasterChildId ||=p.id;}}finally{busy=false;}sync();changed();
 }
 function cleanup(s){const previous=busy;busy=true;
  try{
   if(!s.masterStructureId&&s.sharedChildren){const others=family(s).filter(q=>q.id!==s.id);if(others.length){
    const next=others.sort((a,b)=>(a.linkedCopyNumber||a.structureInstanceNumber)-(b.linkedCopyNumber||b.structureInstanceNumber))[0];
    const base=s.sharedName||s.name;
    structures.annotate(next.id,{masterStructureId:null,sharedName:base,sharedChildren:s.sharedChildren,name:base+'.'+(next.linkedCopyNumber||next.structureInstanceNumber),structureInstanceSerial:s.structureInstanceSerial,autoArrange:null,autoArrangePhrase:s.autoArrangePhrase});
    for(const peer of others)if(peer.id!==next.id)structures.annotate(peer.id,{masterStructureId:next.id});
    for(const node of structures.list())if(node.autoArrange?.root&&node.autoArrange.sourceIds.melody===s.id)structures.annotate(node.id,{autoArrange:{...node.autoArrange,sourceIds:{...node.autoArrange.sourceIds,melody:next.id}}});
   }}
   for(const p of [...getPanels()])if(p.dataset.structureInstanceId===s.id)removeToy(p);
  }finally{busy=previous;}
 }
 const unsubscribe=model.subscribe(event=>{
  if(busy||paused||structures.isSuspended()||event.type!=='change'||event.transient||model.getEditing()?.suspended)return;
  const changedIds=new Set((event.events||[event]).flatMap(e=>[e.connection?.from.objectId,e.removed?.from.objectId]).filter(Boolean));
  for(const id of changedIds)if(structures.get(id)?.sharedDefinitionId)editView(id);
  sync();
 });
 const stop=model.addConnectionValidator(({from,to})=>{
  if(busy||paused||structures.isSuspended())return null;
  const s=structures.get(from.objectId),parent=model.getParent(from.objectId);
  if(s?.sharedDefinitionId&&(!getToy(to.objectId)||model.list('sequence').some(e=>e.from.objectId===to.objectId)))return 'linked-sequence-direct-children';
  if(parent&&structures.get(parent.from.objectId)?.sharedDefinitionId)return 'linked-sequence-direct-children';return null;
 });
 function removeLocalChild(p){const view=structures.get(p.dataset.structureInstanceId);if(!view)return;const slot=p.dataset.structureMasterChildId;busy=true;try{structures.annotate(view.id,{omittedChildSlots:[...new Set([...(view.omittedChildSlots||[]),slot])]});delete p.dataset.structureInstanceId;delete p.dataset.structureMasterChildId;}finally{busy=false;}}
 return {create,sync,cleanup,editView,removeLocalChild,canRemove:()=>true,canChangeType:(id,type)=>type==='sequence'||!structures.get(id)?.sharedDefinitionId,instances:id=>family(structures.get(id)).filter(s=>s.id!==id),pause:()=>{paused=true;},resume:()=>{paused=false;sync();},remove:id=>structures.remove(id),removeOwned:owner=>{for(const s of structures.list())if(s.masterStructureId&&s.autoArrange?.owner===owner)structures.remove(s.id);},sourcePromoted:()=>sync(),dispose:()=>{unsubscribe();stop();}};
}
// TODO: Make Independent — clone the Sequence definition and its toy links.
