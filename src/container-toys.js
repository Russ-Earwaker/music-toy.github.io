import {containerBoardObject} from './board-object.js';
import {connectionModel,TOY_PORTS} from './connections.js';
import {compileStructureGraph} from './structure-graph.js';
import {createStructureRuntime} from './structure-runtime.js';
import {growAuthoredBounds} from './container-fit.js';
export const CONTAINER_PORTS=Object.freeze({input:TOY_PORTS.input,output:TOY_PORTS.output});

// Organization only: no notes, patterns, musical definitions or transport here.
// Wires remain canonical. Board projection substitutes the wrapper endpoints.
export function createContainerToyModel(model,options={}){
 const moveListeners=new Set(),lifecycleListeners=new Set();
 const records=new Map(),listeners=new Set(),restoreShells=new Set(),boundsEdits=new Set();let serial=1;
 const config={getRect:()=>({x:0,y:0,width:680,height:480}),setPosition:()=>{},getDuration:()=>384,canContain:()=>true,canDelete:()=>true,removeInternal:id=>model.removeObject(id),...options};
 const clone=value=>structuredClone(value);
 const samePoint=(a,b)=>a?.objectId===b?.objectId&&a?.portId===b?.portId;
 const owner=id=>[...records.values()].find(c=>c.internalObjectIds.includes(id))?.id||null;
 const get=id=>records.has(id)?{...clone(records.get(id)),boardObject:containerBoardObject(records.get(id))}:null;
 const changed=()=>{for(const listener of listeners)listener();};
 const fail=reason=>({ok:false,reason});
 function inspect(ids){
  const selected=new Set(ids),objects=[...selected].map(id=>model.getObject(id));
  if(!selected.size||objects.some(o=>!o))return fail('Select existing musical objects.');
  for(const id of selected){const o=model.getObject(id);
   if(o.container||owner(id))return fail('Nested containers and shared ownership are not supported yet.');
   if(o.transportId&&!o.structure&&!o.modifier)return fail('Heartbeats stay outside containers.');
   if(!config.canContain(id))return fail('Art-owned, linked, or automatically managed objects cannot be collapsed in this pass.');
  }
  const edges=model.list(null,{includeSuspended:true}),internal=edges.filter(e=>selected.has(e.from.objectId)&&selected.has(e.to.objectId));
  const incoming=edges.filter(e=>!selected.has(e.from.objectId)&&selected.has(e.to.objectId)),outgoing=edges.filter(e=>selected.has(e.from.objectId)&&!selected.has(e.to.objectId));
  if([...internal,...incoming,...outgoing].some(e=>e.to.portId==='pattern'))return fail('Shared pattern wires across or inside containers are not supported yet.');
  if(incoming.length>1||outgoing.length>1)return fail('A container supports at most one incoming and one outgoing wire.');
  const entries=[...selected].filter(id=>!internal.some(e=>e.to.objectId===id)),exits=[...selected].filter(id=>!internal.some(e=>e.from.objectId===id));
  if(entries.length!==1||exits.length!==1)return fail('Select a connected graph with one entry and one exit; branches, cycles and disconnected selections are not supported yet.');
  const visited=new Set();let current=entries[0];
  while(current&&!visited.has(current)){visited.add(current);const next=internal.filter(e=>e.from.objectId===current);if(next.length>1)return fail('Multiple internal exits are not supported yet.');current=next[0]?.to.objectId;}
  if(current||visited.size!==selected.size)return fail('Disconnected selections and cycles are not supported yet.');
  const input={objectId:entries[0],portId:'input'},output={objectId:exits[0],portId:'output'};
  if(!model.getPort(input)||!model.getPort(output))return fail('The internal graph must expose normal entry and exit ports.');
  if(incoming.some(e=>e.to.objectId!==input.objectId||e.to.portId!==input.portId)||outgoing.some(e=>e.from.objectId!==output.objectId||e.from.portId!==output.portId))return fail('Cross-boundary routing does not match the single entry and exit.');
  return {ok:true,internalObjectIds:[...selected],internalConnectionIds:internal.map(e=>e.id),ports:{input,output}};
 }
 function install(c){
  records.set(c.id,c);model.registerObject(c.id,{ports:CONTAINER_PORTS,container:c.ports});
 }
 function collapse(ids,{presentationType='collapsed-graph',presentationState={},interactionData=null}={}){
  if(model.getEditing())return fail('Finish editing the current connection first.');
  const selection=inspect(ids);if(!selection.ok)return selection;
  const rects=selection.internalObjectIds.map(id=>config.getRect(id));
  if(rects.some(r=>!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)))return fail('Selection has no valid board layout.');
  const x=(Math.min(...rects.map(r=>r.x))+Math.max(...rects.map(r=>r.x+r.width)))/2-140,y=(Math.min(...rects.map(r=>r.y))+Math.max(...rects.map(r=>r.y+r.height)))/2-70;
  let id;do{id=`container-toy:${serial++}`;}while(model.getObject(id));
  const {ok,...mapping}=selection;
  const c={id,version:1,kind:'container',...mapping,internalToyIds:selection.internalObjectIds.filter(id=>!model.getObject(id).structure&&!model.getObject(id).modifier),presentation:{type:presentationType,state:{...clone(presentationState),open:false}},bounds:{x,y,width:280,height:140},layout:Object.fromEntries(selection.internalObjectIds.map((id,i)=>[id,{x:rects[i].x-x,y:rects[i].y-y}])),interactionData:clone(interactionData)};
  install(c);changed();return {ok:true,container:get(id)};
 }
 function update(id,fn){const c=records.get(id);if(!c)return null;fn(c);changed();return get(id);}
 function create({presentationType='collapsed-graph',presentationState={},interactionData=null,x=0,y=0,width=280,height=140}={}){
  let id;do{id=`container-toy:${serial++}`;}while(model.getObject(id));
  install({id,version:1,kind:'container',internalObjectIds:[],internalToyIds:[],internalConnectionIds:[],ports:{},bounds:{x,y,width,height},layout:{},presentation:{type:presentationType,state:{...clone(presentationState),open:false}},interactionData:clone(interactionData)});changed();return get(id);
 }
 function mustConnect(edge){const result=model.connect(edge.kind,edge.from,edge.to,{id:edge.id});if(!result.ok)throw new Error(result.reason);}
 function attach(id,objectIds,{interactionData}={}){
  const c=records.get(id);if(!c||c.internalObjectIds.length)return fail('Attach requires an empty container.');
  const selection=inspect(objectIds);if(!selection.ok)return selection;
  if(model.getParent(selection.ports.input.objectId)||model.list().some(e=>e.from.objectId===selection.ports.output.objectId))return fail('New internals must be detached from the outer graph.');
  const boundary=model.list().filter(e=>e.from.objectId===id||e.to.objectId===id),before=clone(c);
  try{model.transaction(()=>{for(const e of boundary)model.disconnect(e.id);
   const {ok,...mapping}=selection;Object.assign(c,mapping,{internalToyIds:selection.internalObjectIds.filter(id=>!model.getObject(id).structure&&!model.getObject(id).modifier)});
   if(interactionData!==undefined)c.interactionData=clone(interactionData);captureLayout(id);install(c);for(const e of boundary)mustConnect(e);
  });}catch(error){records.set(id,before);return fail(error.message);}
  changed();return {ok:true,container:get(id)};
 }
 function clear(id,{interactionData=null}={}){
  const c=records.get(id);if(!c)return fail('Container not found.');
  if(c.internalObjectIds.some(child=>!config.canDelete(child)))return fail('Owned contents cannot safely be deleted.');
  const owned=new Set(c.internalObjectIds),boundary=model.list().filter(e=>owned.has(e.from.objectId)!==owned.has(e.to.objectId)).map(e=>({...e,from:owned.has(e.from.objectId)?{objectId:id,portId:'output'}:e.from,to:owned.has(e.to.objectId)?{objectId:id,portId:'input'}:e.to}));
  model.transaction(()=>{for(const e of boundary)model.disconnect(e.id);
   const children=[...c.internalObjectIds];Object.assign(c,{internalObjectIds:[],internalToyIds:[],internalConnectionIds:[],ports:{},layout:{},interactionData:clone(interactionData)});install(c);
   for(const child of children.reverse())config.removeInternal(child);for(const edge of boundary)mustConnect(edge);
  });changed();return {ok:true};
 }
 function captureLayout(id){const c=records.get(id);if(c)c.layout=Object.fromEntries(c.internalObjectIds.map(child=>{const r=config.getRect(child);return [child,{x:r.x-c.bounds.x,y:r.y-c.bounds.y}];}));}
 function move(id,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const previous=get(id);const result=update(id,c=>{c.bounds.x=x;c.bounds.y=y;for(const child of c.internalObjectIds){const r=c.layout[child];config.setPosition(child,x+r.x,y+r.y);}});
  if(previous&&result)for(const fn of moveListeners)fn({id,dx:x-previous.bounds.x,dy:y-previous.bounds.y});return result;
 }
 function forget(id){boundsEdits.delete(id);records.delete(id);model.removeObject(id);}
 function expand(id){
  if(!records.has(id))return fail('Container not found.');
  // The exact same graph is already on the board; only ownership/visibility go.
  const container=get(id);forget(id);changed();for(const fn of lifecycleListeners)fn({type:'expand',container});return {ok:true};
 }
 function remove(id){
  const c=records.get(id);if(!c)return fail('Container not found.');
  if(c.internalObjectIds.some(child=>!config.canDelete(child)))return fail('An owned object cannot safely be deleted. Expand the container first.');
  model.transaction(()=>{forget(id);for(const child of [...c.internalObjectIds].reverse())config.removeInternal(child);});
  changed();for(const fn of lifecycleListeners)fn({type:'remove',container:clone(c)});return {ok:true};
 }
 function snapshot(){return [...records.values()].map(c=>({...clone(c),boardObject:containerBoardObject(c),layout:Object.fromEntries(c.internalObjectIds.map(id=>{const r=config.getRect(id);return [id,{x:r.x-c.bounds.x,y:r.y-c.bounds.y}];}))}));}
 function durationOf(id){
  const c=records.get(id);if(!c)return null;
  if(!c.internalObjectIds.length)return 0;
  const runtime=createStructureRuntime(),owned=new Set(c.internalObjectIds);
  const structures=c.internalObjectIds.map(id=>model.getObject(id).structure||model.getObject(id).modifier).filter(Boolean);
  const graph=compileStructureGraph({runtime,panels:c.internalToyIds.map(id=>({id})),structures,connections:model.list('sequence').filter(e=>owned.has(e.from.objectId)&&owned.has(e.to.objectId)),currentTick:0,getDuration:config.getDuration,poweredRoots:new Set([c.ports.input.objectId])});
  const root=graph.roots[0];if(!root)return 0;
  return root.reference?runtime.getDefinition(root.reference.structureId).durationTicks:runtime.defineStructure('container-duration',root.type,root.children,0,root).durationTicks;
 }
 function restore(saved=[]){
  if(!Array.isArray(saved))throw new Error('Invalid containers.');
  // Validate all records before changing ownership. Never flatten malformed data.
  const previous=[...records.values()];records.clear();const pending=[],claimed=new Set(),ids=new Set();
  try{for(const raw of saved){
   if(!raw||typeof raw.id!=='string'||ids.has(raw.id)||raw.version!==1||!Array.isArray(raw.internalObjectIds)||raw.internalObjectIds.some(id=>typeof id!=='string')||!Array.isArray(raw.internalConnectionIds)||typeof raw.presentation?.type!=='string'||!raw.presentation.state||!raw.bounds||![raw.bounds.x,raw.bounds.y,raw.bounds.width,raw.bounds.height].every(Number.isFinite)||raw.bounds.width<=0||raw.bounds.height<=0||raw.internalObjectIds.some(id=>!Number.isFinite(raw.layout?.[id]?.x)||!Number.isFinite(raw.layout?.[id]?.y)))throw new Error('Invalid container record.');
   if(model.getObject(raw.id)&&!restoreShells.has(raw.id)&&!previous.some(c=>c.id===raw.id))throw new Error('Container ID collides with a musical object.');
   ids.add(raw.id);if(raw.internalObjectIds.some(id=>claimed.has(id)))throw new Error('Shared container ownership is unsupported.');
   const result=raw.internalObjectIds.length?inspect(raw.internalObjectIds):{ok:true,internalObjectIds:[],internalConnectionIds:[],ports:{}};if(!result.ok)throw new Error(result.reason);
   if(result.internalObjectIds.length!==raw.internalObjectIds.length||!samePoint(result.ports.input,raw.ports?.input)||!samePoint(result.ports.output,raw.ports?.output)||JSON.stringify([...result.internalConnectionIds].sort())!==JSON.stringify([...raw.internalConnectionIds].sort()))throw new Error('Container mapping does not match its canonical graph.');
   raw.internalObjectIds.forEach(id=>claimed.add(id));pending.push({...clone(raw),internalToyIds:result.internalObjectIds.filter(id=>!model.getObject(id).structure&&!model.getObject(id).modifier)});
  }}catch(error){for(const id of restoreShells)model.removeObject(id);restoreShells.clear();for(const c of previous)records.set(c.id,c);throw error;}
  const retainedIds=new Set(pending.map(c=>c.id)),boundary=model.list().filter(e=>retainedIds.has(e.from.objectId)||retainedIds.has(e.to.objectId));
  model.transaction(()=>{for(const c of previous)model.removeObject(c.id);for(const c of pending)install(c);for(const e of boundary)mustConnect(e);});restoreShells.clear();changed();
 }
 function prepareRestore(saved=[]){
  for(const c of saved){if(!c||typeof c.id!=='string'||c.version!==1||model.getObject(c.id))throw new Error('Invalid container restore shell.');}
  for(const c of saved){model.registerObject(c.id,{ports:CONTAINER_PORTS,container:{}});restoreShells.add(c.id);}
 }
 const unsubscribe=model.addConnectionValidator(({from,to})=>{
  const a=owner(from.objectId),b=owner(to.objectId);
  if(a&&a===b)return 'Open containers support note editing; expand before changing internal routing.';
  if(a&&!samePoint(records.get(a).ports.output,from)||b&&!samePoint(records.get(b).ports.input,to))return 'Use the container input or output.';
 });
 const unsubscribeRemoval=model.addConnectionRemovalGuard(e=>!!owner(e.from.objectId)&&owner(e.from.objectId)===owner(e.to.objectId));
 function presentedEndpoint(point,{layout=false}={}){const id=owner(point.objectId),c=records.get(id);if(!c||!layout&&c.presentation.state.open)return point;
  for(const port of ['input','output'])if(c.ports[port].objectId===point.objectId&&c.ports[port].portId===point.portId)return {objectId:id,portId:port};return point;
 }
 function connections({layout=false}={}){return model.list(null,{includeSuspended:true}).filter(e=>{const a=owner(e.from.objectId);return !a||a!==owner(e.to.objectId)||!layout&&records.get(a).presentation.state.open;}).map(e=>({...e,from:presentedEndpoint(e.from,{layout}),to:presentedEndpoint(e.to,{layout})}));}
 const boardGraph={...model,list:kind=>connections({layout:true}).filter(e=>!kind||e.kind===kind),getObjectIds:()=>model.getObjectIds().filter(id=>!owner(id)),getParent:id=>connections({layout:true}).find(e=>e.to.objectId===id&&e.to.portId!=='pattern')||null};
 return {configure:changes=>Object.assign(config,changes),get,list:()=>[...records.keys()].map(get),owner,inspect,collapse,create,attach,clear,move,expand,remove,snapshot,restore,prepareRestore,durationOf,boardGraph,captureLayout,
  requestContainerGrowth:(id,content,{active=false,kind='authored',...options}={})=>{
   const c=records.get(id);if(!c||!active||kind!=='authored')return get(id);
   const next=growAuthoredBounds(c.bounds,content,options);if(JSON.stringify(next)===JSON.stringify(c.bounds))return get(id);
   captureLayout(id);const old=c.bounds;c.bounds=next;
   for(const child of c.internalObjectIds){c.layout[child].x+=old.x-next.x;c.layout[child].y+=old.y-next.y;}
   boundsEdits.add(id);changed();return get(id);
  },
  commitContainerBounds:id=>{const grew=boundsEdits.delete(id);if(grew)config.onBoundsCommit?.(id);return {container:get(id),grew};},
  resize:(id,width,height)=>update(id,c=>{if(width>0&&height>0){c.bounds.width=width;c.bounds.height=height;}}),
  open:(id,open=true)=>{captureLayout(id);return update(id,c=>{c.presentation.state.open=!!open;});},
  setPresentation:(id,{type,state,interactionData}={})=>update(id,c=>{if(type)c.presentation.type=type;if(state)c.presentation.state={...c.presentation.state,...clone(state)};if(interactionData!==undefined)c.interactionData=clone(interactionData);}),
  isVisible:id=>!owner(id)||!!records.get(owner(id)).presentation.state.open,
  connections,
  presentedEndpoint,canEditConnection:e=>!(owner(e.from.objectId)&&owner(e.from.objectId)===owner(e.to.objectId)),
  subscribeLifecycle:fn=>{lifecycleListeners.add(fn);return ()=>lifecycleListeners.delete(fn);},
  subscribeMoves:fn=>{moveListeners.add(fn);return ()=>moveListeners.delete(fn);},
  subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},dispose(){unsubscribe();unsubscribeRemoval();}};
}

export const containerToyModel=createContainerToyModel(connectionModel);
