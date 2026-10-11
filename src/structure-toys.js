import { normalizeChords, normalizeChordStep, progressionDurationTicks } from './chord-progression.js';
import { LOGIC_NODE_TYPES, isModifier, normalizeSemitones, logicNodeLabel } from './modifier-types.js';
import { GRAPH_ENDPOINT_DIAMETER, GRAPH_ENDPOINT_HIT_DIAMETER } from './graph-visuals.js';
import { connectionModel, createStructurePorts } from './connections.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { STRUCTURE_TYPES, normalizeRepeatCount, structureDuration, structureTypeLabel } from './structure-types.js';
import { TICKS_PER_BAR } from './audio-core.js';
import { getPlaybackInstance } from './playback-instances.js';
import { normalizeTimelineOffset, snapTimelineOffset } from './timeline-offsets.js';

const order = port => Number(String(port).split(':')[1]) || 0;
export const STRUCTURE_PORT_RADIUS=GRAPH_ENDPOINT_DIAMETER/2, STRUCTURE_PLUS_RADIUS=GRAPH_ENDPOINT_DIAMETER/2, STRUCTURE_PORT_HIT_RADIUS=GRAPH_ENDPOINT_HIT_DIAMETER/2, STRUCTURE_SOCKET_STEP=56;
export const structurePortPoint = (s, portId) => portId === 'input'
  ? { x: s.x, y: s.y + structureToyHeight(s) / 2 }
  : { x: s.x + structureToyWidth(s), y: s.y + (s.collapsed?40:s.type==='timeline'?80:48) + order(portId) * STRUCTURE_SOCKET_STEP };
export const structureToyWidth = s => s.type === 'chord-progression' ? 360 : s.collapsed ? 128 : s.type === 'timeline' ? 440 : 224;
const baseStructureHeight = s => s.collapsed
  ? Math.max(80, (s.outputCount-1) * STRUCTURE_SOCKET_STEP + 80)
  : s.type === 'chord-progression' ? 168 + s.chords.length * 48 : Math.max(128, (s.outputCount-1) * STRUCTURE_SOCKET_STEP + (s.type==='timeline'?120:88));
export const structureToyHeight=s=>baseStructureHeight(s);

