export function configureInitialSpawnerEnablementRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const difficultyConfig = state.difficultyConfig && typeof state.difficultyConfig === 'object' ? state.difficultyConfig : {};
  const spawnerRuntime = state.spawnerRuntime && typeof state.spawnerRuntime === 'object' ? state.spawnerRuntime : null;
  const count = Math.max(0, Math.trunc(Number(difficultyConfig.initialEnabledSpawnerCount) || 0));
  if (!spawnerRuntime?.setEnabled) return;
  let enabledSoFar = 0;
  spawnerRuntime.setEnabled((entry) => {
    if (entry?.type !== 'loopgrid') return true;
    if (!entry?.state?.hasContent) return false;
    const on = enabledSoFar < count;
    if (on) enabledSoFar += 1;
    return on;
  });
}

export function getEnemySpawnScaleRuntime(options = null) {
  const enemy = options?.enemy || null;
  const spawnStartScale = Number(options?.spawnStartScale);
  const dur = Math.max(0.001, Number(enemy?.spawnDur) || 0.14);
  const t = Math.max(0, Math.min(1, (Number(enemy?.spawnT) || 0) / dur));
  if (t <= 0.72) {
    const u = t / 0.72;
    const eased = 1 - Math.pow(1 - u, 3);
    const base = Number.isFinite(spawnStartScale) ? spawnStartScale : 0.2;
    return base + ((1.1 - base) * eased);
  }
  const v = (t - 0.72) / 0.28;
  return 1.1 - (0.1 * v);
}

export function getRandomOffscreenSpawnPointRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const group = options?.group && typeof options.group === 'object' ? options.group : null;
  const memberIndex = Math.max(0, Math.trunc(Number(options?.memberIndex) || 0));
  const memberCount = Math.max(1, Math.trunc(Number(options?.memberCount) || 1));
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(constants.enemyFallbackSpawnMarginPx) || 42);
  const formationSpawnRegion = String(group?.formationSpawnRegion || '').trim().toLowerCase();
  const formationArchetype = String(group?.formationArchetype || '').trim().toLowerCase();
  const behavioralFormationArchetype = String(group?.behavioralFormationArchetype || '').trim().toLowerCase();
  const behavioralFormationActive = group?.behavioralFormationActive === true;
  const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
  const seed = Math.abs((groupId * 31) + (memberCount * 7) + memberIndex);
  const sideBias = seed % 2;
  const offsetUnit = Math.max(18, Math.min(72, Math.round(Math.min(w, h) * 0.035)));
  const pairOffset = (memberIndex - ((memberCount - 1) * 0.5)) * offsetUnit;
  const stairOffset = memberIndex * Math.max(16, Math.round(offsetUnit * 0.85));
  const randRange = typeof helpers.randRange === 'function'
    ? helpers.randRange
    : ((min, max) => min + (Math.random() * (max - min)));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  if (behavioralFormationActive && behavioralFormationArchetype === 'winding_chain') {
    const fromLeft = (groupId % 2) === 0;
    const baseY = h * 0.24;
    const chainOffset = memberIndex * Math.max(8, Math.round(offsetUnit * 0.24));
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp(baseY + chainOffset, h * 0.16, h * 0.42),
    };
  }

  if (behavioralFormationActive && behavioralFormationArchetype === 'advancing_line') {
    const fromLeft = (groupId % 2) === 0;
    const baseY = h * 0.5;
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp(baseY, h * 0.42, h * 0.58),
    };
  }

  if (formationSpawnRegion === 'lower_outer' || formationArchetype === 'foundation_anchor_line') {
    const fromLeft = sideBias === 0;
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp((h * 0.72) + pairOffset, h * 0.52, h * 0.92),
    };
  }
  if (formationSpawnRegion === 'mid_side' || formationArchetype === 'backbeat_pair') {
    const fromLeft = sideBias === 0;
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp((h * 0.48) + pairOffset, h * 0.28, h * 0.72),
    };
  }
  if (formationSpawnRegion === 'side_diagonal' || formationArchetype === 'syncopation_stair') {
    const fromLeft = sideBias === 0;
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp((h * 0.34) + stairOffset, h * 0.14, h * 0.82),
    };
  }
  if (formationSpawnRegion === 'upper_mid' || formationArchetype === 'lead_arc') {
    return {
      x: clamp((w * 0.5) + pairOffset, w * 0.22, w * 0.78),
      y: -m,
    };
  }
  if (formationSpawnRegion === 'lead_reply_edge' || formationArchetype === 'answer_echo') {
    const fromLeft = sideBias === 0;
    return {
      x: fromLeft ? -m : (w + m),
      y: clamp((h * 0.26) + pairOffset, h * 0.12, h * 0.46),
    };
  }

  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: -m, y: randRange(0, h) ?? 0 };
  if (side === 1) return { x: w + m, y: randRange(0, h) ?? 0 };
  if (side === 2) return { x: randRange(0, w) ?? 0, y: -m };
  return { x: randRange(0, w) ?? 0, y: h + m };
}

export function spawnFallbackEnemyOffscreenRuntime(options = null) {
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const point = helpers.getRandomOffscreenSpawnPoint?.(options) || null;
  if (!point) return;
  helpers.spawnEnemyAt?.(point.x, point.y);
}

export function keepDrawSnakeEnemyOnscreenRuntimeWrapper(options = null) {
  const enemy = options?.enemy || null;
  const dt = Number(options?.dt) || 0;
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  return helpers.keepDrawSnakeEnemyOnscreenRuntime?.({
    enemy,
    dt,
    constants: {
      drawSnakeScreenMarginPx: Number(constants.drawSnakeScreenMarginPx) || 0,
      drawSnakeEdgePullRate: Number(constants.drawSnakeEdgePullRate) || 0,
    },
    helpers: {
      worldToScreen: helpers.worldToScreen,
      screenToWorld: helpers.screenToWorld,
    },
  });
}
