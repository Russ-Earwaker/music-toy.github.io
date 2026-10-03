import { transport } from './audio-core.js';

export const MAIN_TRANSPORT_ID = 'main-heartbeat';

// Identity/lookup only: audio-core remains the sole clock and audio owner.
// Unknown identities have no transport; registration/switching is not supported.
export const transportRegistry = Object.freeze({
  get(transportId) {
    return transportId === MAIN_TRANSPORT_ID ? transport : undefined;
  },
});
