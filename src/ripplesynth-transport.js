export const RIPPLER_LOOP_TICKS = 384;

export function nextRipplerRecordingStartTick(currentTick, loopLengthTicks = RIPPLER_LOOP_TICKS) {
  const loop = Math.max(1, Math.round(loopLengthTicks));
  return (Math.floor(Math.max(0, Number(currentTick) || 0) / loop) + 1) * loop;
}

export function quantizeRipplerOffsetTick(hitTick, startTick, quantDiv, {
  ticksPerBeat = 96,
  loopLengthTicks = RIPPLER_LOOP_TICKS,
} = {}) {
  const relative = Math.max(0, Math.round(Number(hitTick) || 0) - Math.round(Number(startTick) || 0));
  const div = Number(quantDiv);
  if (!Number.isFinite(div) || div <= 0) return relative % loopLengthTicks;
  const gridTicks = Math.max(1, Math.round(ticksPerBeat / div));
  return (Math.ceil((relative + 1e-6) / gridTicks) * gridTicks) % loopLengthTicks;
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
      let iteration = Math.ceil((fromTick - instance.startTick - offsetTick) / loop);
      iteration = Math.max(0, iteration);
      for (;;) {
        const eventTick = instance.startTick + (iteration * loop) + offsetTick;
        if (eventTick >= toTick) break;
        if (eventTick >= fromTick) {
          events.push({ eventTick, blockIndex, slot, offsetTick, eventKey: `block:${blockIndex}` });
        }
        iteration += 1;
      }
    }
  }
  return events.sort((a, b) => a.eventTick - b.eventTick || a.blockIndex - b.blockIndex);
}
