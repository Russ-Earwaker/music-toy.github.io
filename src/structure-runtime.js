import { TICKS_PER_BAR, nextBeatTick } from './audio-core.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { STRUCTURE_TYPES, normalizeRepeatCount, structureDuration } from './structure-types.js';

const tick = value => Math.max(0, Math.round(Number(value) || 0));
const assembleLayout = (entries, representationId) => {
  const durationTicks = Math.max(0, ...entries.map(c => c.offsetTicks + c.durationTicks));
  const leaves = entries.flatMap(c => c.definition ? c.definition.leafLayout.map(l => ({ ...l,
    offsetTicks: c.offsetTicks + l.offsetTicks,
    contexts: l.contexts.map(context => ({ ...context, offsetTicks: context.offsetTicks + c.offsetTicks })) }))
    : [{ toyId: c.toyId, offsetTicks: c.offsetTicks, durationTicks: c.durationTicks, contexts: [] }]);
  return { children: Object.freeze(entries.map(Object.freeze)), durationTicks,
    leafLayout: Object.freeze(leaves.map(l => Object.freeze({ ...l, contexts: Object.freeze([
      ...(representationId ? [{ definitionId: representationId, offsetTicks: 0, durationTicks }] : []),
      ...l.contexts].map(Object.freeze)) }))) };
};
// Preserve activations already handed off; recursively resolve every unreached
// nested node from its latest definition, including the rest of this occurrence.
const reconcile = (old, latest, horizon) => {
  if (horizon <= 0) return latest;
  if (latest.type === 'repeat') {
    const child = latest.children[0];
    if (!child || child.durationTicks === 0) return latest;
    if (old.durationTicks > 0 && horizon >= old.durationTicks) return old;
    const previous = old.type === 'repeat' ? old.iterations
      : old.children.length === 1 && (old.children[0].structureId || old.children[0].toyId) === (child.structureId || child.toyId)
        ? old.children
        : [{structureId:child.structureId,toyId:child.toyId,definition:old,offsetTicks:0,durationTicks:old.durationTicks}];
    const committed = previous.filter(c => c.offsetTicks < horizon
      && (c.structureId || c.toyId) === (child.structureId || child.toyId)).map(c => {
      if (!c.definition || !child.definition || c.offsetTicks + c.durationTicks <= horizon) return c;
      const definition = reconcile(c.definition, child.definition, horizon - c.offsetTicks);
      return {...c,definition,durationTicks:definition.durationTicks};
    });
    let end = Math.max(0,...committed.map(c=>c.offsetTicks+c.durationTicks));
    const iterations = [...committed];
    for (let i=committed.length;i<latest.count;i++) {
      iterations.push({...child,offsetTicks:end});end+=child.durationTicks;
    }
    const layout=assembleLayout(iterations,latest.representationId);
    return Object.freeze({...latest,...layout,children:latest.children,iterations:Object.freeze(iterations.map(Object.freeze))});
  }
  if (old.type === 'repeat') old = {...old,children:old.iterations};
  const key = c => c.structureId || `toy:${c.toyId}`;
  if (latest.type === 'timeline' && old.durationTicks > 0 && horizon >= old.durationTicks && latest.children.length) return old;
  const committed = old.children.filter(c => c.offsetTicks < horizon && latest.children.some(n => key(n) === key(c))).map(c => {
    const next = latest.children.find(n => key(n) === key(c));
    if (!c.definition || !next?.definition) return c;
    const definition = reconcile(c.definition, next.definition, horizon - c.offsetTicks);
    return { ...c, definition, durationTicks: definition.durationTicks };
  });
  const used = new Set(committed.map(key));
  let end = Math.max(0, ...committed.map(c => c.offsetTicks + c.durationTicks));
  const pending = latest.children.filter(c => !used.has(key(c))).map(c => {
    if (latest.type === 'timeline') return c;
    const entry = { ...c, offsetTicks: end };
    if (latest.type === 'sequence') end += c.durationTicks;
    return entry;
  });
  const eligible = latest.type === 'timeline' ? pending.filter(c=>c.offsetTicks >= horizon) : pending;
  const layout = assembleLayout([...committed, ...eligible], latest.representationId);
  // An unreached entry moved into the submitted/past window waits for the next
  // activation; it cannot trigger a retroactive occurrence or restart this one.
  if (latest.type === 'timeline' && eligible.length < pending.length) layout.durationTicks=Math.max(layout.durationTicks,old.durationTicks);
  return Object.freeze({ ...latest, ...layout });
};
const freezeLayout = (type, children, definitions, representationId, count) => {
  if (type === 'repeat' && children.length > 1) throw new Error('Repeat requires at most one child');
  let offsetTicks = 0, durationTicks = 0;
  const leaves = [];
  const layout = children.map(child => {
    const structureId = child.structureId || (child.childId && definitions.has(String(child.childId)) ? String(child.childId) : null);
    const toyId = child.toyId ?? child.childId;
    const nested = structureId ? definitions.get(String(structureId)) : null;
    if (child.structureId && !nested) throw new Error(`Unknown child structure: ${child.structureId}`);
    const length = nested?.durationTicks ?? Math.max(1, tick(child.durationTicks) || TICKS_PER_BAR);
    const offset = type === 'timeline' ? tick(child.offsetTick ?? child.offsetTicks) : type === 'together' ? 0 : offsetTicks;
    const entry = Object.freeze({...(nested ? { structureId: nested.id, offsetTicks: offset, durationTicks: length, definition: nested }
      : { toyId: String(toyId), offsetTicks: offset, durationTicks: length }),
      ...(type === 'timeline' ? {childId:nested?.id || String(toyId),offsetTick:offset} : {})});
    if (nested) for (const leaf of nested.leafLayout) leaves.push({ ...leaf,
      offsetTicks: offset + leaf.offsetTicks,
      contexts: leaf.contexts.map(c => ({ ...c, offsetTicks: c.offsetTicks + offset })) });
    else leaves.push({ toyId: entry.toyId, offsetTicks: offset, durationTicks: length, contexts: [] });
    offsetTicks += length;
    return entry;
  });
  durationTicks=structureDuration(type,layout,type==='repeat'?1:count);
  if (type === 'repeat') {
    const iterations = Array.from({length:layout.length ? count : 0},(_,i)=>({...layout[0],offsetTicks:i*durationTicks}));
    const repeated=assembleLayout(iterations,representationId);
    return Object.freeze({...repeated,children:Object.freeze(layout),iterations:Object.freeze(iterations.map(Object.freeze))});
  }
  const leafLayout = leaves.map(leaf => Object.freeze({ ...leaf, contexts: Object.freeze([
    ...(representationId ? [{ definitionId: representationId, offsetTicks: 0, durationTicks }] : []),
    ...leaf.contexts,
  ].map(c => Object.freeze(c))) }));
  return Object.freeze({ children: Object.freeze(layout), leafLayout: Object.freeze(leafLayout), durationTicks });
};

