import {
  BEAT_SWARM_LOGICAL_BOUNDS,
  BEAT_SWARM_LOGICAL_CENTER,
} from './beat-swarm-viewport-space.js';

export function clampBeatSwarmLogicalPoint(point, marginLogical = 0) {
  const margin = Math.max(0, Number(marginLogical) || 0);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Object.freeze({
    x: Math.max(BEAT_SWARM_LOGICAL_BOUNDS.left + margin, Math.min(BEAT_SWARM_LOGICAL_BOUNDS.right - margin, x)),
    y: Math.max(BEAT_SWARM_LOGICAL_BOUNDS.top + margin, Math.min(BEAT_SWARM_LOGICAL_BOUNDS.bottom - margin, y)),
  });
}

export function reflectBeatSwarmLogicalMotion(position, velocity, marginLogical = 0) {
  const clamped = clampBeatSwarmLogicalPoint(position, marginLogical);
  if (!clamped) return null;
  const x = Number(position?.x);
  const y = Number(position?.y);
  const hitX = Math.abs(clamped.x - x) > 0.001;
  const hitY = Math.abs(clamped.y - y) > 0.001;
  return Object.freeze({
    position: clamped,
    velocity: Object.freeze({
      x: hitX ? -Number(velocity?.x || 0) : Number(velocity?.x || 0),
      y: hitY ? -Number(velocity?.y || 0) : Number(velocity?.y || 0),
    }),
    hitX,
    hitY,
  });
}

export function getBeatSwarmFormationAnchorLogical(enemy = null) {
  const formationArchetype = String(enemy?.formationArchetype || '').trim().toLowerCase();
  const formationSpawnRegion = String(enemy?.formationSpawnRegion || '').trim().toLowerCase();
  const memberIndex = Math.max(0, Math.trunc(Number(enemy?.formationMemberIndex) || 0));
  const memberCount = Math.max(1, Math.trunc(Number(enemy?.formationMemberCount) || 1));
  const centeredIndex = memberIndex - ((memberCount - 1) * 0.5);
  const xStep = 88;
  const yStep = 45;
  let targetX = BEAT_SWARM_LOGICAL_CENTER.x;
  let targetY = BEAT_SWARM_LOGICAL_CENTER.y;

  if (formationSpawnRegion === 'lower_outer' || formationArchetype === 'foundation_anchor_line') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = 1600 * (laneSide < 0 ? 0.28 : (laneSide > 0 ? 0.72 : 0.5)) + (centeredIndex * (xStep * 0.45));
    targetY = (900 * 0.78) - (Math.abs(centeredIndex) * (yStep * 0.2));
  } else if (formationSpawnRegion === 'mid_side' || formationArchetype === 'backbeat_pair') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = 1600 * (laneSide < 0 ? 0.24 : (laneSide > 0 ? 0.76 : 0.5));
    targetY = (900 * 0.5) + (centeredIndex * (yStep * 0.65));
  } else if (formationSpawnRegion === 'side_diagonal' || formationArchetype === 'syncopation_stair') {
    const laneSide = memberCount <= 1 ? 0 : (centeredIndex < 0 ? -1 : 1);
    targetX = 1600 * (laneSide < 0 ? 0.2 : (laneSide > 0 ? 0.8 : 0.5));
    targetY = (900 * 0.34) + (memberIndex * (yStep * 0.9));
  } else if (formationSpawnRegion === 'upper_mid' || formationArchetype === 'lead_arc') {
    targetX = 800 + (centeredIndex * xStep);
    targetY = (900 * 0.22) + (Math.abs(centeredIndex) * (yStep * 0.18));
  } else if (formationSpawnRegion === 'lead_reply_edge' || formationArchetype === 'answer_echo') {
    const laneSide = memberCount <= 1 ? 1 : (centeredIndex <= 0 ? -1 : 1);
    targetX = 1600 * (laneSide < 0 ? 0.22 : 0.78);
    targetY = (900 * 0.28) + (centeredIndex * (yStep * 0.5));
  } else {
    return null;
  }
  return clampBeatSwarmLogicalPoint({ x: targetX, y: targetY }, 24);
}

export function clampBeatSwarmPairCenterLogical(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Object.freeze({
    x: Math.max(320, Math.min(1280, Number.isFinite(x) ? x : 800)),
    y: Math.max(180, Math.min(720, Number.isFinite(y) ? y : 450)),
  });
}
