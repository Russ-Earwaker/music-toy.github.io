import { buildBeatSwarmBehavioralFormationEnemyRuntime } from './beat-swarm-behavioral-runtime.js';
import {
  isBeatSwarmLevel1RoleEligibleForLane,
} from './beat-swarm-level1-contract.js';

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
  const perfRepeatEventBehavior = String(enemy?.perfRepeatEventBehavior || '').trim().toLowerCase();
  if (perfRepeatEventBehavior === 'beat_bounce') {
    if (String(enemy?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') {
      return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
    }
    const nowMs = Number(globalThis.performance?.now?.() || 0);
    const cycleMs = 3200;
    const activeMs = 720;
    const phaseMs = nowMs % cycleMs;
    if (!(phaseMs >= 0 && phaseMs <= activeMs)) {
      return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
    }
    const phaseT = Math.max(0, Math.min(1, phaseMs / activeMs));
    const pulse = Math.sin(phaseT * Math.PI);
    const presentationWeight = Math.max(0.5, Number(enemy?.formationPresentationWeight) || 0.75);
    return {
      velocityDamping: 1 - (0.22 * pulse),
      scaleBias: 1 + (0.08 * pulse * presentationWeight),
      offsetYPx: -(5 * pulse * presentationWeight),
    };
  }
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
  const roleEligible = isBeatSwarmLevel1RoleEligibleForLane(role, musicLaneId, eligibleRoles);
  if (!roleEligible) return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  const strongBeatActive = eventSectionRuntime?.strongBeatActive === true;
  if (!strongBeatActive) return { velocityDamping: 1, scaleBias: 1, offsetYPx: 0 };
  const presentationWeight = Math.max(0.5, Number(enemy?.formationPresentationWeight) || 0.7);
  const pulseScale = Math.max(0, Math.min(0.24, Number(eventSectionRuntime?.presentationPulseScale) || 0));
  return {
    velocityDamping: Math.max(0.82, Math.min(1, Number(eventSectionRuntime?.motionDamping) || 1)),
    scaleBias: 1 + (pulseScale * presentationWeight),
    offsetYPx: -(7 * pulseScale * presentationWeight),
  };
}

function getBehaviorBeatProgressRuntime(enemy, state, key = 'behavioralBeat', beatWindowSeconds = 0.28) {
  const beatIndex = Math.max(0, Math.trunc(Number(state?.currentBeatIndex) || 0));
  const stampKey = `${key}BeatIndex`;
  const tKey = `${key}BeatT`;
  if (Math.trunc(Number(enemy?.[stampKey]) || -1) !== beatIndex) {
    enemy[stampKey] = beatIndex;
    enemy[tKey] = 0;
  } else {
    enemy[tKey] = Math.max(0, Number(enemy?.[tKey]) || 0) + Math.max(0, Number(state?.dt) || 0);
  }
  const localT = Math.max(0, Math.min(1, (Number(enemy?.[tKey]) || 0) / Math.max(0.08, Number(beatWindowSeconds) || 0.28)));
  return {
    beatIndex,
    localT,
    smoothT: 0.5 - (0.5 * Math.cos(localT * Math.PI)),
  };
}

function getPerfBehaviorWindowRuntime(cycleMs = 5200, activeMs = 1800) {
  const nowMs = Number(globalThis.performance?.now?.() || 0);
  const safeCycleMs = Math.max(600, Number(cycleMs) || 5200);
  const safeActiveMs = Math.max(200, Math.min(safeCycleMs, Number(activeMs) || 1800));
  const phaseMs = nowMs % safeCycleMs;
  return {
    active: phaseMs >= 0 && phaseMs <= safeActiveMs,
    cycleIndex: Math.floor(nowMs / safeCycleMs),
    phaseMs,
    cycleMs: safeCycleMs,
    activeMs: safeActiveMs,
  };
}