// Tick-domain structure state only. It never controls or rebases a transport.
export function createStructureRuntime() {
  const definitions = new Map();
  const instances = new Map();
  const timelines = new Map();
  let serial = 1;

  function defineStructure(id, type, children, currentTick = 0, { representationId = null, transportId = MAIN_TRANSPORT_ID, count = 2 } = {}) {
    if (!STRUCTURE_TYPES.includes(type)) throw new Error(`Unsupported structure type: ${type}`);
    count = type === 'repeat' ? normalizeRepeatCount(count) : null;
    id = String(id);
    const visits = new Set();
    const checkChild = childId => {
      if (childId === id) throw new Error('Cyclic Structure definition');
      if (visits.has(childId)) return;
      visits.add(childId);
      for (const child of definitions.get(childId)?.children || []) if (child.structureId) checkChild(child.structureId);
    };
    for (const child of children) if (child.structureId || (child.childId && (String(child.childId) === id || definitions.has(String(child.childId))))) checkChild(String(child.structureId || child.childId));
    for (const child of children) {
      const domain = child.transportId ?? definitions.get(String(child.structureId || child.childId))?.transportId;
      if (domain && domain !== transportId) throw new Error('Mixed transport Structure rejected');
    }
    const layout = freezeLayout(type, children, definitions, representationId, count);
    const previous = definitions.get(id);
    if (previous?.transportId === transportId && previous?.type === type && previous.count === count && previous.representationId === representationId && JSON.stringify(previous.children) === JSON.stringify(layout.children)) return previous;
    const definition = Object.freeze({ id, type, transportId, representationId, count,
      revision: (previous?.revision ?? -1) + 1, ...layout });
    definitions.set(id, definition);
    const instance = instances.get(id);
    if (instance && instance.transportId !== transportId) { instance.active = false; timelines.delete(id); instances.delete(id); }
    if (instance?.active && !instance.parentDefinitionId) {
      const epochs = timelines.get(id);
      const horizon = Math.max(tick(currentTick), instance.scheduledUntilTick);
      while (epochs.length > 1 && (epochs.at(-1).effectiveTick ?? epochs.at(-1).startTick) >= horizon) epochs.pop();
      const last = epochs.at(-1);
      const cycleStart = last.definition.durationTicks > 0
        ? last.startTick + Math.floor(Math.max(0, horizon - last.startTick) / last.definition.durationTicks) * last.definition.durationTicks
        : horizon;
      const live = reconcile(last.definition, definition, horizon - cycleStart);
      epochs.push({ startTick: cycleStart, effectiveTick: horizon, definition: live });
      epochs.push({ startTick: cycleStart + live.durationTicks,
        effectiveTick: Math.max(horizon, cycleStart + live.durationTicks), definition });
    }
    // A child edit updates all containing definitions through their existing
    // references, so future repetitions never retain a whole-loop snapshot.
    for (const parent of [...definitions.values()]) if (parent.id !== id && parent.transportId === transportId && parent.children.some(c=>c.structureId === id)) {
      defineStructure(parent.id,parent.type,parent.children,currentTick,
        {representationId:parent.representationId,transportId:parent.transportId,count:parent.count});
    }
    return definition;
  }
  function defineSequence(id, children, currentTick = 0) { return defineStructure(id, 'sequence', children, currentTick); }

  function startSequence(id, requestedTick, { quantize = true, retrigger = false } = {}) {
    const definition = definitions.get(String(id));
    if (!definition) throw new Error(`Unknown Sequence: ${id}`);
    const old = instances.get(definition.id);
    if (old?.active && !retrigger) return old;
    const startTick = quantize ? nextBeatTick(requestedTick, { strict: true }) : tick(requestedTick);
    const instance = { id: `structure:${serial++}`, definitionId: definition.id,
      transportId: definition.transportId, startTick, active: true,
      generation: (old?.generation ?? -1) + 1, scheduledUntilTick: startTick };
    instances.set(definition.id, instance);
    timelines.set(definition.id, [{ startTick, definition }]);
    return instance;
  }

  function turnsInWindow(id, fromTick, toTick) {
    const instance = instances.get(String(id));
    if (!instance?.active) return [];
    if (instance.parentDefinitionId) return turnsInWindow(instance.parentDefinitionId, fromTick, toTick)
      .filter(t => t.structureContexts.some(c => c.definitionId === instance.definitionId));
    const from = Math.max(tick(fromTick), instance.startTick);
    const to = tick(toTick);
    if (to <= from) return [];
    const epochs = timelines.get(instance.definitionId);
    const turns = [];
    for (let e = 0; e < epochs.length; e++) {
      const epoch = epochs[e];
      const effective = epoch.effectiveTick ?? epoch.startTick;
      const end = Math.min(to, epochs[e + 1]?.effectiveTick ?? epochs[e + 1]?.startTick ?? Infinity);
      const begin = Math.max(from, effective);
      if (end <= begin || effective >= to) continue;
      const layout = epoch.definition;
      if (layout.durationTicks <= 0 || !layout.leafLayout.length) continue;
      let cycle = Math.floor(Math.max(0, begin - epoch.startTick) / layout.durationTicks);
      for (let cycleStart = epoch.startTick + cycle * layout.durationTicks; cycleStart < end; cycle++, cycleStart += layout.durationTicks) {
        for (const child of layout.leafLayout) {
          const startTick = cycleStart + child.offsetTicks;
          const endTick = startTick + child.durationTicks;
          if (startTick >= end || endTick <= begin) continue;
          turns.push(Object.freeze({
            id: `${instance.id}|${startTick}|${child.toyId}`,
            structureInstanceId: instance.id, definitionId: instance.definitionId,
            transportId: instance.transportId, toyId: child.toyId,
            startTick, endTick, durationTicks: child.durationTicks,
            offsetTicks: child.offsetTicks, sequenceDurationTicks: layout.durationTicks,
            structureContexts: Object.freeze(child.contexts.map(c => Object.freeze({
              ...c, startTick: cycleStart + c.offsetTicks,
            }))),
          }));
        }
      }
    }
    return [...new Map(turns.map(turn => [turn.id, turn])).values()];
  }

  function commitThrough(id, endTick) {
    const instance = instances.get(String(id));
    if (instance) {
      instance.scheduledUntilTick = Math.max(instance.scheduledUntilTick, tick(endTick));
      for (const child of instances.values()) if (child.parentInstanceId === instance.id) child.scheduledUntilTick = instance.scheduledUntilTick;
    }
  }
  function remove(id) {
    const instance = instances.get(String(id));
    if (instance) { instance.active = false; instance.generation++; }
    definitions.delete(String(id)); instances.delete(String(id)); timelines.delete(String(id));
  }
  function bindChildInstance(id, parentDefinitionId, activationTick) {
    if (id === parentDefinitionId) return instances.get(id);
    const parent = instances.get(parentDefinitionId), definition = definitions.get(id);
    if (!parent || !definition) return null;
    let instance = instances.get(id);
    if (!instance || instance.parentInstanceId !== parent.id) {
      instance = { id: `structure:${serial++}`, definitionId: id, transportId: parent.transportId,
        startTick: activationTick, active: true, generation: (instance?.generation ?? -1) + 1,
        scheduledUntilTick: parent.scheduledUntilTick, parentInstanceId: parent.id, parentDefinitionId };
      instances.set(id, instance);
      timelines.delete(id);
    }
    return instance;
  }
  function debugSnapshot(currentTick = 0) {
    return Object.freeze({
      definitions: Object.freeze([...definitions.values()]),
      instances: Object.freeze([...instances.values()].map(instance => {
        const activeTurns = turnsInWindow(instance.parentDefinitionId || instance.definitionId, currentTick, tick(currentTick) + 1);
        const turn = activeTurns.find(t => !instance.parentDefinitionId || t.structureContexts.some(c => c.definitionId === instance.definitionId));
        const context = turn?.structureContexts.find(c => c.definitionId === instance.definitionId);
        return Object.freeze({ ...instance, currentLocalTick: turn ? tick(currentTick) - turn.startTick + turn.offsetTicks : null,
          currentStructureLocalTick: context ? tick(currentTick) - context.startTick : null,
          currentChild: turn?.toyId ?? null, currentChildren: Object.freeze(activeTurns.filter(t => !instance.parentDefinitionId || t.structureContexts.some(c => c.definitionId === instance.definitionId)).map(t => t.toyId)),
          currentChildStartTick: turn?.startTick ?? null });
      })),
    });
  }
  function reset() {
    for (const instance of instances.values()) { instance.active = false; instance.generation++; }
    definitions.clear(); instances.clear(); timelines.clear();
  }
  return { reset, defineSequence, defineStructure, startSequence, startStructure: startSequence, turnsInWindow, commitThrough, remove, bindChildInstance,
    getDefinition: id => definitions.get(String(id)) ?? null,
    getInstance: id => instances.get(String(id)) ?? null, debugSnapshot };
}
