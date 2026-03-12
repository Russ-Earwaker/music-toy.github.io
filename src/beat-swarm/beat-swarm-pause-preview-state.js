export function spawnPausePreviewEnemyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.enemies) || !pausePreviewSceneEl) return;
  const minX = (Number(pausePreview.width) || 0) * 0.62;
  const maxX = (Number(pausePreview.width) || 0) * 0.92;
  const minY = (Number(pausePreview.height) || 0) * 0.18;
  const maxY = (Number(pausePreview.height) || 0) * 0.84;
  const x = helpers.randRange?.(minX, maxX) ?? minX;
  const y = helpers.randRange?.(minY, maxY) ?? minY;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-enemy';
  pausePreviewSceneEl.appendChild(el);
  const hp = Math.max(1, Number(constants.previewEnemyHp) || 4);
  pausePreview.enemies.push({
    x,
    y,
    hp,
    maxHp: hp,
    el,
  });
}

export function resetPausePreviewStateRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !pausePreviewSceneEl) return;
  const rect = pausePreviewSceneEl.getBoundingClientRect();
  pausePreview.width = Math.max(260, Number(rect.width) || 0);
  pausePreview.height = Math.max(200, Number(rect.height) || 0);
  if (!pausePreview.ship || typeof pausePreview.ship !== 'object') pausePreview.ship = { x: 0, y: 0, el: null };
  pausePreview.ship.x = pausePreview.width * 0.18;
  pausePreview.ship.y = pausePreview.height * 0.55;
  helpers.clearPausePreviewVisuals?.();
  pausePreviewSceneEl.innerHTML = '';
  const shipEl = document.createElement('div');
  shipEl.className = 'beat-swarm-preview-ship';
  pausePreviewSceneEl.appendChild(shipEl);
  pausePreview.ship.el = shipEl;
  const count = Math.max(1, Math.trunc(Number(constants.previewEnemyCount) || 7));
  for (let i = 0; i < count; i++) helpers.spawnPausePreviewEnemy?.(options);
  helpers.nudgePausePreviewEnemiesIntoAction?.(true, options);
  pausePreview.initialized = true;
}

export function ensurePausePreviewStateRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !pausePreviewSceneEl) return;
  const rect = pausePreviewSceneEl.getBoundingClientRect();
  const w = Math.max(260, Number(rect.width) || 0);
  const h = Math.max(200, Number(rect.height) || 0);
  if (!pausePreview.initialized || Math.abs(w - (Number(pausePreview.width) || 0)) > 1 || Math.abs(h - (Number(pausePreview.height) || 0)) > 1) {
    helpers.resetPausePreviewState?.(options);
  }
}

export function getPausePreviewNearestEnemiesRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.enemies)) return [];
  const x = Number(options?.x) || 0;
  const y = Number(options?.y) || 0;
  const count = Math.max(1, Math.trunc(Number(options?.count) || 1));
  const excludeEnemy = options?.excludeEnemy || null;
  const scored = pausePreview.enemies
    .filter((e) => !excludeEnemy || e !== excludeEnemy)
    .map((e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      return { e, d2: (dx * dx) + (dy * dy) };
    });
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, count).map((it) => it.e);
}

export function removePausePreviewEnemyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const enemy = options?.enemy || null;
  if (!pausePreview || !Array.isArray(pausePreview.enemies) || !enemy) return;
  const idx = pausePreview.enemies.indexOf(enemy);
  if (idx >= 0) pausePreview.enemies.splice(idx, 1);
  try { enemy.el?.remove?.(); } catch {}
}

export function damagePausePreviewEnemyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const enemy = options?.enemy || null;
  if (!pausePreview || !enemy) return false;
  pausePreview.secondsSinceHit = 0;
  enemy.hp -= Math.max(0, Number(options?.amount) || 0);
  helpers.pulseHitFlash?.(enemy.el);
  if (enemy.hp <= 0) {
    helpers.removePausePreviewEnemy?.({ ...options, enemy });
    return true;
  }
  return false;
}

export function previewSelectionContainsBoomerangRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const previewSelectedWeaponSlotIndex = Number.isInteger(options?.previewSelectedWeaponSlotIndex)
    ? options.previewSelectedWeaponSlotIndex
    : null;
  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const stages = helpers.sanitizeWeaponStages?.(weaponLoadout?.[slotIndex]?.stages) || [];
    for (const st of stages) {
      if (String(st?.archetype || '') === 'projectile' && String(st?.variant || '') === 'boomerang') return true;
    }
  }
  return false;
}

export function previewSelectionStartsWithExplosionRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const previewSelectedWeaponSlotIndex = Number.isInteger(options?.previewSelectedWeaponSlotIndex)
    ? options.previewSelectedWeaponSlotIndex
    : null;
  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const stages = helpers.sanitizeWeaponStages?.(weaponLoadout?.[slotIndex]?.stages) || [];
    const first = stages[0] || null;
    if (String(first?.archetype || '') === 'aoe' && String(first?.variant || '') === 'explosion') return true;
  }
  return false;
}

export function ensurePausePreviewExplosionBiasEnemyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.enemies) || !pausePreview.enemies.length) return;
  if (!helpers.previewSelectionStartsWithExplosion?.(options)) return;
  const cx = Number(pausePreview.ship?.x) || 0;
  const cy = Number(pausePreview.ship?.y) || 0;
  const previewExplosionRadius = Math.max(8, Number(constants.previewExplosionRadius) || 52);
  const biasRadius = Math.max(8, previewExplosionRadius * 0.9);
  const r2 = biasRadius * biasRadius;
  for (const e of pausePreview.enemies) {
    const dx = (Number(e.x) || 0) - cx;
    const dy = (Number(e.y) || 0) - cy;
    if ((dx * dx + dy * dy) <= r2) return;
  }
  const target = pausePreview.enemies[pausePreview.enemies.length - 1] || pausePreview.enemies[0];
  if (!target) return;
  const minX = 32;
  const maxX = Math.max(minX + 12, (Number(pausePreview.width) || 0) - 32);
  const minY = 26;
  const maxY = Math.max(minY + 12, (Number(pausePreview.height) || 0) - 26);
  const ang = helpers.randRange?.(0, Math.PI * 2) ?? 0;
  const radius = helpers.randRange?.(Math.max(6, previewExplosionRadius * 0.2), biasRadius) ?? Math.max(6, previewExplosionRadius * 0.2);
  target.x = Math.min(maxX, Math.max(minX, cx + (Math.cos(ang) * radius)));
  target.y = Math.min(maxY, Math.max(minY, cy + (Math.sin(ang) * radius)));
}

export function nudgePausePreviewEnemiesIntoActionRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const force = !!options?.force;
  if (!pausePreview || !Array.isArray(pausePreview.enemies) || !pausePreview.enemies.length) return;
  const noHitRepositionSeconds = Math.max(0.01, Number(constants.previewNoHitRepositionSeconds) || 2.4);
  if (!force && (Number(pausePreview.secondsSinceHit) || 0) < noHitRepositionSeconds) return;

  const shipX = Number(pausePreview.ship?.x) || 0;
  const shipY = Number(pausePreview.ship?.y) || 0;
  const minX = 32;
  const maxX = Math.max(minX + 12, (Number(pausePreview.width) || 0) - 32);
  const minY = 26;
  const maxY = Math.max(minY + 12, (Number(pausePreview.height) || 0) - 26);

  const nearCount = Math.min(3, pausePreview.enemies.length);
  const farCount = pausePreview.enemies.length - nearCount;
  const boomerangLayout = !!helpers.previewSelectionContainsBoomerang?.(options);
  const nearCenterX = Math.min(maxX, Math.max(minX, shipX + (boomerangLayout ? 98 : 74)));
  const nearCenterY = Math.min(maxY, Math.max(minY, shipY));
  const farMinX = Math.min(maxX, Math.max(minX, shipX + Math.max(150, (Number(pausePreview.width) || 0) * 0.34)));
  const nearRadiusMin = boomerangLayout ? 56 : 24;
  const nearRadiusMax = boomerangLayout ? 88 : 54;

  for (let i = 0; i < nearCount; i++) {
    const e = pausePreview.enemies[i];
    const ang = helpers.randRange?.(0, Math.PI * 2) ?? 0;
    const radius = helpers.randRange?.(nearRadiusMin, nearRadiusMax) ?? nearRadiusMin;
    e.x = Math.min(maxX, Math.max(minX, nearCenterX + (Math.cos(ang) * radius)));
    e.y = Math.min(maxY, Math.max(minY, nearCenterY + (Math.sin(ang) * radius)));
  }
  for (let i = 0; i < farCount; i++) {
    const e = pausePreview.enemies[nearCount + i];
    e.x = helpers.randRange?.(farMinX, maxX) ?? farMinX;
    e.y = helpers.randRange?.(minY, maxY) ?? minY;
  }
  helpers.ensurePausePreviewExplosionBiasEnemy?.(options);
  pausePreview.secondsSinceHit = 0;
}

export function getPausePreviewBeatLenRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const info = helpers.getLoopInfo?.();
  return Math.max(0.2, Number(info?.beatLen) || Number(constants.previewBeatLenFallback) || 0.5);
}
