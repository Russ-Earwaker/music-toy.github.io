import {normalizeMusicalRole} from './musical-role.js';
import {MAIN_TRANSPORT_ID} from './transport-registry.js';
import {getPlaybackInstance} from './playback-instances.js';
import {toyLoopLengthTicks} from './drawgrid/dg-pattern-length.js';

export const ARRANGEMENT_ROLES=Object.freeze(['rhythm','accompaniment','melody']);
const progression=roots=>roots.map(root=>({root,quality:root==='A'?'minor':'major'}));
export const ARRANGEMENT_RECIPE=Object.freeze([
 {name:'Intro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
 {name:'A',roles:['rhythm','accompaniment','melody'],chords:progression(['C','A','F','G'])},
 {name:'B',roles:['rhythm','accompaniment','melody','extraRhythm'],chords:progression(['F','G','A','C'])},
 {name:'Outro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
]);
export function arrangementRole(panel){
 if(['extra-rhythm','melody-chunk'].includes(panel.dataset.autoArrangeFill))return null;
 if(panel.dataset.toy==='loopgrid')return 'rhythm';
 const role=normalizeMusicalRole(panel.dataset.musicalRole);
 return panel.dataset.toy==='drawgrid' && ['melody','accompaniment'].includes(role)?role:null;
}
export function selectArrangementSources(panels){
 const sorted=[...panels].filter(p=>!p.dataset.masterToyId).sort((a,b)=>Number(a.dataset.autoArrangeOrigin==='filled')-Number(b.dataset.autoArrangeOrigin==='filled') || (a.id<b.id?-1:a.id>b.id?1:0));
 return Object.fromEntries(ARRANGEMENT_ROLES.map(role=>[role,sorted.find(p=>arrangementRole(p)===role) || null]));
}

// Authored graph builder only. Playback, harmony and repetitions belong to the
// ordinary compiler/runtime. Connected views share editable definitions.
export function createAutoArranger({model,structures,getPanels,createSource,createPhraseSource,createStructureInstance,createInstance,placeSource=()=>{},removeInstances=()=>{},place=null,scope=()=>null}){
 let busy=false,serial=0;
 async function arrange(){
  if(busy)throw new Error('Arrangement is already being built.');
  let sources=selectArrangementSources(getPanels());
  if(!Object.values(sources).some(Boolean))throw new Error('Make a musical idea first, then press Arrange.');
  busy=true;
  const board=scope(),previous=structures.list().find(s=>s.autoArrange?.root && (s.artOwnerId || null)===board);
  const owner=`arrangement:${Date.now()}:${++serial}`;
  const seed=sources.melody || sources.accompaniment || sources.rhythm;
  const domain=model.getTransportId(seed.id) || MAIN_TRANSPORT_ID;
  const heartbeat=model.getObjectIds().find(id=>model.getObject(id)?.ports.output?.accepts.includes('transport') && (model.getObject(id).transportId || id)===domain) || MAIN_TRANSPORT_ID;
  sources=selectArrangementSources(getPanels().filter(p=>!model.getTransportId(p.id) || model.getTransportId(p.id)===domain));
  try{
   if(createPhraseSource){
    const phrase=structures.list().find(s=>!s.masterStructureId && s.autoArrangePhrase?.heartbeatId===heartbeat && (s.artOwnerId||null)===board);
    const authored=sources.melody;
    const master=phrase||await createPhraseSource({heartbeatId:heartbeat,firstChunk:authored});
    if(!master||master.type!=='sequence')throw new Error('Could not create Melody Phrase.');
    sources.melody={...master,dataset:{autoArrangeOrigin:authored?.dataset.autoArrangeOrigin || 'filled'}};
   }
   for(const role of ARRANGEMENT_ROLES)if(!sources[role]){
    const panel=await createSource(role,{heartbeatId:heartbeat});
    if(!panel || arrangementRole(panel)!==role)throw new Error('Could not create the missing '+role+' part.');
    panel.dataset.autoArrangeOrigin='filled';sources[role]=panel;
   }
   const candidates=getPanels().filter(p=>!p.dataset.masterToyId&&p.dataset.toy==='loopgrid'&&p.dataset.autoArrangeFill==='extra-rhythm'&&p.dataset.autoArrangeFillHeartbeat===heartbeat&&(!model.getTransportId(p.id)||model.getTransportId(p.id)===domain));
   let extra=candidates.find(p=>p.id===previous?.autoArrange.sourceIds.extraRhythm)||candidates.sort((a,b)=>a.id.localeCompare(b.id))[0];
   if(!extra){
    extra=await createSource('extraRhythm',{heartbeatId:heartbeat,mainRhythm:sources.rhythm});
    if(!extra||extra.dataset.toy!=='loopgrid')throw new Error('Could not create the extra rhythmic layer.');
    extra.dataset.autoArrangeOrigin='filled';extra.dataset.autoArrangeFill='extra-rhythm';extra.dataset.autoArrangeFillHeartbeat=heartbeat;
   }
   sources.extraRhythm=extra;
   const sourceIds=Object.fromEntries(Object.entries(sources).map(([role,panel])=>[role,panel.id]));
   const reusable=new Set(Object.values(sources).filter(source=>{
    const parent=model.getParent(source.id),owner=parent&&structures.get(parent.from.objectId)?.autoArrange?.owner;
    return (!parent||parent.kind==='transport'||owner===previous?.autoArrange.owner&&!!owner)
      &&(source.type==='sequence'||!model.list('sequence').some(e=>e.from.objectId===source.id));
   }).map(source=>source.id));
   const displaced=[...(previous?.autoArrange.displacedConnections || [])];
   const created=[];
   const usedSources=new Set();
   const connect=(kind,from,to)=>{const r=model.connect(kind,from,to);if(!r.ok)throw new Error('Arrangement connection: '+r.reason);return r.connection;};
   const input=objectId=>({objectId,portId:'input'}),output=(objectId,index=0)=>({objectId,portId:'child:'+index});
   let root;
   // Connection observers see one completed replacement; no temporary source
   // ownership or cloned source patterns enter the playback compiler.
   const savedNodes=structures.list(),savedEdges=model.list();
   try{model.transaction(()=>structures.suspend(()=>{
    // Keep linked expansions alive until replacement succeeds, so rollback can
    // restore their connections without losing any child identities/positions.
    if(previous)for(const node of structures.list().filter(s=>s.autoArrange?.owner===previous.autoArrange.owner&&!s.masterStructureId))structures.remove(node.id);
    for(const edge of displaced)if(!Object.values(sourceIds).includes(edge.to.objectId) && model.getObject(edge.to.objectId) && model.getObject(edge.from.objectId) && !model.getParent(edge.to.objectId))connect(edge.kind,edge.from,edge.to);
    const make=(type,name,parent,index=0)=>{
     const p=parent && structures.get(parent),position=!parent&&previous?{x:previous.x,y:previous.y}:place?.(type,parent,index) || {x:p?p.x+(p.type==='chord-progression'?536:400):0,y:(p?.y || 0)+index*480};
     if(!Number.isFinite(position.x) || !Number.isFinite(position.y))throw new Error('Could not place the arrangement.');
     const node=structures.createStandalone(type,{...position,artOwnerId:board,name,autoArrange:{owner},collapsed:true});
     created.push(node.id);if(parent)connect('sequence',output(parent,index),input(node.id));return node;
    };
    root=make('sequence','Arrangement',null);
    for(const panel of Object.values(sources)){
     const edge=model.getParent(panel.id);
     if(edge?.kind==='transport'){
      if(!displaced.some(e=>e.to.objectId===panel.id))displaced.push(edge);
      model.disconnect(edge.id);
     }
    }
    structures.annotate(root.id,{outputCount:5,autoArrange:{owner,root:true,version:1.5,heartbeatId:heartbeat,sourceIds,
     origins:Object.fromEntries(Object.entries(sources).map(([role,panel])=>[role,panel.dataset.autoArrangeOrigin==='filled'?'filled':'authored'])),displacedConnections:displaced}});
    for(const [index,section] of ARRANGEMENT_RECIPE.entries()){
     const context=make('chord-progression',section.name,root.id,index);
     structures.setProgression(context.id,{chords:section.chords,stepTicks:384});
     const band=section.roles.length>1?make('together',section.name+' layers',context.id):context;
     if(section.roles.length>1)structures.annotate(band.id,{outputCount:section.roles.length+1});
     const duration=source=>source.type==='sequence'?structures.durationOf(source.id):toyLoopLengthTicks(source,getPlaybackInstance(source.id));
     const bandTicks=Math.min(1536,Math.max(...section.roles.map(role=>duration(sources[role]))));
     section.roles.forEach((role,i)=>{
      const naturalTicks=duration(sources[role]);
      const repeat=section.roles.length>1&&naturalTicks<bandTicks;
      const branch=repeat?make('repeat',section.name+' layer '+(i+1),band.id,i):band;
      if(repeat)structures.setCount(branch.id,Math.ceil(bandTicks/naturalTicks));
      const p=structures.get(branch.id),source=sources[role],position={x:p.x+536,y:p.y+(repeat?0:i*220)};
      // The original is the first connected view of its definition. Further
      // occurrences share it; no disconnected source bank is manufactured.
      const reuse=reusable.has(source.id)&&!usedSources.has(source.id);usedSources.add(source.id);
      const instance=reuse?source:source.type==='sequence'
        ?createStructureInstance(sources[role],{x:p.x+536,y:p.y+(repeat?0:i*220),autoArrange:{owner},collapsed:true})
        :createInstance(sources[role],{autoArrangeOwner:owner,ui:{left:`${p.x+536}px`,top:`${p.y+(repeat?0:i*220)}px`}});
      if(reuse){const old=model.getParent(source.id);if(old)model.disconnect(old.id);placeSource(source,position);}
      created.push(instance.id);
      if(sources[role].type==='sequence')created.push(...model.list('sequence').filter(e=>e.from.objectId===instance.id).map(e=>e.to.objectId));
      connect('sequence',output(branch.id,repeat?0:i),input(instance.id));
     });
    }
    connect('transport',{objectId:heartbeat,portId:'output'},input(root.id));
    for(const id of created)if(structures.get(id)&&!structures.get(id).sharedDefinitionId)structures.setCollapsed(id,true);
   }));
   if(previous)removeInstances(previous.autoArrange.owner);
   }catch(error){
    removeInstances(owner);
    model.transaction(()=>structures.suspend(()=>{
     structures.restore(savedNodes);model.list().forEach(e=>model.disconnect(e.id));
     savedEdges.forEach(e=>model.connect(e.kind,e.from,e.to,{id:e.id}));
    }));throw error;
   }
   return {rootId:root.id,owner,sourceIds,created,filledRoles:ARRANGEMENT_ROLES.filter(role=>sources[role].dataset.autoArrangeOrigin==='filled')};
  }finally{busy=false;}
 }
 return {arrange};
}
