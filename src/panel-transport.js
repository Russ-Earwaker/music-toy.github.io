import { transportRegistry, MAIN_TRANSPORT_ID } from './transport-registry.js';
import { connectionModel } from './connections.js';
import { ensureAudioContext } from './audio-core.js';
import { transportLoopInfo } from './heartbeats.js';

export function getPanelTransport(panel) {
  const id = connectionModel.getTransportId(panel?.id);
  // During toy construction registration can lag behind initialization.
  return transportRegistry.get(id || (connectionModel.getObject(panel?.id) ? null : MAIN_TRANSPORT_ID));
}
export function panelTransportBindings(panel) {
  return {
    isRunning: () => getPanelTransport(panel)?.state === 'playing',
    getTransportState: () => getPanelTransport(panel)?.getState() || { state: 'paused', currentTick: 0 },
    getLoopInfo: () => transportLoopInfo(getPanelTransport(panel), ensureAudioContext().currentTime),
    getPositionAtAudioTime: time => getPanelTransport(panel)?.getPositionAtAudioTime(time) || 0,
    tickToAudioTime: tick => getPanelTransport(panel)?.tickToAudioTime(tick) ?? ensureAudioContext().currentTime,
    audioTimeToTick: time => getPanelTransport(panel)?.audioTimeToTick(time) || 0,
    barSeconds: () => 240 / (getPanelTransport(panel)?.bpm || 120),
  };
}
