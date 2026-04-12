import { buildBeatSwarmBehavioralFormationEnemyRuntime } from './beat-swarm-behavioral-runtime.js';

function getFormationAnchorWorldRuntime(enemy, helpers) {
  if (String(enemy?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') return null;
  if (enemy?.retreating) return null;
  const formationArchetype = String(enemy?.formationArchetype || '').trim().toLowerCase();
  const formationSpawnRegion = String(enemy?.formationSpawnRegion || '').trim().toLowerCase();
  if (!formationArchetype && !formationSpawnRegion) return null;
  const introOrMergeProtected = enemy?.introStageCarrier === true || enemy?.formationMergeProtectionActive === true;
  if (!introOrMergeProtected) return null;
  const screenToWorld = typeof helpers?.screenToWorld === 'function' ? helpers.screenToWorld : null;
  if (!screenToWorld) return null;

  const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
  const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
  const memberIndex = Math.max(0, Math.trunc(Number(enemy?.formationMemberIndex) || 0));
  const memberCount = Math.max(1, Math.trunc(Number(enemy?.formationMemberCount) || 1));
  const centeredIndex = memberIndex - ((memberCount - 1) * 0.5);
  const xStep = Math.max(18, Math.round(screenW * 0.055));
  const yStep = Math.max(14, Math.round(screenH * 0.05));
  let targetX = screenW * 0.5;
  let targetY = screenH * 0.5;

  if (formationSpawnRegion === 'lower_outer' || formationArchetype === 'foundation_anchor_line') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = screenW * (laneSide < 0 ? 0.28 : (laneSide > 0 ? 0.72 : 0.5)) + (centeredIndex * (xStep * 0.45));
    targetY = (screenH * 0.78) - (Math.abs(centeredIndex) * (yStep * 0.2));
  } else if (formationSpawnRegion === 'mid_side' || formationArchetype === 'backbeat_pair') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = screenW * (laneSide < 0 ? 0.24 : (laneSide > 0 ? 0.76 : 0.5));
    targetY = (screenH * 0.5) + (centeredIndex * (yStep * 0.65));
  } else if (formationSpawnRegion === 'side_diagonal' || formationArchetype === 'syncopation_stair') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = screenW * (laneSide < 0 ? 0.2 : (laneSide > 0 ? 0.8 : 0.5));
    targetY = (screenH * 0.34) + (memberIndex * (yStep * 0.9));
  } else if (formationSpawnRegion === 'upper_mid' || formationArchetype === 'lead_arc') {
    targetX = (screenW * 0.5) + (centeredIndex * xStep);
    targetY = (screenH * 0.22) + (Math.abs(centeredIndex) * (yStep * 0.18));
  } else if (formationSpawnRegion === 'lead_reply_edge' || formationArchetype === 'answer_echo') {
    const laneSide = memberCount <= 1 ? 1 : (centeredIndex <= 0 ? -1 : 1);
    targetX = screenW * (laneSide < 0 ? 0.22 : 0.78);
    targetY = (screenH * 0.28) + (centeredIndex * (yStep * 0.5));
  } else {
    return null;
  }

  return screenToWorld({
    x: Math.max(24, Math.min(screenW - 24, targetX)),
    y: Math.max(24, Math.min(screenH - 24, targetY)),
  });
}

