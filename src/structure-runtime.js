import { TICKS_PER_BAR, nextBeatTick } from './audio-core.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { STRUCTURE_TYPES, normalizeRepeatCount, structureDuration } from './structure-types.js';
import { LOGIC_NODE_TYPES, MODIFIER_TYPES, isModifier, normalizeSemitones, logicNodeLabel } from './modifier-types.js';
import { composeContext, normalizeContext } from './playback-context.js';

import { normalizeChords, normalizeChordStep, resolveChordAtTick } from './chord-progression.js';
// Definition layouts carry relative origins; occurrences rebase them exactly once.
const shiftHarmony = (context, offset) => context?.harmony ? normalizeContext({...context,harmony:{...context.harmony,originTick:context.harmony.originTick+offset}}) : context;
const occurrenceContext = (authored, historical, cycleStart) => authored.harmony ? normalizeContext({...authored,harmony:{...authored.harmony,originTick:cycleStart+(historical.harmony?.originTick ?? authored.harmony.originTick)}}) : authored;
let runtimeSerial = 1;
const authoredPathKey = leaf => JSON.stringify([leaf.toyId, leaf.authoredPath]);
const tick = value => Math.max(0, Math.round(Number(value) || 0));
const assembleLayout = (entries, representationId, context) => {
  const durationTicks = Math.max(0, ...entries.map(c => c.offsetTicks + c.durationTicks));
  const leaves = entries.flatMap(c => c.definition ? c.definition.leafLayout.map(l => ({ ...l,
    structuralPath: [c.entryId, ...l.structuralPath], authoredPath: [c.relationshipId || c.entryId, ...l.authoredPath], definitionIds: [c.structureId, ...l.definitionIds], context: composeContext(c.context, shiftHarmony(l.context,c.offsetTicks)),
    offsetTicks: c.offsetTicks + l.offsetTicks,
    contexts: l.contexts.map(context => ({ ...context, offsetTicks: context.offsetTicks + c.offsetTicks })) }))
    : [{ toyId: c.toyId, structuralPath: [c.entryId], authoredPath: [c.relationshipId || c.entryId], definitionIds: [], context: normalizeContext(c.context), offsetTicks: c.offsetTicks, durationTicks: c.durationTicks, contexts: [] }]);
  return { children: Object.freeze(entries.map(Object.freeze)), durationTicks,
    leafLayout: Object.freeze(leaves.map(l => Object.freeze({ ...l, structuralPath: Object.freeze(l.structuralPath), authoredPath: Object.freeze(l.authoredPath), definitionIds: Object.freeze(l.definitionIds), context: composeContext(context, l.context), contexts: Object.freeze([
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
      iterations.push({...child,relationshipId:child.entryId,entryId:child.entryId+':repeat:'+i,offsetTicks:end});end+=child.durationTicks;
    }
    const layout=assembleLayout(iterations,latest.representationId,latest.context);
    return Object.freeze({...latest,...layout,children:latest.children,iterations:Object.freeze(iterations.map(Object.freeze))});
  }
  if (old.type === 'repeat') old = {...old,children:old.iterations};
  const key = c => c.entryId;
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
  const layout = assembleLayout([...committed, ...eligible], latest.representationId, latest.context);
  // An unreached entry moved into the submitted/past window waits for the next
  // activation; it cannot trigger a retroactive occurrence or restart this one.
  if (latest.type === 'timeline' && eligible.length < pending.length) layout.durationTicks=Math.max(layout.durationTicks,old.durationTicks);
  return Object.freeze({ ...latest, ...layout });
};
const freezeLayout = (type, children, definitions, representationId, count, context, previous) => {
  if ((type === 'repeat' || isModifier(type)) && children.length > 1) throw new Error(logicNodeLabel(type)+' requires at most one child');
  let offsetTicks = 0, durationTicks = 0;
  const slots = new Map(), available = [...(previous?.children || [])], usedIds = new Set();
  const layout = children.map(child => {
    const structureId = child.structureId || (child.childId && definitions.has(String(child.childId)) ? String(child.childId) : null);
    const toyId = child.toyId ?? child.childId;
    const nested = structureId ? definitions.get(String(structureId)) : null;
    if (child.structureId && !nested) throw new Error(`Unknown child structure: ${child.structureId}`);
    const length = nested?.durationTicks ?? Math.max(1, tick(child.durationTicks) || TICKS_PER_BAR);
    const offset = type === 'timeline' ? tick(child.offsetTick ?? child.offsetTicks) : type === 'together' ? 0 : offsetTicks;
    const sourceId = nested?.id || String(toyId);
    const ordinal = slots.get(sourceId) || 0; slots.set(sourceId, ordinal + 1);
    // Reuse authored slots when callers omit IDs. Timeline offsets disambiguate
    // duplicate references; explicit entryId is preferred for arbitrary moves.
    const candidates = available.filter(c => (c.structureId || c.toyId) === sourceId);
    const matched = candidates.find(c => type === 'timeline' && c.offsetTicks === offset)
      || candidates.find(c => JSON.stringify(c.context) === JSON.stringify(normalizeContext(child.context))) || candidates[0];
    let entryId = String(child.entryId ?? child.id ?? matched?.entryId ?? `slot:${sourceId}:${ordinal}`);
    if (child.entryId == null && child.id == null && !matched) {
      let suffix = ordinal;
      while (usedIds.has(entryId) || available.some(c => c.entryId === entryId)) entryId = `slot:${sourceId}:${++suffix}`;
    }
    const previousSlot = available.findIndex(c => c.entryId === entryId);
    if (previousSlot >= 0) available.splice(previousSlot, 1);
    usedIds.add(entryId);
    const entry = Object.freeze({entryId, context: normalizeContext(child.context), ...(nested ? { structureId: nested.id, offsetTicks: offset, durationTicks: length, definition: nested }
      : { toyId: String(toyId), offsetTicks: offset, durationTicks: length }),
      ...(type === 'timeline' ? {childId:nested?.id || String(toyId),offsetTick:offset} : {})});
    offsetTicks += length;
    return entry;
  });
  if (new Set(layout.map(c => c.entryId)).size !== layout.length) throw new Error('Duplicate Structure entry ID');
  durationTicks=structureDuration(type,layout,type==='repeat'?1:count);
  if (type === 'repeat') {
    const iterations = Array.from({length:layout.length ? count : 0},(_,i)=>({...layout[0],relationshipId:layout[0].entryId,entryId:layout[0].entryId+':repeat:'+i,offsetTicks:i*durationTicks}));
    const repeated=assembleLayout(iterations,representationId,context);
    return Object.freeze({...repeated,children:Object.freeze(layout),iterations:Object.freeze(iterations.map(Object.freeze))});
  }
  const assembled = assembleLayout(layout, representationId, context);
  const leafLayout = assembled.leafLayout;
  return Object.freeze({ children: Object.freeze(layout), leafLayout: Object.freeze(leafLayout), durationTicks });
};

// Tick-domain structure state only. It never controls or rebases a transport.
export function createStructureRuntime() {
  const runtimeId = runtimeSerial++;
  const definitions = new Map();
  const instances = new Map();
  const timelines = new Map();
  let serial = 1;

  function defineNode(id, type, children, currentTick = 0, { representationId = null, transportId = MAIN_TRANSPORT_ID, count = 2, context = null, semitones = 0, chords, stepTicks = 384 } = {}) {
    if (!LOGIC_NODE_TYPES.includes(type)) throw new Error(`Unsupported structure type: ${type}`);
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
    const baseContext = normalizeContext(context);
    semitones = type === 'transpose' ? normalizeSemitones(semitones) : null;
    chords = type === 'chord-progression' ? normalizeChords(chords) : null;
    stepTicks = type === 'chord-progression' ? normalizeChordStep(stepTicks) : null;
    context = type === 'transpose' ? composeContext(baseContext,{transposeSemitones:semitones}) : type === 'chord-progression' ? composeContext(baseContext,{harmony:{progressionId:id,originTick:0,stepTicks,chords}}) : baseContext;
    const previous = definitions.get(id);
    const layout = freezeLayout(type, children, definitions, representationId, count, context, previous);
    if (previous?.transportId === transportId && previous?.type === type && previous.count === count && previous.semitones === semitones && JSON.stringify(previous.baseContext) === JSON.stringify(baseContext) && previous.representationId === representationId && JSON.stringify(previous.context) === JSON.stringify(context) && JSON.stringify(previous.children) === JSON.stringify(layout.children)) return previous;
    const definition = Object.freeze({ id, type, kind:isModifier(type)?'modifier':'structure', transportId, representationId, count, context, baseContext, semitones, chords, stepTicks,
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
      defineNode(parent.id,parent.type,parent.children,currentTick,
        {representationId:parent.representationId,transportId:parent.transportId,count:parent.count,context:parent.baseContext,semitones:parent.semitones,chords:parent.chords,stepTicks:parent.stepTicks});
    }
    return definition;
  }
  function defineStructure(id, type, children, currentTick = 0, options = {}) {
    if (!STRUCTURE_TYPES.includes(type)) throw new Error('Expected a Structure definition');
    return defineNode(id,type,children,currentTick,options);
  }
  function defineModifier(id, type, children, currentTick = 0, options = {}) {
    if (!MODIFIER_TYPES.includes(type)) throw new Error('Expected a modifier definition');
    return defineNode(id,type,Array.isArray(children)?children:children?[children]:[],currentTick,options);
  }
  function defineSequence(id, children, currentTick = 0) { return defineStructure(id, 'sequence', children, currentTick); }

  function startSequence(id, requestedTick, { quantize = true, retrigger = false, context = null } = {}) {
    const definition = definitions.get(String(id));
    if (!definition) throw new Error(`Unknown Sequence: ${id}`);
    const old = instances.get(definition.id);
    if (old?.active && !retrigger) return old;
    const startTick = quantize ? nextBeatTick(requestedTick, { strict: true }) : tick(requestedTick);
    const instance = { id: `structure:${runtimeId}:${serial++}`, definitionId: definition.id,
      transportId: definition.transportId, startTick, active: true, context: normalizeContext(context),
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
    const authoredLeaves = new Map(definitions.get(instance.definitionId)?.leafLayout.map(leaf => [authoredPathKey(leaf),leaf]) || []);
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
          // Submitted timing survives edits, but removed execution paths cannot
          // keep producing notes just because an older epoch retained them.
          if (!authoredLeaves.has(authoredPathKey(child))) continue;
          const startTick = cycleStart + child.offsetTicks;
          const endTick = startTick + child.durationTicks;
          if (startTick >= end || endTick <= begin) continue;
          turns.push(Object.freeze({
            id: JSON.stringify([instance.id, startTick, child.toyId, child.structuralPath]),
            occurrenceId: JSON.stringify([instance.id, startTick, child.toyId, child.structuralPath]),
            structuralPath: child.structuralPath, structureDefinitionIds: child.definitionIds, generation: instance.generation,
            context: composeContext(instance.context, occurrenceContext(authoredLeaves.get(authoredPathKey(child)).context,child.context,cycleStart)),
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
      instance = { id: `structure:${runtimeId}:${serial++}`, definitionId: id, transportId: parent.transportId,
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
          currentChildStartTick: turn?.startTick ?? null,
          harmonicOccurrences: Object.freeze(activeTurns.filter(t=>!instance.parentDefinitionId||t.structureContexts.some(c=>c.definitionId===instance.definitionId)).map(t=>Object.freeze({occurrenceId:t.occurrenceId,toyId:t.toyId,harmony:t.context.harmony,resolvedChord:resolveChordAtTick(t.context,currentTick)}))) });
      })),
    });
  }
  function reset() {
    for (const instance of instances.values()) { instance.active = false; instance.generation++; }
    definitions.clear(); instances.clear(); timelines.clear();
  }
  return { reset, defineSequence, defineStructure, defineModifier, startSequence, startStructure: startSequence, turnsInWindow, commitThrough, remove, bindChildInstance,
    getDefinition: id => definitions.get(String(id)) ?? null,
    getInstance: id => instances.get(String(id)) ?? null,
    resolveChordsAtTick: (id, atTick) => turnsInWindow(id,atTick,Number(atTick)+1).map(turn=>Object.freeze({occurrenceId:turn.occurrenceId,toyId:turn.toyId,harmony:turn.context.harmony,chord:resolveChordAtTick(turn.context,atTick)})), debugSnapshot };
}
