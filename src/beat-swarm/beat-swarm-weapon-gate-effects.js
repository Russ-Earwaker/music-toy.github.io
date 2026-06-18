import { WEAPON_GATE_NOTE_POOL, WEAPON_GATE_TOTAL_SLOTS } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';
import { getWeaponGateCorridorBounds, getWeaponGateNoteStarPosition, getWeaponGateShipScreenPoint } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';

export function tickWeaponGateTransientEffects(state, dt = 0) {
  if (!state) return;
  const safeDt = Math.max(0, Number(dt) || 0);
  state.feedbackTtl = Math.max(0, state.feedbackTtl - safeDt);
  state.wallPulseTtl = Math.max(0, state.wallPulseTtl - safeDt);
  state.noteStarPulseT = Math.max(0, (Number(state.noteStarPulseT) || 0) - safeDt);
  updateWeaponGateShots(state, safeDt);
  for (const star of state.noteStars) star.age = (Number(star.age) || 0) + safeDt;
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

export function addWeaponGateNoteStar(state, selection = null) {
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
  };
  state.noteStars.push(star);
  return star;
}

export function applyWeaponGateWallBounce(state, y = 0, dir = 1) {
  if (!state) return;
  state.y = Number(y) || 0;
  state.vy = dir * Math.max(460, Math.abs(state.vy) * 0.9);
  state.speed = Math.min(740, state.speed + 80);
  state.wallPulseTtl = 0.25;
  const bounds = getWeaponGateCorridorBounds(state);
  state.wallPulseY = dir > 0 ? bounds.top : bounds.bottom;
}