function getEventSectionVisualRuntime(enemy, eventSectionRuntime = null) {
  const activeEventSection = String(eventSectionRuntime?.activeEventSection || '').trim().toLowerCase();
  if (activeEventSection !== 'beat_bounce') {
    return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  }
  if (String(enemy?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') {
    return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  }
  const role = String(enemy?.formationRole || '').trim().toLowerCase();
  const musicLaneId = String(enemy?.musicLaneId || '').trim().toLowerCase();
  const eligibleRoles = Array.isArray(eventSectionRuntime?.eligibleRoles) ? eventSectionRuntime.eligibleRoles : [];
  const roleEligible = eligibleRoles.length <= 0
    || eligibleRoles.includes(role)
    || (musicLaneId === 'foundation_lane' && eligibleRoles.includes('foundation_groove'))
    || (musicLaneId === 'secondary_loop_lane' && eligibleRoles.includes('counter_rhythm'))
    || (musicLaneId === 'primary_loop_lane' && eligibleRoles.includes('lead_phrase'));
  if (!roleEligible) return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  const strongBeatActive = eventSectionRuntime?.strongBeatActive === true;
  if (!strongBeatActive) return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  const presentationWeight = Math.max(0.5, Number(enemy?.formationPresentationWeight) || 0.7);
  const pulseScale = Math.max(0, Number(eventSectionRuntime?.presentationPulseScale) || 0);
  return {
    velocityDamping: Math.max(0.82, Math.min(1, Number(eventSectionRuntime?.motionDamping) || 1)),
    scaleBias: 1 + (pulseScale * presentationWeight),
    offsetYPx: -(6 * presentationWeight),
  };
}

function resolveWindingChainLeaderRuntime(enemy, enemies) {
  const groupId = Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0));
  if (!(groupId > 0)) return null;
  let leader = null;
  for (let i = 0; i < enemies.length; i++) {
    const candidate = enemies[i];
    if (!candidate || candidate === enemy) continue;
    if (String(candidate?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') continue;
    const candidateGroupId = Math.max(0, Math.trunc(Number(candidate?.composerGroupId || candidate?.musicGroupId) || 0));
    if (candidateGroupId !== groupId) continue;
    if (candidate?.behavioralFormationActive !== true) continue;
    if (String(candidate?.behavioralFormationArchetype || '').trim().toLowerCase() !== 'winding_chain') continue;
    if (candidate?.retreating) continue;
    if (!leader || Math.trunc(Number(candidate?.formationMemberIndex) || 0) < Math.trunc(Number(leader?.formationMemberIndex) || 0)) {
      leader = candidate;
    }
  }
  return leader;
}

function resolveBehavioralFormationMotionRuntime(enemy, enemies, centerWorld, state, constants) {
  const runtime = enemy?.behavioralFormationRuntime && typeof enemy.behavioralFormationRuntime === 'object'
    ? enemy.behavioralFormationRuntime
    : null;
  if (!runtime || runtime.active !== true) return null;
  if (runtime.behaviorClass !== 'follow_the_leader' || runtime.archetype !== 'winding_chain') return null;
  const enemyMaxSpeed = Math.max(40, Number(constants?.enemyMaxSpeed) || 0);
  const speedMultiplier = Math.max(1, Number(runtime?.speedMultiplier) || 1);
  const desiredSpeed = enemyMaxSpeed * speedMultiplier;
  if ((Number(runtime?.leaderBias) || 0) >= 0.999) {
    const arenaCenter = state?.arenaCenterWorld && typeof state.arenaCenterWorld === 'object'
      ? state.arenaCenterWorld
      : centerWorld;
    const arenaRadius = Math.max(140, Number(constants?.swarmArenaRadiusWorld) || 0);
    const phase = (Number(enemy?.behavioralFormationPhase) || 0) + ((Number(state?.dt) || 0) * Math.PI * 2 * Math.max(0.04, Number(runtime?.pathOscillationHz) || 0.55));
    enemy.behavioralFormationPhase = phase;
    const relX = Number(enemy?.wx) - Number(arenaCenter?.x || 0);
    const relY = Number(enemy?.wy) - Number(arenaCenter?.y || 0);
    const relLen = Math.hypot(relX, relY) || 1;
    const currentAngle = Math.atan2(relY, relX);
    if (!enemy.behavioralFormationTraverseTarget || !Number.isFinite(enemy.behavioralFormationTraverseTarget.x) || !Number.isFinite(enemy.behavioralFormationTraverseTarget.y)) {
      enemy.behavioralFormationTraverseMode = Math.random() < 0.32 ? 'cross' : 'edge';
      enemy.behavioralFormationTraverseSign = enemy.behavioralFormationTraverseSign === -1 ? -1 : 1;
      if (enemy.behavioralFormationTraverseMode === 'edge') {
        const nextAngle = currentAngle + (enemy.behavioralFormationTraverseSign * (Math.PI * (0.55 + (Math.random() * 0.22))));
        enemy.behavioralFormationTraverseTarget = {
          x: Number(arenaCenter?.x || 0) + (Math.cos(nextAngle) * arenaRadius * 0.76),
          y: Number(arenaCenter?.y || 0) + (Math.sin(nextAngle) * arenaRadius * 0.76),
        };
      } else {
        enemy.behavioralFormationTraverseTarget = {
          x: Number(arenaCenter?.x || 0) - (relX / relLen) * arenaRadius * 0.68,
          y: Number(arenaCenter?.y || 0) - (relY / relLen) * arenaRadius * 0.42,
        };
      }
    }
    const targetDx0 = Number(enemy.behavioralFormationTraverseTarget.x) - Number(enemy?.wx);
    const targetDy0 = Number(enemy.behavioralFormationTraverseTarget.y) - Number(enemy?.wy);
    const targetDist0 = Math.hypot(targetDx0, targetDy0);
    if (targetDist0 < Math.max(80, arenaRadius * 0.18)) {
      const nextSign = (Number(enemy.behavioralFormationTraverseSign) || 1) * -1;
      enemy.behavioralFormationTraverseSign = nextSign;
      enemy.behavioralFormationTraverseMode = Math.random() < 0.34 ? 'cross' : 'edge';
      if (enemy.behavioralFormationTraverseMode === 'edge') {
        const nextAngle = currentAngle + (nextSign * (Math.PI * (0.6 + (Math.sin(phase * 0.53) * 0.18))));
        enemy.behavioralFormationTraverseTarget = {
          x: Number(arenaCenter?.x || 0) + (Math.cos(nextAngle) * arenaRadius * 0.78),
          y: Number(arenaCenter?.y || 0) + (Math.sin(nextAngle) * arenaRadius * 0.78),
        };
      } else {
        const wiggle = Math.sin(phase * 0.73) * arenaRadius * 0.28;
        enemy.behavioralFormationTraverseTarget = {
          x: Number(arenaCenter?.x || 0) + (nextSign * arenaRadius * 0.72),
          y: Number(arenaCenter?.y || 0) + wiggle,
        };
      }
    }
    const targetDx = Number(enemy.behavioralFormationTraverseTarget.x) - Number(enemy?.wx);
    const targetDy = Number(enemy.behavioralFormationTraverseTarget.y) - Number(enemy?.wy);
    const targetDist = Math.hypot(targetDx, targetDy) || 1;
    const dirX = targetDx / targetDist;
    const dirY = targetDy / targetDist;
    const normalX = -dirY;
    const normalY = dirX;
    const preferredRadius = Math.max(150, arenaRadius * 0.72);
    const radialX = relX / relLen;
    const radialY = relY / relLen;
    const radialError = preferredRadius - relLen;
    const radialPull = Math.max(-0.75, Math.min(0.75, radialError / Math.max(40, arenaRadius * 0.22)));
    const sweepWave = Math.sin(phase * 1.37) * Math.max(0.18, Math.min(1, Number(runtime?.pathOscillationAmplitude) || 0.5));
    const edgeMode = String(enemy.behavioralFormationTraverseMode || 'edge') === 'edge';
    const tangentDir = Number(enemy?.behavioralFormationTraverseSign) || 1;
    const tangentX = -radialY * tangentDir;
    const tangentY = radialX * tangentDir;
    const desiredDirX = edgeMode
      ? (dirX * 0.46) + (tangentX * 0.54) + (normalX * sweepWave * 0.28) + (radialX * radialPull * 0.52)
      : dirX + (normalX * sweepWave * 0.42) + (radialX * radialPull * 0.45);
    const desiredDirY = edgeMode
      ? (dirY * 0.46) + (tangentY * 0.54) + (normalY * sweepWave * 0.28) + (radialY * radialPull * 0.52)
      : dirY + (normalY * sweepWave * 0.42) + (radialY * radialPull * 0.45);
    const desiredDirLen = Math.hypot(desiredDirX, desiredDirY) || 1;
    return {
      overrideVelocity: true,
      desiredVx: (desiredDirX / desiredDirLen) * desiredSpeed,
      desiredVy: (desiredDirY / desiredDirLen) * desiredSpeed,
      blend: Math.max(0.12, Math.min(0.45, Number(runtime?.velocityBlend) || 0.34)),
    };
  }
  const groupId = Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0));
  if (!(groupId > 0)) return null;
  const members = [];
  for (let i = 0; i < enemies.length; i++) {
    const candidate = enemies[i];
    if (!candidate) continue;
    const candidateGroupId = Math.max(0, Math.trunc(Number(candidate?.composerGroupId || candidate?.musicGroupId) || 0));
    if (candidateGroupId !== groupId) continue;
    if (candidate?.behavioralFormationActive !== true) continue;
    if (String(candidate?.behavioralFormationArchetype || '').trim().toLowerCase() !== 'winding_chain') continue;
    if (candidate?.retreating) continue;
    members.push(candidate);
  }
  members.sort((a, b) => Math.trunc(Number(a?.formationMemberIndex) || 0) - Math.trunc(Number(b?.formationMemberIndex) || 0));
  const slotIndex = Math.max(0, Math.trunc(Number(runtime?.slotIndex) || 0));
  const predecessor = slotIndex > 0 ? (members[slotIndex - 1] || resolveWindingChainLeaderRuntime(enemy, enemies)) : null;
  if (!predecessor) return null;
  const prevVx = Number(predecessor?.vx) || 0;
  const prevVy = Number(predecessor?.vy) || 0;
  const prevSpeed = Math.hypot(prevVx, prevVy) || 1;
  const dirX = prevSpeed > 0.0001 ? (prevVx / prevSpeed) : 0;
  const dirY = prevSpeed > 0.0001 ? (prevVy / prevSpeed) : -1;
  const normalX = -dirY;
  const normalY = dirX;
  const targetX = Number(predecessor?.wx)
    - (dirX * Math.max(12, Number(runtime?.followDistanceWorld) || 0))
    + (normalX * (Number(runtime?.lateralOffsetWorld) || 0));
  const targetY = Number(predecessor?.wy)
    - (dirY * Math.max(12, Number(runtime?.followDistanceWorld) || 0))
    + (normalY * (Number(runtime?.lateralOffsetWorld) || 0));
  const followDx = targetX - Number(enemy?.wx);
  const followDy = targetY - Number(enemy?.wy);
  const followLen = Math.hypot(followDx, followDy) || 1;
  const desiredGap = Math.max(18, Number(runtime?.followDistanceWorld) || 0);
  const gapError = Math.max(-1, Math.min(1, (followLen - desiredGap) / desiredGap));
  const approachWeight = followLen < desiredGap ? 0.92 : 0.78;
  const streamWeight = 1 - approachWeight;
  const desiredDirX = ((followDx / followLen) * approachWeight) + (dirX * streamWeight);
  const desiredDirY = ((followDy / followLen) * approachWeight) + (dirY * streamWeight);
  const desiredDirLen = Math.hypot(desiredDirX, desiredDirY) || 1;
  const slotSpeedScale = Math.max(0.9, 1 - (slotIndex * 0.03)) + (gapError * 0.18);
  return {
    overrideVelocity: true,
    desiredVx: (desiredDirX / desiredDirLen) * desiredSpeed * Math.max(0.82, Math.min(1.12, slotSpeedScale)),
    desiredVy: (desiredDirY / desiredDirLen) * desiredSpeed * Math.max(0.82, Math.min(1.12, slotSpeedScale)),
    blend: Math.max(0.18, Math.min(0.5, (Number(runtime?.velocityBlend) || 0.34) + 0.08)),
  };
}

export function updateBeatSwarmEnemiesRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  if (!enemies.length) return;

  const centerWorld = helpers.getViewportCenterWorld?.() || { x: 0, y: 0 };
  const z = helpers.getZoomState?.();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = (Number(constants.enemyHitRadius) || 0) / Math.max(0.001, scale || 1);
  const offscreenRemovePad = 80;
  const offscreenGraceSeconds = 2.4;
  const frameIndex = Math.max(0, Math.trunc(Number(state.frameIndex) || 0));
  const eventSectionRuntime = state?.eventSectionRuntime && typeof state.eventSectionRuntime === 'object'
    ? state.eventSectionRuntime
    : null;
  const projectileCount = Math.max(0, Math.trunc(Number(state.projectileCount) || 0));
  const effectCount = Math.max(0, Math.trunc(Number(state.effectCount) || 0));
  const liveObjectPressure = enemies.length + projectileCount + effectCount;
  const drawSnakeVisualStride = liveObjectPressure >= 72 ? 3 : (liveObjectPressure >= 40 ? 2 : 1);

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e?.__bsRemoved || e?.__bsHiddenRemoved) {
      if (e?.el instanceof HTMLElement) {
        e.el.style.transform = 'translate(-9999px, -9999px) scale(0.001)';
        e.el.style.opacity = '0';
        e.el.style.visibility = 'hidden';
        e.el.style.display = 'none';
      }
      if (e?.linkedSpawnerLineEl instanceof HTMLElement) {
        e.linkedSpawnerLineEl.style.transform = 'translate(-9999px, -9999px)';
        e.linkedSpawnerLineEl.style.opacity = '0';
      }
      enemies.splice(i, 1);
      continue;
    }
    const enemyType = String(e?.enemyType || '');
    const lifecycleState = helpers.normalizeMusicLifecycleState?.(e?.lifecycleState || 'active', 'active');
    const eventSectionVisual = getEventSectionVisualRuntime(e, eventSectionRuntime);
    const behavioralFormationRuntime = buildBeatSwarmBehavioralFormationEnemyRuntime({ enemy: e, helpers, state });
    e.behavioralFormationRuntime = behavioralFormationRuntime;
    e.behavioralFormationLeaderBias = Number(behavioralFormationRuntime?.leaderBias) || 0;
    e.behavioralFormationFollowDistanceWorld = Number(behavioralFormationRuntime?.followDistanceWorld) || 0;
    e.behavioralFormationLateralOffsetWorld = Number(behavioralFormationRuntime?.lateralOffsetWorld) || 0;
    if (behavioralFormationRuntime?.targetWorld && typeof behavioralFormationRuntime.targetWorld === 'object') {
      e.behavioralFormationTargetX = Number(behavioralFormationRuntime.targetWorld.x) || 0;
      e.behavioralFormationTargetY = Number(behavioralFormationRuntime.targetWorld.y) || 0;
    } else {
      e.behavioralFormationTargetX = 0;
      e.behavioralFormationTargetY = 0;
    }
    const participationGain = Math.max(0, Math.min(1, Number(e?.musicParticipationGain == null ? 1 : e.musicParticipationGain)));
    const introSlotProfile = String(e?.introSlotProfileSourceType || '').trim().toLowerCase();
    const isIntroSlotCarrier = introSlotProfile === 'spawner_rhythm_pulse'
      || introSlotProfile === 'spawner_rhythm_backbeat'
      || introSlotProfile === 'spawner_rhythm_motion';
    const isProtectedComposerCarrier = enemyType === 'composer-group-member'
      && !e?.retreating
      && lifecycleState === 'active'
      && (
        e?.introStageCarrier === true
        || isIntroSlotCarrier
        || participationGain >= 0.78
      );
    const effectiveOffscreenGraceSeconds = isProtectedComposerCarrier ? 6.5 : offscreenGraceSeconds;
    const aggressionScale = helpers.getLifecycleAggressionScale?.(lifecycleState);
    const resolveRolePulseScale = () => {
      const pulseDur = Math.max(0.01, Number(e?.musicRolePulseDur) || Number(constants.musicRolePulseSeconds) || 0.24);
      const pulseT = Math.max(0, Number(e?.musicRolePulseT) || 0);
      const pulseScale = Math.max(0, Math.min(0.5, Number(e?.musicRolePulseScale) || Number(constants.musicRolePulseScale) || 0.1));
      if (!(pulseT > 0)) {
        if (e?.el) {
          try { e.el.style.setProperty('--bs-role-pulse', '0'); } catch {}
        }
        return 1;
      }
      const phase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
      const strength = Math.sin(phase * Math.PI);
      const nextPulseT = Math.max(0, pulseT - (Number(state.dt) || 0));
      e.musicRolePulseT = nextPulseT;
      if (e?.el) {
        try { e.el.style.setProperty('--bs-role-pulse', String(Math.max(0, Math.min(1, strength)).toFixed(3))); } catch {}
      }
      return 1 + (strength * pulseScale);
    };
    if (enemyType === 'spawner') helpers.updateSpawnerEnemyFlash?.(e, state.dt);
    const isPersistentSpecialEnemy = enemyType === 'spawner' || enemyType === 'drawsnake';
    if (!e?.retreating && lifecycleState === 'retiring' && enemyType === 'composer-group-member') {
      const retireStartedMs = Number(e?.retirePhaseStartMs) || 0;
      const nowMs = Number(globalThis?.performance?.now?.() || 0);
      if (retireStartedMs > 0 && (nowMs - retireStartedMs) >= ((Number(constants.retiringRetreatDelaySec) || 0) * 1000)) {
        helpers.startEnemyRetreat?.(e, e?.retireReason || 'retreated', 'retiring-timeout');
      }
    }
    if (e?.retreating) {
      const away = helpers.normalizeDir?.(
        (Number(e.wx) || 0) - (Number(centerWorld.x) || 0),
        (Number(e.wy) || 0) - (Number(centerWorld.y) || 0),
        Number(e.vx) || 0,
        Number(e.vy) || 0
      ) || { x: 0, y: 0 };
      const retreatSpeed = (Number(constants.enemyMaxSpeed) || 0) * (enemyType === 'composer-group-member' ? 0.95 : 1.05);
      const blend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 2.2));
      e.vx += (((Number(away.x) || 0) * retreatSpeed) - (Number(e.vx) || 0)) * blend;
      e.vy += (((Number(away.y) || 0) * retreatSpeed) - (Number(e.vy) || 0)) * blend;
      if ((Number(eventSectionVisual.velocityDamping) || 1) < 0.999) {
        e.vx *= eventSectionVisual.velocityDamping;
        e.vy *= eventSectionVisual.velocityDamping;
      }
      e.wx += (Number(e.vx) || 0) * (Number(state.dt) || 0);
      e.wy += (Number(e.vy) || 0) * (Number(state.dt) || 0);
      const s = helpers.worldToScreen?.({ x: e.wx, y: e.wy });
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
        helpers.removeEnemy?.(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      const outPad = 120;
      if (s.x < -outPad || s.y < -outPad || s.x > globalThis.window.innerWidth + outPad || s.y > globalThis.window.innerHeight + outPad) {
        helpers.removeEnemy?.(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      if (e.el) {
        e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + (Number(state.dt) || 0));
        const spawnScale = enemyType === 'drawsnake' ? 1 : (helpers.getEnemySpawnScale?.(e) || 1);
        const rolePulseScale = resolveRolePulseScale();
        e.el.style.transform = `translate(${s.x}px, ${(s.y + (Number(eventSectionVisual.offsetYPx) || 0)).toFixed(3)}px) scale(${(spawnScale * rolePulseScale * (Number(eventSectionVisual.scaleBias) || 1)).toFixed(3)})`;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) helpers.updateSpawnerLinkedEnemyLine?.(e);
      if (enemyType === 'drawsnake' && ((frameIndex + Math.max(0, Math.trunc(Number(e?.id) || 0))) % drawSnakeVisualStride) === 0) {
        helpers.updateDrawSnakeVisual?.(e, scale, state.dt);
      }
      continue;
    }
    const dx = centerWorld.x - e.wx;
    const dy = centerWorld.y - e.wy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const typeSpeedMult = String(e?.enemyType || '') === 'spawner' ? (Number(constants.spawnerEnemySpeedMultiplier) || 1) : 1;
    const enemySpeedScale = Math.max(0.35, Number(e?.enemySpeedMultiplier) || 1);
    const speedMult = Math.max(0.05, Number(state?.difficultyConfig?.enemySpeedMultiplier) || 1)
      * Math.max(0.05, Number(typeSpeedMult) || 1)
      * enemySpeedScale
      * Math.max(0.35, Number(aggressionScale) || 0);
    let ax = (dx / d) * (Number(constants.enemyAccel) || 0) * speedMult;
    let ay = (dy / d) * (Number(constants.enemyAccel) || 0) * speedMult;
    if (enemyType === 'drawsnake') {
      const curAngle = Number(e.drawsnakeMoveAngle);
      e.drawsnakeMoveAngle = Number.isFinite(curAngle) ? curAngle : (Math.random() * Math.PI * 2);
      e.drawsnakeTurnTimer = (Number(e.drawsnakeTurnTimer) || 0) - (Number(state.dt) || 0);
      if (!(Number(e.drawsnakeTurnTimer) > 0)) {
        e.drawsnakeTurnTimer = helpers.randRange?.(
          Number(constants.drawSnakeTurnIntervalMin) || 0,
          Number(constants.drawSnakeTurnIntervalMax) || 0
        );
        const dir = Math.random() >= 0.5 ? 1 : -1;
        e.drawsnakeTurnTarget = dir * (helpers.randRange?.(
          Number(constants.drawSnakeTurnRateMin) || 0,
          Number(constants.drawSnakeTurnRateMax) || 0
        ) || 0);
      }
      const targetTurn = Number(e.drawsnakeTurnTarget) || 0;
      const curTurn = Number(e.drawsnakeTurnRate) || 0;
      const turnBlend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 1.85));
      e.drawsnakeTurnRate = curTurn + ((targetTurn - curTurn) * turnBlend);
      e.drawsnakeWindPhase = (Number(e.drawsnakeWindPhase) || 0) + ((Number(state.dt) || 0) * Math.PI * 2 * (Number(constants.drawSnakeWindFreqHz) || 0));
      const wind = Math.sin(Number(e.drawsnakeWindPhase) || 0);
      e.drawsnakeMoveAngle += ((Number(e.drawsnakeTurnRate) || 0) + (wind * 0.18)) * (Number(state.dt) || 0);
      const arenaCenter = (state.arenaCenterWorld && Number.isFinite(state.arenaCenterWorld.x) && Number.isFinite(state.arenaCenterWorld.y))
        ? state.arenaCenterWorld
        : centerWorld;
      const toArenaX = Number(arenaCenter.x) - Number(e.wx);
      const toArenaY = Number(arenaCenter.y) - Number(e.wy);
      const arenaDist = Math.hypot(toArenaX, toArenaY) || 0.0001;
      const arenaSoft = (Number(constants.swarmArenaRadiusWorld) || 0) * (Number(constants.drawSnakeArenaBiasRadiusScale) || 0);
      if (arenaDist > arenaSoft) {
        const inwardAngle = Math.atan2(toArenaY, toArenaX);
        let delta = inwardAngle - e.drawsnakeMoveAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const over = Math.max(0, arenaDist - arenaSoft);
        const maxOver = Math.max(1, (Number(constants.swarmArenaRadiusWorld) || 0) - arenaSoft);
        const bias = Math.max(0, Math.min(1, over / maxOver)) * (Number(constants.drawSnakeArenaBiasStrength) || 0);
        e.drawsnakeMoveAngle += delta * Math.max(0, Math.min(1, bias));
      }
      const roamSpeed = (Number(constants.enemyMaxSpeed) || 0) * Math.max(0.36, Math.min(1.2, speedMult * 0.78));
      const desiredVx = Math.cos(e.drawsnakeMoveAngle) * roamSpeed;
      const desiredVy = Math.sin(e.drawsnakeMoveAngle) * roamSpeed;
      const blend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 2.2));
      e.vx += (desiredVx - e.vx) * blend;
      e.vy += (desiredVy - e.vy) * blend;
      ax = 0;
      ay = 0;
    }
    if (enemyType === 'composer-group-member') {
      const sepR = Math.max(20, Number(constants.composerGroupSeparationRadiusWorld) || 200);
      const sepR2 = sepR * sepR;
      let repelX = 0;
      let repelY = 0;
      for (let j = 0; j < enemies.length; j++) {
        const o = enemies[j];
        if (!o || o === e || String(o?.enemyType || '') !== 'composer-group-member') continue;
        const ddx = e.wx - o.wx;
        const ddy = e.wy - o.wy;
        const d2 = (ddx * ddx) + (ddy * ddy);
        if (!(d2 > 0.0001) || d2 >= sepR2) continue;
        const dist = Math.sqrt(d2);
        const push = (1 - (dist / sepR));
        repelX += (ddx / dist) * push;
        repelY += (ddy / dist) * push;
      }
      if (repelX !== 0 || repelY !== 0) {
        const repelLen = Math.hypot(repelX, repelY) || 1;
        const force = Math.max(0, Number(constants.composerGroupSeparationForce) || 0) * Math.max(0.45, Number(aggressionScale) || 0);
        ax += (repelX / repelLen) * force;
        ay += (repelY / repelLen) * force;
      }
      const anchorWorld = getFormationAnchorWorldRuntime(e, helpers);
      if (anchorWorld && Number.isFinite(anchorWorld.x) && Number.isFinite(anchorWorld.y)) {
        const anchorDx = Number(anchorWorld.x) - Number(e.wx);
        const anchorDy = Number(anchorWorld.y) - Number(e.wy);
        const anchorDist = Math.hypot(anchorDx, anchorDy);
        if (anchorDist > 0.0001) {
          const presentationWeight = Math.max(0.2, Number(e?.formationPresentationWeight) || 0.6);
          const introBiasScale = e?.introStageCarrier === true ? 1 : 0.72;
          const anchorForce = Math.max(0, Number(constants.enemyAccel) || 0) * 0.18 * presentationWeight * introBiasScale;
          ax += (anchorDx / anchorDist) * anchorForce;
          ay += (anchorDy / anchorDist) * anchorForce;
        }
      }
    }
    const behavioralMotion = resolveBehavioralFormationMotionRuntime(e, enemies, centerWorld, state, constants);
    if (behavioralMotion?.overrideVelocity === true) {
      const blend = Math.max(0.08, Math.min(0.5, Number(behavioralMotion.blend) || 0.3));
      e.vx += ((Number(behavioralMotion.desiredVx) || 0) - (Number(e.vx) || 0)) * blend;
      e.vy += ((Number(behavioralMotion.desiredVy) || 0) - (Number(e.vy) || 0)) * blend;
      ax *= 0.2;
      ay *= 0.2;
    }
    e.vx += ax * (Number(state.dt) || 0);
    e.vy += ay * (Number(state.dt) || 0);
    if ((Number(eventSectionVisual.velocityDamping) || 1) < 0.999) {
      e.vx *= eventSectionVisual.velocityDamping;
      e.vy *= eventSectionVisual.velocityDamping;
    }
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = (Number(constants.enemyMaxSpeed) || 0) * speedMult;
    if (speed > maxSpeed) {
      const k = maxSpeed / speed;
      e.vx *= k;
      e.vy *= k;
    }
    e.wx += e.vx * (Number(state.dt) || 0);
    e.wy += e.vy * (Number(state.dt) || 0);
    if (d <= hitRadiusWorld) {
      const perfProtected = helpers.isPerfRepeatProtectedEnemy?.(e) === true;
      if (lifecycleState === 'retiring') {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        const repulseSpeed = Math.max(80, (Number(constants.enemyMaxSpeed) || 0) * Math.max(0.4, Number(aggressionScale) || 0));
        e.vx = back.x * repulseSpeed;
        e.vy = back.y * repulseSpeed;
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.2);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.2);
        continue;
      }
      if (enemyType === 'drawsnake') {
        e.drawsnakeMoveAngle = (Number(e.drawsnakeMoveAngle) || 0) + Math.PI * 0.75;
        e.vx *= -0.45;
        e.vy *= -0.45;
        continue;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        e.vx = back.x * Math.max(120, Math.hypot(e.vx, e.vy));
        e.vy = back.y * Math.max(120, Math.hypot(e.vx, e.vy));
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.6);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.6);
        continue;
      }
      if (perfProtected) {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        const bounceSpeed = Math.max(110, Math.hypot(e.vx, e.vy), (Number(constants.enemyMaxSpeed) || 0) * 0.7);
        e.vx = back.x * bounceSpeed;
        e.vy = back.y * bounceSpeed;
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.4);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.4);
        continue;
      }
      helpers.removeEnemy?.(e, 'killed');
      enemies.splice(i, 1);
      continue;
    }
    const s = helpers.worldToScreen?.({ x: e.wx, y: e.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      if (isPersistentSpecialEnemy) {
        if (e.el) e.el.style.transform = 'translate(-9999px, -9999px)';
        continue;
      }
      helpers.removeEnemy?.(e, 'expired');
      enemies.splice(i, 1);
      continue;
    }
    const isOffscreenBeyondGracePad = s.x < -offscreenRemovePad
      || s.y < -offscreenRemovePad
      || s.x > globalThis.window.innerWidth + offscreenRemovePad
      || s.y > globalThis.window.innerHeight + offscreenRemovePad;
    if (isOffscreenBeyondGracePad) {
      e.offscreenGraceT = Math.max(0, Number(e.offscreenGraceT) || 0) + (Number(state.dt) || 0);
      if (!isPersistentSpecialEnemy && Number(e.offscreenGraceT) >= effectiveOffscreenGraceSeconds) {
        helpers.removeEnemy?.(e, 'retreated');
        enemies.splice(i, 1);
        continue;
      }
    } else {
      e.offscreenGraceT = 0;
    }
    if (e.el) {
      e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + (Number(state.dt) || 0));
      const spawnScale = enemyType === 'drawsnake' ? 1 : (helpers.getEnemySpawnScale?.(e) || 1);
      const rolePulseScale = enemyType === 'drawsnake' ? 1 : resolveRolePulseScale();
      let actionScale = 1;
      if (enemyType === 'composer-group-member') {
        const pulseDur = Math.max(0.01, Number(e.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
        const pulseT = Math.max(0, Number(e.composerActionPulseT) || 0);
        let actionPulseStrength = 0;
        if (pulseT > 0) {
          const phase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
          const localPulseScale = Math.max(0, Number(e?.composerActionPulseScale) || Number(constants.composerGroupActionPulseScale) || 0);
          actionPulseStrength = Math.sin(phase * Math.PI);
          actionScale = 1 + (actionPulseStrength * localPulseScale);
          e.composerActionPulseT = Math.max(0, pulseT - (Number(state.dt) || 0));
        }
        if (e.el instanceof HTMLElement) {
          if (actionPulseStrength > 0.0001) {
            const borderWidthPx = 1 + (actionPulseStrength * 2.4);
            const innerTintPct = Math.max(6, 18 - (actionPulseStrength * 10));
            const glowPx = 8 + (actionPulseStrength * 14);
            try {
              e.el.style.borderWidth = `${borderWidthPx.toFixed(2)}px`;
              e.el.style.borderColor = 'var(--bs-role-color-bright)';
              e.el.style.background = `radial-gradient(circle at center, color-mix(in srgb, var(--bs-role-color-bright) ${Math.max(4, 10 - (actionPulseStrength * 5)).toFixed(2)}%, black ${(100 - Math.max(4, 10 - (actionPulseStrength * 5))).toFixed(2)}%), color-mix(in srgb, var(--bs-role-color-deep) ${innerTintPct.toFixed(2)}%, black ${(100 - innerTintPct).toFixed(2)}%))`;
              e.el.style.boxShadow = `0 0 ${glowPx.toFixed(2)}px var(--bs-role-glow-color)`;
            } catch {}
          } else {
            try {
              e.el.style.borderWidth = '';
              e.el.style.borderColor = '';
              e.el.style.background = '';
              e.el.style.boxShadow = '';
            } catch {}
          }
        }
        const soloPulseDur = Math.max(0.01, Number(e?.soloCarrierActivationPulseDur) || 0);
        const soloPulseT = Math.max(0, Number(e?.soloCarrierActivationPulseT) || 0);
        const soloCarrierType = String(e?.soloCarrierType || '').trim().toLowerCase() === 'rhythm' ? 'rhythm' : '';
        const isSoloCarrier = soloCarrierType === 'rhythm';
        if (isSoloCarrier && soloPulseT > 0) {
          const soloPhase = 1 - Math.max(0, Math.min(1, soloPulseT / soloPulseDur));
          const soloPulseStrength = Math.sin(soloPhase * Math.PI);
          const soloPulseScale = Math.max(0, Number(e?.soloCarrierActivationPulseScale) || 0.18);
          actionScale *= 1 + (soloPulseStrength * soloPulseScale);
          const shouldLogRhythmPulse = soloCarrierType === 'rhythm'
            && Number(e?.soloPulseDebugLastLoggedT) !== Number(soloPulseT);
          e.soloCarrierActivationPulseT = Math.max(0, soloPulseT - (Number(state.dt) || 0));
          if (e.el instanceof HTMLElement) {
            e.el.classList.add('is-solo-note-active');
            try {
              e.el.style.setProperty('--bs-solo-pulse-level', soloPulseStrength.toFixed(3));
            } catch {}
            if (soloCarrierType === 'rhythm') {
              try {
                e.el.style.borderColor = 'rgba(255, 246, 224, 0.88)';
                e.el.style.filter = `brightness(${(1.02 + (soloPulseStrength * 0.16)).toFixed(3)}) saturate(${(1.01 + (soloPulseStrength * 0.1)).toFixed(3)})`;
              } catch {}
            }
          }
          if (shouldLogRhythmPulse && typeof helpers.noteIntroDebug === 'function') {
            try {
              e.soloPulseDebugLastLoggedT = soloPulseT;
              helpers.noteIntroDebug('square_visual_pulse_frame', {
                enemyId: Math.trunc(Number(e?.id) || 0),
                groupId: Math.trunc(Number(e?.composerGroupId) || e?.musicGroupId || 0),
                soloPulseT: Number(soloPulseT) || 0,
                soloPulseDur: Number(soloPulseDur) || 0,
                soloPulseStrength,
                hasEl: e.el instanceof HTMLElement,
                className: e.el instanceof HTMLElement ? String(e.el.className || '') : '',
                transform: e.el instanceof HTMLElement ? String(e.el.style.transform || '') : '',
                background: e.el instanceof HTMLElement ? String(e.el.style.background || '') : '',
                filter: e.el instanceof HTMLElement ? String(e.el.style.filter || '') : '',
              });
            } catch {}
          }
        } else if (isSoloCarrier && e.el instanceof HTMLElement) {
          e.el.classList.remove('is-solo-note-active');
          try { e.el.style.setProperty('--bs-solo-pulse-level', '0'); } catch {}
          if (soloCarrierType === 'rhythm') {
            try {
              e.el.style.borderColor = '';
              e.el.style.filter = '';
            } catch {}
          }
          if (soloCarrierType === 'rhythm' && typeof helpers.noteIntroDebug === 'function' && e.soloPulseDebugLastLoggedT) {
            try {
              helpers.noteIntroDebug('square_visual_pulse_clear', {
                enemyId: Math.trunc(Number(e?.id) || 0),
                groupId: Math.trunc(Number(e?.composerGroupId) || e?.musicGroupId || 0),
                hasEl: e.el instanceof HTMLElement,
                className: e.el instanceof HTMLElement ? String(e.el.className || '') : '',
              });
            } catch {}
          }
          e.soloPulseDebugLastLoggedT = 0;
        }
      }
      e.el.style.transform = `translate(${s.x}px, ${(s.y + (Number(eventSectionVisual.offsetYPx) || 0)).toFixed(3)}px) scale(${(spawnScale * actionScale * rolePulseScale * (Number(eventSectionVisual.scaleBias) || 1)).toFixed(3)})`;
    }
    if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) helpers.updateSpawnerLinkedEnemyLine?.(e);
    if (enemyType === 'drawsnake' && ((frameIndex + Math.max(0, Math.trunc(Number(e?.id) || 0))) % drawSnakeVisualStride) === 0) {
      helpers.updateDrawSnakeVisual?.(e, scale, state.dt);
    }
  }
}

export function keepDrawSnakeEnemyOnscreenRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemy = options?.enemy;
  const dt = Number(options?.dt) || 0;
  if (String(enemy?.enemyType || '') !== 'drawsnake') return null;
  const s = helpers.worldToScreen?.({ x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 });
  const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
  const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
  const pad = Math.max(40, Number(constants.drawSnakeScreenMarginPx) || 140);
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return s;
  const isOffscreen = s.x < -pad || s.y < -pad || s.x > (screenW + pad) || s.y > (screenH + pad);
  if (!enemy.drawsnakeHasEnteredScreen) {
    if (isOffscreen) return s;
    enemy.drawsnakeHasEnteredScreen = true;
  }
  const clampedX = Math.max(pad, Math.min(screenW - pad, s.x));
  const clampedY = Math.max(pad, Math.min(screenH - pad, s.y));
  if (Math.abs(clampedX - s.x) < 0.001 && Math.abs(clampedY - s.y) < 0.001) return s;
  const pulled = helpers.screenToWorld?.({ x: clampedX, y: clampedY });
  if (!pulled || !Number.isFinite(pulled.x) || !Number.isFinite(pulled.y)) return s;
  const pullRate = Math.max(0.5, Number(constants.drawSnakeEdgePullRate) || 8);
  const t = Math.max(0, Math.min(1, dt * pullRate));
  const pullAngle = Math.atan2((pulled.y - enemy.wy), (pulled.x - enemy.wx));
  if (Number.isFinite(pullAngle)) {
    const cur = Number(enemy.drawsnakeMoveAngle) || 0;
    let delta = pullAngle - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    enemy.drawsnakeMoveAngle = cur + (delta * Math.max(0, Math.min(1, t * 0.8)));
  }
  enemy.wx += (pulled.x - enemy.wx) * t;
  enemy.wy += (pulled.y - enemy.wy) * t;
  enemy.vx *= 0.86;
  enemy.vy *= 0.86;
  return helpers.worldToScreen?.({ x: enemy.wx, y: enemy.wy }) || s;
}
