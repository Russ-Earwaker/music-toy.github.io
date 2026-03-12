export function getHelperKeyRuntime(options = null) {
  const slotIndex = options?.slotIndex;
  const stageIndex = options?.stageIndex;
  const si = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : Math.trunc(Number(slotIndex));
  const ti = Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : Math.trunc(Number(stageIndex));
  return `${Number.isFinite(si) ? si : -1}:${Number.isFinite(ti) ? ti : -1}`;
}

export function getEnemyByIdRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const id = Math.trunc(Number(options?.enemyId) || 0);
  if (!(id > 0)) return null;
  return enemies.find((e) => Math.trunc(Number(e.id) || 0) === id) || null;
}

export function hasActiveHelperByKeyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = Array.isArray(state.helpers) ? state.helpers : [];
  const helperKey = String(options?.helperKey || '');
  return helpers.some((h) => String(h?.key || '') === helperKey);
}

export function createHelperVisualsRuntime(options = null) {
  const kind = String(options?.kind || '').trim();
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  if (!enemyLayerEl || !kind) return null;
  if (kind === 'orbital-drone') {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    elA.className = 'beat-swarm-projectile beat-swarm-helper-orbital';
    elB.className = 'beat-swarm-projectile beat-swarm-helper-orbital';
    enemyLayerEl.appendChild(elA);
    enemyLayerEl.appendChild(elB);
    return { elA, elB };
  }
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile beat-swarm-helper-turret';
  enemyLayerEl.appendChild(el);
  return { el };
}

export function spawnHelperRuntime(options = null) {
  const kind = String(options?.kind || '').trim();
  const anchorWorld = options?.anchorWorld && typeof options.anchorWorld === 'object' ? options.anchorWorld : null;
  const beatIndex = Number(options?.beatIndex) || 0;
  const nextStages = Array.isArray(options?.nextStages) ? options.nextStages : [];
  const context = options?.context && typeof options.context === 'object' ? options.context : null;
  const anchorEnemyId = options?.anchorEnemyId;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helperFns = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const helpers = Array.isArray(state.helpers) ? state.helpers : null;
  const enemyLayerEl = state.enemyLayerEl || null;
  if (!helpers || !enemyLayerEl || !anchorWorld || !kind) return false;
  const slotRaw = Number(context?.weaponSlotIndex);
  const stageRaw = Number(context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const stageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const key = helperFns.getHelperKey?.({ slotIndex, stageIndex }) || `${slotIndex}:${stageIndex}`;
  if (helperFns.hasActiveHelperByKey?.({ ...options, helperKey: key })) return false;
  const visuals = helperFns.createHelperVisuals?.({ ...options, kind });
  if (!visuals) return false;
  helpers.push({
    id: Math.max(1, Number(helperFns.getNextHelperId?.() || 1)),
    key,
    kind,
    anchorType: Number.isFinite(anchorEnemyId)
      ? 'enemy'
      : (String(context?.helperAnchorType || '') === 'player' ? 'player' : 'world'),
    anchorEnemyId: Number.isFinite(anchorEnemyId) ? Math.trunc(anchorEnemyId) : null,
    anchorX: Number(anchorWorld.x) || 0,
    anchorY: Number(anchorWorld.y) || 0,
    orbitAngle: 0,
    orbitRadius: Number(constants.helperOrbitRadiusWorld) || 60,
    orbitAngVel: Number(constants.helperOrbitAngVel) || 1.4,
    untilBeat: Math.max(0, Math.trunc(beatIndex)) + Math.max(1, Math.trunc(Number(constants.helperLifetimeBeats) || 8)),
    damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
    nextStages: helperFns.sanitizeWeaponStages?.(nextStages) || [],
    context: {
      weaponSlotIndex: slotIndex,
      stageIndex,
      damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
      forcedNoteName: helperFns.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
    },
    elA: visuals.elA || null,
    elB: visuals.elB || null,
    el: visuals.el || null,
  });
  return true;
}

export function updateHelpersRuntime(options = null) {
  const dt = Math.max(0, Number(options?.dt) || 0);
  const centerWorld = options?.centerWorld || null;
  const scale = Math.max(0.001, Number(options?.scale) || 1);
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helperFns = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const helpers = Array.isArray(state.helpers) ? state.helpers : null;
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const currentBeatIndex = Math.trunc(Number(state.currentBeatIndex) || 0);
  if (!helpers) return;

  const impactRadiusWorld = (Number(constants.helperImpactRadiusPx) || 18) / scale;
  const ir2 = impactRadiusWorld * impactRadiusWorld;
  for (let i = helpers.length - 1; i >= 0; i--) {
    const h = helpers[i];
    if ((Number(h.untilBeat) || 0) < currentBeatIndex) {
      try { h?.elA?.remove?.(); } catch {}
      try { h?.elB?.remove?.(); } catch {}
      try { h?.el?.remove?.(); } catch {}
      helpers.splice(i, 1);
      continue;
    }
    if (String(h.anchorType) === 'enemy') {
      const e = helperFns.getEnemyById?.({ ...options, enemyId: h.anchorEnemyId }) || null;
      if (e) {
        h.anchorX = Number(e.wx) || 0;
        h.anchorY = Number(e.wy) || 0;
      } else {
        h.anchorType = 'world';
        h.anchorEnemyId = null;
      }
    } else if (String(h.anchorType) === 'player' && centerWorld) {
      h.anchorX = Number(centerWorld.x) || 0;
      h.anchorY = Number(centerWorld.y) || 0;
    }

    if (h.kind === 'orbital-drone') {
      h.orbitAngle = (Number(h.orbitAngle) || 0) + ((Number(h.orbitAngVel) || Number(constants.helperOrbitAngVel) || 1.4) * dt);
      const orbitR = Number(h.orbitRadius) || Number(constants.helperOrbitRadiusWorld) || 60;
      const points = [
        { x: h.anchorX + (Math.cos(h.orbitAngle) * orbitR), y: h.anchorY + (Math.sin(h.orbitAngle) * orbitR), el: h.elA },
        { x: h.anchorX + (Math.cos(h.orbitAngle + Math.PI) * orbitR), y: h.anchorY + (Math.sin(h.orbitAngle + Math.PI) * orbitR), el: h.elB },
      ];
      for (const p of points) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const dx = e.wx - p.x;
          const dy = e.wy - p.y;
          if ((dx * dx + dy * dy) <= ir2) {
            helperFns.damageEnemy?.(e, (Number(constants.helperImpactDamage) || 0.5) * dt * 8 * Math.max(0.05, Number(h.damageScale) || 1));
          }
        }
        const s = helperFns.worldToScreen?.({ x: p.x, y: p.y });
        if (p.el && s && Number.isFinite(s.x) && Number.isFinite(s.y)) p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.wx - h.anchorX;
        const dy = e.wy - h.anchorY;
        if ((dx * dx + dy * dy) <= ir2) {
          helperFns.damageEnemy?.(e, (Number(constants.helperImpactDamage) || 0.5) * dt * 7 * Math.max(0.05, Number(h.damageScale) || 1));
        }
      }
      const s = helperFns.worldToScreen?.({ x: h.anchorX, y: h.anchorY });
      if (h.el && s && Number.isFinite(s.x) && Number.isFinite(s.y)) h.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }
}