function getPairedDanceAssignmentRuntime(enemy, enemies, state, cycleIndex = 0) {
  const groupId = Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0));
  if (!(groupId > 0)) return null;
  if (!state.__pairedDanceLayoutCache || typeof state.__pairedDanceLayoutCache !== 'object') {
    state.__pairedDanceLayoutCache = Object.create(null);
  }
  const cacheKey = `${groupId}:${Math.trunc(Number(cycleIndex) || 0)}`;
  if (!state.__pairedDanceLayoutCache[cacheKey]) {
    const members = enemies
      .filter((candidate) => (
        candidate
        && !candidate.retreating
        && String(candidate?.enemyType || '').trim().toLowerCase() === 'composer-group-member'
        && Math.trunc(Number(candidate?.composerGroupId || candidate?.musicGroupId || 0)) === groupId
      ))
      .slice();
    const used = new Set();
    const assignments = Object.create(null);
    const centers = [];
    const worldToScreen = typeof state?.worldToScreen === 'function' ? state.worldToScreen : null;
    const screenToWorld = typeof state?.screenToWorld === 'function' ? state.screenToWorld : null;
    const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
    const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
    const minCenterDistance = 150;
    members.sort((a, b) => (Number(a?.wx) || 0) - (Number(b?.wx) || 0));
    for (let i = 0; i < members.length; i++) {
      const a = members[i];
      const aId = Math.max(0, Math.trunc(Number(a?.id) || 0));
      if (!(aId > 0) || used.has(aId)) continue;
      let partner = null;
      let nearestD2 = Infinity;
      for (let j = 0; j < members.length; j++) {
        const b = members[j];
        const bId = Math.max(0, Math.trunc(Number(b?.id) || 0));
        if (!(bId > 0) || bId === aId || used.has(bId)) continue;
        const ddx = (Number(b?.wx) || 0) - (Number(a?.wx) || 0);
        const ddy = (Number(b?.wy) || 0) - (Number(a?.wy) || 0);
        const d2 = (ddx * ddx) + (ddy * ddy);
        if (!(d2 < nearestD2)) continue;
        nearestD2 = d2;
        partner = b;
      }
      used.add(aId);
      const b = partner || null;
      const bId = Math.max(0, Math.trunc(Number(b?.id) || 0));
      if (bId > 0) used.add(bId);
      const midpoint = b
        ? {
            x: ((Number(a?.wx) || 0) + (Number(b?.wx) || 0)) * 0.5,
            y: ((Number(a?.wy) || 0) + (Number(b?.wy) || 0)) * 0.5,
          }
        : { x: Number(a?.wx) || 0, y: Number(a?.wy) || 0 };
      let pairCenter = midpoint;
      const midpointScreen = worldToScreen ? worldToScreen(midpoint) : null;
      const midpointOnScreen = !!(midpointScreen && Number.isFinite(midpointScreen.x) && Number.isFinite(midpointScreen.y) && midpointScreen.x >= 0 && midpointScreen.x <= screenW && midpointScreen.y >= 0 && midpointScreen.y <= screenH);
      if (!midpointOnScreen && screenToWorld) {
        const safeWorld = screenToWorld({
          x: Math.max(screenW * 0.2, Math.min(screenW * 0.8, Number(midpointScreen?.x) || (screenW * 0.5))),
          y: Math.max(screenH * 0.2, Math.min(screenH * 0.8, Number(midpointScreen?.y) || (screenH * 0.5))),
        });
        if (safeWorld && Number.isFinite(safeWorld.x) && Number.isFinite(safeWorld.y)) {
          pairCenter = { x: Number(safeWorld.x) || midpoint.x, y: Number(safeWorld.y) || midpoint.y };
        }
      }
      for (let k = 0; k < centers.length; k++) {
        const other = centers[k];
        const dx = Number(pairCenter.x) - Number(other.x);
        const dy = Number(pairCenter.y) - Number(other.y);
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= minCenterDistance) continue;
        const push = (minCenterDistance - dist);
        const nx = dx / dist;
        const ny = dy / dist;
        pairCenter = {
          x: Number(pairCenter.x) + (nx * push),
          y: Number(pairCenter.y) + (ny * push),
        };
      }
      centers.push(pairCenter);
      let axisX = 1;
      let axisY = 0;
      if (b) {
        const rawAxisX = (Number(a?.wx) || 0) - (Number(b?.wx) || 0);
        const rawAxisY = (Number(a?.wy) || 0) - (Number(b?.wy) || 0);
        const rawAxisLen = Math.hypot(rawAxisX, rawAxisY) || 0;
        if (rawAxisLen > 0.001) {
          axisX = rawAxisX / rawAxisLen;
          axisY = rawAxisY / rawAxisLen;
        }
      }
      assignments[aId] = {
        partnerId: bId,
        pairCenterX: Number(pairCenter.x) || midpoint.x,
        pairCenterY: Number(pairCenter.y) || midpoint.y,
        pairSide: -1,
        approachAxisX: axisX,
        approachAxisY: axisY,
      };
      if (bId > 0) {
        assignments[bId] = {
          partnerId: aId,
          pairCenterX: Number(pairCenter.x) || midpoint.x,
          pairCenterY: Number(pairCenter.y) || midpoint.y,
          pairSide: 1,
          approachAxisX: axisX,
          approachAxisY: axisY,
        };
      }
    }
    state.__pairedDanceLayoutCache[cacheKey] = assignments;
  }
  return state.__pairedDanceLayoutCache[cacheKey]?.[Math.max(0, Math.trunc(Number(enemy?.id) || 0))] || null;
}

function arePairedDanceTargetsReadyRuntime(enemies, state, cycleIndex = 0) {
  const cache = state?.__pairedDanceLayoutCache;
  if (!cache || typeof cache !== 'object') return false;
  const readyCache = state.__pairedDanceReadyCache || (state.__pairedDanceReadyCache = Object.create(null));
  const memberReadyCache = state.__pairedDanceMemberReadyCache || (state.__pairedDanceMemberReadyCache = Object.create(null));
  const readyKey = String(Math.trunc(Number(cycleIndex) || 0));
  if (Object.prototype.hasOwnProperty.call(readyCache, readyKey)) {
    return readyCache[readyKey] === true;
  }
  const tolerance = 40;
  const cycleMemberReady = memberReadyCache[readyKey] && typeof memberReadyCache[readyKey] === 'object'
    ? memberReadyCache[readyKey]
    : (memberReadyCache[readyKey] = Object.create(null));
  const byId = new Map();
  for (const enemy of enemies) {
    if (!enemy) continue;
    byId.set(Math.max(0, Math.trunc(Number(enemy?.id) || 0)), enemy);
  }
  for (const key of Object.keys(cache)) {
    if (!key.endsWith(`:${Math.trunc(Number(cycleIndex) || 0)}`)) continue;
    const assignments = cache[key];
    if (!assignments || typeof assignments !== 'object') continue;
    for (const [idKey, assignment] of Object.entries(assignments)) {
      const enemy = byId.get(Math.max(0, Math.trunc(Number(idKey) || 0))) || null;
      if (!enemy || enemy.retreating) continue;
      const pairSide = Number(assignment?.pairSide) >= 0 ? 1 : -1;
      const axisX = Number.isFinite(Number(assignment?.approachAxisX)) ? Number(assignment.approachAxisX) : 1;
      const axisY = Number.isFinite(Number(assignment?.approachAxisY)) ? Number(assignment.approachAxisY) : 0;
      const readyGap = 124;
      const targetX = (Number(assignment?.pairCenterX) || Number(enemy?.wx) || 0) + (axisX * pairSide * readyGap);
      const targetY = (Number(assignment?.pairCenterY) || Number(enemy?.wy) || 0) + (axisY * pairSide * readyGap);
      const dist = Math.hypot(targetX - (Number(enemy?.wx) || 0), targetY - (Number(enemy?.wy) || 0));
      const enemyId = Math.max(0, Math.trunc(Number(idKey) || 0));
      if (dist <= tolerance) cycleMemberReady[enemyId] = true;
      if (cycleMemberReady[enemyId] === true) continue;
      if (dist > tolerance) {
        readyCache[readyKey] = false;
        return false;
      }
    }
  }
  readyCache[readyKey] = true;
  return true;
}

