function normalizeBeat(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= 0.0001) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared));
  return Math.hypot(point.x - (start.x + (dx * t)), point.y - (start.y + (dy * t)));
}

function angleToTarget(source, target) {
  return Math.atan2(
    (Number(target?.y) || 0) - (Number(source?.wy) || 0),
    (Number(target?.x) || 0) - (Number(source?.wx) || 0),
  );
}

export function createBeatSwarmEnemyLaserRuntime() {
  const hazards = [];
  let hazardId = 1;

  function syncEnemyLaserPhase(enemy) {
    if (!enemy) return;
    const enemyHazards = hazards.filter((hazard) => hazard.sourceEnemyId === Math.trunc(Number(enemy.id) || 0));
    const phase = enemyHazards.some((hazard) => hazard.activated)
      ? 'active'
      : (enemyHazards.some((hazard) => hazard.locked) ? 'locked' : (enemyHazards.length ? 'aiming' : ''));
    enemy.combatLaserPhase = phase;
    enemy.el?.classList?.toggle?.('is-laser-aiming', phase === 'aiming');
    enemy.el?.classList?.toggle?.('is-laser-locked', phase === 'locked');
  }

  function removeHazard(hazard) {
    for (const el of hazard?.beamEls || []) {
      try { el?.remove?.(); } catch {}
    }
    const index = hazards.indexOf(hazard);
    if (index >= 0) hazards.splice(index, 1);
    syncEnemyLaserPhase(hazard?.enemy);
  }

  function clear() {
    while (hazards.length) removeHazard(hazards[hazards.length - 1]);
  }

  function spawn(options = null) {
    const layer = options?.layer || null;
    const enemy = options?.enemy || null;
    const pattern = options?.pattern || null;
    if (!layer || !enemy || !pattern) return null;
    const beamCount = Math.max(1, Math.trunc(Number(pattern.beamCount) || 1));
    const beamEls = [];
    for (let index = 0; index < beamCount; index += 1) {
      const el = document.createElement('div');
      el.className = 'beat-swarm-hostile-laser is-warning is-aiming';
      if (String(pattern.beamStyle || '').trim().toLowerCase() === 'thick') el.classList.add('is-thick');
      layer.appendChild(el);
      beamEls.push(el);
    }
    const startBeat = normalizeBeat(options?.beatIndex);
    const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(options?.subdivisionsPerBeat) || 1));
    const startStep = Number.isFinite(Number(options?.stepIndex))
      ? normalizeBeat(options.stepIndex)
      : startBeat * subdivisionsPerBeat;
    const phaseBeats = Math.max(1, Math.trunc(Number(pattern.phaseBeats) || Math.ceil((Number(pattern.warningBeats) || 2) * 0.5)));
    const warningBeats = phaseBeats * 2;
    const warningSteps = warningBeats * subdivisionsPerBeat;
    const activeBeats = Math.max(1, Math.trunc(Number(pattern.activeBeats) || 8));
    const hazard = {
      id: hazardId++,
      sourceEnemyId: Math.trunc(Number(enemy.id) || 0),
      enemy,
      enemyEl: enemy.el || null,
      patternId: String(pattern.id || '').trim().toLowerCase(),
      beamCount,
      beamEls,
      angle: String(pattern.aimMode || '').trim().toLowerCase() === 'track_then_lock'
        ? angleToTarget(enemy, options?.target)
        : Number.isFinite(Number(enemy.combatLaserFormationAngle))
          ? Number(enemy.combatLaserFormationAngle)
          : Number.isFinite(Number(enemy.combatLaserAngle)) ? Number(enemy.combatLaserAngle) : -Math.PI * 0.5,
      aimMode: String(pattern.aimMode || 'rotate').trim().toLowerCase(),
      angularSpeed: Number(pattern.angularSpeed) || 0,
      lengthWorld: Math.max(600, Number(pattern.lengthWorld) || 1600),
      bidirectional: pattern.bidirectional === true,
      extendPastViewport: pattern.extendPastViewport === true,
      collisionRadiusWorld: Math.max(4, Number(pattern.collisionRadiusWorld) || 28),
      warningWidthPx: Math.max(2, Number(pattern.warningWidthPx) || 2),
      activeWidthPx: Math.max(4, Number(pattern.activeWidthPx) || 7),
      soundVolume: Math.max(0.01, Math.min(1,
        enemy.combatLaserSoundVolume != null && Number.isFinite(Number(enemy.combatLaserSoundVolume))
          ? Number(enemy.combatLaserSoundVolume)
          : (Number(pattern.soundVolume) || 0.46)
      )),
      startBeat,
      startStep,
      subdivisionsPerBeat,
      phaseBeats,
      phaseSteps: phaseBeats * subdivisionsPerBeat,
      lockBeat: startBeat + phaseBeats,
      lockStep: startStep + (phaseBeats * subdivisionsPerBeat),
      activateBeat: startBeat + warningBeats,
      activateStep: startStep + warningSteps,
      endBeat: startBeat + warningBeats + activeBeats,
      endStep: startStep + warningSteps + (activeBeats * subdivisionsPerBeat),
      activated: false,
      locked: false,
      lastContactBeat: -1,
      lastContactStep: -1,
    };
    if (hazard.aimMode === 'formation') {
      enemy.combatLaserFormationAngle = hazard.angle + (Number(pattern.formationAdvanceRadians) || 0);
    } else {
      enemy.combatLaserAngle = hazard.angle + 0.42;
    }
    hazards.push(hazard);
    syncEnemyLaserPhase(enemy);
    return hazard;
  }

  function update(options = null) {
    const dt = Math.max(0, Number(options?.dt) || 0);
    const beatIndex = normalizeBeat(options?.beatIndex);
    const stepIndex = Number.isFinite(Number(options?.stepIndex))
      ? normalizeBeat(options.stepIndex)
      : null;
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    const enemyById = new Map(enemies.map((enemy) => [Math.trunc(Number(enemy?.id) || 0), enemy]));
    const player = options?.player || { x: 0, y: 0 };
    const worldToScreen = options?.worldToScreen;
    if (typeof worldToScreen !== 'function') return;
    for (let index = hazards.length - 1; index >= 0; index -= 1) {
      const hazard = hazards[index];
      const enemy = enemyById.get(hazard.sourceEnemyId) || null;
      const stepScheduled = Math.max(1, Math.trunc(Number(hazard.subdivisionsPerBeat) || 1)) > 1
        && stepIndex != null;
      const timelineIndex = stepScheduled ? stepIndex : beatIndex;
      const endIndex = stepScheduled ? hazard.endStep : hazard.endBeat;
      if (!enemy || timelineIndex >= endIndex) {
        removeHazard(hazard);
        continue;
      }
      const active = timelineIndex >= (stepScheduled ? hazard.activateStep : hazard.activateBeat);
      const locked = !active && timelineIndex >= (stepScheduled ? hazard.lockStep : hazard.lockBeat);
      if (!active && !locked && hazard.aimMode === 'track_then_lock') {
        hazard.angle = angleToTarget(enemy, player);
      }
      if (locked && !hazard.locked) {
        hazard.locked = true;
        for (const el of hazard.beamEls) {
          el.classList.remove('is-aiming');
          el.classList.add('is-locked');
        }
        options?.onLock?.({ hazard, enemy, beatIndex, stepIndex });
      }
      enemy.combatFacingAngle = hazard.angle;
      if (active && !hazard.activated) {
        hazard.activated = true;
        for (const el of hazard.beamEls) {
          el.classList.remove('is-warning', 'is-aiming', 'is-locked');
          el.classList.add('is-active');
        }
        options?.onActivate?.({ hazard, enemy, beatIndex, stepIndex });
      }
      syncEnemyLaserPhase(enemy);
      const speedScale = active ? 1 : 0.22;
      if (hazard.aimMode !== 'track_then_lock' && hazard.aimMode !== 'formation') {
        hazard.angle += hazard.angularSpeed * dt * speedScale;
      }
      let playerContact = false;
      for (let beamIndex = 0; beamIndex < hazard.beamCount; beamIndex += 1) {
        const angle = hazard.angle + ((Math.PI * 2 * beamIndex) / hazard.beamCount);
        const muzzleOffsetWorld = Math.max(0, Number(enemy?.combatMuzzleOffsetWorld) || 0);
        const source = {
          x: (Number(enemy.wx) || 0) + (Math.cos(angle) * muzzleOffsetWorld),
          y: (Number(enemy.wy) || 0) + (Math.sin(angle) * muzzleOffsetWorld),
        };
        const start = hazard.bidirectional ? {
          x: source.x - (Math.cos(angle) * hazard.lengthWorld * 0.5),
          y: source.y - (Math.sin(angle) * hazard.lengthWorld * 0.5),
        } : source;
        const end = hazard.bidirectional ? {
          x: source.x + (Math.cos(angle) * hazard.lengthWorld * 0.5),
          y: source.y + (Math.sin(angle) * hazard.lengthWorld * 0.5),
        } : {
          x: source.x + (Math.cos(angle) * hazard.lengthWorld),
          y: source.y + (Math.sin(angle) * hazard.lengthWorld),
        };
        const startScreen = worldToScreen(start);
        const endScreen = worldToScreen(end);
        if (!startScreen || !endScreen) continue;
        const dx = endScreen.x - startScreen.x;
        const dy = endScreen.y - startScreen.y;
        const projectedLength = Math.max(1, Math.hypot(dx, dy));
        const viewportLength = (typeof window !== 'undefined')
          ? Math.hypot(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)) * 2.5
          : projectedLength;
        const length = hazard.extendPastViewport ? Math.max(projectedLength, viewportLength) : projectedLength;
        hazard.lastVisualLengthPx = length;
        const el = hazard.beamEls[beamIndex];
        const beamWidth = active ? hazard.activeWidthPx : hazard.warningWidthPx;
        el.style.height = `${beamWidth}px`;
        el.style.marginTop = `${(-beamWidth * 0.5).toFixed(2)}px`;
        el.style.width = `${length}px`;
        el.style.transform = `translate(${startScreen.x}px, ${startScreen.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
        if (active && distanceToSegment(player, start, end) <= hazard.collisionRadiusWorld) playerContact = true;
      }
      const contactIndex = stepScheduled ? stepIndex : beatIndex;
      const lastContactIndex = stepScheduled ? hazard.lastContactStep : hazard.lastContactBeat;
      if (playerContact && lastContactIndex !== contactIndex) {
        if (stepScheduled) hazard.lastContactStep = stepIndex;
        else hazard.lastContactBeat = beatIndex;
        options?.onPlayerContact?.({ hazard, enemy, beatIndex, stepIndex });
      }
    }
  }

  function getSnapshot() {
    return hazards.map((hazard) => ({
      id: hazard.id,
      sourceEnemyId: hazard.sourceEnemyId,
      patternId: hazard.patternId,
      beamCount: hazard.beamCount,
      activateBeat: hazard.activateBeat,
      activateStep: hazard.activateStep,
      lockBeat: hazard.lockBeat,
      lockStep: hazard.lockStep,
      phaseBeats: hazard.phaseBeats,
      endBeat: hazard.endBeat,
      endStep: hazard.endStep,
      subdivisionsPerBeat: hazard.subdivisionsPerBeat,
      activated: hazard.activated,
      aimMode: hazard.aimMode,
      bidirectional: hazard.bidirectional,
      extendPastViewport: hazard.extendPastViewport,
      collisionRadiusWorld: hazard.collisionRadiusWorld,
      angle: hazard.angle,
      warningWidthPx: hazard.warningWidthPx,
      activeWidthPx: hazard.activeWidthPx,
      visualLengthPx: Number(hazard.lastVisualLengthPx) || 0,
    }));
  }

  return { clear, spawn, update, getSnapshot };
}
