import { isPlaybackOccurrenceValid } from '../playback-instances.js';

// Audio admission supplies immutable note/occurrence data. Rendering only drains
// due events against the owning transport; it never advances a musical clock.
export function createDrawGridPlaybackVisuals() {
  const pending = new Map();
  return {
    enqueue(event) {
      const key = JSON.stringify([event.occurrence?.identity, event.toyId, event.eventTick, event.col, event.row]);
      if (!pending.has(key)) pending.set(key, event);
    },
    clear(transportId) {
      for (const [key, event] of pending) if (event.transportId === transportId) pending.delete(key);
    },
    flush(getTransport, emit) {
      for (const [key, event] of pending) {
        if (!isPlaybackOccurrenceValid(event.occurrence)) { pending.delete(key); continue; }
        const transport = getTransport(event.transportId);
        if (transport?.state !== 'playing' || transport.currentTick < (event.dueTick ?? event.eventTick)) continue;
        pending.delete(key);
        emit(event);
      }
    },
  };
}
export const drawGridPlaybackVisuals = createDrawGridPlaybackVisuals();
