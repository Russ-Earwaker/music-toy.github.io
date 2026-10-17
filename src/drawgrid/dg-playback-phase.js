import { getPlaybackLocalTick } from '../playback-instances.js';

export function drawGridPlaybackLoopInfo(info, instance) {
  if (!info) return null;
  const local = getPlaybackLocalTick(instance, info.currentTick);
  if (local == null) return info;
  const phase = local / instance.loopLengthTicks;
  return { ...info, phase01: phase, progress: phase, barLen: info.barLen * instance.loopLengthTicks / 384 };
}
