// Absolute-tick lookahead scheduler for legacy grid sequencers.
// Toys keep receiving __sequencerSchedule(column, audioTime); tick metadata is
// supplied as an optional third argument until playback instances are migrated.
import { getPlaybackInstance, updatePlaybackInstanceProgress } from './playback-instances.js';

const DEFAULT_TICKS_PER_BAR = 384;
const intTick = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

export function createSequencerScheduler({ ticksPerBar = DEFAULT_TICKS_PER_BAR, lateGraceTicks = 0 } = {}) {
  const loopTicks = Math.max(1, intTick(ticksPerBar, DEFAULT_TICKS_PER_BAR));
  const graceTicks = Math.max(0, intTick(lateGraceTicks));
  const states = new Map();
  let resetSerial = 0;
  let pendingReset = null;

  const makeState = (cursorTick) => ({
    scheduledUntilTick: intTick(cursorTick), identities: new Set(),
    definitionRevision: null, generation: null, resetSerial,
  });
  function getState(toyId, cursorTick) {
    let state = states.get(toyId);
    if (!state) { state = makeState(cursorTick); states.set(toyId, state); }
    if (state.resetSerial !== resetSerial && pendingReset) {
      state.scheduledUntilTick = pendingReset.cursorTick;
      state.identities.clear();
      state.resetSerial = resetSerial;
    }
    return state;
  }
  function resetTimeline(tick, { includeBoundary = true, clearIdentities = true } = {}) {
    const cursorTick = intTick(tick) + (includeBoundary ? 0 : 1);
    resetSerial += 1;
    pendingReset = { cursorTick };
    for (const state of states.values()) {
      state.scheduledUntilTick = cursorTick;
      if (clearIdentities) state.identities.clear();
      state.resetSerial = resetSerial;
    }
  }
  function clearToy(toyId) {
    if (!toyId) return;
    for (const key of states.keys()) if (key === toyId || key.startsWith(`${toyId}|`)) states.delete(key);
  }
  function resetToyTimeline(toyId, tick, { includeBoundary = true } = {}) {
    for (const [key, state] of states) if (key === toyId || key.startsWith(`${toyId}|`)) {
      state.scheduledUntilTick = intTick(tick) + (includeBoundary ? 0 : 1);
      state.identities.clear();
    }
  }
  function resolveGeneration(toy, toyId) {
    const audioId = toy?.__audioToyId || toy?.dataset?.audiotoyid || toy?.dataset?.toyid || toyId;
    try { return Number(window.__TOY_AUDIO_GEN?.[audioId]) || 0; } catch { return 0; }
  }
  function resolveStartTick(toy, audioTimeToTick) {
    const override = Number(toy?.__loopStartOverrideSec);
    return Number.isFinite(override) && typeof audioTimeToTick === 'function'
      ? intTick(audioTimeToTick(override)) : 0;
  }

  function tick({ transportId = null, activeToyIds, playbackTurns = [], getToy, currentTick, lookaheadEndTick, tickToAudioTime, audioTimeToTick } = {}) {
    if ((!activeToyIds?.size && !playbackTurns.length) || typeof tickToAudioTime !== 'function') return { scheduled: 0, events: [] };
    const nowTick = intTick(currentTick);
    const endTick = Math.max(nowTick, intTick(lookaheadEndTick, nowTick));
    if (endTick <= nowTick) return { scheduled: 0, events: [] };
    const events = [];

    const work = [...(activeToyIds || [])].map(toyId => ({ toyId }));
    work.push(...playbackTurns);
    for (const turn of work) {
      const { toyId } = turn;
      const toy = getToy ? getToy(toyId) : document.getElementById(toyId);
      if (!toy) continue;
      const usesEventProvider = typeof toy.__sequencerEventsInWindow === 'function'
        && typeof toy.__sequencerScheduleEvent === 'function';
      if (!usesEventProvider && typeof toy.__sequencerSchedule !== 'function') continue;
      const steps = Math.max(1, Math.trunc(Number(toy.dataset?.steps) || 8));
      const migratedGrid = ['loopgrid', 'loopgrid-drum', 'drawgrid'].includes(toy.dataset?.toy);
      const structureTurn = !!turn.playbackInstance;
      const usesPlaybackInstance = structureTurn || migratedGrid || usesEventProvider;
      const playbackInstance = turn.playbackInstance || (usesPlaybackInstance ? getPlaybackInstance(toyId) : null);
      if (usesPlaybackInstance && (!playbackInstance || !playbackInstance.active)) continue;
      if (transportId && playbackInstance && playbackInstance.transportId !== transportId) continue;
      const toyLoopTicks = usesPlaybackInstance
        ? Math.max(1, intTick(playbackInstance.loopLengthTicks, loopTicks))
        : loopTicks;
      const revision = Number.isFinite(Number(toy.__seqRev)) ? Number(toy.__seqRev) : 0;
      const generation = resolveGeneration(toy, toyId);
      const stateKey = structureTurn ? `${toyId}|${playbackInstance.id}` : toyId;
      const state = getState(stateKey, structureTurn ? Math.max(nowTick, turn.startTick) : nowTick);
      if (state.transportId != null && state.transportId !== transportId) { state.scheduledUntilTick = nowTick; state.identities.clear(); }
      state.transportId = transportId;
      const chainTurnEndTick = Number(structureTurn ? turn.endTick : toy.__chainTurnEndTick);
      const scheduleEndTick = Number.isFinite(chainTurnEndTick)
        ? Math.min(endTick, intTick(chainTurnEndTick))
        : endTick;

      const chainTurnStartTick = Number(toy.__chainTurnStartTick);
      const providerWindowStartTick = Number(toy.__sequencerWindowStartTick);
      const playbackStartTick = Number(playbackInstance?.startTick);
      const firstStepTicks = Math.max(1, Math.ceil(toyLoopTicks / steps));
      const freshPlaybackStartTick = usesPlaybackInstance
        && playbackInstance.definitionRevisionSeen < 0
        && Number.isFinite(playbackStartTick)
        && nowTick >= playbackStartTick
        && (nowTick - playbackStartTick) < firstStepTicks
          ? playbackStartTick
          : NaN;
      const explicitStartTick = structureTurn ? NaN : toy.__chainJustActivated && Number.isFinite(chainTurnStartTick)
        ? chainTurnStartTick
        : (Number.isFinite(providerWindowStartTick) ? providerWindowStartTick : freshPlaybackStartTick);
      const hasExplicitStart = Number.isFinite(explicitStartTick);
      if (!structureTurn && (toy.__forceSchedulerReset || toy.__chainJustActivated || hasExplicitStart)) {
        state.scheduledUntilTick = hasExplicitStart ? intTick(explicitStartTick) : nowTick;
        state.identities.clear();
        try { toy.__forceSchedulerReset = false; } catch {}
      }
      if (state.definitionRevision !== revision) {
        state.definitionRevision = revision;
      }
      if (state.generation !== generation) {
        state.generation = generation;
        state.identities.clear();
      }

      // Schedule [fromTick, endTick). Delayed polls recover only the explicit
      // grace range; older events are skipped and are never moved to a new tick.
      const fromTick = structureTurn
        ? Math.max(state.scheduledUntilTick, turn.startTick, Math.max(0, nowTick - graceTicks))
        : hasExplicitStart
        ? state.scheduledUntilTick
        : Math.max(state.scheduledUntilTick, Math.max(0, nowTick - graceTicks));
      if (fromTick >= scheduleEndTick) {
        state.scheduledUntilTick = Math.max(state.scheduledUntilTick, scheduleEndTick);
        continue;
      }

      if (usesEventProvider) {
        // Event-provider toys can contain several irregular events near their
        // local start. A late chain handoff must not backfill every event from
        // the exact turn boundary: AudioContext will clamp those past times to
        // "now" and audibly reorder/compress the learned pattern. Recover only
        // the configured grace window; older events remain missed.
        const providerFromTick = Math.max(fromTick, Math.max(0, nowTick - graceTicks));
        let providedEvents = null;
        try {
          providedEvents = toy.__sequencerEventsInWindow(providerFromTick, scheduleEndTick, playbackInstance);
        } catch {}
        // null means the provider is temporarily unavailable (for example while
        // physics is learning a pattern). Do not consume its musical window.
        if (providedEvents == null) continue;
        if (!Array.isArray(providedEvents)) providedEvents = [];
        for (const event of providedEvents) {
          const eventTick = intTick(event?.eventTick, -1);
          if (eventTick < providerFromTick || eventTick >= scheduleEndTick) continue;
          const eventKey = String(event?.eventKey || `event:${event?.step ?? 0}`);
          const identity = `${toyId}|${playbackInstance.id}|${eventTick}|${eventKey}|r${revision}|g${playbackInstance.generation}`;
          if (state.identities.has(identity)) continue;
          state.identities.add(identity);
          const metadata = {
            transportId: playbackInstance.transportId || transportId, toyId: String(toyId), playbackInstanceId: playbackInstance.id,
            eventTick, eventKey, definitionRevision: revision,
            generation: playbackInstance.generation, audioGeneration: generation,
            late: eventTick < nowTick, identity,
          };
          try {
            toy.__seqPatternActive = toy.__seqPattern || null;
            toy.__seqRevActive = revision;
            toy.__sequencerScheduleEvent(event, tickToAudioTime(eventTick), metadata);
            events.push(metadata);
          } catch {}
        }
        state.scheduledUntilTick = scheduleEndTick;
        const progress = {
          scheduledUntilTick: scheduleEndTick,
          definitionRevisionSeen: revision,
        };
        if (structureTurn) Object.assign(playbackInstance, progress);
        else updatePlaybackInstanceProgress(toyId, progress);
        try { toy.__chainJustActivated = false; } catch {}
        try { delete toy.__chainTurnStartTick; } catch {}
        try { delete toy.__sequencerWindowStartTick; } catch {}
        const pruneBefore = Math.max(0, nowTick - (loopTicks * 2));
        for (const identity of state.identities) {
          const identityTick = Number(identity.split('|')[2]);
          if (Number.isFinite(identityTick) && identityTick < pruneBefore) state.identities.delete(identity);
        }
        continue;
      }

      const startTick = usesPlaybackInstance ? playbackInstance.startTick : resolveStartTick(toy, audioTimeToTick);
      let stepNumber = Math.ceil(((fromTick - startTick) * steps) / toyLoopTicks);
      while (startTick + Math.round((stepNumber * toyLoopTicks) / steps) < fromTick) stepNumber += 1;
      for (;;) {
        const eventTick = startTick + Math.round((stepNumber * toyLoopTicks) / steps);
        if (eventTick >= scheduleEndTick) break;
        if (eventTick >= fromTick && eventTick >= 0) {
          const column = ((stepNumber % steps) + steps) % steps;
          const playbackInstanceId = usesPlaybackInstance
            ? playbackInstance.id
            : String(toy.dataset?.playbackInstanceId || `legacy:${toyId}`);
          const eventKey = `column:${column}`;
          const identityGeneration = usesPlaybackInstance ? playbackInstance.generation : generation;
          const identity = `${toyId}|${playbackInstanceId}|${eventTick}|${eventKey}|r${revision}|g${identityGeneration}`;
          if (!state.identities.has(identity)) {
            state.identities.add(identity);
            const metadata = {
              transportId: playbackInstance?.transportId || transportId,
              toyId: String(toyId), playbackInstanceId, eventTick, eventKey,
              definitionRevision: revision,
              generation: identityGeneration,
              audioGeneration: generation,
              late: eventTick < nowTick,
              identity,
            };
            try {
              toy.__seqPatternActive = toy.__seqPattern || null;
              toy.__seqRevActive = revision;
              toy.__sequencerSchedule(column, tickToAudioTime(eventTick), metadata);
              events.push(metadata);
            } catch {}
          }
        }
        stepNumber += 1;
      }
      state.scheduledUntilTick = scheduleEndTick;
      if (usesPlaybackInstance) {
        const progress = {
          scheduledUntilTick: scheduleEndTick,
          definitionRevisionSeen: revision,
        };
        if (structureTurn) Object.assign(playbackInstance, progress);
        else updatePlaybackInstanceProgress(toyId, progress);
      }
      try { toy.__chainJustActivated = false; } catch {}
      try { delete toy.__chainTurnStartTick; } catch {}
      try { delete toy.__sequencerWindowStartTick; } catch {}

      const pruneBefore = Math.max(0, nowTick - (loopTicks * 2));
      for (const identity of state.identities) {
        const eventTick = Number(identity.split('|')[2]);
        if (Number.isFinite(eventTick) && eventTick < pruneBefore) state.identities.delete(identity);
      }
    }
    // Occurrence scheduler state is bounded even after thousands of loops.
    for (const [key, state] of states) {
      if ((!transportId || state.transportId === transportId) && key.includes('|') && state.scheduledUntilTick < nowTick - loopTicks * 2) states.delete(key);
    }
    return { scheduled: events.length, events };
  }

  function getDebugState(toyId) {
    const state = states.get(toyId);
    return state ? {
      scheduledUntilTick: state.scheduledUntilTick,
      identities: new Set(state.identities),
      definitionRevision: state.definitionRevision,
      generation: state.generation,
    } : null;
  }
  return { tick, clearToy, resetTimeline, resetToyTimeline, getDebugState,
    reset() { states.clear(); pendingReset = null; resetSerial++; } };
}
