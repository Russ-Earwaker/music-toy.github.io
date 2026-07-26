import { WEAPON_GATE_NOTE_POOL, WEAPON_GATE_TOTAL_SLOTS } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';
import { getWeaponGateNoteStarPosition, getWeaponGateShipScreenPoint } from './beat-swarm-weapon-gate-geometry.js?v=2026-07-26-weapon-gate-ghosts-v1';

export function tickWeaponGateTransientEffects(state, dt = 0) {
  if (!state) return;
  const safeDt = Math.max(0, Number(dt) || 0);
  state.feedbackTtl = Math.max(0, state.feedbackTtl - safeDt);
  state.noteStarPulseT = Math.max(0, (Number(state.noteStarPulseT) || 0) - safeDt);
  for (const gate of state.gates || []) {
    if (!gate || !(Number(gate.heroTtl) > 0)) continue;
    gate.heroTtl = Math.max(0, (Number(gate.heroTtl) || 0) - safeDt);
  }
  updateWeaponGateShots(state, safeDt);
  for (const star of state.noteStars) {
    star.age = (Number(star.age) || 0) + safeDt;
    star.burstT = Math.max(0, (Number(star.burstT) || 0) - safeDt);
  }
  for (const transfer of state.noteTransfers || []) {
    transfer.ttl = Math.max(0, (Number(transfer.ttl) || 0) - safeDt);
  }
  state.noteTransfers = (state.noteTransfers || []).filter((transfer) => transfer.ttl > 0);
  for (const pulse of state.ghostGatePulses || []) {
    pulse.ttl = Math.max(0, (Number(pulse.ttl) || 0) - safeDt);
  }
  state.ghostGatePulses = (state.ghostGatePulses || []).filter((pulse) => pulse.ttl > 0);
}

export function spawnWeaponGateShot(state, note = 'C4') {
  if (!state) return null;
  const { x: shipX, y: shipY } = getWeaponGateShipScreenPoint();
  const target = { x: shipX + 250, y: shipY, ttl: 0.95, hit: false };
  const shot = { x: shipX + 26, y: shipY, vx: 780, note, ttl: 0.95, target };
  state.targets.push(target);
  state.shots.push(shot);
  return shot;
}

export function updateWeaponGateShots(state, dt = 0) {
  if (!state) return;
  const safeDt = Math.max(0, Number(dt) || 0);
  for (const shot of state.shots) {
    shot.x += shot.vx * safeDt;
    shot.ttl -= safeDt;
    if (shot.target && !shot.target.hit && Math.abs(shot.x - shot.target.x) < 18) {
      shot.target.hit = true;
      shot.ttl = 0;
    }
  }
  for (const target of state.targets) target.ttl -= safeDt;
  state.shots = state.shots.filter((shot) => shot.ttl > 0);
  state.targets = state.targets.filter((target) => target.ttl > 0);
}

export function addWeaponGateNoteStar(state, selection = null, originPoint = null) {
  if (!state) return null;
  const point = getWeaponGateNoteStarPosition({
    slotIndex: selection?.slotIndex,
    note: selection?.note || 'C4',
    notePool: WEAPON_GATE_NOTE_POOL,
    totalSlots: WEAPON_GATE_TOTAL_SLOTS,
  });
  const star = {
    x: point.x,
    y: point.y,
    note: selection?.note || '',
    slot: point.slot,
    age: 0,
    burstT: 0.56,
  };
  state.noteStars.push(star);
  if (Number.isFinite(Number(originPoint?.x)) && Number.isFinite(Number(originPoint?.y))) {
    const duration = 0.62;
    if (!Array.isArray(state.noteTransfers)) state.noteTransfers = [];
    state.noteTransfers.push({
      slot: point.slot,
      fromX: Number(originPoint.x),
      fromY: Number(originPoint.y),
      ttl: duration,
      duration,
    });
  }
  state.noteStarPulseSlot = point.slot;
  state.noteStarPulseT = Math.max(Number(state.noteStarPulseT) || 0, 0.22);
  return star;
}

export function pulseWeaponGateGhost(state, slotIndex = 0) {
  if (!state) return false;
  const slot = ((Math.trunc(Number(slotIndex) || 0) % WEAPON_GATE_TOTAL_SLOTS) + WEAPON_GATE_TOTAL_SLOTS) % WEAPON_GATE_TOTAL_SLOTS;
  const gate = (state.gates || []).find((candidate) => (
    candidate?.selected === true
    && Math.trunc(Number(candidate.slotIndex) || 0) === slot
  ));
  const selection = state.selections?.[slot] || null;
  if (!gate || String(selection?.kind || '') !== 'note' || Number(gate.heroTtl) > 0) return false;
  const ship = getWeaponGateShipScreenPoint();
  // Keep the replay flash inside one 1/16-note slot so interleaved old/new
  // gates read as a single ordered sequence instead of overlapping.
  const duration = 0.18;
  state.ghostGatePulses = (state.ghostGatePulses || []).filter((pulse) => Math.trunc(Number(pulse.slot) || 0) !== slot);
  state.ghostGatePulses.push({
    slot,
    gate,
    corridorX: (Number(state.progress) || 0) + (Number(ship.x) || 0),
    ttl: duration,
    duration,
  });
  return true;
}
