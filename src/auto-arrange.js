import {normalizeMusicalRole} from './musical-role.js';
import {MAIN_TRANSPORT_ID} from './transport-registry.js';

export const ARRANGEMENT_ROLES=Object.freeze(['rhythm','accompaniment','melody']);
const progression=roots=>roots.map(root=>({root,quality:root==='A'?'minor':'major'}));
export const ARRANGEMENT_RECIPE=Object.freeze([
 {name:'Intro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
 {name:'A',roles:['rhythm','accompaniment','melody'],chords:progression(['C','A','F','G'])},
 {name:'B',roles:['rhythm','accompaniment','melody'],chords:progression(['F','G','A','C'])},
 {name:'Outro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
]);
export function arrangementRole(panel){
 if(panel.dataset.toy==='loopgrid')return 'rhythm';
 const role=normalizeMusicalRole(panel.dataset.musicalRole);
 return panel.dataset.toy==='drawgrid' && ['melody','accompaniment'].includes(role)?role:null;
}
export function selectArrangementSources(panels){
 const sorted=[...panels].sort((a,b)=>Number(a.dataset.autoArrangeOrigin==='filled')-Number(b.dataset.autoArrangeOrigin==='filled') || (a.id<b.id?-1:a.id>b.id?1:0));
 return Object.fromEntries(ARRANGEMENT_ROLES.map(role=>[role,sorted.find(p=>arrangementRole(p)===role) || null]));
}

// Authored graph builder only. Playback, harmony and repetitions belong to the
// ordinary compiler/runtime. Pattern sockets reference editable source toys.
export function createAutoArranger({model,structures,getPanels,createSource,place=null,scope=()=>null}){
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
   for(const role of ARRANGEMENT_ROLES)if(!sources[role]){
    const panel=await createSource(role,{heartbeatId:heartbeat});
    if(!panel || arrangementRole(panel)!==role)throw new Error('Could not create the missing '+role+' part.');
    panel.dataset.autoArrangeOrigin='filled';sources[role]=panel;
   }
   const sourceIds=Object.fromEntries(ARRANGEMENT_ROLES.map(role=>[role,sources[role].id]));
   const displaced=[...(previous?.autoArrange.displacedConnections || [])];
   const created=[];
   const connect=(kind,from,to)=>{const r=model.connect(kind,from,to);if(!r.ok)throw new Error('Arrangement connection: '+r.reason);return r.connection;};
   const input=objectId=>({objectId,portId:'input'}),output=(objectId,index=0)=>({objectId,portId:'child:'+index});
   let root;
   // Connection observers see one completed replacement; no temporary source
   // parenting or cloned source patterns enter the playback compiler.
   const savedNodes=structures.list(),savedEdges=model.list();
   try{model.transaction(()=>structures.suspend(()=>{
    if(previous)for(const node of structures.list().filter(s=>s.autoArrange?.owner===previous.autoArrange.owner))structures.remove(node.id);
    for(const edge of displaced)if(!Object.values(sourceIds).includes(edge.to.objectId) && model.getObject(edge.to.objectId) && model.getObject(edge.from.objectId) && !model.getParent(edge.to.objectId))connect(edge.kind,edge.from,edge.to);
    const make=(type,name,parent,index=0)=>{
     const p=parent && structures.get(parent),position=place?.(type,parent,index) || {x:p?p.x+(p.type==='chord-progression'?536:400):0,y:(p?.y || 0)+index*480};
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
    structures.annotate(root.id,{outputCount:5,autoArrange:{owner,root:true,version:1,heartbeatId:heartbeat,sourceIds,
     origins:Object.fromEntries(ARRANGEMENT_ROLES.map(role=>[role,sources[role].dataset.autoArrangeOrigin==='filled'?'filled':'authored'])),displacedConnections:displaced}});
    for(const [index,section] of ARRANGEMENT_RECIPE.entries()){
     const context=make('chord-progression',section.name,root.id,index);
     structures.setProgression(context.id,{chords:section.chords,stepTicks:384});
     const band=section.roles.length>1?make('together',section.name+' layers',context.id):context;
     if(section.roles.length>1)structures.annotate(band.id,{outputCount:section.roles.length+1});
     section.roles.forEach((role,i)=>connect('sequence',output(band.id,i),{objectId:sources[role].id,portId:'pattern'}));
    }
    connect('transport',{objectId:heartbeat,portId:'output'},input(root.id));
    for(const id of created)structures.setCollapsed(id,true);
   }));}catch(error){
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
