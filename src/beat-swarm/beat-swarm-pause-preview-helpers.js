export function getPausePreviewHelperKeyRuntime(options = null) {
  const slotIndex = Number.isFinite(options?.slotIndex) ? Math.trunc(options.slotIndex) : -1;
  const stageIndex = Number.isFinite(options?.stageIndex) ? Math.trunc(options.stageIndex) : -1;
  return `${slotIndex}:${stageIndex}`;
}

export function hasActivePausePreviewHelperByKeyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const key = String(options?.helperKey || '');
  if (!pausePreview || !Array.isArray(pausePreview.helpers) || !key) return false;
  for (let i = pausePreview.helpers.length - 1; i >= 0; i--) {
    const h = pausePreview.helpers[i];
    if (String(h?.key || '') !== key) continue;
    const aConnected = !!h?.elA?.isConnected;
    const bConnected = !!h?.elB?.isConnected;
    const elConnected = !!h?.el?.isConnected;
    const visualAlive = aConnected || bConnected || elConnected;
    if (visualAlive) return true;
    pausePreview.helpers.splice(i, 1);
  }
  return false;
}

export function createPausePreviewHelperVisualsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  const kind = String(options?.kind || '');
  if (!pausePreviewSceneEl || !kind) return null;
  if (kind === 'orbital-drone') {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    elA.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital';
    elB.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital';
    pausePreviewSceneEl.appendChild(elA);
    pausePreviewSceneEl.appendChild(elB);
    return { elA, elB };
  }
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-turret';
  pausePreviewSceneEl.appendChild(el);
  return { el };
}

export function spawnPausePreviewHelperRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  const kind = String(options?.kind || '');
  const anchorPoint = options?.anchorPoint && typeof options.anchorPoint === 'object' ? options.anchorPoint : null;
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const context = options?.context && typeof options.context === 'object' ? options.context : null;
  const anchorEnemy = options?.anchorEnemy || null;
  if (!pausePreview || !Array.isArray(pausePreview.helpers) || !pausePreviewSceneEl || !kind || !anchorPoint) return false;
  const slotRaw = Number(context?.weaponSlotIndex);
  const stageRaw = Number(context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const stageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const key = helpers.getPausePreviewHelperKey?.({ slotIndex, stageIndex }) || `${slotIndex}:${stageIndex}`;
  if (helpers.hasActivePausePreviewHelperByKey?.({ ...options, helperKey: key })) return false;
  const visuals = helpers.createPausePreviewHelperVisuals?.({ ...options, kind });
  if (!visuals) return false;
  const lifeBeats = Math.max(1, Math.trunc(Number(constants.previewHelperLifetimeBeats) || 8));
  pausePreview.helpers.push({
    key,
    kind,
    anchorType: anchorEnemy ? 'enemy' : (String(context?.helperAnchorType || '') === 'player' ? 'player' : 'world'),
    anchorEnemy: anchorEnemy || null,
    anchorX: Number(anchorPoint.x) || 0,
    anchorY: Number(anchorPoint.y) || 0,
    orbitAngle: 0,
    orbitRadius: Math.max(1, Number(constants.previewHelperOrbitRadius) || 34),
    orbitAngVel: Number(constants.previewHelperOrbitAngVel) || 2.3,
    untilBeat: beatIndex + lifeBeats,
    nextStages: helpers.sanitizeWeaponStages?.(options?.nextStages) || [],
    context: {
      weaponSlotIndex: slotIndex,
      stageIndex,
    },
    elA: visuals.elA || null,
    elB: visuals.elB || null,
    el: visuals.el || null,
  });
  return true;
}

