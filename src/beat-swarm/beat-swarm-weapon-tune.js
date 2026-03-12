export function createBeatSwarmWeaponTuneTools(options = {}) {
  const weaponTuneSteps = Math.max(1, Math.trunc(Number(options.weaponTuneSteps) || 8));
  const drawgridTuneNotePalette = Array.isArray(options.drawgridTuneNotePalette)
    ? options.drawgridTuneNotePalette.slice()
    : [];
  const maxWeaponSlots = Math.max(1, Math.trunc(Number(options.maxWeaponSlots) || 3));
  const weaponTuneChainLength = Math.max(1, Math.trunc(Number(options.weaponTuneChainLength) || 2));
  const weaponLoadout = Array.isArray(options.weaponLoadout) ? options.weaponLoadout : [];
  const hasWeaponSubBoard = typeof options.hasWeaponSubBoard === 'function'
    ? options.hasWeaponSubBoard
    : () => false;
  const normalizeSwarmNoteName = typeof options.normalizeSwarmNoteName === 'function'
    ? options.normalizeSwarmNoteName
    : (noteName) => String(noteName || '').trim();
  const getRandomSwarmPentatonicNote = typeof options.getRandomSwarmPentatonicNote === 'function'
    ? options.getRandomSwarmPentatonicNote
    : () => 'C4';

  function createDefaultWeaponTune() {
    const notes = drawgridTuneNotePalette.slice();
    const rows = Math.max(1, notes.length);
    const steps = weaponTuneSteps;
    const active = Array.from({ length: steps }, () => true);
    const list = Array.from({ length: steps }, () => [Math.max(0, rows - 1)]);
    const disabled = Array.from({ length: steps }, () => []);
    return { kind: 'drawgrid', steps, notes, active, list, disabled };
  }

  function createRandomWeaponTune() {
    const base = createDefaultWeaponTune();
    const steps = Math.max(1, Math.trunc(Number(base.steps) || weaponTuneSteps));
    const notes = drawgridTuneNotePalette.slice();
    const rows = Math.max(1, notes.length);
    const active = Array.from({ length: steps }, () => false);
    const list = Array.from({ length: steps }, () => []);
    const disabled = Array.from({ length: steps }, () => []);
    for (let s = 0; s < steps; s++) {
      if (Math.random() >= 0.62) continue;
      const r = Math.max(0, Math.min(rows - 1, Math.trunc(Math.random() * rows)));
      active[s] = true;
      // Startup tune is monophonic so projectile count maps 1:1 to active notes.
      list[s] = [r];
    }
    if (!active.some(Boolean)) {
      const s = Math.max(0, Math.min(steps - 1, Math.trunc(Math.random() * steps)));
      const r = Math.max(0, Math.min(rows - 1, Math.trunc(Math.random() * rows)));
      active[s] = true;
      list[s] = [r];
    }
    return { kind: 'drawgrid', steps, notes, active, list, disabled };
  }

  function sanitizeWeaponTune(rawTune) {
    const base = createDefaultWeaponTune();
    const steps = weaponTuneSteps;
    const notes = drawgridTuneNotePalette.slice();
    const active = Array.from({ length: steps }, () => false);
    const list = Array.from({ length: steps }, () => []);
    const disabled = Array.from({ length: steps }, () => []);
    if (rawTune && Array.isArray(rawTune.cells)) {
      // Back-compat with earlier 2D tune grid format.
      for (let s = 0; s < steps; s++) {
        const col = Array.isArray(rawTune.cells[s]) ? rawTune.cells[s] : [];
        const picked = [];
        for (let r = 0; r < Math.min(notes.length, col.length); r++) if (col[r]) picked.push(r);
        if (picked.length) {
          active[s] = true;
          list[s] = picked;
        }
      }
    } else {
      const srcSteps = Math.max(1, Math.trunc(Number(rawTune?.steps) || base.steps || steps));
      const srcActive = Array.isArray(rawTune?.nodes?.active) ? rawTune.nodes.active : Array.isArray(rawTune?.active) ? rawTune.active : base.active;
      const srcList = Array.isArray(rawTune?.nodes?.list) ? rawTune.nodes.list : Array.isArray(rawTune?.list) ? rawTune.list : base.list;
      const srcDisabled = Array.isArray(rawTune?.nodes?.disabled) ? rawTune.nodes.disabled : Array.isArray(rawTune?.disabled) ? rawTune.disabled : base.disabled;
      for (let s = 0; s < steps; s++) {
        const srcCol = ((s % srcSteps) + srcSteps) % srcSteps;
        const on = !!srcActive?.[srcCol];
        const rowsRaw = Array.isArray(srcList?.[srcCol]) ? srcList[srcCol] : [];
        const rows = rowsRaw
          .map((v) => Math.trunc(Number(v)))
          .filter((v) => v >= 0 && v < notes.length);
        active[s] = on && rows.length > 0;
        list[s] = rows;
        disabled[s] = (Array.isArray(srcDisabled?.[srcCol]) ? srcDisabled[srcCol] : [])
          .map((v) => Math.trunc(Number(v)))
          .filter((v) => v >= 0 && v < notes.length);
      }
    }
    return { kind: 'drawgrid', steps, notes, active, list, disabled };
  }

  function getWeaponTuneSignature(tuneLike) {
    const tune = sanitizeWeaponTune(tuneLike);
    const steps = Math.max(1, Math.trunc(Number(tune?.steps) || weaponTuneSteps));
    const parts = [];
    for (let s = 0; s < steps; s++) {
      if (!tune.active?.[s]) continue;
      const rows = Array.isArray(tune.list?.[s]) ? tune.list[s].slice() : [];
      if (!rows.length) continue;
      rows.sort((a, b) => a - b);
      parts.push(`${s}:${rows.join('.')}`);
    }
    return `steps=${steps}|events=${parts.length}|sig=${parts.join(',')}`;
  }

  function createDistinctRandomWeaponTune(referenceTune) {
    const refSig = getWeaponTuneSignature(referenceTune);
    for (let i = 0; i < 16; i++) {
      const candidate = createRandomWeaponTune();
      if (getWeaponTuneSignature(candidate) !== refSig) return candidate;
    }
    // Extremely unlikely fallback: flip one step to force a different signature.
    const fallback = sanitizeWeaponTune(referenceTune);
    const steps = Math.max(1, Math.trunc(Number(fallback?.steps) || weaponTuneSteps));
    const rowCount = Math.max(1, Array.isArray(fallback?.notes) ? fallback.notes.length : drawgridTuneNotePalette.length);
    const step = Math.max(0, Math.min(steps - 1, Math.trunc(Math.random() * steps)));
    const row = Math.max(0, Math.min(rowCount - 1, Math.trunc(Math.random() * rowCount)));
    fallback.active[step] = true;
    fallback.list[step] = [row];
    return fallback;
  }

  function sanitizeWeaponTuneChain(rawChain) {
    const arr = Array.isArray(rawChain) ? rawChain : [];
    const out = [];
    for (const raw of arr) out.push(sanitizeWeaponTune(raw));
    return out;
  }

  function countWeaponTuneActiveEvents(tune) {
    let n = 0;
    const steps = Math.max(1, Math.trunc(Number(tune?.steps) || weaponTuneSteps));
    const active = Array.isArray(tune?.active) ? tune.active : [];
    const list = Array.isArray(tune?.list) ? tune.list : [];
    for (let s = 0; s < steps; s++) {
      if (!active[s]) continue;
      const rows = Array.isArray(list[s]) ? list[s] : [];
      n += rows.length;
    }
    return n;
  }

  function countWeaponTuneActiveColumns(tune) {
    let n = 0;
    const steps = Math.max(1, Math.trunc(Number(tune?.steps) || weaponTuneSteps));
    const active = Array.isArray(tune?.active) ? tune.active : [];
    const list = Array.isArray(tune?.list) ? tune.list : [];
    for (let s = 0; s < steps; s++) {
      if (!active[s]) continue;
      const rows = Array.isArray(list[s]) ? list[s] : [];
      if (rows.length > 0) n += 1;
    }
    return n;
  }

  function getWeaponSlotTuneChain(slotIndex) {
    const idx = Math.max(0, Math.min(maxWeaponSlots - 1, Math.trunc(Number(slotIndex) || 0)));
    const slot = weaponLoadout[idx];
    const baseChain = sanitizeWeaponTuneChain(slot?.tuneChain);
    const chain = baseChain.length ? baseChain : [sanitizeWeaponTune(slot?.tune)];
    let synthesized = chain.length !== baseChain.length;
    while (chain.length < weaponTuneChainLength) {
      const prev = chain[chain.length - 1] || chain[0];
      chain.push(createDistinctRandomWeaponTune(prev));
      synthesized = true;
    }
    if (chain.length > weaponTuneChainLength) chain.length = weaponTuneChainLength;
    if (synthesized && slot) {
      slot.tuneChain = chain.map((t) => sanitizeWeaponTune(t));
      slot.tune = sanitizeWeaponTune(chain[0]);
    }
    return chain;
  }

  function getWeaponTuneActivityStats(slotIndex) {
    const chain = getWeaponSlotTuneChain(slotIndex);
    let totalNotes = 0;
    let activeNotes = 0;
    for (const tune of chain) {
      const steps = Math.max(1, Math.trunc(Number(tune?.steps) || weaponTuneSteps));
      totalNotes += steps;
      activeNotes += countWeaponTuneActiveColumns(tune);
    }
    if (totalNotes <= 0) totalNotes = weaponTuneSteps;
    return { activeNotes, totalNotes };
  }

  function shouldMuteProjectileStageSound(slotIndex) {
    const idx = Math.max(0, Math.min(maxWeaponSlots - 1, Math.trunc(Number(slotIndex) || 0)));
    return hasWeaponSubBoard(idx);
  }

  function getWeaponTuneDamageScale(slotIndex) {
    const stats = getWeaponTuneActivityStats(slotIndex);
    const active = Math.max(0, Number(stats.activeNotes) || 0);
    const total = Math.max(1, Number(stats.totalNotes) || weaponTuneSteps);
    if (active <= 0) return 1;
    const scale = total / active;
    return Math.max(0.25, Math.min(8, Number(scale) || 1));
  }

  function getWeaponTuneStepNotes(slotIndex, beatIndex) {
    const idx = Math.max(0, Math.min(maxWeaponSlots - 1, Math.trunc(Number(slotIndex) || 0)));
    const chain = getWeaponSlotTuneChain(idx);
    let totalSteps = 0;
    for (const tune of chain) totalSteps += Math.max(1, Math.trunc(Number(tune?.steps) || weaponTuneSteps));
    totalSteps = Math.max(1, totalSteps);
    let rem = ((Math.trunc(Number(beatIndex) || 0) % totalSteps) + totalSteps) % totalSteps;
    let tune = chain[0];
    let step = 0;
    for (const candidate of chain) {
      const steps = Math.max(1, Math.trunc(Number(candidate?.steps) || weaponTuneSteps));
      if (rem < steps) {
        tune = candidate;
        step = rem;
        break;
      }
      rem -= steps;
    }
    if (!Array.isArray(tune?.active) || !tune.active[step]) return [];
    const colRows = Array.isArray(tune?.list?.[step]) ? tune.list[step] : [];
    const out = [];
    for (const rRaw of colRows) {
      const r = Math.trunc(Number(rRaw));
      if (!(r >= 0 && r < tune.notes.length)) continue;
      const note = normalizeSwarmNoteName(tune.notes[r]) || getRandomSwarmPentatonicNote();
      out.push(note);
    }
    return out;
  }

  function hasWeaponTuneContent(slotIndex) {
    const chain = getWeaponSlotTuneChain(slotIndex);
    for (const tune of chain) {
      if (countWeaponTuneActiveEvents(sanitizeWeaponTune(tune)) > 0) return true;
    }
    return false;
  }

  function ensureWeaponHasStarterTune(slotIndex) {
    const idx = Math.max(0, Math.min(maxWeaponSlots - 1, Math.trunc(Number(slotIndex) || 0)));
    if (hasWeaponTuneContent(idx)) return;
    const starter = createRandomWeaponTune();
    if (weaponLoadout[idx]) {
      weaponLoadout[idx].tune = starter;
      weaponLoadout[idx].tuneChain = [
        sanitizeWeaponTune(starter),
        sanitizeWeaponTune(createDistinctRandomWeaponTune(starter)),
      ];
    }
  }

  function seedDefaultWeaponLoadout() {
    for (let i = 0; i < weaponLoadout.length; i++) {
      const slot = weaponLoadout[i];
      if (!slot) continue;
      slot.name = `Weapon ${i + 1}`;
      slot.stages = [];
      slot.tune = createDefaultWeaponTune();
      slot.tuneChain = [sanitizeWeaponTune(slot.tune), sanitizeWeaponTune(slot.tune)];
    }
    // Default starter: Projectile -> Explosion.
    if (weaponLoadout[0]) {
      weaponLoadout[0].stages = [
        { archetype: 'projectile', variant: 'standard' },
        { archetype: 'aoe', variant: 'explosion' },
      ];
      const randomStarterTune = createRandomWeaponTune();
      weaponLoadout[0].tune = randomStarterTune;
      weaponLoadout[0].tuneChain = [
        sanitizeWeaponTune(randomStarterTune),
        sanitizeWeaponTune(createDistinctRandomWeaponTune(randomStarterTune)),
      ];
    }
  }

  return Object.freeze({
    countWeaponTuneActiveColumns,
    countWeaponTuneActiveEvents,
    createDefaultWeaponTune,
    createDistinctRandomWeaponTune,
    createRandomWeaponTune,
    ensureWeaponHasStarterTune,
    getWeaponSlotTuneChain,
    getWeaponTuneActivityStats,
    getWeaponTuneDamageScale,
    getWeaponTuneSignature,
    getWeaponTuneStepNotes,
    hasWeaponTuneContent,
    sanitizeWeaponTune,
    sanitizeWeaponTuneChain,
    seedDefaultWeaponLoadout,
    shouldMuteProjectileStageSound,
  });
}