function getPairedDanceReadyStatsRuntime(enemies, state, cycleIndex = 0) {
  const cache = state?.__pairedDanceLayoutCache;
  if (!cache || typeof cache !== 'object') return { readyCount: 0, totalCount: 0, readyRatio: 0 };
  const memberReadyCache = state.__pairedDanceMemberReadyCache || (state.__pairedDanceMemberReadyCache = Object.create(null));
  const readyKey = String(Math.trunc(Number(cycleIndex) || 0));
  const cycleMemberReady = memberReadyCache[readyKey] && typeof memberReadyCache[readyKey] === 'object'
    ? memberReadyCache[readyKey]
    : null;
  let totalCount = 0;
  let readyCount = 0;
  for (const key of Object.keys(cache)) {
    if (!key.endsWith(`:${Math.trunc(Number(cycleIndex) || 0)}`)) continue;
    const assignments = cache[key];
    if (!assignments || typeof assignments !== 'object') continue;
    for (const idKey of Object.keys(assignments)) {
      const enemyId = Math.max(0, Math.trunc(Number(idKey) || 0));
      if (!(enemyId > 0)) continue;
      totalCount += 1;
      if (cycleMemberReady?.[enemyId] === true) readyCount += 1;
    }
  }
  return {
    readyCount,
    totalCount,
    readyRatio: totalCount > 0 ? (readyCount / totalCount) : 0,
  };
}

function getPairedDanceCycleStateRuntime(enemies, state, cycleIndex = 0, phaseMs = 0) {
  const key = String(Math.trunc(Number(cycleIndex) || 0));
  const cache = state.__pairedDanceCycleStateCache || (state.__pairedDanceCycleStateCache = Object.create(null));
  const entry = cache[key] && typeof cache[key] === 'object'
    ? cache[key]
    : (cache[key] = { started: false, startMs: -1, readyRatio: 0, readyCount: 0, totalCount: 0, allPairsReady: false });
  const readyStats = getPairedDanceReadyStatsRuntime(enemies, state, cycleIndex);
  const allPairsReady = arePairedDanceTargetsReadyRuntime(enemies, state, cycleIndex);
  entry.readyRatio = Number(readyStats.readyRatio) || 0;
  entry.readyCount = Math.max(0, Math.trunc(Number(readyStats.readyCount) || 0));
  entry.totalCount = Math.max(0, Math.trunc(Number(readyStats.totalCount) || 0));
  entry.allPairsReady = allPairsReady === true;
  if (!entry.started) {
    const shouldStart = entry.allPairsReady || (
      Number(phaseMs) >= 2200
      && entry.readyRatio >= 0.875
    );
    if (shouldStart) {
      entry.started = true;
      entry.startMs = Math.max(0, Number(phaseMs) || 0);
    }
  }
  return entry;
}

function notePairedDanceTraceRuntime(helpers, state, enemy, traceLike = null) {
  const noteMusicSystemEvent = typeof helpers?.noteMusicSystemEvent === 'function' ? helpers.noteMusicSystemEvent : null;
  if (!noteMusicSystemEvent || !enemy || !traceLike || typeof traceLike !== 'object') return;
  if (String(enemy?.behavioralFormationArchetype || '').trim().toLowerCase() !== 'paired_dance') return;
  const frameIndex = Math.max(0, Math.trunc(Number(state?.frameIndex) || 0));
  const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
  if ((frameIndex % 6) !== (actorId % 6)) return;
  noteMusicSystemEvent('music_paired_dance_trace', {
    actorId,
    groupId: Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0)),
    targetEnemyId: Math.max(0, Math.trunc(Number(traceLike?.partnerId) || 0)),
    behavioralFormationArchetype: 'paired_dance',
    phase: String(traceLike?.phase || '').trim().toLowerCase(),
    reason: String(traceLike?.reason || '').trim().toLowerCase(),
    cycleBeat: Math.max(0, Math.trunc(Number(traceLike?.cycleBeat) || 0)),
    cycleIndex: Math.max(0, Math.trunc(Number(traceLike?.cycleIndex) || 0)),
    allPairsReady: traceLike?.allPairsReady === true,
    pairCenterX: Number(traceLike?.pairCenterX) || 0,
    pairCenterY: Number(traceLike?.pairCenterY) || 0,
    targetX: Number(traceLike?.targetX) || 0,
    targetY: Number(traceLike?.targetY) || 0,
    desiredVx: Number(traceLike?.desiredVx) || 0,
    desiredVy: Number(traceLike?.desiredVy) || 0,
    postBlendVx: Number(traceLike?.postBlendVx) || 0,
    postBlendVy: Number(traceLike?.postBlendVy) || 0,
    orbitAngle: Number(traceLike?.orbitAngle) || 0,
    debugFrame: frameIndex,
  }, {
    beatIndex: Math.max(0, Math.trunc(Number(state?.currentBeatIndex) || 0)),
    barIndex: Math.max(0, Math.trunc(Number(state?.currentBarIndex) || 0)),
  });
}

