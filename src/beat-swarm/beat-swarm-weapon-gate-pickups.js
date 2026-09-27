import { WEAPON_GATE_LOGICAL_CENTER, WEAPON_GATE_LOGICAL_WIDTH, getWeaponGateShipLogicalPoint } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';

export function updateWeaponGateDashPickup(state, dt = 0, input = null) {
  if (!state || state.phase !== 'gate') return null;
  const safeDt = Math.max(0, Number(dt) || 0);
  state.dashPickupCooldown = Math.max(0, (Number(state.dashPickupCooldown) || 0) - safeDt);
  if (!state.dashPickup && state.dashPickupCooldown <= 0) {
    state.dashPickup = { x: state.progress + WEAPON_GATE_LOGICAL_WIDTH + 180, y: state.y };
  }
  const p = state.dashPickup;
  if (!p) return null;
  const sx = p.x - state.progress;
  const sy = p.y + (WEAPON_GATE_LOGICAL_CENTER.y - state.y);
  const { x: shipX, y: shipY } = getWeaponGateShipLogicalPoint();
  if (sx < -40) {
    state.dashPickup = null;
    state.dashPickupCooldown = 1.25;
    return null;
  }
  if (Math.hypot(sx - shipX, sy - shipY) > 34) return null;
  state.dashPickup = null;
  state.dashPickupCooldown = 1.8;
  const ix = Number(input?.x) || 0;
  const iy = Number(input?.y) || 0;
  const mag = Math.hypot(ix, iy);
  if (mag > 0.2) return { x: ix / mag, y: iy / mag, power: 760 };
  const angle = (state.rng() < 0.5 ? -1 : 1) * ((Math.PI / 8) + (state.rng() * Math.PI / 8));
  return { x: Math.cos(angle), y: Math.sin(angle), power: 760 };
}
