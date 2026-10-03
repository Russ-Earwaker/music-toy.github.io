import { TICKS_PER_BAR } from './audio-core.js';
import { createStructureRuntime } from './structure-runtime.js';
import { compileStructureGraph } from './structure-graph.js';
import { adoptPlaybackInstance, createPlaybackInstanceForStructureTurn,
  deactivatePlaybackInstance, getPlaybackInstance } from './playback-instances.js';

// Connection edges define chains; DOM flags are compatibility/presentation state.
// Musical handoffs are derived exclusively from the parent Sequence timeline.
export function createChainSequenceAdapter({ getToy, chainState, cancelToy = () => {},
  onTurn = () => {}, onRelease = () => {}, publishDebug = () => {}, connectionModel = null } = {}) {
  const runtime = createStructureRuntime();
  const heads = new Map();
  const headDefinitions = new Map();
  const prepared = new Map();
  const currentTurns = new Map();
  const definitionId = headId => headDefinitions.get(headId) || `sequence:${headId}`;
  const managed = new Set();
  let auxiliaryDefinitions = new Set();
  const terminatedToys = new Set();

  function terminateStructure(id) {
    const owned = new Set(runtime.getDefinition(id)?.leafLayout.map(leaf => leaf.toyId) || []);
    for (const toyId of owned) {
      terminatedToys.add(toyId); cancelToy(toyId); deactivatePlaybackInstance(toyId);
    }
    for (const [key, entry] of prepared) if (entry.turn.structureContexts?.some(c => c.definitionId === id)) {
      entry.instance.active = false; prepared.delete(key);
    }
    runtime.remove(id);
    for (const [head, members] of heads) if (members.length && members.every(toy => owned.has(toy))) {
      runtime.remove(definitionId(head)); currentTurns.delete(head); chainState.delete(head);
    }
  }

  function prepare(turn) {
    for (const context of turn.structureContexts || []) runtime.bindChildInstance(context.definitionId, turn.definitionId, context.startTick);
    let instance = prepared.get(turn.id)?.instance;
    if (!instance) {
      instance = createPlaybackInstanceForStructureTurn(turn);
      prepared.set(turn.id, { turn, instance });
    }
    return { ...turn, playbackInstance: instance };
  }

  function sync(panels, transportState, { connections = null, structures = [] } = {}) {
    if (connectionModel) for (const id of terminatedToys) if (connectionModel.isRooted(id)) terminatedToys.delete(id);
    const previousId = panel => connections
      ? connections.find(c => c.to.objectId === panel.id)?.from.objectId
      : panel.dataset.prevToyId;
    const nextId = panel => connections
      ? connections.find(c => c.from.objectId === panel.id)?.to.objectId
      : panel.dataset.nextToyId;
    const roots = [];
    let auxiliary = new Set();
    if (structures.length) {
      const graph = compileStructureGraph({ panels, structures, connections: connections || [], runtime,
        currentTick: transportState.currentTick,
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
    const seen = new Set(), seenDefinitions = new Set(auxiliary), previousHeads = new Map(heads);
    const candidateHeads = new Set(roots.map(root => root.headId)), nextManaged = new Set();
    for (const root of roots) {
      const headId = root.headId, members = root.members;
      for (const toyId of members) nextManaged.add(toyId);
      if (!headDefinitions.has(headId)) {
        const owner = [...previousHeads].find(([oldHead, oldMembers]) =>
          !candidateHeads.has(oldHead) && members.some(id => oldMembers.includes(id)));
        headDefinitions.set(headId, owner ? definitionId(owner[0]) : root.preferredId || ('sequence:' + headId));
        if (owner && currentTurns.has(owner[0])) currentTurns.set(headId, currentTurns.get(owner[0]));
      }
      seen.add(headId); heads.set(headId, members);
      const id = definitionId(headId); seenDefinitions.add(id);
      runtime.defineStructure(id, root.type, root.children, transportState.currentTick, { representationId: root.representationId || null, count:root.count });
      const existingInstance = runtime.getInstance(id);
      if (!existingInstance || existingInstance.parentDefinitionId) {
        runtime.startSequence(id, transportState.currentTick, {
          quantize: transportState.state === 'playing', retrigger: !!existingInstance });
        for (const toyId of members) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
      }
      if (members.length && members.every(toyId => terminatedToys.has(toyId))) runtime.getInstance(id).active = false;
      else if (connectionModel) runtime.getInstance(id).active = connectionModel.isRooted(headId);
    }
    for (const headId of heads.keys()) if (!seen.has(headId)) {
      if (!seenDefinitions.has(definitionId(headId))) {
        for (const toyId of heads.get(headId)) cancelToy(toyId);
        runtime.remove(definitionId(headId));
        for (const [id, entry] of prepared) if (entry.turn.definitionId === definitionId(headId)) prepared.delete(id);
      }
      heads.delete(headId);
      headDefinitions.delete(headId);
      currentTurns.delete(headId);
    }
    for (const id of auxiliaryDefinitions) if (!seenDefinitions.has(id)) runtime.remove(id);
    auxiliaryDefinitions = auxiliary;
    for (const toyId of managed) if (!nextManaged.has(toyId)) {
      const toy = getToy(toyId);
      const instance = getPlaybackInstance(toyId);
      if (instance) {
        delete instance.structureInstanceId;
        delete instance.structureTurnId;
        instance.active = !terminatedToys.has(toyId) && (!connectionModel || connectionModel.isRooted(toyId));
      }
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
        if (instance && instance.structureInstanceId !== runtime.getInstance(toy.__sequenceDefinitionId)?.id) {
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
      const at = Math.max(transportState.currentTick, entry.turn.startTick);
      if (!nextManaged.has(entry.turn.toyId) || (connectionModel && !connectionModel.isRooted(entry.turn.toyId))
        || !runtime.turnsInWindow(entry.turn.definitionId, at, at + 1).some(turn => turn.id === key)) {
        entry.instance.active = false; prepared.delete(key);
      }
    }
    updateCurrent(transportState.currentTick);
  }

  function definitionIdForToy(toyId) {
    for (const [headId, children] of heads) if (children.includes(toyId)) return definitionId(headId);
    return null;
  }

  function updateCurrent(currentTick) {
    for (const [headId, children] of heads) {
      const turns = connectionModel && !connectionModel.isRooted(headId) ? []
        : runtime.turnsInWindow(definitionId(headId), currentTick, currentTick + 1).filter(t => children.includes(t.toyId));
      const active = new Map(turns.map(t => [t.toyId, t]));
      const previous = currentTurns.get(headId) || new Map();
      for (const [toyId, oldTurn] of previous) {
        if (active.get(toyId)?.id === oldTurn.id) continue;
        getToy(toyId)?.__sequenceTurnEnded?.(oldTurn.endTick);
        if (!active.has(toyId)) deactivatePlaybackInstance(toyId);
      }
      for (const toyId of children) {
        const toy = getToy(toyId), value = active.has(toyId) ? 'true' : 'false';
        if (toy && toy.dataset.chainActive !== value) toy.dataset.chainActive = value;
      }
      for (const turn of turns) {
        const playback = prepare(turn).playbackInstance;
        playback.active = true;
        if (previous.get(turn.toyId)?.id === turn.id) {
          if (getPlaybackInstance(turn.toyId) !== playback) adoptPlaybackInstance(playback);
          continue;
        }
        adoptPlaybackInstance(playback);
        const toy = getToy(turn.toyId);
        if (toy) { toy.__chainTurnStartTick = turn.startTick; toy.__chainTurnEndTick = turn.endTick; }
        onTurn(turn, previous.get(turn.toyId) || [...previous.values()].at(-1));
      }
      currentTurns.set(headId, active);
      chainState.set(headId, turns[0]?.toyId ?? null);
    }
    for (const [id, entry] of prepared) if (entry.turn.endTick < currentTick - TICKS_PER_BAR * 2) prepared.delete(id);
    publishDebug(runtime.debugSnapshot(currentTick));
  }

  function turnsForLookahead(currentTick, endTick) {
    updateCurrent(currentTick);
    const turns = [];
    for (const headId of heads.keys()) {
      if (connectionModel && !connectionModel.isRooted(headId)) continue;
      const id = definitionId(headId);
      turns.push(...runtime.turnsInWindow(id, currentTick, endTick)
        .filter(turn => heads.get(headId).includes(turn.toyId)).map(prepare));
      runtime.commitThrough(id, endTick);
    }
    return turns;
  }

  function retrigger(headId, transportState) {
    if (!heads.has(headId) || (connectionModel && !connectionModel.isRooted(headId))) return null;
    for (const toyId of heads.get(headId)) {
      terminatedToys.delete(toyId);
      cancelToy(toyId);
      deactivatePlaybackInstance(toyId);
      const toy = getToy(toyId);
      if (toy) { toy.dataset.chainActive = 'false'; delete toy.__chainStartAt; }
    }
    for (const [id, entry] of prepared) if (entry.turn.definitionId === definitionId(headId)) prepared.delete(id);
    currentTurns.delete(headId);
    const instance = runtime.startSequence(definitionId(headId), transportState.currentTick,
      { quantize: transportState.state === 'playing', retrigger: true });
    // Head gestures can immediately begin internal relearning, but their musical
    // anchor must already be the new (possibly future) parent-assigned boundary.
    for (const turn of runtime.turnsInWindow(definitionId(headId), instance.startTick, instance.startTick + 1)) adoptPlaybackInstance(prepare(turn).playbackInstance);
    updateCurrent(transportState.currentTick);
    return instance;
  }

  function reset() {
    for (const toyId of managed) { cancelToy(toyId); deactivatePlaybackInstance(toyId); }
    for (const entry of prepared.values()) entry.instance.active = false;
    runtime.reset(); heads.clear(); headDefinitions.clear(); prepared.clear(); currentTurns.clear();
    managed.clear(); auxiliaryDefinitions.clear(); terminatedToys.clear(); chainState.clear();
    publishDebug(runtime.debugSnapshot());
  }
  return { reset, sync, updateCurrent, turnsForLookahead, retrigger, terminateStructure, runtime,
    getActiveToyIds: () => new Set([...chainState.values()].filter(id => id && !managed.has(id) && getPlaybackInstance(id)?.active !== false).concat([...currentTurns.values()].flatMap(turns => [...turns.keys()])).filter(id => !connectionModel || connectionModel.isRooted(id))),
    getRootForToy: toyId => [...heads].find(([, members]) => members.includes(toyId))?.[0] || null,
    isManaged: toyId => managed.has(toyId), hasSequence: headId => heads.has(headId) };
}
