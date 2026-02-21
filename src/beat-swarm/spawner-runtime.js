export function createBeatSwarmSpawnerRuntime({ getLayerEl, onSpawn } = {}) {
  const typeDefs = new Map();
  const activeEntries = [];
  let running = false;

  const clearEntries = () => {
    while (activeEntries.length) {
      const entry = activeEntries.pop();
      const def = typeDefs.get(entry.type);
      if (!def) continue;
      try { def.teardown?.(entry, { onSpawn }); } catch {}
      try { def.restore?.(entry, { onSpawn }); } catch {}
    }
  };

  const registerType = (typeName, def) => {
    const type = String(typeName || '').trim();
    if (!type || !def) return false;
    typeDefs.set(type, def);
    return true;
  };

  const enter = () => {
    if (running) return true;
    const layerEl = getLayerEl?.();
    if (!layerEl) return false;
    running = true;
    clearEntries();
    for (const [type, def] of typeDefs.entries()) {
      const panels = Array.isArray(def.queryPanels?.()) ? def.queryPanels() : [];
      for (const panel of panels) {
        const entry = {
          type,
          panel,
          layerEl,
          state: Object.create(null),
        };
        try { def.capture?.(entry, { onSpawn }); } catch {}
        try { def.setup?.(entry, { onSpawn }); } catch {}
        activeEntries.push(entry);
      }
    }
    return true;
  };

  const update = (dt) => {
    if (!running) return;
    for (const entry of activeEntries) {
      const def = typeDefs.get(entry.type);
      if (!def) continue;
      try { def.update?.(entry, { dt, onSpawn }); } catch {}
    }
  };

  const setEnabled = (selectorFn) => {
    if (typeof selectorFn !== 'function') return false;
    for (let i = 0; i < activeEntries.length; i++) {
      const entry = activeEntries[i];
      const next = !!selectorFn(entry, i);
      entry.state.enabled = next;
      const def = typeDefs.get(entry.type);
      try { def?.onEnabledChange?.(entry, next); } catch {}
    }
    return true;
  };

  const exit = () => {
    if (!running) return true;
    running = false;
    clearEntries();
    return true;
  };

  return {
    registerType,
    enter,
    update,
    setEnabled,
    exit,
    isActive: () => running,
    getActiveEntries: () => Array.from(activeEntries),
  };
}

