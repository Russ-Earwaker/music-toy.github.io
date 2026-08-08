function enemyId(enemy) {
  return Math.max(0, Math.trunc(Number(enemy?.id) || 0));
}

function isLiveEnemy(enemy) {
  return !!enemy
    && enemy.__bsRemoved !== true
    && enemy.__bsPendingDeath !== true
    && Number(enemy.hp) > 0
    && String(enemy.lifecycleState || 'active') === 'active';
}

function removeLink(link) {
  try { link?.el?.remove?.(); } catch {}
}

export function createBeatSwarmEnemyConductorRuntime() {
  let linkId = 1;
  const links = [];
  const shields = new Map();

  function removeShield(targetEnemyId, enemy = null) {
    const shield = shields.get(targetEnemyId);
    try { shield?.remove?.(); } catch {}
    shields.delete(targetEnemyId);
    if (enemy) enemy.conductorShieldEl = null;
  }

  function ensureShield(target, layer) {
    const targetId = enemyId(target);
    let shield = shields.get(targetId);
    if (!shield) {
      shield = document.createElement('div');
      shield.className = 'beat-swarm-conductor-shield';
      layer?.appendChild?.(shield);
      shields.set(targetId, shield);
    }
    target.conductorShieldEl = shield;
    return shield;
  }

  function clear(enemies = null) {
    for (const link of links) removeLink(link);
    links.length = 0;
    for (const shield of shields.values()) {
      try { shield?.remove?.(); } catch {}
    }
    shields.clear();
    if (Array.isArray(enemies)) {
      for (const enemy of enemies) {
        enemy.conductorDamageMultiplier = 1;
        enemy.conductorShieldEl = null;
        enemy.el?.classList?.remove('is-conductor-protected');
      }
    }
  }

  function spawn(options = null) {
    const source = options?.enemy;
    const pattern = options?.pattern || {};
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    if (!isLiveEnemy(source)) return [];
    const radius = Math.max(80, Number(pattern.radiusWorld) || 620);
    const maxTargets = Math.max(1, Math.trunc(Number(pattern.maxTargets) || 2));
    const sourceX = Number(source.wx) || 0;
    const sourceY = Number(source.wy) || 0;
    const sourceId = enemyId(source);
    for (let index = links.length - 1; index >= 0; index -= 1) {
      if (links[index].sourceEnemyId !== sourceId) continue;
      removeLink(links[index]);
      links.splice(index, 1);
    }
    const targets = enemies
      .filter((candidate) => isLiveEnemy(candidate)
        && candidate !== source
        && String(candidate.combatProfileId || '').trim().toLowerCase() !== 'conductor')
      .map((candidate) => ({
        enemy: candidate,
        distance: Math.hypot((Number(candidate.wx) || 0) - sourceX, (Number(candidate.wy) || 0) - sourceY),
      }))
      .filter((entry) => entry.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxTargets)
      .map((entry) => entry.enemy);
    const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
    const activeBeats = Math.max(1, Math.trunc(Number(pattern.activeBeats) || 7));
    const created = [];
    for (const target of targets) {
      const el = document.createElement('div');
      el.className = `beat-swarm-conductor-link is-${String(pattern.id || 'shield_link').replace(/[^a-z0-9_-]/gi, '-')}`;
      options?.layer?.appendChild?.(el);
      const link = {
        id: linkId++,
        el,
        sourceEnemyId: sourceId,
        targetEnemyId: enemyId(target),
        patternId: String(pattern.id || 'shield_link'),
        damageMultiplier: Math.max(0, Math.min(1, Number(pattern.damageMultiplier) || 0.2)),
        startBeat: beatIndex,
        endBeat: beatIndex + activeBeats,
      };
      links.push(link);
      created.push(link);
    }
    return created;
  }

  function update(options = null) {
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
    const worldToScreen = options?.worldToScreen;
    const byId = new Map(enemies.map((enemy) => [enemyId(enemy), enemy]));
    const protectedIds = new Set();
    for (const enemy of enemies) {
      enemy.conductorDamageMultiplier = 1;
      enemy.el?.classList?.remove('is-conductor-protected');
    }
    for (let index = links.length - 1; index >= 0; index -= 1) {
      const link = links[index];
      const source = byId.get(link.sourceEnemyId);
      const target = byId.get(link.targetEnemyId);
      if (!isLiveEnemy(source) || !isLiveEnemy(target) || beatIndex >= link.endBeat) {
        removeLink(link);
        links.splice(index, 1);
        continue;
      }
      target.conductorDamageMultiplier = Math.min(
        Number(target.conductorDamageMultiplier) || 1,
        link.damageMultiplier,
      );
      protectedIds.add(link.targetEnemyId);
      target.el?.classList?.add('is-conductor-protected');
      if (typeof worldToScreen !== 'function') continue;
      const from = worldToScreen({ x: Number(source.wx) || 0, y: Number(source.wy) || 0 });
      const to = worldToScreen({ x: Number(target.wx) || 0, y: Number(target.wy) || 0 });
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      link.el.style.transform = `translate(${from.x.toFixed(2)}px, ${from.y.toFixed(2)}px) rotate(${Math.atan2(dy, dx)}rad)`;
      link.el.style.width = `${Math.hypot(dx, dy).toFixed(2)}px`;
    }
    for (const [targetId, shield] of shields) {
      if (protectedIds.has(targetId)) continue;
      removeShield(targetId, byId.get(targetId));
    }
    for (const targetId of protectedIds) {
      const target = byId.get(targetId);
      if (!target || typeof worldToScreen !== 'function') continue;
      const point = worldToScreen({ x: Number(target.wx) || 0, y: Number(target.wy) || 0 });
      if (!point) continue;
      const shield = ensureShield(target, options?.layer);
      shield.style.transform = `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px)`;
      shield.style.setProperty('--bs-conductor-shield-strength', `${(1 - (Number(target.conductorDamageMultiplier) || 1)).toFixed(3)}`);
    }
    return links.length;
  }

  function getSnapshot() {
    return links.map((link) => ({
      id: link.id,
      sourceEnemyId: link.sourceEnemyId,
      targetEnemyId: link.targetEnemyId,
      patternId: link.patternId,
      damageMultiplier: link.damageMultiplier,
      startBeat: link.startBeat,
      endBeat: link.endBeat,
    }));
  }

  return { clear, spawn, update, getSnapshot };
}