export function fireHelperPayloadAtRuntime(options = null) {
  const originWorld = options?.originWorld || null;
  const helperObj = options?.helperObj || null;
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helperFns = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!originWorld || !helperObj) return;
  const stages = helperFns.sanitizeWeaponStages?.(helperObj?.nextStages) || [];
  const slotRaw = Number(helperObj?.context?.weaponSlotIndex);
  const stageRaw = Number(helperObj?.context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const baseStageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const damageScale = Math.max(0.05, Number(helperObj?.context?.damageScale) || Number(helperObj?.damageScale) || 1);
  const forcedNoteName = helperFns.normalizeSwarmNoteName?.(helperObj?.context?.forcedNoteName) || null;
  const nearest = helperFns.getNearestEnemy?.(originWorld.x, originWorld.y) || null;
  if (!stages.length) {
    const dir = nearest
      ? (helperFns.normalizeDir?.(nearest.wx - originWorld.x, nearest.wy - originWorld.y) || { x: 1, y: 0 })
      : (helperFns.getShipFacingDirWorld?.() || { x: 1, y: 0 });
    helperFns.spawnProjectileFromDirection?.({
      fromW: originWorld,
      dirX: dir.x,
      dirY: dir.y,
      damage: 2 * damageScale,
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
        ? (helperFns.getOffsetPoint?.(
          originWorld,
          nearest ? { x: nearest.wx, y: nearest.wy } : null,
          Number(constants.helperTurretSpawnOffsetWorld) || 24,
          helperFns.getShipFacingDirWorld?.() || null
        ) || originWorld)
        : originWorld;
      helperFns.spawnHelper?.({
        kind: first.variant,
        anchorWorld: helperSpawnPoint,
        beatIndex,
        nextStages: rest,
        context: {
          weaponSlotIndex: slotIndex,
          stageIndex: baseStageIndex + 1,
          helperAnchorType: 'world',
          damageScale,
          forcedNoteName,
        },
        anchorEnemyId: null,
      });
    }
    const dir = nearest
      ? (helperFns.normalizeDir?.(nearest.wx - originWorld.x, nearest.wy - originWorld.y) || { x: 1, y: 0 })
      : (helperFns.getShipFacingDirWorld?.() || { x: 1, y: 0 });
    helperFns.spawnProjectileFromDirection?.({
      fromW: originWorld,
      dirX: dir.x,
      dirY: dir.y,
      damage: 2 * damageScale,
      nextStages: null,
      nextBeatIndex: null,
      chainContext: null,
    });
    return;
  }
  helperFns.triggerWeaponStage?.({
    stage: first,
    originWorld,
    beatIndex,
    remainingStages: rest,
    context: {
      origin: originWorld,
      impactPoint: originWorld,
      weaponSlotIndex: slotIndex,
      stageIndex: baseStageIndex + 1,
      damageScale,
      forcedNoteName,
    },
  });
}

export function fireHelpersOnBeatRuntime(options = null) {
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helperFns = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const helpers = Array.isArray(state.helpers) ? state.helpers : [];
  for (const h of helpers) {
    if ((Number(h.untilBeat) || 0) < beatIndex) continue;
    if (h.kind === 'orbital-drone') {
      const r = Number(h.orbitRadius) || Number(constants.helperOrbitRadiusWorld) || 60;
      const a = Number(h.orbitAngle) || 0;
      const points = [
        { x: h.anchorX + (Math.cos(a) * r), y: h.anchorY + (Math.sin(a) * r) },
        { x: h.anchorX + (Math.cos(a + Math.PI) * r), y: h.anchorY + (Math.sin(a + Math.PI) * r) },
      ];
      for (const p of points) helperFns.fireHelperPayloadAt?.({ ...options, originWorld: p, helperObj: h, beatIndex });
    } else {
      helperFns.fireHelperPayloadAt?.({
        ...options,
        originWorld: { x: h.anchorX, y: h.anchorY },
        helperObj: h,
        beatIndex,
      });
    }
  }
}