function ensurePairedDanceOrbitSeedRuntime(enemy, partner, assignment, cycleIndex = 0, pairCenterX = 0, pairCenterY = 0, orbitRadius = 1, ellipseY = 1) {
  if (!enemy || !partner || !assignment) return 0;
  const seedKey = `${Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0))}:${Math.min(Math.max(0, Math.trunc(Number(enemy?.id) || 0)), Math.max(0, Math.trunc(Number(partner?.id) || 0)))}:${Math.max(Math.max(0, Math.trunc(Number(enemy?.id) || 0)), Math.max(0, Math.trunc(Number(partner?.id) || 0)))}:${Math.max(0, Math.trunc(Number(cycleIndex) || 0))}`;
  if (!globalThis.__bsPairedDanceOrbitSeed || typeof globalThis.__bsPairedDanceOrbitSeed !== 'object') {
    globalThis.__bsPairedDanceOrbitSeed = Object.create(null);
  }
  const cache = globalThis.__bsPairedDanceOrbitSeed;
  if (Number.isFinite(Number(cache[seedKey]))) return Number(cache[seedKey]) || 0;
  const axisX = Number.isFinite(Number(assignment?.approachAxisX)) ? Number(assignment.approachAxisX) : 1;
  const axisY = Number.isFinite(Number(assignment?.approachAxisY)) ? Number(assignment.approachAxisY) : 0;
  const normalX = -axisY;
  const normalY = axisX;
  const relX = (Number(enemy?.wx) || 0) - Number(pairCenterX || 0);
  const relY = (Number(enemy?.wy) || 0) - Number(pairCenterY || 0);
  const localX = (relX * axisX) + (relY * axisY);
  const localY = (relX * normalX) + (relY * normalY);
  const base = Math.atan2(localY / Math.max(1, Number(ellipseY) || 1), localX / Math.max(1, Number(orbitRadius) || 1));
  cache[seedKey] = Number.isFinite(base) ? base : 0;
  return Number(cache[seedKey]) || 0;
}

function applyPairedDanceSeparationRuntime(enemy, enemies, state) {
  if (!enemy || String(enemy?.behavioralFormationArchetype || '').trim().toLowerCase() !== 'paired_dance') return;
  if (enemy?.behavioralFormationActive !== true || enemy?.retreating) return;
  const danceWindow = getPerfBehaviorWindowRuntime(5600, 3600);
  if (!danceWindow.active) return;
  const beatIndex = Math.max(0, Math.trunc(Number(state?.currentBeatIndex) || 0));
  const cycleBeat = beatIndex % 8;
  if (cycleBeat > 5) return;
  const assignment = getPairedDanceAssignmentRuntime(enemy, enemies, state, danceWindow.cycleIndex);
  if (!assignment) return;
  const partnerId = Math.max(0, Math.trunc(Number(assignment?.partnerId) || 0));
  if (!(partnerId > 0)) return;
  const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
  if (!(actorId > 0) || actorId >= partnerId) return;
  const partner = enemies.find((candidate) => Math.max(0, Math.trunc(Number(candidate?.id) || 0)) === partnerId) || null;
  if (!partner || partner.retreating || String(partner?.behavioralFormationArchetype || '').trim().toLowerCase() !== 'paired_dance') return;
  const dx = (Number(enemy?.wx) || 0) - (Number(partner?.wx) || 0);
  const dy = (Number(enemy?.wy) || 0) - (Number(partner?.wy) || 0);
  let dist = Math.hypot(dx, dy) || 0;
  const minDist = 156;
  if (dist >= minDist) return;
  let nx = 1;
  let ny = 0;
  if (dist > 0.001) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const axisX = Number.isFinite(Number(assignment?.approachAxisX)) ? Number(assignment.approachAxisX) : 1;
    const axisY = Number.isFinite(Number(assignment?.approachAxisY)) ? Number(assignment.approachAxisY) : 0;
    nx = axisX;
    ny = axisY;
    dist = 0;
  }
  const push = (minDist - dist) * 0.5;
  enemy.wx = (Number(enemy?.wx) || 0) + (nx * push);
  enemy.wy = (Number(enemy?.wy) || 0) + (ny * push);
  partner.wx = (Number(partner?.wx) || 0) - (nx * push);
  partner.wy = (Number(partner?.wy) || 0) - (ny * push);
}

