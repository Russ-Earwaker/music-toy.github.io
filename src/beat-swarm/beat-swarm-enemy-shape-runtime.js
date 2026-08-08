function normalizeBeat(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function createBeatSwarmEnemyShapeRuntime() {
  const hazards = [];
  let hazardId = 1;

  function removeHazard(hazard) {
    try { hazard?.el?.remove?.(); } catch {}
    const index = hazards.indexOf(hazard);
    if (index >= 0) hazards.splice(index, 1);
  }

  function clear() {
    while (hazards.length) removeHazard(hazards[hazards.length - 1]);
  }

  function spawn(options = null) {
    const layer = options?.layer || null;
    const enemy = options?.enemy || null;
    const target = options?.target || null;
    const pattern = options?.pattern || null;
    if (!layer || !enemy || !target || !pattern) return null;
    const placement = String(pattern.placement || 'player').trim().toLowerCase();
    const blend = placement === 'approach' ? 0.68 : 0;
    const targetX = Number(target.x) || 0;
    const targetY = Number(target.y) || 0;
    const towardEnemyX = (Number(enemy.wx) || 0) - targetX;
    const towardEnemyY = (Number(enemy.wy) || 0) - targetY;
    const towardEnemyDistance = Math.hypot(towardEnemyX, towardEnemyY) || 1;
    const blendedDistance = towardEnemyDistance * blend;
    const placementDistance = placement === 'approach'
      ? Math.max(blendedDistance, Number(pattern.minTargetDistanceWorld) || 0)
      : 0;
    const center = {
      x: targetX + ((towardEnemyX / towardEnemyDistance) * placementDistance),
      y: targetY + ((towardEnemyY / towardEnemyDistance) * placementDistance),
    };
    const radiusWorld = Math.max(80, Number(pattern.radiusWorld) || 230);
    const separationPaddingWorld = Math.max(20, Number(pattern.separationPaddingWorld) || 50);
    for (let pass = 0; pass < 3; pass += 1) {
      for (const existing of hazards) {
        const dx = center.x - Number(existing?.center?.x || 0);
        const dy = center.y - Number(existing?.center?.y || 0);
        const distance = Math.hypot(dx, dy);
        const minimumDistance = radiusWorld + Math.max(1, Number(existing?.radiusWorld) || 1) + separationPaddingWorld;
        if (distance >= minimumDistance) continue;
        const fallbackX = towardEnemyDistance > 0 ? towardEnemyX / towardEnemyDistance : 1;
        const fallbackY = towardEnemyDistance > 0 ? towardEnemyY / towardEnemyDistance : 0;
        const nx = distance > 0.001 ? dx / distance : fallbackX;
        const ny = distance > 0.001 ? dy / distance : fallbackY;
        const correction = minimumDistance - distance;
        center.x += nx * correction;
        center.y += ny * correction;
      }
    }
    const el = document.createElement('div');
    const shape = String(pattern.shape || 'circle').trim().toLowerCase();
    const safety = String(pattern.safety || 'outside').trim().toLowerCase();
    el.className = `beat-swarm-hostile-shape is-${shape} is-safe-${safety} is-warning`;
    layer.appendChild(el);
    const startBeat = normalizeBeat(options?.beatIndex);
    const warningBeats = Math.max(1, Math.trunc(Number(pattern.warningBeats) || 2));
    const hazard = {
      id: hazardId++,
      sourceEnemyId: Math.trunc(Number(enemy.id) || 0),
      patternId: String(pattern.id || '').trim().toLowerCase(),
      shape,
      safety,
      center,
      radiusWorld,
      outerRadiusWorld: Math.max(180, Number(pattern.outerRadiusWorld) || 520),
      soundVolume: Math.max(0.01, Math.min(1, Number(pattern.soundVolume) || 0.47)),
      startBeat,
      activateBeat: startBeat + warningBeats,
      endBeat: startBeat + warningBeats + Math.max(1, Math.trunc(Number(pattern.activeBeats) || 4)),
      activated: false,
      lastContactBeat: -1,
      el,
    };
    hazards.push(hazard);
    return hazard;
  }

  function update(options = null) {
    const beatIndex = normalizeBeat(options?.beatIndex);
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    const enemyIds = new Set(enemies.map((enemy) => Math.trunc(Number(enemy?.id) || 0)));
    const player = options?.player || { x: 0, y: 0 };
    const worldToScreen = options?.worldToScreen;
    if (typeof worldToScreen !== 'function') return;
    for (let index = hazards.length - 1; index >= 0; index -= 1) {
      const hazard = hazards[index];
      if (!enemyIds.has(hazard.sourceEnemyId) || beatIndex >= hazard.endBeat) {
        removeHazard(hazard);
        continue;
      }
      const active = beatIndex >= hazard.activateBeat;
      if (active && !hazard.activated) {
        hazard.activated = true;
        hazard.el.classList.remove('is-warning');
        hazard.el.classList.add('is-active');
        options?.onActivate?.({ hazard, beatIndex });
      }
      const centerScreen = worldToScreen(hazard.center);
      const edgeScreen = worldToScreen({ x: hazard.center.x + hazard.radiusWorld, y: hazard.center.y });
      if (centerScreen && edgeScreen) {
        const radiusPx = Math.max(12, Math.abs(edgeScreen.x - centerScreen.x));
        hazard.el.style.width = `${radiusPx * 2}px`;
        hazard.el.style.height = `${radiusPx * 2}px`;
        hazard.el.style.transform = `translate(${centerScreen.x - radiusPx}px, ${centerScreen.y - radiusPx}px)`;
      }
      if (!active) continue;
      const distance = Math.hypot((Number(player.x) || 0) - hazard.center.x, (Number(player.y) || 0) - hazard.center.y);
      const playerInDanger = hazard.safety === 'inside'
        ? distance > hazard.radiusWorld
        : distance <= hazard.radiusWorld;
      options?.onDamageRegion?.({ hazard, beatIndex });
      if (playerInDanger && hazard.lastContactBeat !== beatIndex) {
        hazard.lastContactBeat = beatIndex;
        options?.onPlayerContact?.({ hazard, beatIndex });
      }
    }
  }

  function getSnapshot() {
    return hazards.map((hazard) => ({
      id: hazard.id,
      sourceEnemyId: hazard.sourceEnemyId,
      patternId: hazard.patternId,
      shape: hazard.shape,
      safety: hazard.safety,
      center: { ...hazard.center },
      radiusWorld: hazard.radiusWorld,
      activateBeat: hazard.activateBeat,
      endBeat: hazard.endBeat,
      activated: hazard.activated,
    }));
  }

  return { clear, spawn, update, getSnapshot };
}
