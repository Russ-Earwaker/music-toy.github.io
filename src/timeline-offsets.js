import { TICKS_PER_BEAT } from './audio-core.js';
export const normalizeTimelineOffset = value => Number.isFinite(Number(value)) ? Math.max(0,Math.round(Number(value))) : 0;
export const snapTimelineOffset = value => Math.round(normalizeTimelineOffset(value)/TICKS_PER_BEAT)*TICKS_PER_BEAT;
