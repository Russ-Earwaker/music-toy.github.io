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
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(constants.enemyFallbackSpawnMarginPx) || 42);
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: -m, y: helpers.randRange?.(0, h) ?? 0 };
  if (side === 1) return { x: w + m, y: helpers.randRange?.(0, h) ?? 0 };
  if (side === 2) return { x: helpers.randRange?.(0, w) ?? 0, y: -m };
  return { x: helpers.randRange?.(0, w) ?? 0, y: h + m };
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
