import { PROJECTILE_SPEED, PROJECTILE_LIFETIME } from './beat-swarm-mode-constants.js';
// The baseline has speed/lifetime, not an independent range constant.
export const BASELINE_STRAIGHT_SHOT_TRAVEL = PROJECTILE_SPEED * PROJECTILE_LIFETIME;
export function advanceStraightShot(p, dt) {
  p.spawnWorld ||= { x: p.wx, y: p.wy };
  p.maxRangeWorld ||= BASELINE_STRAIGHT_SHOT_TRAVEL;
  const speed = Math.hypot(p.vx, p.vy);
  const distance = Math.min(Math.max(0, dt) * speed, Math.max(0, p.maxRangeWorld - (p.distanceTravelled || 0)));
  if (speed > 0) { p.wx += p.vx / speed * distance; p.wy += p.vy / speed * distance; }
  p.distanceTravelled = (p.distanceTravelled || 0) + distance;
}
