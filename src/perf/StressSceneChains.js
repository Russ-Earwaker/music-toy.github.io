// src/perf/StressSceneChains.js
// Chained-toy stress scene generator (seeded randomness, deterministic).

import { getCommittedState } from '../zoom/ZoomCoordinator.js';

function clearSceneViaSnapshot() {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') {
    console.warn('[StressSceneChains] Persistence API not ready');
    return false;
  }
  const snap = P.getSnapshot();
  snap.toys = [];
  snap.chains = [];
  const ok = !!P.applySnapshot(snap);
  try { window.resetChainState?.({ clearDom: true }); } catch {}
  return ok;
}

// Small, deterministic RNG (seeded)
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function debugDumpToySnapshot(panelId, tag) {
  if (!panelId) return;
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function') return;
  try {
    const snap = P.getSnapshot();
    const t = (snap.toys || []).find((x) => x && (x.id === panelId || x.toyId === panelId));
    if (!t) {
      console.log('[StressSceneChains][dumpSnap]', { tag, panelId, found: false });
      return;
    }
    const stateStr = t.state ? JSON.stringify(t.state).slice(0, 2000) : '';
    console.log('[StressSceneChains][dumpSnap]', {
      tag,
      panelId,
      toyKeys: Object.keys(t),
      stateKeys: Object.keys(t.state || {}),
      state: t.state,
    });
    console.log('[StressSceneChains][dumpSnap][stateJSON]', stateStr);
  } catch (e) {
    console.warn('[StressSceneChains] debugDumpToySnapshot failed', e);
  }
}

function makeLoopgridState(rand, {
  steps = 8,
  density = 0.33,
  noteMin = 0,
  noteMax = 35,
  forceAtLeastOne = true,
} = {}) {
  const on = new Array(steps).fill(false).map(() => rand() < density);

  if (forceAtLeastOne && !on.some(Boolean)) {
    on[Math.floor(rand() * steps)] = true;
  }

  // loopgrid palette is typically 12 * octaves (grid-core uses 36 values by default)
  const noteIndices = new Array(steps).fill(0).map(() => {
    const n = noteMin + Math.floor(rand() * (noteMax - noteMin + 1));
    return Math.max(noteMin, Math.min(noteMax, n));
  });

  return { steps: on, noteIndices };
}

function dumpPanelKeys(panel, tag) {
  try {
    const keys = Object.keys(panel).sort();
    const dkeys = Object.keys(panel.dataset || {}).sort();
    console.log(`[StressSceneChains][dump:${tag}]`, {
      id: panel.id,
      className: panel.className,
      keys: keys.filter(k => !k.startsWith('__perf')).slice(0, 80),
      dataset: dkeys,
    });

    // Common attachment points worth checking explicitly
    const suspects = [
      '__toy', '_toy', 'toy', '__instance', '__app', '__widget',
      'controller', 'model', 'api', 'state', 'loopgrid', 'grid',
    ];
    const hit = {};
    for (const s of suspects) hit[s] = panel[s] ? typeof panel[s] : null;
    console.log(`[StressSceneChains][dump:${tag}] suspects`, hit);
  } catch (e) {
    console.warn('[StressSceneChains] dump failed', e);
  }
}

function tryApplyStateViaPersistence(panelId, state) {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') return false;

  try {
    const snap = P.getSnapshot();
    const t = (snap.toys || []).find((x) => x && (x.id === panelId || x.toyId === panelId));
    if (!t) return false;

    t.state = t.state || {};

    // Loopgrid snapshot schema (confirmed by dumpSnap):
    // state.steps (bool[]), state.noteIndices (number[]), state.notes (midi-ish number[]), state.instrument (string)
    const existingSteps = Array.isArray(t.state.steps) ? t.state.steps : null;
    const stepCount = existingSteps ? existingSteps.length : (Array.isArray(state.steps) ? state.steps.length : 8);

    // Resize/crop our generated arrays to whatever the toy expects
    const steps = new Array(stepCount).fill(false).map((_, i) => !!state.steps?.[i % (state.steps?.length || 1)]);
    const noteIndices = new Array(stepCount).fill(0).map((_, i) => {
      const v = state.noteIndices?.[i % (state.noteIndices?.length || 1)] ?? 12;
      return Math.max(0, Math.min(35, v));
    });

    // Map noteIndex to a MIDI-ish note value.
    // Dump shows noteIndex 12 -> note 60 (C4), so use 48 + index.
    const notes = noteIndices.map((ni) => 48 + ni);

    // Write the real keys the toy uses
    t.state.steps = steps;
    t.state.noteIndices = noteIndices;
    t.state.notes = notes;

    // Keep existing instrument unless explicitly provided
    if (state.instrument) t.state.instrument = state.instrument;

    return !!P.applySnapshot(snap);
  } catch {
    return false;
  }
}

function applyLoopgridStateToPanel(panel, state) {
  if (!panel) return false;

  // Prefer a toy instance API if present.
  const toy = panel.__toy || panel._toy || panel.toy || panel.__instance;
  try {
    if (toy) {
      if (typeof toy.setState === 'function') { toy.setState(state); return true; }
      if (typeof toy.loadState === 'function') { toy.loadState(state); return true; }
      if (typeof toy.applyState === 'function') { toy.applyState(state); return true; }
      if (typeof toy.setPattern === 'function') { toy.setPattern(state); return true; }
    }
  } catch {}

  // Next best: push into snapshot if possible (authoritative for toy state).
  if (panel.id && tryApplyStateViaPersistence(panel.id, state)) return true;

  return false;
}