export function firePausePreviewHelperPayloadAtRuntime(options = null) {
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const origin = options?.origin && typeof options.origin === 'object' ? options.origin : null;
  const helperObj = options?.helperObj && typeof options.helperObj === 'object' ? options.helperObj : null;
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  if (!origin || !helperObj) return;
  const stages = helpers.sanitizeWeaponStages?.(helperObj?.nextStages) || [];
  const slotRaw = Number(helperObj?.context?.weaponSlotIndex);
  const stageRaw = Number(helperObj?.context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const baseStageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const nearest = helpers.getPausePreviewNearestEnemies?.(origin.x, origin.y, 1)?.[0] || null;
  if (!stages.length) {
    const dir = nearest
      ? (helpers.normalizeDir?.(nearest.x - origin.x, nearest.y - origin.y) || { x: 1, y: 0 })
      : { x: 1, y: 0 };
    helpers.spawnPausePreviewProjectileFromDirection?.({
      ...options,
      from: origin,
      dirX: dir.x,
      dirY: dir.y,
      damage: 2,
      nextStages: null,
      nextBeatIndex: null,
      chainContext: null,
    });
    return;
  }
  const first = stages[0];
  const rest = stages.slice(1);
  if (first.archetype === 'helper') {
    if (first.variant && first.variant !== helperObj.kind) {
      const helperSpawnPoint = (first.variant === 'turret')
        ? (helpers.getOffsetPoint?.(
          origin,
          nearest ? { x: nearest.x, y: nearest.y } : null,
          Number(constants.previewHelperTurretSpawnOffset) || 18,
          { x: 1, y: 0 }
        ) || origin)
        : origin;
      helpers.spawnPausePreviewHelper?.({
        ...options,
        kind: first.variant,
        anchorPoint: helperSpawnPoint,
        beatIndex,
        nextStages: rest,
        context: {
          weaponSlotIndex: slotIndex,
          stageIndex: baseStageIndex + 1,
          helperAnchorType: 'world',
        },
        anchorEnemy: null,
      });
    }
    const dir = nearest
      ? (helpers.normalizeDir?.(nearest.x - origin.x, nearest.y - origin.y) || { x: 1, y: 0 })
      : { x: 1, y: 0 };
    helpers.spawnPausePreviewProjectileFromDirection?.({
      ...options,
      from: origin,
      dirX: dir.x,
      dirY: dir.y,
      damage: 2,
      nextStages: null,
      nextBeatIndex: null,
      chainContext: null,
    });
    return;
  }
  helpers.triggerPausePreviewWeaponStage?.({
    ...options,
    stage: first,
    origin,
    beatIndex,
    remainingStages: rest,
    context: {
      origin,
      impactPoint: origin,
      weaponSlotIndex: slotIndex,
      stageIndex: baseStageIndex + 1,
    },
  });
}

export function firePausePreviewHelpersOnBeatRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  if (!pausePreview || !Array.isArray(pausePreview.helpers)) return;
  const orbitRadius = Math.max(1, Number(constants.previewHelperOrbitRadius) || 34);
  for (const h of pausePreview.helpers) {
    if ((Number(h.untilBeat) || 0) < beatIndex) continue;
    if (h.kind === 'orbital-drone') {
      const r = Number(h.orbitRadius) || orbitRadius;
      const a = Number(h.orbitAngle) || 0;
      const points = [
        { x: h.anchorX + (Math.cos(a) * r), y: h.anchorY + (Math.sin(a) * r) },
        { x: h.anchorX + (Math.cos(a + Math.PI) * r), y: h.anchorY + (Math.sin(a + Math.PI) * r) },
      ];
      for (const p of points) helpers.firePausePreviewHelperPayloadAt?.({ ...options, origin: p, helperObj: h, beatIndex });
    } else {
      helpers.firePausePreviewHelperPayloadAt?.({
        ...options,
        origin: { x: h.anchorX, y: h.anchorY },
        helperObj: h,
        beatIndex,
      });
    }
  }
}

export function updatePausePreviewHelpersRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const dt = Math.max(0, Number(options?.dt) || 0);
  if (!pausePreview || !Array.isArray(pausePreview.helpers) || !Array.isArray(pausePreview.enemies)) return;
  const impactRadius = Math.max(4, Number(constants.previewHelperImpactRadius) || 12);
  const impactDamage = Math.max(0, Number(constants.previewHelperImpactDamage) || 1.1);
  const orbitRadius = Math.max(1, Number(constants.previewHelperOrbitRadius) || 34);
  const orbitAngVel = Number(constants.previewHelperOrbitAngVel) || 2.3;
  const ir2 = impactRadius * impactRadius;
  for (let i = pausePreview.helpers.length - 1; i >= 0; i--) {
    const h = pausePreview.helpers[i];
    if ((Number(h.untilBeat) || 0) < (Number(pausePreview.beatIndex) || 0)) {
      try { h?.elA?.remove?.(); } catch {}
      try { h?.elB?.remove?.(); } catch {}
      try { h?.el?.remove?.(); } catch {}
      pausePreview.helpers.splice(i, 1);
      continue;
    }
    if (String(h.anchorType) === 'enemy') {
      if (h.anchorEnemy && pausePreview.enemies.includes(h.anchorEnemy)) {
        h.anchorX = Number(h.anchorEnemy.x) || 0;
        h.anchorY = Number(h.anchorEnemy.y) || 0;
      } else {
        h.anchorType = 'world';
        h.anchorEnemy = null;
      }
    } else if (String(h.anchorType) === 'player') {
      h.anchorX = Number(pausePreview.ship?.x) || 0;
      h.anchorY = Number(pausePreview.ship?.y) || 0;
    }
    if (h.kind === 'orbital-drone') {
      h.orbitAngle = (Number(h.orbitAngle) || 0) + ((Number(h.orbitAngVel) || orbitAngVel) * dt);
      const pts = [
        {
          x: h.anchorX + (Math.cos(h.orbitAngle) * (Number(h.orbitRadius) || orbitRadius)),
          y: h.anchorY + (Math.sin(h.orbitAngle) * (Number(h.orbitRadius) || orbitRadius)),
          el: h.elA,
        },
        {
          x: h.anchorX + (Math.cos(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || orbitRadius)),
          y: h.anchorY + (Math.sin(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || orbitRadius)),
          el: h.elB,
        },
      ];
      for (const p of pts) {
        for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
          const e = pausePreview.enemies[j];
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          if ((dx * dx + dy * dy) <= ir2) helpers.damagePausePreviewEnemy?.(e, impactDamage * dt * 8);
        }
        if (p.el) p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
      }
    } else {
      for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
        const e = pausePreview.enemies[j];
        const dx = e.x - h.anchorX;
        const dy = e.y - h.anchorY;
        if ((dx * dx + dy * dy) <= ir2) helpers.damagePausePreviewEnemy?.(e, impactDamage * dt * 7);
      }
      if (h.el) h.el.style.transform = `translate(${h.anchorX.toFixed(2)}px, ${h.anchorY.toFixed(2)}px)`;
    }
  }
}
