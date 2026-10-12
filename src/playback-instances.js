import {patternOriginTick,applySourcePhase} from './source-phase.js';
import { TICKS_PER_BAR, nextBeatTick } from './audio-core.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { normalizeContext } from './playback-context.js';
// Toy lookup selects the visible playhead only. All audio occurrences coexist.
const instancesByToyId = new Map();
const occurrences = new Map();
const invalidationListeners = new Set();
export const getPlaybackOccurrence = id => occurrences.get(String(id)) || null;
export const getPlaybackOccurrences = toyId => [...occurrences.values()].filter(i => toyId == null || i.toyId === String(toyId));
export function onPlaybackOccurrenceInvalidated(listener) {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}
export function invalidatePlaybackOccurrence(id) {
  const instance = occurrences.get(String(id));
  if (!instance) return;
  instance.active = false; instance.generation++;
  occurrences.delete(instance.occurrenceId);
  for (const listener of invalidationListeners) { try { listener(instance.occurrenceId); } catch {} }
}
export function isPlaybackOccurrenceValid(metadata) {
  if (!metadata?.occurrenceId) return true; // unscheduled UI auditions
  const instance = getPlaybackOccurrence(metadata.occurrenceId);
  return !!instance?.active && instance.generation === metadata.generation;
}
let instanceSequence = 1;

const cleanTick = value => Math.max(0, Math.round(Number(value) || 0));
const cleanLoop = value => Math.max(1, Math.round(Number(value) || TICKS_PER_BAR));

function makeInstance(toyId, { startTick = 0, loopLengthTicks = TICKS_PER_BAR, active = true, generation = 0, occurrenceId = null, context = null } = {}, transportId = MAIN_TRANSPORT_ID) {
  const id = occurrenceId || `playback:${String(toyId)}:${instanceSequence++}`;
  const instance = {
    id, occurrenceId: id, context: normalizeContext(context),
    toyId: String(toyId),
    transportId,
    active: !!active,
    startTick: cleanTick(startTick),
    loopLengthTicks: cleanLoop(loopLengthTicks),
    durationTicks: cleanLoop(loopLengthTicks),
    scheduledUntilTick: cleanTick(startTick),
    definitionRevisionSeen: -1,
    generation: Math.max(0, Math.trunc(Number(generation) || 0)),
  };
  applySourcePhase(instance);
  occurrences.set(id, instance);
  return instance;
}

export function getPlaybackInstance(toyId) {
  return instancesByToyId.get(String(toyId)) || null;
}

export function ensurePlaybackInstance(toyId, options = {}) {
  const key = String(toyId);
  let instance = instancesByToyId.get(key);
  if (!instance) {
    instance = makeInstance(key, options, options.transportId ?? MAIN_TRANSPORT_ID);
    instancesByToyId.set(key, instance);
  } else if (options.loopLengthTicks != null) {
    instance.loopLengthTicks = cleanLoop(options.loopLengthTicks);
    instance.durationTicks = instance.loopLengthTicks;
  }
  return instance;
}

export function activatePlaybackInstance(toyId, requestedTick, {
  loopLengthTicks = TICKS_PER_BAR,
  quantize = true,
  retrigger = false,
} = {}) {
  const key = String(toyId);
  const existing = instancesByToyId.get(key) || null;
  // Structure-owned turns are placed by their parent timeline. Toy edits and
  // internal relearning may not rebase them; deliberate retriggers go via it.
  if (existing?.structureInstanceId) return existing;
  if (existing?.active && !retrigger) return existing;
  const startTick = quantize ? nextBeatTick(requestedTick, { strict: true }) : cleanTick(requestedTick);
  const generation = (existing?.generation || 0) + (existing ? 1 : 0);
  // Replacement instances inherit ownership, including retriggers and chain turns.
  const instance = makeInstance(key, { startTick, loopLengthTicks, active: true, generation, context: existing?.context }, existing?.transportId ?? MAIN_TRANSPORT_ID);
  if (existing) invalidatePlaybackOccurrence(existing.occurrenceId);
  instancesByToyId.set(key, instance);
  return instance;
}

// A chain turn is already quantized by the outgoing toy. Preserve that exact
// boundary and always replace the prior standalone/turn instance.
export function activatePlaybackInstanceForChainTurn(toyId, handoffTick, {
  loopLengthTicks = TICKS_PER_BAR,
} = {}) {
  return activatePlaybackInstance(toyId, handoffTick, {
    loopLengthTicks,
    quantize: false,
    retrigger: true,
  });
}

export function deactivatePlaybackInstance(toyId) {
  const instance = getPlaybackInstance(toyId);
  if (!instance) return null;
  invalidatePlaybackOccurrence(instance.occurrenceId);
  return instance;
}