export function buildChainedLoopgridStress({
  // layout
  chains = 4,            // number of chain heads
  chainLength = 10,      // toys per chain
  gridCols = 2,          // how many heads per row
  headSpacingX = 520,
  headSpacingY = 420,
  linkSpacingX = 420,    // spacing between linked toys along the chain
  jitterY = 80,

  // content
  seed = 1337,
  density = 0.33,
  noteMin = 0,
  noteMax = 35,
  steps = 8,

  // misc
  toyType = 'loopgrid',
} = {}) {
  const factory = window.MusicToyFactory;
  if (!factory || typeof factory.create !== 'function') {
    console.warn('[StressSceneChains] MusicToyFactory.create not ready');
    return false;
  }

  clearSceneViaSnapshot();

  const cam = getCommittedState();
  const centerX = cam.x;
  const centerY = cam.y;

  const rand = mulberry32(seed);

  // Compute head grid
  const cols = Math.max(1, gridCols | 0);
  const rows = Math.ceil(chains / cols);

  const totalW = (cols - 1) * headSpacingX;
  const totalH = (rows - 1) * headSpacingY;

  /** @type {Array<Array<HTMLElement>>} */
  const allChains = [];

  for (let i = 0; i < chains; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;

    const headX = centerX + (c * headSpacingX - totalW / 2);
    const headY = centerY + (r * headSpacingY - totalH / 2);

    const panels = [];

    for (let k = 0; k < chainLength; k++) {
      const x = headX + k * linkSpacingX;
      const jitter = Math.max(0, Number.isFinite(jitterY) ? jitterY : 0);
      const y = headY + Math.round((rand() * 2 - 1) * jitter); // optional vertical jitter

      let panel = null;
      try {
        panel = factory.create(toyType, { centerX: x, centerY: y, autoCenter: false, allowOffscreen: true, skipSpawnPlacement: true });
      } catch (err) {
        console.warn('[StressSceneChains] create failed', { toyType, i, k }, err);
      }
      if (!panel) continue;

      // Pre-seed state BEFORE init (createToyPanelAt initializes on setTimeout(0))
      try {
        const st = makeLoopgridState(rand, {
          steps,
          density,
          noteMin,
          noteMax,
          forceAtLeastOne: true,
        });
        // store for later application (after init)
        panel.__perfLoopgridSeedState = {
          steps: st.steps,
          noteIndices: st.noteIndices,
        };
      } catch (err) {
        console.warn('[StressSceneChains] seed state failed', err);
      }

      panels.push(panel);
    }

    allChains.push(panels);
  }

  // Link chains once IDs exist in DOM. (Two rAFs gives layout/init a chance to run.)
  const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
  raf(() => raf(() => {
    try {
      for (const panels of allChains) {
        for (let k = 0; k < panels.length - 1; k++) {
          const a = panels[k];
          const b = panels[k + 1];
          if (!a?.id || !b?.id) continue;

          a.dataset.nextToyId = b.id;
          a.dataset.chainHasChild = '1';

          b.dataset.prevToyId = a.id;
          b.dataset.chainParent = a.id;
        }
      }

      // Rebuild chain state + connectors
      window.updateChains?.();
      window.updateAllChainUIs?.();
      window.scheduleChainRedraw?.();

      // Force-apply seeded patterns after toys have had a chance to init.
      // This is what makes "playing" actually do work.
      let applied = 0;
      let attempted = 0;
      for (const panels of allChains) {
        for (const p of panels) {
          const st = p && p.__perfLoopgridSeedState;
          if (!st) continue;
          attempted++;
          if (applyLoopgridStateToPanel(p, st)) applied++;
        }
      }

      // Kick updates/redraws so new state is reflected ASAP.
      try {
        window.updateAllToys?.();
        window.scheduleAllToysRedraw?.();
        window.requestAnimationFrame?.(() => {
          window.updateAllToys?.();
          window.scheduleAllToysRedraw?.();
        });
      } catch {}

      // Mark dirty so autosave snapshots capture this test scene
      window.Persistence?.markDirty?.();

      console.log('[StressSceneChains] built', {
        toyType,
        chains: allChains.length,
        chainLength,
        seed,
        density,
        steps,
      });

      console.log('[StressSceneChains] seeded patterns', { attempted, applied });

      // Count how many steps were actually "on" in the seeded data for sanity.
      let onCount = 0;
      for (const panels of allChains) {
        for (const p of panels) {
          const st = p && p.__perfLoopgridSeedState;
          if (!st || !Array.isArray(st.steps)) continue;
          onCount += st.steps.reduce((acc, v) => acc + (v ? 1 : 0), 0);
        }
      }
      console.log('[StressSceneChains] seededOnCount', { onCount, attempted, applied });
      try { window.__LAST_STRESS_META = { attempted, applied, onCount }; } catch {}

      debugDumpToySnapshot(allChains?.[0]?.[0]?.id, 'afterBuildFirst');

      // If we failed to apply to any panel, dump one panel to discover the actual API surface.
      if (attempted > 0 && applied === 0) {
        const first = allChains?.[0]?.[0];
        if (first) dumpPanelKeys(first, 'firstPanel');
      }
    } catch (err) {
      console.warn('[StressSceneChains] finalize failed', err);
    }
  }));

  return true;
}
