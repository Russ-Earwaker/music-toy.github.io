export const BOUNCER_LOOP_TICKS = 384;

const cleanTick = value => Math.max(0, Math.round(Number(value) || 0));

export function nextBouncerRecordingStartTick(currentTick, loopLengthTicks = BOUNCER_LOOP_TICKS) {
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  return (Math.floor(cleanTick(currentTick) / loop) + 1) * loop;
}

export function quantizeBouncerOffsetTick(hitTick, startTick, quantDiv, {
  ticksPerBeat = 96,
  loopLengthTicks = BOUNCER_LOOP_TICKS,
} = {}) {
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  const relative = Math.max(0, cleanTick(hitTick) - cleanTick(startTick));
  const div = Number(quantDiv);
  if (!Number.isFinite(div) || div <= 0) return relative % loop;
  const gridTicks = Math.max(1, Math.round(ticksPerBeat / div));
  // A hit in the final quantization cell belongs at the end of this recorded
  // loop. Wrapping a rounded value of `loop` back to zero makes the note play
  // at the launch position, disconnected from the recorded collision.
  return Math.min(loop - 1, Math.ceil((relative + 1e-6) / gridTicks) * gridTicks);
}

export function normalizeBouncerPattern(pattern, {
  ticksPerBeat = 96,
  loopLengthTicks = BOUNCER_LOOP_TICKS,
} = {}) {
  if (!Array.isArray(pattern)) return [];
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  return pattern.map(event => {
    if (!event || typeof event !== 'object') return null;
    let offsetTick = Number(event.offsetTick);
    if (!Number.isFinite(offsetTick) && Number.isFinite(Number(event.offset))) {
      offsetTick = Number(event.offset) * ticksPerBeat;
    }
    if (!Number.isFinite(offsetTick)) return null;
    return { ...event, offsetTick: cleanTick(offsetTick) % loop };
  }).filter(Boolean);
}

export function normalizeBouncerTrajectory(samples, loopLengthTicks = BOUNCER_LOOP_TICKS) {
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  if (!Array.isArray(samples)) return [];
  const byTick = new Map();
  for (const sample of samples) {
    if (!sample || !Number.isFinite(Number(sample.x)) || !Number.isFinite(Number(sample.y))) continue;
    const rawTick = Number.isFinite(Number(sample.offsetTick)) ? sample.offsetTick : sample.tick;
    if (!Number.isFinite(Number(rawTick))) continue;
    const offsetTick = cleanTick(rawTick) % loop;
    byTick.set(offsetTick, {
      offsetTick,
      x: Number(sample.x),
      y: Number(sample.y),
      r: Math.max(0, Number(sample.r) || 0),
    });
  }
  return [...byTick.values()].sort((a, b) => a.offsetTick - b.offsetTick);
}

export function recordBouncerTrajectorySample(samples, ball, transportTick, startTick, loopLengthTicks = BOUNCER_LOOP_TICKS) {
  if (!Array.isArray(samples) || !ball || ball.isGhost) return false;
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  const relative = cleanTick(transportTick) - cleanTick(startTick);
  if (relative < 0 || relative >= loop) return false;
  const sample = { offsetTick: relative, x: Number(ball.x) || 0, y: Number(ball.y) || 0, r: Math.max(0, Number(ball.r) || 0) };
  const last = samples[samples.length - 1];
  if (last?.offsetTick === relative) samples[samples.length - 1] = sample;
  else samples.push(sample);
  return true;
}

export function interpolateBouncerTrajectory(samples, localTick, loopLengthTicks = BOUNCER_LOOP_TICKS) {
  const trajectory = normalizeBouncerTrajectory(samples, loopLengthTicks);
  if (!trajectory.length) return null;
  if (trajectory.length === 1) return { ...trajectory[0] };
  const loop = Math.max(1, cleanTick(loopLengthTicks));
  const tick = cleanTick(localTick) % loop;
  let rightIndex = trajectory.findIndex(sample => sample.offsetTick >= tick);
  if (rightIndex < 0) rightIndex = 0;
  const right = trajectory[rightIndex];
  const left = trajectory[(rightIndex - 1 + trajectory.length) % trajectory.length];
  const leftTick = left.offsetTick <= tick ? left.offsetTick : left.offsetTick - loop;
  const rightTick = right.offsetTick >= tick ? right.offsetTick : right.offsetTick + loop;
  const span = Math.max(1, rightTick - leftTick);
  const amount = Math.max(0, Math.min(1, (tick - leftTick) / span));
  return {
    offsetTick: tick,
    x: left.x + ((right.x - left.x) * amount),
    y: left.y + ((right.y - left.y) * amount),
    r: left.r + ((right.r - left.r) * amount),
    replay: true,
  };
}

export function getBouncerReplayCompletionTick({
  recorder,
  instance,
  currentTick,
  isChained = false,
  isChainActive = false,
  completedInstanceId = null,
} = {}) {
  if (recorder?.mode !== 'replay' || !isChained || !isChainActive || !instance?.active) return null;
  if (completedInstanceId === instance.id) return null;
  const completionTick = cleanTick(instance.startTick) + Math.max(1, cleanTick(instance.loopLengthTicks || BOUNCER_LOOP_TICKS));
  return cleanTick(currentTick) >= completionTick ? completionTick : null;
}

export function bouncerEventsInWindow({
  instance, pattern, blocks, edgeControllers, fromTick, toTick,
}) {
  if (!instance?.active || toTick <= fromTick) return [];
  const loop = Math.max(1, cleanTick(instance.loopLengthTicks || BOUNCER_LOOP_TICKS));
  const events = [];
  for (let index = 0; index < (pattern?.length || 0); index += 1) {
    const event = pattern[index];
    if (!event?.note || !Number.isFinite(Number(event.offsetTick))) continue;
    if (event.blockIndex != null && blocks?.[event.blockIndex]?.active === false) continue;
    if (event.edgeControllerIndex != null && edgeControllers?.[event.edgeControllerIndex]?.active === false) continue;
    if (event.edgeName != null) {
      const edge = { L: 'left', R: 'right', T: 'top', B: 'bot' }[event.edgeName] || event.edgeName;
      const controller = edgeControllers?.find?.(item => item?.edge === edge);
      if (controller?.active === false) continue;
    }
    const offsetTick = cleanTick(event.offsetTick) % loop;
    let iteration = Math.max(0, Math.ceil((fromTick - instance.startTick - offsetTick) / loop));
    for (;;) {
      const eventTick = instance.startTick + (iteration * loop) + offsetTick;
      if (eventTick >= toTick) break;
      if (eventTick >= fromTick) {
        const source = event.blockIndex != null ? `block:${event.blockIndex}`
          : event.edgeControllerIndex != null ? `edge:${event.edgeControllerIndex}`
            : `edge-name:${event.edgeName ?? 'unknown'}`;
        events.push({ ...event, eventTick, offsetTick, eventKey: `${source}:pattern:${index}` });
      }
      iteration += 1;
    }
  }
  return events.sort((a, b) => a.eventTick - b.eventTick || a.eventKey.localeCompare(b.eventKey));
}

export function bouncerVisualEventTick(instance, event) {
  if (!instance?.active || !Number.isFinite(Number(event?.visualOffsetTick))) return null;
  const loop = Math.max(1, cleanTick(instance.loopLengthTicks || BOUNCER_LOOP_TICKS));
  return cleanTick(instance.startTick) + (cleanTick(event.visualOffsetTick) % loop);
}