export function registerLoopgridSpawnerType(runtime, { flashDecay = 3.2 } = {}) {
  if (!runtime || typeof runtime.registerType !== 'function') return false;

  const getCubeClientPoint = (panel, col) => {
    const host = panel?.querySelector?.('.sequencer-wrap') || panel?.querySelector?.('.toy-body') || panel;
    const r = host?.getBoundingClientRect?.();
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    const idx = Math.max(0, Math.min(7, Math.trunc(Number(col) || 0)));
    return {
      x: r.left + ((idx + 0.5) / 8) * r.width,
      y: r.top + (r.height * 0.5),
    };
  };

  const createProxy = (entry, steps) => {
    const proxy = document.createElement('div');
    proxy.className = 'beat-swarm-rhythm-proxy';
    const cubes = [];
    const flash = Array.from({ length: 8 }, () => 0);
    for (let i = 0; i < 8; i++) {
      const cube = document.createElement('div');
      cube.className = 'beat-swarm-rhythm-cube';
      cube.classList.toggle('is-active-note', !!steps?.[i]);
      proxy.appendChild(cube);
      cubes.push(cube);
    }
    entry.layerEl.appendChild(proxy);
    entry.state.proxyEl = proxy;
    entry.state.cubeEls = cubes;
    entry.state.flash = flash;
  };

  const updateCubeActiveFlags = (entry) => {
    const steps = Array.isArray(entry.panel?.__gridState?.steps) ? entry.panel.__gridState.steps : [];
    const cubes = Array.isArray(entry.state.cubeEls) ? entry.state.cubeEls : [];
    for (let i = 0; i < cubes.length; i++) {
      cubes[i].classList.toggle('is-active-note', !!steps[i]);
    }
  };

  const syncProxyGeometry = (entry) => {
    const proxy = entry.state.proxyEl;
    if (!proxy) return;
    const host = entry.panel?.querySelector?.('.sequencer-wrap') || entry.panel?.querySelector?.('.toy-body') || entry.panel;
    const r = host?.getBoundingClientRect?.();
    if (!r || !(r.width > 0) || !(r.height > 0)) {
      proxy.style.opacity = '0';
      return;
    }
    proxy.style.opacity = '1';
    proxy.style.left = `${r.left}px`;
    proxy.style.top = `${r.top}px`;
    proxy.style.width = `${r.width}px`;
    proxy.style.height = `${r.height}px`;
  };

  return runtime.registerType('loopgrid', {
    queryPanels: () => Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]')),
    capture: (entry) => {
      entry.state.display = entry.panel.style.display;
      entry.state.visibility = entry.panel.style.visibility;
      entry.state.pointerEvents = entry.panel.style.pointerEvents;
      entry.state.playListener = null;
      entry.state.updateListener = null;
      entry.state.proxyEl = null;
      entry.state.cubeEls = null;
      entry.state.flash = null;
    },
    setup: (entry, { onSpawn }) => {
      const panel = entry.panel;
      const steps = Array.isArray(panel?.__gridState?.steps) ? panel.__gridState.steps : [];
      const hasNotes = steps.some(Boolean);
      if (!hasNotes) {
        panel.style.display = 'none';
        entry.state.hasContent = false;
        entry.state.enabled = false;
        return;
      }

      entry.state.hasContent = true;
      entry.state.enabled = true;
      panel.classList.add('beat-swarm-rhythm-spawner');
      panel.style.visibility = 'hidden';
      panel.style.pointerEvents = 'none';
      createProxy(entry, steps);

      const onPlayCol = (ev) => {
        if (!entry.state.enabled) return;
        const col = Number(ev?.detail?.col);
        if (!Number.isFinite(col)) return;
        const idx = Math.max(0, Math.min(7, Math.trunc(col)));
        const liveSteps = Array.isArray(panel?.__gridState?.steps) ? panel.__gridState.steps : null;
        if (!liveSteps || !liveSteps[idx]) return;

        if (Array.isArray(entry.state.flash)) entry.state.flash[idx] = 1;
        const cube = entry.state.cubeEls?.[idx];
        if (cube) {
          cube.classList.add('is-hit');
          setTimeout(() => { try { cube.classList.remove('is-hit'); } catch {} }, 140);
        }

        const pt = getCubeClientPoint(panel, idx);
        if (!pt) return;
        try { onSpawn?.({ type: 'loopgrid', panel, col: idx, point: pt }); } catch {}
      };
      panel.addEventListener('loopgrid:playcol', onPlayCol);
      entry.state.playListener = onPlayCol;

      const onUpdate = () => updateCubeActiveFlags(entry);
      panel.addEventListener('loopgrid:update', onUpdate);
      entry.state.updateListener = onUpdate;
    },
    update: (entry, { dt }) => {
      if (!entry.state.hasContent) return;
      syncProxyGeometry(entry);
      entry.state.proxyEl?.classList?.toggle?.('is-disabled', !entry.state.enabled);
      const flash = entry.state.flash;
      const cubes = entry.state.cubeEls;
      if (Array.isArray(flash) && Array.isArray(cubes)) {
        for (let i = 0; i < cubes.length; i++) {
          flash[i] = Math.max(0, (flash[i] || 0) - (flashDecay * (Number(dt) || 0)));
          cubes[i].style.setProperty('--bs-flash', `${flash[i].toFixed(3)}`);
        }
      }
    },
    onEnabledChange: (entry, enabled) => {
      const proxy = entry?.state?.proxyEl;
      if (!proxy) return;
      proxy.classList.toggle('is-disabled', !enabled);
    },
    teardown: (entry) => {
      const panel = entry.panel;
      const playListener = entry.state.playListener;
      const updateListener = entry.state.updateListener;
      if (playListener) {
        try { panel.removeEventListener('loopgrid:playcol', playListener); } catch {}
      }
      if (updateListener) {
        try { panel.removeEventListener('loopgrid:update', updateListener); } catch {}
      }
      try { entry.state.proxyEl?.remove?.(); } catch {}
    },
    restore: (entry) => {
      const panel = entry.panel;
      panel.classList.remove('beat-swarm-rhythm-spawner');
      panel.style.pointerEvents = entry.state.pointerEvents ?? '';
      panel.style.visibility = entry.state.visibility ?? '';
      panel.style.display = entry.state.display ?? '';
    },
  });
}
