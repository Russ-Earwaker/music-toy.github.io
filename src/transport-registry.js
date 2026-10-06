import { transport, ensureAudioContext } from './audio-core.js';
import { createTickTransport } from './tick-transport.js';

export const MAIN_TRANSPORT_ID = 'main-heartbeat';

const transports = new Map([[MAIN_TRANSPORT_ID, transport]]);
let serial = 1;
export const transportRegistry = Object.freeze({
  get(id) { return transports.get(id); },
  list() { return [...transports.entries()].map(([id, transport]) => ({ id, transport })); },
  create({ id, ...options } = {}) {
    if (!id) do { id = `heartbeat:${serial++}`; } while (transports.has(id));
    if (transports.has(id)) throw new Error(`Transport already exists: ${id}`);
    const instance = createTickTransport({ ...options, id, getContext: ensureAudioContext,
      emit(detail) {
        try { if (detail.type === 'play') window.__ripplerUserArmed = true; } catch {}
        try { document.dispatchEvent(new CustomEvent('transport:change', { detail })); } catch {}
      } });
    transports.set(id, instance); return instance;
  },
  remove(id) {
    if (id === MAIN_TRANSPORT_ID) return false;
    const instance = transports.get(id); if (!instance) return false;
    instance.pause(); return transports.delete(id);
  },
});
