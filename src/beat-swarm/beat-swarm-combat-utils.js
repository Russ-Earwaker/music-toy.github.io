export function normalizeDirRuntime(options = null) {
  const dx = Number(options?.dx) || 0;
  const dy = Number(options?.dy) || 0;
  const fallbackX = Number(options?.fallbackX);
  const fallbackY = Number(options?.fallbackY);
  const len = Math.hypot(dx, dy);
  if (len > 0.0001) return { x: dx / len, y: dy / len };
  const fx = Number.isFinite(fallbackX) ? fallbackX : 1;
  const fy = Number.isFinite(fallbackY) ? fallbackY : 0;
  const fLen = Math.hypot(fx, fy) || 1;
  return { x: fx / fLen, y: fy / fLen };
}

export function pulseHitFlashRuntime(options = null) {
  const el = options?.el || null;
  if (!el?.classList) return;
  const now = Number(options?.nowMs) || performance.now();
  const last = Number(el.dataset?.hitFlashTs || 0);
  if ((now - last) < 60) return;
  if (el.dataset) el.dataset.hitFlashTs = `${now}`;
  el.classList.remove('is-hit-flash');
  void el.offsetWidth;
  el.classList.add('is-hit-flash');
}

export function getOffsetPointRuntime(options = null) {
  const fromPoint = options?.fromPoint || null;
  const towardPoint = options?.towardPoint || null;
  const offsetDist = Number(options?.offsetDist) || 0;
  const fallbackDir = options?.fallbackDir || null;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const ox = Number(fromPoint?.x) || 0;
  const oy = Number(fromPoint?.y) || 0;
  const tx = Number(towardPoint?.x);
  const ty = Number(towardPoint?.y);
  let dir = null;
  if (Number.isFinite(tx) && Number.isFinite(ty)) {
    dir = helpers.normalizeDir?.({ dx: tx - ox, dy: ty - oy }) || { x: 1, y: 0 };
  } else if (fallbackDir && Number.isFinite(fallbackDir.x) && Number.isFinite(fallbackDir.y)) {
    dir = helpers.normalizeDir?.({ dx: fallbackDir.x, dy: fallbackDir.y }) || { x: 1, y: 0 };
  } else {
    dir = { x: 1, y: 0 };
  }
  const d = Math.max(0, offsetDist);
  return { x: ox + (dir.x * d), y: oy + (dir.y * d) };
}

export function getShipFacingDirWorldRuntime(options = null) {
  const shipFacingDeg = Number(options?.shipFacingDeg) || 0;
  const rad = (shipFacingDeg - 90) * (Math.PI / 180);
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

export function getProjectileChainSpawnOffsetWorldRuntime(options = null) {
  const z = options?.zoomState || null;
  const projectileHitRadiusPx = Number(options?.projectileHitRadiusPx) || 0;
  const projectileChainSpawnOffsetWorld = Number(options?.projectileChainSpawnOffsetWorld) || 0;
  const s = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = projectileHitRadiusPx / Math.max(0.001, s || 1);
  return Math.max(projectileChainSpawnOffsetWorld, hitRadiusWorld + 8);
}

export function countOrbitingHomingMissilesRuntime(options = null) {
  const projectiles = Array.isArray(options?.projectiles) ? options.projectiles : [];
  let n = 0;
  for (const p of projectiles) {
    if (String(p?.kind || '') !== 'homing-missile') continue;
    if (String(p?.homingState || '') !== 'orbit') continue;
    n += 1;
  }
  return n;
}
