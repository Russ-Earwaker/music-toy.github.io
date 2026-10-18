import {MAIN_TRANSPORT_ID} from './transport-registry.js';
import {getPlaybackInstance} from './playback-instances.js';
import {toyLoopLengthTicks} from './drawgrid/dg-pattern-length.js';
import {auditArrangementInputs,selectInputPlan} from './auto-arrange-inputs.js';

export const ARRANGEMENT_ROLES=Object.freeze(['rhythm','accompaniment','melody']);
const progression=roots=>roots.map(root=>({root,quality:root==='A'?'minor':'major'}));
export const ARRANGEMENT_RECIPE=Object.freeze([
 {name:'Intro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
 {name:'A',roles:['rhythm','accompaniment','melody'],chords:progression(['C','A','F','G'])},
 {name:'B',roles:['rhythm','accompaniment','melody','extraRhythm'],chords:progression(['F','G','A','C'])},
 {name:'Outro',roles:['accompaniment'],chords:progression(['C','A','F','G'])},
]);
export function arrangementRole(panel){
 return auditArrangementInputs([panel])[0]?.role||null;
}
export function selectArrangementSources(panels){
 return selectInputPlan(panels).sources;
}

// Authored graph builder only. Playback, harmony and repetitions belong to the
// ordinary compiler/runtime. Connected views share editable definitions.
export function createAutoArranger({model,structures,getPanels,createSource,createPhraseSource,createStructureInstance,createInstance,adoptSource,adoptPhrase,placeSource=()=>{},removeInstances=()=>{},place=null,scope=()=>null,publishDebug=()=>{}}){
 let busy=false,serial=0,lastReport=null;
 async function arrange({heartbeatId:requestedHeartbeat=null}={}){
  if(busy)throw new Error('Arrangement is already being built.');
  const board=scope(),previous=structures.list().find(s=>s.autoArrange?.root && (s.artOwnerId || null)===board && (!requestedHeartbeat||s.autoArrange.heartbeatId===requestedHeartbeat));
  const reserved=[];
  const available=getPanels().filter(p=>!requestedHeartbeat||model.getTransportId(p.id)===requestedHeartbeat).filter(p=>{
   const parent=model.getParent(p.id),parentOwner=parent&&structures.get(parent.from.objectId)?.autoArrange?.owner;
   const manualParent=parent&&parent.kind!=='transport'&&!(previous&&parentOwner===previous.autoArrange.owner);
   const manualChildren=model.list('sequence').some(e=>e.from.objectId===p.id);
   if(manualParent||manualChildren){reserved.push({id:p.id,reason:'part of an unrelated manual graph; left unchanged to avoid duplicate playback'});return false;}
   return true;
  });
  let plan=selectInputPlan(available),sources=plan.sources;
  if(!plan.audit.some(e=>e.usable)){
   lastReport={inputs:plan.audit.map(({panel,...entry})=>entry),selected:{},generated:[],unused:reserved};publishDebug(lastReport);
   throw new Error('Make a musical idea first, then press Arrange. Empty toys and unrelated manual graphs stay unchanged.');
  }
  busy=true;
  const owner=`arrangement:${Date.now()}:${++serial}`;
  const seed=sources.melody || sources.accompaniment || sources.rhythm || plan.audit.find(e=>e.usable).panel;
  const domain=model.getTransportId(seed.id) || MAIN_TRANSPORT_ID;
  const heartbeat=model.getObjectIds().find(id=>model.getObject(id)?.ports.output?.accepts.includes('transport') && (model.getObject(id).transportId || id)===domain) || MAIN_TRANSPORT_ID;
  plan=selectInputPlan(available.filter(p=>!model.getTransportId(p.id) || model.getTransportId(p.id)===domain));sources=plan.sources;
  const priorPhrase=previous&&structures.get(previous.autoArrange.sourceIds.melody);
  if(priorPhrase?.autoArrangePhrase){
   // Chunk views are intentionally excluded from input classification. Preserve
   // their existing phrase slot instead of promoting yesterday's B texture to
   // primary Melody and abandoning the edited phrase on Arrange Again.
   const displacedMelody=sources.melody;
   if(displacedMelody&&!plan.textures.some(e=>e.id===displacedMelody.id))plan.textures.unshift(plan.audit.find(e=>e.id===displacedMelody.id));
   sources.melody={...priorPhrase,dataset:{autoArrangeOrigin:previous.autoArrange.origins.melody==='filled'?'filled':undefined}};
  }
  const generated=[],duration=source=>source.type==='sequence'?structures.durationOf(source.id):toyLoopLengthTicks(source,getPlaybackInstance(source.id));
  try{
   if(createPhraseSource&&!priorPhrase?.autoArrangePhrase&&(!sources.melody||sources.melody.dataset.toy==='drawgrid')){
    const phrase=structures.list().find(s=>!s.masterStructureId && s.autoArrangePhrase?.heartbeatId===heartbeat && (s.artOwnerId||null)===board);
    const authored=sources.melody;
    const master=phrase||await createPhraseSource({heartbeatId:heartbeat,firstChunk:authored,seed:authored});
    if(!master||master.type!=='sequence')throw new Error('Could not create Melody Phrase.');
    sources.melody={...master,dataset:{autoArrangeOrigin:authored?.dataset.autoArrangeOrigin || 'filled'}};
    if(!phrase&&!authored)generated.push('melody');
   }
   for(const role of ARRANGEMENT_ROLES)if(!sources[role]){
    const panel=await createSource(role,{heartbeatId:heartbeat});
    if(!panel || arrangementRole(panel)!==role)throw new Error('Could not create the missing '+role+' part.');
    panel.dataset.autoArrangeOrigin='filled';sources[role]=panel;
    generated.push(role);
   }
   const candidates=getPanels().filter(p=>!p.dataset.masterToyId&&p.dataset.toy==='loopgrid'&&p.dataset.autoArrangeFill==='extra-rhythm'&&p.dataset.autoArrangeFillHeartbeat===heartbeat&&(!model.getTransportId(p.id)||model.getTransportId(p.id)===domain));
   let extra=plan.extraRhythm||candidates.find(p=>p.id===previous?.autoArrange.sourceIds.extraRhythm)||candidates.sort((a,b)=>a.id.localeCompare(b.id))[0];
   if(!extra){
    extra=await createSource('extraRhythm',{heartbeatId:heartbeat,mainRhythm:sources.rhythm});
    if(!extra||extra.dataset.toy!=='loopgrid')throw new Error('Could not create the extra rhythmic layer.');
    extra.dataset.autoArrangeOrigin='filled';extra.dataset.autoArrangeFill='extra-rhythm';extra.dataset.autoArrangeFillHeartbeat=heartbeat;
    generated.push('extraRhythm');
   }
   sources.extraRhythm=extra;
   // One B-only texture lane, not a pile of simultaneous pitched/percussion
   // extras. Existing Timeline/Repeat express bounded, whole-pattern turns.
   const unused=[...reserved,...available.filter(p=>model.getTransportId(p.id)&&model.getTransportId(p.id)!==domain).map(p=>({id:p.id,reason:'different Heartbeat domain; left unchanged'}))];
   function allocate(entries,prefix){
    const lane=[];let remaining=4;
    for(const entry of entries){
     const panel=entry.panel||entry,bars=Math.max(1,Math.ceil(duration(panel)/384));
     if(bars>remaining){unused.push({id:panel.id,reason:'B lane has no room for this complete pattern; original graph left unchanged'});continue;}
     const role=prefix==='rhythm'&&lane.length===0?'extraRhythm':prefix+lane.length;
     sources[role]=panel;lane.push({role,bars,naturalBars:bars});remaining-=bars;
    }
    while(remaining&&lane.some(t=>t.naturalBars<=remaining))for(const t of lane)if(t.naturalBars<=remaining){t.bars+=t.naturalBars;remaining-=t.naturalBars;}
    return lane;
   }
   const extraPercussion=plan.textures.filter(e=>e.musicalRole==='percussion'||!e.pitched);
   const oldExtra=candidates.find(p=>p.id===previous?.autoArrange.sourceIds.extraRhythm);
   const rhythms=allocate([extra,...extraPercussion,...(oldExtra&&oldExtra.id!==extra.id?[oldExtra]:[])],'rhythm');
   const textures=allocate(plan.textures.filter(e=>!extraPercussion.includes(e)),'texture');
   const sourceIds=Object.fromEntries(Object.entries(sources).map(([role,panel])=>[role,panel.id]));
   const report={inputs:plan.audit.map(({id,definitionId,generated,kind,explicit,role,musicalRole,empty,reason})=>({id,definitionId,generated,kind,explicit,role,musicalRole,empty,reason})),
    selected:sourceIds,generated,texturePolicy:'One sequential B rhythm lane and one pitched texture lane; whole patterns, four bars each',unused};
   report.authoredSourceIds=[...new Set([...(previous?.autoArrange.inputReport?.authoredSourceIds||[]),...plan.audit.filter(e=>e.usable&&!e.generated).map(e=>e.id)])].filter(id=>getPanels().some(p=>p.id===id)&&!unused.some(e=>e.id===id));
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
    if(previous)for(const node of structures.list().filter(s=>s.autoArrange?.owner===previous.autoArrange.owner&&!s.masterStructureId&&!Object.values(sourceIds).includes(s.id)))structures.remove(node.id);
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
     origins:Object.fromEntries(Object.entries(sources).map(([role,panel])=>[role,panel.dataset.autoArrangeOrigin==='filled'?'filled':'authored'])),displacedConnections:displaced,inputReport:report}});
    const attach=(source,parent,index,label,spanTicks)=>{
      const naturalTicks=duration(source),repeat=naturalTicks<spanTicks;
      const branch=repeat?make('repeat',label,parent.id,index):parent;
      if(repeat)structures.setCount(branch.id,Math.ceil(spanTicks/naturalTicks));
      const p=structures.get(branch.id),position={x:p.x+536,y:p.y+(repeat?0:index*220)};
      const reuse=reusable.has(source.id)&&!usedSources.has(source.id);usedSources.add(source.id);
      const instance=reuse?source:source.type==='sequence'
        ?createStructureInstance(source,{...position,autoArrange:{owner},collapsed:true})
        :createInstance(source,{autoArrangeOwner:owner,ui:{left:`${position.x}px`,top:`${position.y}px`}});
      if(reuse){const old=model.getParent(source.id);if(old)model.disconnect(old.id);if(source.type==='sequence'&&adoptPhrase)adoptPhrase(source,{owner,...position});else if(adoptSource)adoptSource(source,{owner,...position});else placeSource(source,position);}
      created.push(instance.id);
      if(source.type==='sequence')created.push(...model.list('sequence').filter(e=>e.from.objectId===instance.id).map(e=>e.to.objectId));
      connect('sequence',output(branch.id,repeat?0:index),input(instance.id));
      return repeat?branch.id:instance.id;
    };
    const attachLane=(lane,name,parent,index)=>{
     const node=make('timeline',name,parent.id,index);structures.annotate(node.id,{outputCount:lane.length+1});let offset=0;const entries=[];
     lane.forEach((entry,i)=>{const childId=attach(sources[entry.role],node,i,name+' '+(i+1),entry.bars*384);entries.push({childId,portId:'child:'+i,offsetTick:offset});offset+=entry.bars*384;});
     structures.annotate(node.id,{entries});
    };
    for(const [index,section] of ARRANGEMENT_RECIPE.entries()){
     const context=make('chord-progression',section.name,root.id,index);
     structures.setProgression(context.id,{chords:section.chords,stepTicks:384});
     const band=section.roles.length>1?make('together',section.name+' layers',context.id):context;
     if(section.roles.length>1)structures.annotate(band.id,{outputCount:section.roles.length+1+(section.name==='B'&&textures.length?1:0)});
     const bandTicks=section.name==='B'&&(textures.length||rhythms.length>1)?1536:Math.min(1536,Math.max(...section.roles.map(role=>duration(sources[role]))));
     section.roles.forEach((role,i)=>{
      if(section.name==='B'&&role==='extraRhythm'&&rhythms.length>1){attachLane(rhythms,'B rhythm variations',band,i);return;}
      attach(sources[role],band,i,section.name+' layer '+(i+1),section.roles.length>1?bandTicks:duration(sources[role]));
     });
     if(section.name==='B'&&textures.length){
      attachLane(textures,'B textures',band,section.roles.length);
     }
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
   lastReport=report;publishDebug(report);
   return {rootId:root.id,owner,sourceIds,created,inputReport:report,filledRoles:ARRANGEMENT_ROLES.filter(role=>sources[role].dataset.autoArrangeOrigin==='filled')};
  }finally{busy=false;}
 }
 return {arrange,getDebugReport:()=>lastReport};
}
