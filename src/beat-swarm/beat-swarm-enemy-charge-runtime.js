function normalizeBeat(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function normalizeDirection(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length > 0.0001) return { x: x / length, y: y / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackY) || 1;
  return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
}

export function createBeatSwarmEnemyChargeRuntime() {
  const charges = [];
  let chargeId = 1;

  function removeCharge(charge) {
    try { charge?.telegraphEl?.remove?.(); } catch {}
    if (charge?.enemy) {
      charge.enemy.combatCharging = false;
      charge.enemy.vx = 0;
      charge.enemy.vy = 0;
      charge.enemy.combatAnchorX = Number(charge.enemy.wx) || 0;
      charge.enemy.combatAnchorY = Number(charge.enemy.wy) || 0;
    }
    const index = charges.indexOf(charge);
    if (index >= 0) charges.splice(index, 1);
  }

  function clear() {
    while (charges.length) removeCharge(charges[charges.length - 1]);
  }

  function spawn(options = null) {
    const layer = options?.layer || null;
    const enemy = options?.enemy || null;
    const target = options?.target || null;
    const pattern = options?.pattern || null;
    if (!layer || !enemy || !target || !pattern) return null;
    const predictive = String(pattern.aimMode || 'direct').trim().toLowerCase() === 'intercept';
    const predictionSeconds = predictive ? Math.max(0, Number(pattern.predictionSeconds) || 0.72) : 0;
    const aimX = (Number(target.x) || 0) + ((Number(options?.playerVelocityX) || 0) * predictionSeconds);
    const aimY = (Number(target.y) || 0) + ((Number(options?.playerVelocityY) || 0) * predictionSeconds);
    const direction = normalizeDirection(aimX - (Number(enemy.wx) || 0), aimY - (Number(enemy.wy) || 0));
    enemy.combatFacingAngle = Math.atan2(direction.y, direction.x);
    const telegraphEl = document.createElement('div');
    telegraphEl.className = `beat-swarm-charge-telegraph is-${predictive ? 'intercept' : 'direct'}`;
    layer.appendChild(telegraphEl);
    const startBeat = normalizeBeat(options?.beatIndex);
    const warningBeats = Math.max(1, Math.trunc(Number(pattern.warningBeats) || 2));
    const charge = {
      id: chargeId++,
      sourceEnemyId: Math.trunc(Number(enemy.id) || 0),
      patternId: String(pattern.id || '').trim().toLowerCase(),
      enemy,
      direction,
      speed: Math.max(200, Number(pattern.chargeSpeed) || 900),
      lineLengthWorld: Math.max(500, Number(pattern.lineLengthWorld) || 1500),
      soundVolume: Math.max(0.01, Math.min(1, Number(pattern.soundVolume) || 0.48)),
      startBeat,
      activateBeat: startBeat + warningBeats,
      endBeat: startBeat + warningBeats + Math.max(1, Math.trunc(Number(pattern.chargeBeats) || 2)),
      activated: false,
      lastContactBeat: -1,
      telegraphEl,
    };
    enemy.combatCharging = false;
    charges.push(charge);
    return charge;
  }

  function update(options = null) {
    const dt = Math.max(0, Math.min(0.08, Number(options?.dt) || 0));
    const beatIndex = normalizeBeat(options?.beatIndex);
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    const enemyIds = new Set(enemies.map((enemy) => Math.trunc(Number(enemy?.id) || 0)));
    const player = options?.player || { x: 0, y: 0 };
    const worldToScreen = options?.worldToScreen;
    if (typeof worldToScreen !== 'function') return;
    for (let index = charges.length - 1; index >= 0; index -= 1) {
      const charge = charges[index];
      const enemy = charge.enemy;
      if (!enemyIds.has(charge.sourceEnemyId) || beatIndex >= charge.endBeat) {
        removeCharge(charge);
        continue;
      }
      const active = beatIndex >= charge.activateBeat;
      if (active && !charge.activated) {
        charge.activated = true;
        enemy.combatCharging = true;
        enemy.combatFacingAngle = Math.atan2(charge.direction.y, charge.direction.x);
        charge.telegraphEl.classList.add('is-active');
        options?.onActivate?.({ charge, enemy, beatIndex });
      }
      const start = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
      const end = {
        x: start.x + (charge.direction.x * charge.lineLengthWorld),
        y: start.y + (charge.direction.y * charge.lineLengthWorld),
      };
      const startScreen = worldToScreen(start);
      const endScreen = worldToScreen(end);
      if (startScreen && endScreen) {
        const dx = endScreen.x - startScreen.x;
        const dy = endScreen.y - startScreen.y;
        charge.telegraphEl.style.width = `${Math.max(1, Math.hypot(dx, dy))}px`;
        charge.telegraphEl.style.transform = `translate(${startScreen.x}px, ${startScreen.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
      }
      if (!active) continue;
      enemy.wx = (Number(enemy.wx) || 0) + (charge.direction.x * charge.speed * dt);
      enemy.wy = (Number(enemy.wy) || 0) + (charge.direction.y * charge.speed * dt);
      enemy.vx = charge.direction.x * charge.speed;
      enemy.vy = charge.direction.y * charge.speed;
      enemy.combatAnchorX = Number(enemy.wx) || 0;
      enemy.combatAnchorY = Number(enemy.wy) || 0;
      const playerDistance = Math.hypot((Number(player.x) || 0) - enemy.wx, (Number(player.y) || 0) - enemy.wy);
      if (playerDistance <= 54 && charge.lastContactBeat !== beatIndex) {
        charge.lastContactBeat = beatIndex;
        options?.onPlayerContact?.({ charge, enemy, beatIndex });
      }
    }
  }

  function getSnapshot() {
    return charges.map((charge) => ({
      id: charge.id,
      sourceEnemyId: charge.sourceEnemyId,
      patternId: charge.patternId,
      direction: { ...charge.direction },
      speed: charge.speed,
      activateBeat: charge.activateBeat,
      endBeat: charge.endBeat,
      activated: charge.activated,
    }));
  }

  return { clear, spawn, update, getSnapshot };
}
