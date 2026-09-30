import { getPlaybackColumn } from './playback-instances.js';

export function resolveSimpleRhythmPlayheadColumn({ running, instance, transportTick, steps = 8 } = {}) {
  if (!running) return 0;
  return getPlaybackColumn(instance, transportTick, steps) ?? 0;
}