// Replace identity, rather than mutating a scheduled instance into another clock.
export function rebasePlaybackTransport(toyId, transportId, startTick = 0) {
  const old = getPlaybackInstance(toyId);
  if (!old) return null;
  invalidatePlaybackOccurrence(old.occurrenceId);
  const instance = makeInstance(toyId, { startTick, loopLengthTicks: old.loopLengthTicks,
    generation: old.generation + 1, active: !!transportId, context: old.context }, transportId);
  instancesByToyId.set(String(toyId), instance);
  return instance;
}

// Prepare future turns without replacing a toy's currently visible occurrence.
export function createPlaybackInstanceForStructureTurn(turn) {
  const instance = makeInstance(turn.toyId, { startTick: turn.startTick,
    loopLengthTicks: turn.durationTicks, occurrenceId: turn.occurrenceId || turn.id,
    generation: turn.generation, context: turn.context }, turn.transportId);
  Object.assign(instance, { structureInstanceId: turn.structureInstanceId, structureTurnId: turn.id, explicitPhaseOffsetTicks: turn.explicitPhaseOffsetTicks || 0, structuralPath: turn.structuralPath });
  instance.endTick = turn.endTick;
  applySourcePhase(instance);
  return instance;
}

export function adoptPlaybackInstance(instance) {
  occurrences.set(instance.occurrenceId, instance);
  instancesByToyId.set(instance.toyId, instance);
  return instance;
}

// Leaving a Structure creates standalone runtime state; it must not retain the
// removed path's identity, modifier context, or cancelled scheduler cursor.
export function releasePlaybackInstance(toyId, { active = true } = {}) {
  const old = getPlaybackInstance(toyId);
  if (!old) return null;
  invalidatePlaybackOccurrence(old.occurrenceId);
  const instance = makeInstance(toyId, { startTick: old.startTick, loopLengthTicks: old.loopLengthTicks,
    active, generation: old.generation + 1 }, old.transportId);
  instancesByToyId.set(String(toyId), instance);
  return instance;
}

export function updatePlaybackInstanceProgress(toyId, { scheduledUntilTick, definitionRevisionSeen } = {}) {
  const instance = getPlaybackInstance(toyId);
  if (!instance) return null;
  if (scheduledUntilTick != null) instance.scheduledUntilTick = cleanTick(scheduledUntilTick);
  if (definitionRevisionSeen != null) instance.definitionRevisionSeen = Math.trunc(Number(definitionRevisionSeen) || 0);
  return instance;
}

export function getPlaybackLocalTick(instance, transportTick) {
  if (!instance?.active) return null;
  const tick = cleanTick(transportTick);
  if (tick < instance.startTick) return null;
  const loop = cleanLoop(instance.loopLengthTicks);
  return ((tick - patternOriginTick(instance)) % loop + loop) % loop;
}

export function getPlaybackColumn(instance, transportTick, steps = 8) {
  const localTick = getPlaybackLocalTick(instance, transportTick);
  if (localTick == null) return null;
  const count = Math.max(1, Math.trunc(Number(steps) || 1));
  return Math.floor((localTick * count) / cleanLoop(instance.loopLengthTicks)) % count;
}

// Chain ownership is half-open: the outgoing turn owns [startTick, endTick).
// Keeping this check beside the playback-position calculation prevents a render
// frame at the handoff tick from briefly showing the outgoing toy's next loop.
export function getPlaybackColumnWithinTurn(instance, transportTick, steps = 8, turnEndTick = null) {
  const tick = cleanTick(transportTick);
  const endTick = Number(turnEndTick);
  if (Number.isFinite(endTick) && tick >= cleanTick(endTick)) return null;
  return getPlaybackColumn(instance, tick, steps);
}

export function getPlaybackStepEvents(instance, fromTick, toTick, steps = 8) {
  if (!instance?.active) return [];
  const count = Math.max(1, Math.trunc(Number(steps) || 1));
  const loop = cleanLoop(instance.loopLengthTicks);
  const from = Math.max(cleanTick(fromTick), instance.startTick);
  const to = cleanTick(toTick);
  if (to <= from) return [];
  let stepNumber = Math.ceil(((from - patternOriginTick(instance)) * count) / loop);
  while (patternOriginTick(instance) + Math.round((stepNumber * loop) / count) < from) stepNumber += 1;
  const events = [];
  for (;;) {
    const eventTick = patternOriginTick(instance) + Math.round((stepNumber * loop) / count);
    if (eventTick >= to) break;
    events.push({
      eventTick,
      step: ((stepNumber % count) + count) % count,
    });
    stepNumber += 1;
  }
  return events;
}

export function removePlaybackInstance(toyId) {
  for (const instance of getPlaybackOccurrences(toyId)) invalidatePlaybackOccurrence(instance.occurrenceId);
  return instancesByToyId.delete(String(toyId));
}

export function clearPlaybackInstances() {
  for (const id of [...occurrences.keys()]) invalidatePlaybackOccurrence(id);
  instancesByToyId.clear();
}

export function clearPlaybackInstancesForTests() {
  clearPlaybackInstances();
  instanceSequence = 1;
}
