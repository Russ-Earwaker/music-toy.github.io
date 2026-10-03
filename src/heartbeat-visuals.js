import { connectionModel } from './connections.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';

// Pure tick-domain presentation. No activation, scheduling, or audio side effects.
export function getHeartbeatVisualPhase({ currentTick = 0, ticksPerBeat = 96, state } = {}) {
  const tick = Math.max(0, Number(currentTick) || 0);
  const beat = tick / Math.max(1, Number(ticksPerBeat) || 96);
  const phase = beat - Math.floor(beat);
  const playing = state === 'playing';
  return Object.freeze({
    tick, beat: Math.floor(beat), phase,
    energy: playing ? Math.pow(1 - phase, 3) : 0,
    travel: playing && phase < 0.8 ? phase / 0.8 : null,
  });
}

export function createHeartbeatVisualModel(getConnections = () => connectionModel.list('transport')) {
  return {
    update(toyIds, transportState) {
      const present = toyIds ? new Set(toyIds) : null;
      const connectedToyIds = getConnections().filter(c => c.kind === 'transport'
        && c.from.objectId === MAIN_TRANSPORT_ID && (!present || present.has(c.to.objectId)))
        .map(c => c.to.objectId);
      const pulse = getHeartbeatVisualPhase(transportState);
      return Object.freeze({
        transportId: MAIN_TRANSPORT_ID,
        connectedToyIds: Object.freeze(connectedToyIds),
        currentTick: pulse.tick, currentBeat: pulse.beat,
        activePulseCount: pulse.travel === null ? 0 : connectedToyIds.length, pulse,
      });
    },
  };
}