// Board representations only. Musical definitions/instances live in the existing runtime.
export function createStructureToyModel(model, options = {}) {
  const records = new Map();
  let serial = 1, busy = false, suspended = 0;
  const config = { getPosition: () => ({ x: 0, y: 0 }), getDuration:id=>getPlaybackInstance(id)?.loopLengthTicks || TICKS_PER_BAR, ...options };
  const list = () => [...records.values()].map(s => ({...s,transportId:model.getTransportId(s.id)}));
  const childEdges = id => model.list('sequence').filter(c=>c.from.objectId===id).sort((a,b)=>order(a.from.portId)-order(b.from.portId));
  // Derived presentation only; list()/persistence retain canonical records.
  const presented=s=>({...s,transportId:model.getTransportId(s.id),});
  const edgeDuration=(edge,seen)=>edge.to.portId==='pattern'?config.getDuration(edge.to.objectId):durationOf(edge.to.objectId,seen);
  function durationOf(id,seen=new Set()) {
    if(seen.has(id)) throw new Error('Cyclic Structure graph');
    const next=new Set(seen).add(id),s=records.get(id),edges=childEdges(id);
    if(!s) return config.getDuration(id)+(edges[0]?durationOf(edges[0].to.objectId,next):0);
    if (s.type === 'chord-progression') return progressionDurationTicks(s.chords,s.stepTicks);
    if (isModifier(s.type)) return edges[0] ? edgeDuration(edges[0],next) : 0;
    return structureDuration(s.type,edges.map(c=>({durationTicks:c.to.portId==='pattern'?config.getDuration(c.to.objectId):durationOf(c.to.objectId,next),
      offsetTick:s.entries?.find(e=>e.portId===c.from.portId)?.offsetTick || 0})),s.count);
  }
  function timelineEntries(s,edges=childEdges(s.id),sourceType=s.type) {
    let end=0;
    return Object.freeze(edges.map(c=>{
      const previous=sourceType==='timeline' && s.entries?.find(e=>e.portId===c.from.portId);
      const offsetTick=previous?previous.offsetTick:sourceType==='together'?0:end;
      end=offsetTick+edgeDuration(c);
      return Object.freeze({childId:c.to.objectId,portId:c.from.portId,offsetTick});
    }));
  }
  function conversion(id,type) {
    const s=records.get(id);if(s?.type!=='timeline'||!['sequence','together'].includes(type))return {lossy:false};
    const entries=[...(s.entries||[])].sort((a,b)=>a.offsetTick-b.offsetTick || order(a.portId)-order(b.portId));
    let end=0,lossy=false;
    for(const e of entries) {if(e.offsetTick!==(type==='together'?0:end))lossy=true;end+=durationOf(e.childId);}
    return {lossy,message:type==='sequence'?'Sequence removes Timeline gaps and overlaps.':'Together moves every Timeline entry to the start.'};
  }
  const structureTypeLabelForChild = id => records.has(id)?logicNodeLabel(records.get(id).type)
    : ({loopgrid:'Rhythm',drawgrid:'Draw Line',bouncer:'Bouncer',rippler:'Rippler'}[config.getToyType?.(id)] || 'Toy');
  const register = s => model.registerObject(s.id, { ports: createStructurePorts(s.outputCount,s.type),
    transportId: s.transportId, ...(isModifier(s.type) ? {modifier:s} : {structure:s}) });
  function update(id, changes, { notify = true } = {}) {
    const before = records.get(id);
    if (!before) return null;
    const next = Object.freeze({ ...before, ...changes });
    records.set(id, next); register(next);
    if (notify) model.touchObject(id);
    return next;
  }
  function create(type, from, to, provenance, includeInput, position = null) {
    let id; do { id = `structure-toy:${serial++}`; } while (model.getObject(id));
    const a = position || config.getPosition(from), b = position || config.getPosition(to);
    let s = Object.freeze({ id, definitionId: `definition:${id}`, type, kind:isModifier(type)?'modifier':'structure', ...(type==='transpose'?{semitones:0}:type==='chord-progression'?{chords:normalizeChords(),stepTicks:384}:{}), provenance, includeInput,
      transportId: MAIN_TRANSPORT_ID, x: (a.x + b.x) / 2 - 72, y: (a.y + b.y) / 2 - 38,
      positionSource:'auto', collapsed:false, outputCount: type === 'repeat' || isModifier(type) ? 1 : 2, ...(type === 'repeat' ? {count:2} : {}), ...(type === 'timeline'?{entries:Object.freeze([])}:{}), artOwnerId: config.getOwner?.(from.objectId) || null });
    const placed=config.placeStructure?.({x:s.x,y:s.y,width:structureToyWidth(s),height:structureToyHeight(s)},from.objectId);
    if(placed)s=Object.freeze({...s,x:placed.x,y:placed.y});
    records.set(id, s); register(s);
    // Publish creation with the completed topology transaction, including nested Structures.
    model.touchObject(id, {structureCreated:true, layoutInsertion:{
      insertedObjectId:id, attachedBranchId:to.objectId, layoutRootId:from.objectId,
      // Wrapping a type conversion adopts all existing children together.
      ...(from.portId==='input'?{preserveSubtreeIds:childEdges(from.objectId).map(c=>c.to.objectId)}:{}),
    }});
    return s;
  }
  // A detached board object has no transport authority until its input is rooted.
  function createStandalone(type, {x=0,y=0,artOwnerId=null,name=null,autoArrange=null,collapsed=false} = {}) {
    if(!LOGIC_NODE_TYPES.includes(type))return null;
    let id;do {id=`structure-toy:${serial++}`;}while(model.getObject(id));
    const s=Object.freeze({id,definitionId:`definition:${id}`,type,kind:isModifier(type)?'modifier':'structure',...(type==='transpose'?{semitones:0}:type==='chord-progression'?{chords:normalizeChords(),stepTicks:384}:{}),provenance:'explicit',includeInput:false,
      x,y,artOwnerId,...(name?{name}:{}),...(autoArrange?{autoArrange}:{}),positionSource:'auto',collapsed:!!collapsed,outputCount:type==='repeat'||isModifier(type)?1:2,
      ...(type==='repeat'?{count:2}:{}),...(type==='timeline'?{entries:Object.freeze([])}:{})});
    model.transaction(()=>{records.set(id,s);register(s);model.touchObject(id,{structureCreated:true});});
    return records.get(id);
  }
  function mustConnect(kind, from, to, id = null) {
    const result = model.connect(kind, from, to, { id });
    if (!result.ok) throw new Error(result.reason);
    return result;
  }
  function promote(connectionId, type = 'together') {
    if (!LOGIC_NODE_TYPES.includes(type)) return null;
    const c = model.get(connectionId);
    if (!c || !['sequence','transport'].includes(c.kind)) return null;
    let s;
    busy = true;
    try {
      model.transaction(() => {
        s = create(type, c.from, c.to, 'explicit', false);
        model.disconnect(c.id);
        mustConnect(c.kind, c.from, { objectId: s.id, portId: 'input' });
        mustConnect('sequence', { objectId: s.id, portId: 'child:0' }, c.to, c.id);
        if(type==='timeline')update(s.id,{entries:timelineEntries(s)},{notify:false});
        model.touchObject(s.id);
      });
    } catch (error) { if (s) records.delete(s.id); throw error; }
    finally { busy = false; }
    refresh(); return records.get(s.id);
  }
  function promoteOccupied(request) {
    if (request.kind !== 'sequence' || request.port.portId !== 'output' || model.getObject(request.port.objectId)?.structure) return null;
    const existing = model.list('sequence').find(c => c.from.objectId === request.from.objectId && c.from.portId === request.from.portId && c.id !== request.connectionId);
    if (!existing) return null;
    let s, result;
    busy = true;
    try {
      model.transaction(() => {
        s = create('sequence', request.from, existing.to, 'auto', false);
        model.disconnect(existing.id);
        if (request.connectionId) model.disconnect(request.connectionId);
        mustConnect('sequence', request.from, { objectId: s.id, portId: 'input' });
        mustConnect('sequence', { objectId: s.id, portId: 'child:0' }, existing.to, existing.id);
        result = mustConnect('sequence', { objectId: s.id, portId: 'child:1' }, request.to, request.connectionId);
        model.touchObject(s.id);
      });
    } catch { if (s) records.delete(s.id); return null; }
    finally { busy = false; }
    refresh(); return { ...result, structureId: s.id };
  }
  function setType(id, type, {allowLossy=false}={}) {
    if (!STRUCTURE_TYPES.includes(type) || isModifier(records.get(id)?.type) || !records.has(id)) return null;
    if(conversion(id,type).lossy&&!allowLossy)return null;
    const s=records.get(id),children=model.list('sequence').filter(c=>c.from.objectId===id).sort((a,b)=>order(a.from.portId)-order(b.from.portId));
    const before=new Map(records);busy=true;
    try {
      model.transaction(()=>{
        if(type==='timeline'&&s.type==='repeat') {
          const inner=create('repeat',{objectId:id,portId:'input'},children[0]?.to || {objectId:id,portId:'input'},'explicit',false,{x:s.x+262,y:s.y+38});
          update(inner.id,{count:s.count,artOwnerId:s.artOwnerId},{notify:false});
          for(const c of children)model.disconnect(c.id);
          update(id,{type,provenance:'explicit',outputCount:2,entries:Object.freeze([Object.freeze({childId:inner.id,portId:'child:0',offsetTick:0})])},{notify:false});
          mustConnect('sequence',{objectId:id,portId:'child:0'},{objectId:inner.id,portId:'input'});
          for(const c of children)mustConnect('sequence',{objectId:inner.id,portId:c.from.portId},c.to,c.id);
        } else if (type === 'repeat' && (children.length > 1 || (s.type==='timeline'&&s.entries?.some(e=>e.offsetTick>0)))) {
          const inner=create(s.type,{objectId:id,portId:'input'},children[0].to,'explicit',false,{x:s.x+262,y:s.y+38});
          const desired={x:inner.x,y:inner.y,width:structureToyWidth(inner),height:structureToyHeight({...inner,outputCount:s.outputCount})};
          const placed=config.placeStructure?.(desired,id,inner.id);
          update(inner.id,{x:placed?.x ?? s.x+structureToyWidth(s)+46,y:placed?.y ?? s.y,artOwnerId:s.artOwnerId,outputCount:s.outputCount,
            ...(s.type==='timeline'?{entries:s.entries}:{})}, {notify:false});
          for (const c of children) model.disconnect(c.id);
          update(id,{type,count:normalizeRepeatCount(s.count),outputCount:1,provenance:'explicit'}, {notify:false});
          mustConnect('sequence',{objectId:id,portId:'child:0'},{objectId:inner.id,portId:'input'});
          for (const c of children) mustConnect('sequence',{objectId:inner.id,portId:c.from.portId},c.to,c.id);
        } else {
          const reorder=s.type==='timeline'&&type==='sequence';
          const ordered=reorder?[...children].sort((a,b)=>(s.entries.find(e=>e.portId===a.from.portId)?.offsetTick||0)-(s.entries.find(e=>e.portId===b.from.portId)?.offsetTick||0)):children;
          if(type === 'repeat'||reorder) for(const c of children) model.disconnect(c.id);
          update(id,{type,provenance:'explicit',outputCount:type === 'repeat'?1:Math.max(2,s.outputCount),
            ...(type==='timeline'?{entries:timelineEntries(s,children)}:{}),
            ...(type === 'repeat'?{count:normalizeRepeatCount(s.count)}:{})}, {notify:false});
          if(type === 'repeat' && children[0]) mustConnect('sequence',{objectId:id,portId:'child:0'},children[0].to,children[0].id);
          if(reorder) for(const [i,c] of ordered.entries())mustConnect('sequence',{objectId:id,portId:`child:${i}`},c.to,c.id);
        }
        model.touchObject(id);
      });
    } catch(error) {records.clear();for(const [key,value] of before)records.set(key,value);throw error;}
    finally {busy=false;}
    refresh();return records.get(id);
  }
  function refresh() {
    if (busy || suspended || model.getEditing()?.suspended) return;
    busy = true;
    try {
      model.transaction(() => {
        for (const s of list()) {
          const children = model.list('sequence').filter(c => c.from.objectId === s.id);
          const input = model.list('sequence').find(c => c.to.objectId === s.id);
          if(s.type==='timeline') {
            const entries=timelineEntries(s);
            if(JSON.stringify(entries)!==JSON.stringify(s.entries)) {update(s.id,{entries},{notify:false});model.touchObject(s.id);}
          }
          if (s.type === 'sequence' && s.provenance === 'auto' && input && children.length === 1) {
            const child = children[0];
            model.disconnect(input.id); model.disconnect(child.id); model.removeObject(s.id); records.delete(s.id);
            mustConnect('sequence', input.from, child.to, child.id);
            model.touchObject(s.id);
          } else {
            const outputCount = s.type === 'repeat' || isModifier(s.type) ? 1 : Math.max(2, ...children.map(c => order(c.from.portId) + 2));
            if (outputCount !== s.outputCount) update(s.id, { outputCount }, { notify: false });
          }
        }
      });
    } finally { busy = false; }
  }
  model.setPromotionResolver(promoteOccupied);
  const unsubscribe = model.subscribe(event => {
    if (event.type !== 'change' || event.transient) return;
    for (const change of event.events || [event]) {
      const c = change.connection, s = c?.kind === 'sequence' && records.get(c.from.objectId);
      const type = s && config.getToyType?.(c.to.objectId);
      if (type) update(s.id, { lastChildType: type, lastChildId: c.to.objectId }, { notify: false });
    }
    refresh();
  });
  return {
    createStandalone, list, get: id => records.has(id) ? presented(records.get(id)) : null, promote, setType, conversion, durationOf,
    getTimelineEntries(id) {return (records.get(id)?.entries||[]).map(e=>{const edge=childEdges(id).find(c=>c.from.portId===e.portId);return {...e,durationTicks:edge?edgeDuration(edge):durationOf(e.childId),label:structureTypeLabelForChild(e.childId)};});},
    setOffset(id,portId,value,{snap=true}={}) {
      const s=records.get(id);if(s?.type!=='timeline'||!s.entries.some(e=>e.portId===portId))return null;
      const offsetTick=snap?snapTimelineOffset(value):normalizeTimelineOffset(value);
      return update(id,{entries:Object.freeze(s.entries.map(e=>e.portId===portId?Object.freeze({...e,offsetTick}):e))});
    },
    setProgression(id,{chords,stepTicks}={}) { const s=records.get(id);if(s?.type!=='chord-progression')return null;
      const next={chords:normalizeChords(chords ?? s.chords),stepTicks:normalizeChordStep(stepTicks ?? s.stepTicks)};
      return JSON.stringify([s.chords,s.stepTicks])===JSON.stringify([next.chords,next.stepTicks])?s:update(id,next); },
    setSemitones(id,value) { const s=records.get(id);if(s?.type!=='transpose')return null;
      const semitones=normalizeSemitones(value);return s.semitones===semitones?s:update(id,{semitones}); },
    setCount(id,count) { return records.get(id)?.type === 'repeat' ? update(id,{count:normalizeRepeatCount(count)}) : null; },
    setCollapsed(id, collapsed) {
      const before = records.get(id);
      if (!before || before.collapsed === !!collapsed) return before || null;
      // No graph touch/definition notification: this is persisted board UI only.
      const next = update(id, { collapsed: !!collapsed }, { notify: false });
      config.onPresentation?.(next, before);
      config.onMove?.();
      return next;
    },
    configure: changes => Object.assign(config, changes),
    annotate(id,changes) {return update(id,changes);},
    move(id, x, y, {manual=true}={}) {
      const result = update(id, { x, y, ...(manual?{provenance:'explicit',positionSource:'manual'}:{}) }, { notify: false });
      config.onMove?.(); return result;
    },
    remove(id) {
      const s = records.get(id);
      if (!s) return;
      config.onRemove?.(s);
      model.transaction(() => { records.delete(id); model.removeObject(id); model.touchObject(id); });
    },
    suspend(fn) { suspended++; try { return fn(); } finally { suspended--; refresh(); } },
    restore(saved = []) {
      for (const s of list()) model.removeObject(s.id);
      records.clear();
      for (const value of saved) {
        if (!value || typeof value.id !== 'string' || !LOGIC_NODE_TYPES.includes(value.type)) continue;
        const s = Object.freeze({ ...value, definitionId: `definition:${value.id}`, transportId: MAIN_TRANSPORT_ID,
          x: Number(value.x) || 0, y: Number(value.y) || 0, kind:isModifier(value.type)?'modifier':'structure', ...(value.type==='transpose'?{semitones:normalizeSemitones(value.semitones)}:value.type==='chord-progression'?{chords:normalizeChords(value.chords),stepTicks:normalizeChordStep(value.stepTicks)}:{}), outputCount: value.type === 'repeat' || isModifier(value.type) ? 1 : Math.max(2, Math.trunc(Number(value.outputCount) || 2)),
          ...(value.type === 'repeat' ? {count:normalizeRepeatCount(value.count)} : {}),
          ...(value.type==='timeline'?{entries:Object.freeze((Array.isArray(value.entries)?value.entries:[]).filter(e=>typeof e?.childId==='string'&&/^child:\d+$/.test(e.portId)).map(e=>Object.freeze({childId:e.childId,portId:e.portId,offsetTick:normalizeTimelineOffset(e.offsetTick)})))}:{}),
          collapsed:value.collapsed===true, provenance: value.provenance === 'auto' ? 'auto' : 'explicit', includeInput: false });
        records.set(s.id, s); register(s);
      }
    },
    dispose() { unsubscribe(); model.setPromotionResolver(null); },
  };
}

export const structureToyModel = createStructureToyModel(connectionModel);