function resolvePerfRepeatEventMotionRuntime(enemy, state, constants) {
  const perfRepeatEventBehavior = String(enemy?.perfRepeatEventBehavior || '').trim().toLowerCase();
  if (perfRepeatEventBehavior !== 'beat_bounce') return null;
  if (String(enemy?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') return null;
  const eventWindow = getPerfBehaviorWindowRuntime(5200, 1800);
  if (!eventWindow.active) {
    enemy.behavioralBeatBounceAnchorX = Number(enemy?.wx) || 0;
    enemy.behavioralBeatBounceAnchorY = Number(enemy?.wy) || 0;
    return null;
  }
  if (!Number.isFinite(Number(enemy?.behavioralBeatBounceAnchorX)) || !Number.isFinite(Number(enemy?.behavioralBeatBounceAnchorY))) {
    enemy.behavioralBeatBounceAnchorX = Number(enemy?.wx) || 0;
    enemy.behavioralBeatBounceAnchorY = Number(enemy?.wy) || 0;
  }
  const beatState = getBehaviorBeatProgressRuntime(enemy, state, 'behavioralBeatBounce', 0.24);
  const anchorX = Number(enemy?.behavioralBeatBounceAnchorX) || Number(enemy?.wx) || 0;
  const anchorY = Number(enemy?.behavioralBeatBounceAnchorY) || Number(enemy?.wy) || 0;
  const cycleBeat = beatState.beatIndex % 4;
  const segSmooth = beatState.smoothT;
  const lateralAmp = 118;
  const forwardAmp = 72;
  const sweepAmp = 96;
  const bob = Math.sin(((beatState.beatIndex + beatState.localT) % 1 + beatState.localT) * Math.PI * 4) * 10;
  let offsetX = 0;
  let offsetY = 0;
  if (cycleBeat === 0) {
    offsetX = lateralAmp * segSmooth;
    offsetY = bob;
  } else if (cycleBeat === 1) {
    offsetX = lateralAmp - (sweepAmp * segSmooth);
    offsetY = (-forwardAmp * segSmooth) + bob;
  } else if (cycleBeat === 2) {
    offsetX = (lateralAmp - sweepAmp) - (lateralAmp * 2 * segSmooth);
    offsetY = bob;
  } else {
    offsetX = -lateralAmp + (sweepAmp * segSmooth);
    offsetY = (forwardAmp * segSmooth) + bob;
  }
  const targetWorld = {
    x: anchorX + offsetX,
    y: anchorY + offsetY,
  };
  const dx = Number(targetWorld.x) - Number(enemy?.wx);
  const dy = Number(targetWorld.y) - Number(enemy?.wy);
  const dLen = Math.hypot(dx, dy) || 1;
  const desiredSpeed = Math.max(80, (Number(constants?.enemyMaxSpeed) || 140) * 1.25);
  return {
    overrideVelocity: true,
    desiredVx: (dx / dLen) * desiredSpeed,
    desiredVy: (dy / dLen) * desiredSpeed,
    blend: 0.36 + (0.06 * segSmooth),
  };
}

function resolveSingleBehaviorMotionRuntime(enemy, centerWorld, state, constants, runtime = null) {
  const singleBehaviorId = String(runtime?.singleBehaviorId || enemy?.singleBehaviorId || '').trim().toLowerCase();
  if (!singleBehaviorId || singleBehaviorId === 'none' || singleBehaviorId === 'default_motion') return null;
  if (enemy?.retreating) return null;
  const dt = Math.max(0, Number(state?.dt) || 0);
  const dx = Number(centerWorld?.x) - (Number(enemy?.wx) || 0);
  const dy = Number(centerWorld?.y) - (Number(enemy?.wy) || 0);
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;
  const normalX = -dirY;
  const normalY = dirX;
  const enemyMaxSpeed = Math.max(40, Number(constants?.enemyMaxSpeed) || 0);
  const beatState = getBehaviorBeatProgressRuntime(enemy, state, `single_${singleBehaviorId}`, 0.26);
  const sharedInstrumentPulseStrength = (() => {
    const instrumentId = String(
      enemy?.musicLaneInstrumentId
        || enemy?.composerInstrument
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || '',
    ).trim().toUpperCase();
    if (!instrumentId) return 0;
    const enemies = Array.isArray(state?.enemies) ? state.enemies : [];
    let strongestPulse = 0;
    for (let i = 0; i < enemies.length; i++) {
      const candidate = enemies[i];
      if (!candidate) continue;
      const candidateInstrumentId = String(
        candidate?.musicLaneInstrumentId
          || candidate?.composerInstrument
          || candidate?.musicInstrumentId
          || candidate?.instrumentId
          || '',
      ).trim().toUpperCase();
      if (candidateInstrumentId !== instrumentId) continue;
      const pulseDur = Math.max(
        0.01,
        Number(candidate?.composerActionPulseDur)
          || Number(constants?.composerGroupActionPulseSeconds)
          || 0.18,
      );
      const pulseT = Math.max(0, Number(candidate?.composerActionPulseT) || 0);
      if (!(pulseT > 0)) continue;
      const pulsePhase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
      const pulseStrength = Math.sin(pulsePhase * Math.PI);
      if (pulseStrength > strongestPulse) strongestPulse = pulseStrength;
    }
    return strongestPulse;
  })();
  if (singleBehaviorId === 'move_stop_on_beat') {
    const cycleBeat = beatState.beatIndex % 4;
    const strongBeat = cycleBeat === 0 || cycleBeat === 2;
    const holdWindow = sharedInstrumentPulseStrength > 0.12
      ? sharedInstrumentPulseStrength > 0.2
      : (strongBeat && beatState.localT < 0.46);
    if (holdWindow) {
      return {
        overrideVelocity: true,
        desiredVx: 0,
        desiredVy: 0,
        blend: Math.max(0.34, Math.min(0.78, 0.42 + (sharedInstrumentPulseStrength * 0.38))),
      };
    }
    const resumeScale = sharedInstrumentPulseStrength > 0.001
      ? (0.5 + ((1 - sharedInstrumentPulseStrength) * 0.5))
      : (strongBeat ? (0.52 + (0.48 * beatState.smoothT)) : 1);
    const desiredSpeed = enemyMaxSpeed * (0.52 * resumeScale);
    return {
      overrideVelocity: true,
      desiredVx: dirX * desiredSpeed,
      desiredVy: dirY * desiredSpeed,
      blend: 0.18 + (0.1 * Math.max(0.35, resumeScale)),
    };
  }
  if (singleBehaviorId === 'zig_zag_on_beat') {
    const phraseIndex = Math.floor(Math.max(0, beatState.beatIndex) / 2);
    const phrasePolarity = (phraseIndex % 2) === 0 ? 1 : -1;
    const smoothWave = Math.sin((beatState.localT * Math.PI) - (Math.PI * 0.5));
    const phraseSwell = 0.35 + (0.65 * beatState.smoothT);
    const wave = smoothWave * phrasePolarity * phraseSwell;
    const lateralAmplitude = Math.max(72, enemyMaxSpeed * 0.68);
    const forwardSpeed = enemyMaxSpeed * 0.56;
    const lateralSpeed = lateralAmplitude * wave;
    return {
      overrideVelocity: true,
      desiredVx: (dirX * forwardSpeed) + (normalX * lateralSpeed),
      desiredVy: (dirY * forwardSpeed) + (normalY * lateralSpeed),
      blend: 0.24 + (0.06 * Math.max(0, dt * 60)),
    };
  }
  return null;
}

function resolveWindingChainLeaderRuntime(enemy, enemies) {
  const groupId = Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0));
  if (!(groupId > 0)) return null;
  const archetype = String(enemy?.behavioralFormationArchetype || '').trim().toLowerCase();
  let leader = null;
  for (let i = 0; i < enemies.length; i++) {
    const candidate = enemies[i];
    if (!candidate || candidate === enemy) continue;
    if (String(candidate?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') continue;
    const candidateGroupId = Math.max(0, Math.trunc(Number(candidate?.composerGroupId || candidate?.musicGroupId) || 0));
    if (candidateGroupId !== groupId) continue;
    if (candidate?.behavioralFormationActive !== true) continue;
    if (String(candidate?.behavioralFormationArchetype || '').trim().toLowerCase() !== archetype) continue;
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
  const enemyMaxSpeed = Math.max(40, Number(constants?.enemyMaxSpeed) || 0);
  const speedMultiplier = Math.max(1, Number(runtime?.speedMultiplier) || 1);
  const desiredSpeed = enemyMaxSpeed * speedMultiplier;
  if (runtime.behaviorClass === 'follow_the_leader' && runtime.archetype === 'advancing_line' && (Number(runtime?.leaderBias) || 0) >= 0.999) {
    const arenaCenter = state?.arenaCenterWorld && typeof state.arenaCenterWorld === 'object'
      ? state.arenaCenterWorld
      : centerWorld;
    const arenaRadius = Math.max(140, Number(constants?.swarmArenaRadiusWorld) || 180);
    const phase = (Number(enemy?.behavioralFormationPhase) || 0) + ((Number(state?.dt) || 0) * Math.PI * 2 * Math.max(0.018, Number(runtime?.pathOscillationHz) || 0.32));
    enemy.behavioralFormationPhase = phase;
    if (!Number.isFinite(Number(enemy?.behavioralFormationPathDirX)) || Math.abs(Number(enemy?.behavioralFormationPathDirX)) < 0.001) {
      enemy.behavioralFormationPathDirX = ((Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId || 0)) % 2) === 0) ? 1 : -1;
    }
    if (!Number.isFinite(Number(enemy?.behavioralFormationPathOriginWorldX)) || !Number.isFinite(Number(enemy?.behavioralFormationPathOriginWorldY))) {
      enemy.behavioralFormationPathOriginWorldX = Number(enemy?.wx) || 0;
      enemy.behavioralFormationPathOriginWorldY = Number(enemy?.wy) || 0;
    }
    const travelDirX = Number(enemy.behavioralFormationPathDirX) >= 0 ? 1 : -1;
    const travelDirY = Number(enemy?.behavioralFormationPathDirY) || 0;
    const travelLen = Math.hypot(travelDirX, travelDirY) || 1;
    const dirX = travelDirX / travelLen;
    const dirY = travelDirY / travelLen;
    const normalX = -dirY;
    const normalY = dirX;
    const waveBaseY = Number(enemy.behavioralFormationPathOriginWorldY) || Number(enemy?.wy) || 0;
    const offsetBand = Math.max(arenaRadius * 0.52, 120);
    if (!Number.isFinite(Number(enemy?.behavioralFormationPathCrossOffsetWorld)) || Math.abs(Number(enemy?.behavioralFormationPathCrossOffsetWorld)) < 1) {
      const seedPhase = Math.sin((Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId || 0)) * 0.37) + 0.8);
      enemy.behavioralFormationPathCrossOffsetWorld = seedPhase * offsetBand * 0.55;
    }
    const wiggleAmp = Math.max(110, Math.min(arenaRadius * 1.05, arenaRadius * Math.max(0.7, Number(runtime?.pathOscillationAmplitude) || 0.95)));
    const forwardLookahead = Math.max(arenaRadius * 0.85, 320);
    const leadWave = Math.sin(phase * 0.42);
    const targetWorld = {
      x: Number(enemy?.wx) + (dirX * forwardLookahead) + (normalX * leadWave * wiggleAmp),
      y: waveBaseY + (dirY * forwardLookahead) + (normalY * ((Number(enemy.behavioralFormationPathCrossOffsetWorld) || 0) + (leadWave * wiggleAmp))),
    };
    const dx = Number(targetWorld.x) - Number(enemy?.wx);
    const dy = Number(targetWorld.y) - Number(enemy?.wy);
    const dLen = Math.hypot(dx, dy) || 1;
    const steerX = dx / dLen;
    const steerY = dy / dLen;
    return {
      overrideVelocity: true,
      desiredVx: steerX * desiredSpeed,
      desiredVy: steerY * desiredSpeed,
      blend: Math.max(0.22, Math.min(0.46, (Number(runtime?.velocityBlend) || 0.3) + 0.1)),
    };
  }
  if (runtime.behaviorClass === 'paired_motion' && runtime.archetype === 'paired_dance') {
    const danceWindow = getPerfBehaviorWindowRuntime(5600, 3600);
    if (!danceWindow.active) return null;
    const assignment = getPairedDanceAssignmentRuntime(enemy, enemies, state, danceWindow.cycleIndex);
    if (!assignment) return null;
    const pairSide = Number(assignment?.pairSide) >= 0 ? 1 : -1;
    const partnerId = Math.max(0, Math.trunc(Number(assignment?.partnerId) || 0));
    const partner = partnerId > 0
      ? (enemies.find((candidate) => Math.max(0, Math.trunc(Number(candidate?.id) || 0)) === partnerId) || null)
      : null;
    const beatState = getBehaviorBeatProgressRuntime(enemy, state, 'behavioralPairedDance', 0.22);
    const cycleState = getPairedDanceCycleStateRuntime(enemies, state, danceWindow.cycleIndex, danceWindow.phaseMs);
    const assembleMs = 1600;
    const holdMs = 360;
    const danceStartMs = assembleMs + holdMs;
    const effectiveAllPairsReady = Number(danceWindow.phaseMs) >= danceStartMs;
    const pairCenterX = Number(assignment?.pairCenterX) || ((Number(enemy?.wx) || 0) + (Number(partner?.wx) || 0)) * 0.5;
    const pairCenterY = Number(assignment?.pairCenterY) || ((Number(enemy?.wy) || 0) + (Number(partner?.wy) || 0)) * 0.5;
    const partnerX = Number(partner?.wx) || pairCenterX;
    const partnerY = Number(partner?.wy) || pairCenterY;
    const pairDx = (Number(enemy?.wx) || 0) - partnerX;
    const pairDy = (Number(enemy?.wy) || 0) - partnerY;
    const pairDist = Math.hypot(pairDx, pairDy) || 1;
    const pairSepX = pairDist > 0.001 ? (pairDx / pairDist) : pairSide;
    const pairSepY = pairDist > 0.001 ? (pairDy / pairDist) : 0;
    const approachAxisX = Number.isFinite(Number(assignment?.approachAxisX)) ? Number(assignment.approachAxisX) : pairSepX;
    const approachAxisY = Number.isFinite(Number(assignment?.approachAxisY)) ? Number(assignment.approachAxisY) : pairSepY;
    const orbitNormalX = -approachAxisY;
    const orbitNormalY = approachAxisX;
    const readyGap = 124;
    const readyTargetX = pairCenterX + (approachAxisX * pairSide * readyGap);
    const readyTargetY = pairCenterY + (approachAxisY * pairSide * readyGap);
    let targetWorld = null;
    let phase = 'release';
    let orbitAngle = 0;
    if (Number(danceWindow.phaseMs) < assembleMs) {
      phase = 'approach';
      targetWorld = {
        x: readyTargetX,
        y: readyTargetY,
      };
    } else if (Number(danceWindow.phaseMs) < danceStartMs) {
      phase = 'hold';
      targetWorld = {
        x: readyTargetX,
        y: readyTargetY,
      };
    } else {
      phase = 'orbit';
      const orbitDir = (((Math.trunc(Number(enemy?.behavioralDanceCycleIndex) || 0) + Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0))) % 2) === 0) ? 1 : -1;
      const orbitStartMs = danceStartMs;
      const orbitMs = Math.max(900, Number(danceWindow.activeMs) - orbitStartMs);
      const orbitPhase = Math.max(0, Math.min(1, (Number(danceWindow.phaseMs) - orbitStartMs) / orbitMs));
      const orbitRadius = 186;
      const ellipseY = orbitRadius * 0.88;
      const sharedSeed = ensurePairedDanceOrbitSeedRuntime(
        enemy,
        partner,
        assignment,
        danceWindow.cycleIndex,
        pairCenterX,
        pairCenterY,
        orbitRadius,
        ellipseY,
      );
      const baseAngle = sharedSeed + (pairSide < 0 ? 0 : Math.PI);
      orbitAngle = baseAngle + ((orbitPhase * Math.PI * 2 * 1.1) * orbitDir);
      const sweepX = Math.cos(orbitAngle) * orbitRadius;
      const sweepY = Math.sin(orbitAngle) * ellipseY;
      const driftX = Math.sin(orbitPhase * Math.PI * 2) * 5;
      const driftY = Math.cos(orbitPhase * Math.PI * 4) * 4;
      const partnerGap = Math.max(0, 132 - pairDist);
      const repelScale = Math.max(0, Math.min(56, partnerGap * 0.7));
      targetWorld = {
        x: pairCenterX + (approachAxisX * sweepX) + (orbitNormalX * sweepY) + driftX + (approachAxisX * pairSide * (44 + repelScale)),
        y: pairCenterY + (approachAxisY * sweepX) + (orbitNormalY * sweepY) + driftY + (approachAxisY * pairSide * (44 + repelScale)),
      };
    }
    const dx = Number(targetWorld.x) - Number(enemy?.wx);
    const dy = Number(targetWorld.y) - Number(enemy?.wy);
    const dLen = Math.hypot(dx, dy) || 1;
    const phaseIsApproach = (phase === 'approach');
    const phaseIsHold = (phase === 'hold');
    const desiredVx = (dx / dLen) * (phaseIsApproach ? desiredSpeed * 2 : (phaseIsHold ? desiredSpeed * 0.42 : desiredSpeed));
    const desiredVy = (dy / dLen) * (phaseIsApproach ? desiredSpeed * 2 : (phaseIsHold ? desiredSpeed * 0.42 : desiredSpeed));
    return {
      overrideVelocity: true,
      desiredVx,
      desiredVy,
      blend: phaseIsApproach
        ? 0.62
        : (phaseIsHold
          ? 0.88
          : Math.max(0.58, Math.min(0.78, (Number(runtime?.velocityBlend) || 0.34) + 0.28))),
      debugTrace: {
        phase,
        reason: phaseIsApproach
          ? 'assembly_window'
          : (phaseIsHold
            ? 'hold_window'
            : 'orbit_window'),
        partnerId,
        cycleBeat: Math.max(0, Math.trunc(Number(beatState.beatIndex) || 0)) % 8,
        cycleIndex: danceWindow.cycleIndex,
        allPairsReady: effectiveAllPairsReady,
        readyCount: Math.max(0, Math.trunc(Number(cycleState.readyCount) || 0)),
        totalCount: Math.max(0, Math.trunc(Number(cycleState.totalCount) || 0)),
        pairCenterX,
        pairCenterY,
        targetX: Number(targetWorld?.x) || 0,
        targetY: Number(targetWorld?.y) || 0,
        desiredVx,
        desiredVy,
        orbitAngle,
      },
    };
  }
  if (runtime.behaviorClass !== 'follow_the_leader') return null;
  if (runtime.archetype === 'winding_chain' && (Number(runtime?.leaderBias) || 0) >= 0.999) {
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
      enemy.behavioralFormationTraverseMode = Math.random() < 0.22 ? 'cross' : 'edge';
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
      enemy.behavioralFormationTraverseMode = Math.random() < 0.24 ? 'cross' : 'edge';
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
    const sweepWave = Math.sin(phase * 1.37) * Math.max(0.24, Math.min(1.15, Number(runtime?.pathOscillationAmplitude) || 0.5));
    const sineLateral = Math.sin(phase * 2.2) * 0.34;
    const edgeMode = String(enemy.behavioralFormationTraverseMode || 'edge') === 'edge';
    const tangentDir = Number(enemy?.behavioralFormationTraverseSign) || 1;
    const tangentX = -radialY * tangentDir;
    const tangentY = radialX * tangentDir;
    const desiredDirX = edgeMode
      ? (dirX * 0.42) + (tangentX * 0.58) + (normalX * ((sweepWave * 0.2) + sineLateral)) + (radialX * radialPull * 0.52)
      : dirX + (normalX * ((sweepWave * 0.34) + (sineLateral * 0.7))) + (radialX * radialPull * 0.45);
    const desiredDirY = edgeMode
      ? (dirY * 0.42) + (tangentY * 0.58) + (normalY * ((sweepWave * 0.2) + sineLateral)) + (radialY * radialPull * 0.52)
      : dirY + (normalY * ((sweepWave * 0.34) + (sineLateral * 0.7))) + (radialY * radialPull * 0.45);
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
    if (String(candidate?.behavioralFormationArchetype || '').trim().toLowerCase() !== String(runtime?.archetype || '').trim().toLowerCase()) continue;
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
  state.worldToScreen = typeof helpers.worldToScreen === 'function' ? helpers.worldToScreen : null;
  state.screenToWorld = typeof helpers.screenToWorld === 'function' ? helpers.screenToWorld : null;
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
    const effectiveOffscreenGraceSeconds = enemyType === 'composer-group-member' && lifecycleState === 'retiring'
      ? 1.1
      : (isProtectedComposerCarrier ? 6.5 : offscreenGraceSeconds);
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
      const groupBehaviorArchetype = String(e?.behavioralFormationArchetype || '').trim().toLowerCase();
      const soloCarrierType = String(e?.soloCarrierType || '').trim().toLowerCase();
      const introCarrierBodyType = String(e?.introCarrierBodyType || '').trim().toLowerCase();
      const groupId = Number.isFinite(Number(e?.composerGroupId))
        ? Number(e.composerGroupId)
        : (Number.isFinite(Number(e?.musicGroupId)) ? Number(e.musicGroupId) : null);
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
      const allowGroupCohesion = groupId !== null
        && soloCarrierType === ''
        && introCarrierBodyType !== 'solo'
        && groupBehaviorArchetype !== 'paired_dance'
        && groupBehaviorArchetype !== 'advancing_line'
        && groupBehaviorArchetype !== 'winding_chain';
      if (allowGroupCohesion) {
        let memberCount = 0;
        let centroidX = 0;
        let centroidY = 0;
        let avgVx = 0;
        let avgVy = 0;
        for (let j = 0; j < enemies.length; j++) {
          const o = enemies[j];
          if (!o || String(o?.enemyType || '') !== 'composer-group-member') continue;
          const otherGroupId = Number.isFinite(Number(o?.composerGroupId))
            ? Number(o.composerGroupId)
            : (Number.isFinite(Number(o?.musicGroupId)) ? Number(o.musicGroupId) : null);
          if (otherGroupId !== groupId) continue;
          if (String(o?.lifecycleState || '').trim().toLowerCase() === 'retiring') continue;
          centroidX += Number(o.wx) || 0;
          centroidY += Number(o.wy) || 0;
          avgVx += Number(o.vx) || 0;
          avgVy += Number(o.vy) || 0;
          memberCount += 1;
        }
        if (memberCount >= 2) {
          centroidX /= memberCount;
          centroidY /= memberCount;
          avgVx /= memberCount;
          avgVy /= memberCount;
          const centroidDx = centroidX - Number(e.wx);
          const centroidDy = centroidY - Number(e.wy);
          const centroidDist = Math.hypot(centroidDx, centroidDy);
          const cohesionSoftRadius = Math.max(
            Math.max(80, Number(constants.composerGroupSeparationRadiusWorld) || 200) * 0.82,
            120
          );
          if (centroidDist > cohesionSoftRadius) {
            const pullDist = centroidDist - cohesionSoftRadius;
            const pullNorm = Math.min(1, pullDist / Math.max(1, cohesionSoftRadius * 0.8));
            const cohesionForce = Math.max(0, Number(constants.enemyAccel) || 0) * 0.11 * pullNorm;
            ax += (centroidDx / centroidDist) * cohesionForce;
            ay += (centroidDy / centroidDist) * cohesionForce;
          }
          const velocityBlend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 0.95));
          e.vx += (avgVx - (Number(e.vx) || 0)) * velocityBlend * 0.22;
          e.vy += (avgVy - (Number(e.vy) || 0)) * velocityBlend * 0.22;
        }
      }
    }
    const perfRepeatEventMotion = resolvePerfRepeatEventMotionRuntime(e, state, constants);
    const groupBehaviorMotion = perfRepeatEventMotion || resolveBehavioralFormationMotionRuntime(e, enemies, centerWorld, state, constants);
    const singleBehaviorMotion = groupBehaviorMotion
      ? null
      : resolveSingleBehaviorMotionRuntime(e, centerWorld, state, constants, behavioralFormationRuntime);
    const scopedBehaviorMotion = groupBehaviorMotion || singleBehaviorMotion;
    if (scopedBehaviorMotion?.overrideVelocity === true) {
      const blend = Math.max(0.08, Math.min(0.5, Number(scopedBehaviorMotion.blend) || 0.3));
      e.vx += ((Number(scopedBehaviorMotion.desiredVx) || 0) - (Number(e.vx) || 0)) * blend;
      e.vy += ((Number(scopedBehaviorMotion.desiredVy) || 0) - (Number(e.vy) || 0)) * blend;
      if (scopedBehaviorMotion?.debugTrace && typeof scopedBehaviorMotion.debugTrace === 'object') {
        notePairedDanceTraceRuntime(helpers, state, e, {
          ...scopedBehaviorMotion.debugTrace,
          postBlendVx: Number(e.vx) || 0,
          postBlendVy: Number(e.vy) || 0,
        });
      }
      if (String(e?.behavioralFormationArchetype || '').trim().toLowerCase() === 'advancing_line') {
        ax = 0;
        ay = 0;
      } else if (String(e?.behavioralFormationArchetype || '').trim().toLowerCase() === 'paired_dance') {
        ax = 0;
        ay = 0;
      } else if (singleBehaviorMotion?.overrideVelocity === true) {
        ax *= 0.12;
        ay *= 0.12;
      } else {
        ax *= 0.2;
        ay *= 0.2;
      }
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
    applyPairedDanceSeparationRuntime(e, enemies, state);
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
            const borderWidthPx = 1 + (actionPulseStrength * 3.2);
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
