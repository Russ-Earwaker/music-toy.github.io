import {patternOriginTick} from './source-phase.js';
export const RIPPLER_LOOP_TICKS = 384;

export function ripplerCycleAtTick(instance, currentTick) {
  if (!instance?.active || currentTick < instance.startTick || currentTick >= (instance.endTick ?? Infinity)) return null;
  const loop = Math.max(1, Math.round(instance.loopLengthTicks || RIPPLER_LOOP_TICKS));
  const origin = patternOriginTick(instance);
  const startTick = origin + Math.floor((currentTick - origin) / loop) * loop;
  return { startTick, key: JSON.stringify([instance.occurrenceId || instance.id, startTick]) };
}

export function nextRipplerRecordingStartTick(currentTick, loopLengthTicks = RIPPLER_LOOP_TICKS) {
  const loop = Math.max(1, Math.round(loopLengthTicks));
  return (Math.floor(Math.max(0, Number(currentTick) || 0) / loop) + 1) * loop;
}

export function quantizeRipplerOffsetTick(hitTick, startTick, quantDiv, {
  ticksPerBeat = 96,
  loopLengthTicks = RIPPLER_LOOP_TICKS,
} = {}) {
  return quantizeForwardTick(hitTick,startTick,quantDiv,{ticksPerBeat}) % loopLengthTicks;
}

// Canonical forward grid admission, also used by performed loop sources.
export function quantizeForwardTick(hitTick,startTick=0,quantDiv=2,{ticksPerBeat=96,strict=true}={}){
  const relative = Math.max(0, Math.round(Number(hitTick) || 0) - Math.round(Number(startTick) || 0));
  const div = Number(quantDiv);
  if (!Number.isFinite(div) || div <= 0) return relative;
  const gridTicks = Math.max(1, Math.round(ticksPerBeat / div));
  return Math.ceil((relative + (strict?1e-6:0)) / gridTicks) * gridTicks;
}

export function ripplerEventsInWindow({
  instance,
  pattern,
  patternOffsets,
  blocks,
  fromTick,
  toTick,
}) {
  if (!instance?.active || toTick <= fromTick) return [];
  const loop = Math.max(1, Math.round(instance.loopLengthTicks || RIPPLER_LOOP_TICKS));
  const events = [];
  for (let slot = 0; slot < pattern.length; slot += 1) {
    for (const blockIndex of pattern[slot] || []) {
      const block = blocks?.[blockIndex];
      if (!block?.active) continue;
      const raw = patternOffsets?.[slot]?.get?.(blockIndex);
      const offsetTick = Number.isFinite(raw)
        ? Math.max(0, Math.round(raw)) % loop
        : Math.round((slot * loop) / Math.max(1, pattern.length));
      let iteration = Math.ceil((Math.max(fromTick,instance.startTick) - patternOriginTick(instance) - offsetTick) / loop);
      iteration = Math.max(0, iteration);
      for (;;) {
        const eventTick = patternOriginTick(instance) + (iteration * loop) + offsetTick;
        if (eventTick >= toTick) break;
        if (eventTick >= Math.max(fromTick,instance.startTick)) {
          events.push({ eventTick, blockIndex, slot, offsetTick, eventKey: `block:${blockIndex}` });
        }
        iteration += 1;
      }
    }
  }
  return events.sort((a, b) => a.eventTick - b.eventTick || a.blockIndex - b.blockIndex);
}
