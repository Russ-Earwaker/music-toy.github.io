import { isModifier } from './modifier-types.js';
import { MAIN_TRANSPORT_ID, transportRegistry } from './transport-registry.js';
import { TICKS_PER_BAR } from './audio-core.js';
import { createStructureRuntime } from './structure-runtime.js';
import { compileStructureGraph } from './structure-graph.js';
import { adoptPlaybackInstance, createPlaybackInstanceForStructureTurn,
  deactivatePlaybackInstance, getPlaybackInstance, invalidatePlaybackOccurrence, releasePlaybackInstance } from './playback-instances.js';

// Connection edges define chains; DOM flags are compatibility/presentation state.
// Musical handoffs are derived exclusively from the parent Sequence timeline.
export function createChainSequenceAdapter({ getToy, chainState, cancelToy = () => {},
  onTurn = () => {}, onRootCycle = null, onRelease = () => {}, publishDebug = () => {}, connectionModel = null } = {}) {
  const runtime = createStructureRuntime();
  const heads = new Map();
  const headDefinitions = new Map();
  const prepared = new Map();
  const currentTurns = new Map();
  const currentRootCycles = new Map();
  const definitionId = headId => headDefinitions.get(headId) || `sequence:${headId}`;
  const managed = new Set();
  let auxiliaryDefinitions = new Set();
  const terminatedToys = new Set();

  function discardPrepared(predicate) {
    for (const [key, entry] of prepared) if (predicate(entry.turn)) {
      invalidatePlaybackOccurrence(entry.instance.occurrenceId); prepared.delete(key);
    }
  }
  const hasOtherRoot = (toyId, headId) => [...heads].some(([head, members]) => head !== headId && members.includes(toyId));
  function terminateStructure(id) {
    const owned = new Set(runtime.getDefinition(id)?.leafLayout.map(leaf => leaf.toyId) || []);
    for (const toyId of owned) {
      const unrelated = [...heads.keys()].some(head => definitionId(head) !== id &&
        runtime.getDefinition(definitionId(head))?.leafLayout.some(leaf => leaf.toyId === toyId && !leaf.definitionIds.includes(id)));
      if (!unrelated) { terminatedToys.add(toyId); cancelToy(toyId); deactivatePlaybackInstance(toyId); }
    }
    discardPrepared(turn => turn.definitionId === id || turn.structureDefinitionIds?.includes(id));
    for (const [head] of heads) if (definitionId(head) === id) {
      currentTurns.delete(head); chainState.delete(head);
    }
    // Descendant removal updates containing definitions, preserving sibling paths.
    for (const definition of runtime.debugSnapshot().definitions) if (definition.id !== id && definition.children.some(c => c.structureId === id)) {
      const define = isModifier(definition.type) ? runtime.defineModifier : runtime.defineStructure;
      define(definition.id, definition.type, definition.children.filter(c => c.structureId !== id),
        runtime.getInstance(definition.id)?.scheduledUntilTick || 0, { ...definition, context:definition.baseContext });
    }
    runtime.remove(id);
    for (const [head, members] of heads) if (members.length && members.every(toy => terminatedToys.has(toy))) {
      runtime.remove(definitionId(head)); currentTurns.delete(head); chainState.delete(head);
    }
  }

  function discardInvalidPrepared() {
    discardPrepared(turn => !runtime.turnsInWindow(turn.definitionId, turn.startTick, turn.startTick + 1).some(current => current.id === turn.id));
  }

  function prepare(turn) {
    for (const context of turn.structureContexts || []) runtime.bindChildInstance(context.definitionId, turn.definitionId, context.startTick);
    let instance = prepared.get(turn.id)?.instance;
    if (!instance) {
      instance = createPlaybackInstanceForStructureTurn(turn);
      prepared.set(turn.id, { turn, instance });
    }
    // Metadata already handed to audio keeps its immutable context snapshot.
    // The next unscheduled window sees the latest modifier definition.
    instance.context = turn.context;
    return { ...turn, playbackInstance: instance };
  }

  const domainFor = id => connectionModel?.getTransportId(id) || MAIN_TRANSPORT_ID;
  const stateFor = (id, fallback) => domainFor(id) === MAIN_TRANSPORT_ID ? fallback : transportRegistry.get(domainFor(id))?.getState() || fallback;
  function sync(panels, transportState, { connections = null, structures = [], runtimeRoots = [] } = {}) {
    if (connectionModel) for (const id of terminatedToys) if (connectionModel.isRooted(id)) terminatedToys.delete(id);
    const previousId = panel => connections
      ? connections.find(c => c.to.objectId === panel.id)?.from.objectId
      : panel.dataset.prevToyId;
    const nextId = panel => connections
      ? connections.find(c => c.from.objectId === panel.id)?.to.objectId
      : panel.dataset.nextToyId;
    const roots = [];
    let auxiliary = new Set();
    if (structures.length || connectionModel) {
      const graph = compileStructureGraph({ panels, structures, connections: connections || [], runtime,
        poweredRoots: new Set(connectionModel?.list('transport').map(edge => edge.to.objectId) || []),
        currentTick: transportState.currentTick, getTransportId: domainFor, getCurrentTick: id => stateFor(id, transportState).currentTick,
        getDuration: id => getPlaybackInstance(id)?.loopLengthTicks || TICKS_PER_BAR });
      roots.push(...graph.roots); auxiliary = graph.defined;
    } else {
      for (const head of panels) {
        if (previousId(head) || !nextId(head)) continue;
        const children = [], visited = new Set();
        let panel = head;
        while (panel && !visited.has(panel.id)) {
          visited.add(panel.id);
          children.push({ toyId: panel.id, durationTicks: getPlaybackInstance(panel.id)?.loopLengthTicks || TICKS_PER_BAR });
          panel = getToy(nextId(panel));
        }
        if (children.length >= 2) roots.push({ headId: head.id, type: 'sequence', children, members: children.map(c => c.toyId) });
      }
    }
    roots.push(...runtimeRoots);
    const seen = new Set(), seenDefinitions = new Set(auxiliary), previousHeads = new Map(heads);
    const candidateHeads = new Set(roots.map(root => root.headId)), nextManaged = new Set();
    for (const root of roots) {
      const headId = root.headId, members = root.members;
      const ownerId = root.transportId || domainFor(headId), ownerState = ownerId === MAIN_TRANSPORT_ID ? transportState : transportRegistry.get(ownerId)?.getState() || transportState;
      for (const toyId of members) nextManaged.add(toyId);
      if (!headDefinitions.has(headId)) {
        const owner = [...previousHeads].find(([oldHead, oldMembers]) =>
          !candidateHeads.has(oldHead) && members.some(id => oldMembers.includes(id)));
        // A newly inserted wrapper cannot inherit the ID of a definition now
        // compiled as its descendant: that would turn its child into itself.
        const reusableOwner = owner && !connectionModel?.getObject(headId)?.structure?.autoArrange?.root && !(auxiliary.has(definitionId(owner[0])) && root.preferredId !== definitionId(owner[0]));
        headDefinitions.set(headId, reusableOwner ? definitionId(owner[0]) : root.preferredId || ('sequence:' + headId));
        if (reusableOwner && currentTurns.has(owner[0])) currentTurns.set(headId, currentTurns.get(owner[0]));
      }
      seen.add(headId); heads.set(headId, members);
      const id = definitionId(headId); seenDefinitions.add(id);
      const previousInstance = runtime.getInstance(id);
      const migrated = previousInstance && previousInstance.transportId !== ownerId;
      if (migrated) {
        for (const toyId of members) if (!hasOtherRoot(toyId, headId)) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
        discardPrepared(turn => turn.definitionId === id);
        currentTurns.delete(headId);
        runtime.remove(id);
      }
      const define = isModifier(root.type) ? runtime.defineModifier : runtime.defineStructure;
      define(id, root.type, root.children, ownerState.currentTick, { representationId: root.representationId || null, transportId: ownerId, count:root.count, context:root.context, semitones:root.semitones, chords:root.chords, stepTicks:root.stepTicks });
      const existingInstance = runtime.getInstance(id);
      const power = connectionModel?.getParent(headId);
      const powerId = power?.kind === 'transport' ? power.id : null;
      const powered = connectionModel ? !!powerId : true;
      const reconnect = connectionModel && existingInstance && powered && (!existingInstance.active || existingInstance.powerConnectionId !== powerId);
      if (!existingInstance || existingInstance.parentDefinitionId || reconnect) {
        if (reconnect) { discardPrepared(turn => turn.definitionId === id); currentTurns.delete(headId); }
        runtime.startSequence(id, ownerState.currentTick, {
          quantize: ownerState.state === 'playing', retrigger: !!existingInstance,loop:root.loop ?? (connectionModel ? powered : !runtime.getDefinition(id).leafLayout.some(leaf=>leaf.context.harmony)) });
        for (const toyId of members) if (!hasOtherRoot(toyId, headId)) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
      }
      if (connectionModel && powered) runtime.getInstance(id).rootAnchor = true;
      runtime.getInstance(id).powerConnectionId = powerId;
      if (members.length && members.every(toyId => terminatedToys.has(toyId))) runtime.getInstance(id).active = false;
      else if (connectionModel) runtime.getInstance(id).active = powered;
    }
    for (const headId of heads.keys()) if (!seen.has(headId)) {
      if (!seenDefinitions.has(definitionId(headId))) {
        for (const toyId of heads.get(headId)) if (!nextManaged.has(toyId)) cancelToy(toyId);
        runtime.remove(definitionId(headId));
        discardPrepared(turn => turn.definitionId === definitionId(headId));
      }
      heads.delete(headId);
      headDefinitions.delete(headId);
      currentTurns.delete(headId);
      currentRootCycles.delete(headId);
    }
    for (const id of auxiliaryDefinitions) if (!seenDefinitions.has(id)) runtime.remove(id);
    auxiliaryDefinitions = auxiliary;
    for (const toyId of managed) if (!nextManaged.has(toyId)) {
      const toy = getToy(toyId);
      const instance = releasePlaybackInstance(toyId, {
        active: !terminatedToys.has(toyId) && (!connectionModel || connectionModel.isRooted(toyId)) });
      if (toy) {
        delete toy.__sequenceDefinitionId;
        delete toy.__getSequenceNextTurn;
        delete toy.__isSequencePlaybackInstanceUpcoming;
        delete toy.__chainTurnStartTick;
        delete toy.__chainTurnEndTick;
        delete toy.__chainStartAt;
        toy.dataset.chainActive = instance?.active === false ? 'false' : 'true';
        onRelease(toyId);
      }
    }
    managed.clear();
    for (const toyId of terminatedToys) if (!nextManaged.has(toyId)) terminatedToys.delete(toyId);
    for (const toyId of nextManaged) {
      managed.add(toyId);
      const toy = getToy(toyId);
      if (toy) {
        toy.__sequenceDefinitionId = definitionIdForToy(toyId);
        const instance = getPlaybackInstance(toyId);
        if (instance && !instance.structureTurnId && instance.structureInstanceId !== runtime.getInstance(toy.__sequenceDefinitionId)?.id) {
          instance.structureInstanceId = runtime.getInstance(toy.__sequenceDefinitionId)?.id;
          deactivatePlaybackInstance(toyId);
        }
        toy.__getSequenceNextTurn = afterTick => {
          const definition = runtime.getDefinition(toy.__sequenceDefinitionId);
          if (!definition) return null;
          return runtime.turnsInWindow(definition.id, afterTick + 1,
            afterTick + definition.durationTicks * 2 + 1).find(turn => turn.toyId === toyId && turn.startTick > afterTick) ?? null;
        };
        toy.__isSequencePlaybackInstanceUpcoming = (instanceId, currentTick) => [...prepared.values()].some(entry =>
          entry.instance.id === instanceId && entry.turn.endTick > currentTick &&
          runtime.getInstance(entry.turn.definitionId)?.id === entry.turn.structureInstanceId &&
          runtime.turnsInWindow(entry.turn.definitionId, Math.max(currentTick, entry.turn.startTick),
            Math.max(currentTick, entry.turn.startTick) + 1).some(turn => turn.id === entry.turn.id));
      }
    }
    for (const [key, entry] of prepared) {
      const at = Math.max(stateFor(entry.turn.toyId, transportState).currentTick, entry.turn.startTick);
      if (!nextManaged.has(entry.turn.toyId) || (connectionModel && !connectionModel.isRooted(entry.turn.toyId))
        || !runtime.turnsInWindow(entry.turn.definitionId, at, at + 1).some(turn => turn.id === key)) {
        invalidatePlaybackOccurrence(entry.instance.occurrenceId); prepared.delete(key);
      }
    }
    updateCurrent(transportState.currentTick);
  }

  function definitionIdForToy(toyId) {
    for (const [headId, children] of heads) if (children.includes(toyId)) return definitionId(headId);
    return null;
  }

  function updateCurrent(currentTick, transportId = null) {
    discardInvalidPrepared();
    const previousByToy = new Map(), activations = [];
    for (const toyId of managed) previousByToy.set(toyId, getPlaybackInstance(toyId));
    for (const [headId, children] of heads) {
      if (transportId && runtime.getDefinition(definitionId(headId))?.transportId !== transportId) continue;
      const ownerTick = transportId || !connectionModel ? currentTick : stateFor(headId, {currentTick}).currentTick;
      const rootCycle=runtime.rootCycleAtTick(definitionId(headId),ownerTick);
      if(rootCycle && currentRootCycles.get(headId)!==rootCycle.id){
        if(onRootCycle?.({...rootCycle,headId,connection:connectionModel?.getParent(headId)})!==false)currentRootCycles.set(headId,rootCycle.id);
      }
      const turns = connectionModel && !connectionModel.isRooted(headId) ? []
        : runtime.turnsInWindow(definitionId(headId), ownerTick, ownerTick + 1).filter(t => children.includes(t.toyId));
      const previous = currentTurns.get(headId) || new Map();
      const active = new Map(turns.map(t => [t.id, t]));
      let cycle = [...previous.values()].at(-1)?.rootCycleStartTick;
      for (const turn of turns) {
        prepare(turn);
        if (!previous.has(turn.id)) {
          activations.push([{...turn,rootCycleActivation:!onRootCycle && turn.rootCycleStartTick !== cycle}, [...previous.values()].at(-1)]);
          cycle = turn.rootCycleStartTick;
        }
      }
      currentTurns.set(headId, active);
      chainState.set(headId, turns[0]?.toyId ?? null);
    }
    // A single visible playhead follows the newest current activation. Audio
    // retains every occurrence, including simultaneous branches and lookahead.
    const selected = new Map();
    for (const turns of currentTurns.values()) for (const turn of turns.values()) {
      const old = selected.get(turn.toyId);
      if (!old || turn.startTick > old.startTick || (turn.startTick === old.startTick && turn.id > old.id)) selected.set(turn.toyId, turn);
    }
    for (const toyId of managed) {
      const turn = selected.get(toyId), previous = previousByToy.get(toyId), toy = getToy(toyId);
      if (turn) {
        const playback = prepare(turn).playbackInstance;
        playback.active = true;
        adoptPlaybackInstance(playback);
        if (toy) { toy.__chainTurnStartTick = turn.startTick; toy.__chainTurnEndTick = turn.endTick; toy.dataset.chainActive = 'true'; }
      } else {
        // Ending the displayed turn must not cancel a future prepared turn.
        if (previous) previous.active = false;
        if (toy) toy.dataset.chainActive = 'false';
      }
      if (previous?.structureTurnId && previous.structureTurnId !== turn?.id)
        toy?.__sequenceTurnEnded?.(previous.startTick + previous.durationTicks);
    }
    for (const [turn, previous] of activations) onTurn(turn, previous);
    discardPrepared(turn => (!transportId || turn.transportId === transportId) && turn.endTick <
      (transportId || !connectionModel ? currentTick : stateFor(turn.toyId, {currentTick}).currentTick) - TICKS_PER_BAR * 2);
    publishDebug(runtime.debugSnapshot(currentTick));
  }

  function turnsForLookahead(currentTick, endTick, transportId = null) {
    updateCurrent(currentTick, transportId);
    const turns = [];
    for (const headId of heads.keys()) {
      if (transportId && runtime.getDefinition(definitionId(headId))?.transportId !== transportId) continue;
      if (connectionModel && !connectionModel.isRooted(headId)) continue;
      const id = definitionId(headId);
      turns.push(...runtime.turnsInWindow(id, currentTick, endTick)
        .filter(turn => heads.get(headId).includes(turn.toyId)).map(prepare));
      runtime.commitThrough(id, endTick);
    }
    return turns;
  }

  function retrigger(headId, transportState, { quantize = transportState.state === 'playing' } = {}) {
    if (!heads.has(headId) || (connectionModel && !connectionModel.isRooted(headId))) return null;
    for (const toyId of heads.get(headId)) {
      terminatedToys.delete(toyId);
      if (!hasOtherRoot(toyId, headId)) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
      const toy = getToy(toyId);
      if (toy) { toy.dataset.chainActive = 'false'; delete toy.__chainStartAt; }
    }
    discardPrepared(turn => turn.definitionId === definitionId(headId));
    currentTurns.delete(headId);
    const old=runtime.getInstance(definitionId(headId));
    const instance = runtime.startSequence(definitionId(headId), transportState.currentTick,
      { quantize, retrigger: true, loop: old?.loop });
    instance.rootAnchor=old?.rootAnchor;instance.powerConnectionId=old?.powerConnectionId;
    // Head gestures can immediately begin internal relearning, but their musical
    // anchor must already be the new (possibly future) parent-assigned boundary.
    for (const turn of runtime.turnsInWindow(definitionId(headId), instance.startTick, instance.startTick + 1)) adoptPlaybackInstance(prepare(turn).playbackInstance);
    updateCurrent(transportState.currentTick);
    return instance;
  }

  function reset() {
    for (const toyId of managed) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
    discardPrepared(() => true);
    runtime.reset(); heads.clear(); headDefinitions.clear(); prepared.clear(); currentTurns.clear();
    managed.clear(); auxiliaryDefinitions.clear(); terminatedToys.clear(); chainState.clear();currentRootCycles.clear();
    publishDebug(runtime.debugSnapshot());
  }
  return { reset, sync, updateCurrent, turnsForLookahead, retrigger, terminateStructure, runtime,
    getActiveToyIds: () => new Set([...chainState.values()].filter(id => id && !managed.has(id) && getPlaybackInstance(id)?.active !== false).concat([...currentTurns.values()].flatMap(turns => [...turns.values()].map(turn => turn.toyId))).filter(id => !connectionModel || connectionModel.isRooted(id))),
    getRootForToy: toyId => [...heads].find(([, members]) => members.includes(toyId))?.[0] || null,
    isManaged: toyId => managed.has(toyId), hasSequence: headId => heads.has(headId) };
}
