// Linked board expansions: authored membership exists only on the Master.
// Each copy materialises ordinary Toy Instances and connections for the existing
// compiler, scheduler, harmony resolver and source-owned audio routing.
export function createStructureInstanceController({model,structures,getToy,getPanels,createToyInstance,removeToy,placeChild,placeInstance,changed=()=>{}}){
 let busy=false,paused=false;
 const children=id=>model.list('sequence').filter(e=>e.from.objectId===id).sort((a,b)=>Number(a.from.portId.split(':')[1])-Number(b.from.portId.split(':')[1]));
 const instances=id=>structures.list().filter(s=>s.masterStructureId===id);
 function sourceChildren(master){
  if(master?.type!=='sequence'||master.masterStructureId)throw new Error('Linked copies currently support Sequence Masters only.');
  return children(master.id).map(edge=>{
   const toy=getToy(edge.to.objectId);
   if(!toy || model.list('sequence').some(e=>e.from.objectId===toy.id))throw new Error('Linked Sequence copies currently need direct toy children; nested structures and toy chains are not supported yet.');
   const source=getToy(toy.dataset.masterToyId||toy.id);
   if(!source)throw new Error('Missing child Master.');
   return {slot:edge.to.objectId,source};
  });
 }
 function connect(parent,index,child){
  const result=model.connect('sequence',{objectId:parent,portId:'child:'+index},{objectId:child,portId:'input'});
  if(!result.ok)throw new Error('Linked Sequence connection: '+result.reason);
 }
 function syncInstance(instance,master,slots){
  const owned=getPanels().filter(p=>p.dataset.structureInstanceId===instance.id);
  const wanted=slots.map(({slot,source},index)=>{
   let child=owned.find(p=>p.dataset.structureMasterChildId===slot && p.dataset.masterToyId===source.id);
   if(!child){
    const at=placeChild?.(instance,index,source)||{x:instance.x+400,y:instance.y+index*220};
    child=createToyInstance(source,{autoArrangeOwner:instance.autoArrange?.owner,structureInstanceId:instance.id,structureMasterChildId:slot,ui:{left:at.x+'px',top:at.y+'px'}});
   }
   return child;
  });
  for(const p of owned)if(!wanted.includes(p))removeToy(p);
  const edges=children(instance.id),correct=edges.length===wanted.length&&edges.every((e,i)=>e.to.objectId===wanted[i].id&&e.from.portId==='child:'+i&&e.to.portId==='input');
  if(!correct){
   for(const e of edges)model.disconnect(e.id);
   structures.annotate(instance.id,{outputCount:Math.max(2,wanted.length+1)});
   wanted.forEach((p,i)=>{const parent=model.getParent(p.id);if(parent)model.disconnect(parent.id);connect(instance.id,i,p.id);});
  }
  const name=master.name+'.'+instance.structureInstanceNumber;
  if(instance.name!==name)structures.annotate(instance.id,{name});
 }
 function sync(){
  if(busy||paused||structures.isSuspended()||model.getEditing()?.suspended)return;
  busy=true;
  try{model.transaction(()=>structures.suspend(()=>{
   for(const instance of structures.list().filter(s=>s.masterStructureId)){
    const master=structures.get(instance.masterStructureId);
    if(!master)throw new Error('Missing Structure Master: '+instance.masterStructureId);
    syncInstance(instance,master,sourceChildren(master));
   }
  }));}finally{busy=false;}
 }
 function create(masterOrId,options={}){
  let master=structures.get(typeof masterOrId==='string'?masterOrId:masterOrId.id);
  if(master?.masterStructureId)master=structures.get(master.masterStructureId);
  const slots=sourceChildren(master);
  const used=new Set(structures.list().map(s=>s.name));let n=1;
  while(used.has('Sequence '+n))n++;
  const name=master.name||'Sequence '+n;
  const number=Math.max(master.structureInstanceSerial||0,...instances(master.id).map(s=>s.structureInstanceNumber||0))+1;
  let instance;busy=true;
  try{model.transaction(()=>structures.suspend(()=>{
   structures.annotate(master.id,{name,structureInstanceSerial:number});master=structures.get(master.id);
   const desired={x:options.x??master.x+400,y:options.y??master.y+number*100,width:224,height:Math.max(128,slots.length*56+88)};
   const position=placeInstance?.(desired,master)||desired;
   instance=structures.createStandalone('sequence',{x:position.x,y:position.y,artOwnerId:master.artOwnerId,name:name+'.'+number,autoArrange:options.autoArrange,collapsed:options.collapsed??false});
   structures.annotate(instance.id,{masterStructureId:master.id,structureInstanceNumber:number});
   instance=structures.get(instance.id);syncInstance(instance,master,slots);
  }));}catch(error){if(instance)remove(instance.id);throw error;}finally{busy=false;}
  changed();return structures.get(instance.id);
 }
 function cleanup(instance){
  const before=busy;busy=true;
  try{for(const p of [...getPanels()])if(p.dataset.structureInstanceId===instance.id)removeToy(p);}finally{busy=before;}
 }
 function canRemove(s){return !!s.masterStructureId||instances(s.id).length===0;}
 function remove(id){return structures.remove(id);}
 function removeOwned(owner){for(const s of structures.list())if(s.masterStructureId&&s.autoArrange?.owner===owner)remove(s.id);}
 const unsubscribe=model.subscribe(e=>{if(e.type==='change'&&!e.transient)sync();});
 const stopValidation=model.addConnectionValidator(({from,to})=>{
  if(busy||paused||structures.isSuspended())return null;
  if(structures.get(from.objectId)?.masterStructureId||getToy(from.objectId)?.dataset.structureInstanceId||getToy(to.objectId)?.dataset.structureInstanceId)return 'linked-sequence-owned-children';
  if(instances(from.objectId).length && (!getToy(to.objectId)||model.list('sequence').some(e=>e.from.objectId===to.objectId)))return 'linked-sequence-direct-children';
  const parent=model.getParent(from.objectId);
  if(parent&&instances(parent.from.objectId).length)return 'linked-sequence-direct-children';
  return null;
 });
 return {create,sync,cleanup,canRemove,remove,removeOwned,instances,pause:()=>{paused=true;},resume:()=>{paused=false;sync();},canChangeType:(id,type)=>type==='sequence'||instances(id).length===0,dispose:()=>{unsubscribe();stopValidation();}};
}

export function validateStructureInstanceLinks(snapshot){
 const nodes=snapshot.structureToys||[],byId=new Map(nodes.map(s=>[s.id,s])),numbers=new Set();
 for(const s of nodes.filter(s=>s.masterStructureId)){
  const master=byId.get(s.masterStructureId),key=s.masterStructureId+'|'+s.structureInstanceNumber;
  if(!master||master.masterStructureId||master.type!=='sequence'||s.type!=='sequence')throw new Error('Missing or invalid Structure Master: '+s.masterStructureId);
  if(!Number.isInteger(s.structureInstanceNumber)||s.structureInstanceNumber<1||numbers.has(key))throw new Error('Invalid Structure Instance number.');
  numbers.add(key);
 }
 for(const toy of snapshot.toys||[])if(toy.structureInstanceId){
  const parent=byId.get(toy.structureInstanceId);
  if((!toy.masterToyId&&!toy.sharedDefinitionId)||(!parent?.masterStructureId&&!parent?.sharedDefinitionId)||!toy.structureMasterChildId)throw new Error('Invalid generated Structure child: '+toy.id);
 }
 return snapshot;
}
