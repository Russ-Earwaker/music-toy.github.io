// src/drawgrid-init.js
// Boot drawing grid only for panels with data-toy="drawgrid".
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { initToyUI } from '../toyui.js';

function drawgridInitDebugEnabled() {
  try { if (window.__DG_INIT_DEBUG === true) return true; } catch {}
  try { if (localStorage.getItem('DG_INIT_DEBUG') === '1') return true; } catch {}
  return false;
}

function drawgridStateSignature(stateLike) {
  const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
  const active = Array.isArray(st?.nodes?.active) ? st.nodes.active : Array.isArray(st?.active) ? st.active : [];
  const list = Array.isArray(st?.nodes?.list) ? st.nodes.list : Array.isArray(st?.list) ? st.list : [];
  const steps = Math.max(active.length, list.length);
  const parts = [];
  for (let i = 0; i < steps; i++) {
    if (!active[i]) continue;
    const rows = Array.isArray(list[i]) ? list[i].slice().map((v) => Math.trunc(Number(v))).filter((v) => Number.isFinite(v)) : [];
    if (!rows.length) continue;
    rows.sort((a, b) => a - b);
    parts.push(`${i}:${rows.join('.')}`);
  }
  return `steps=${steps}|events=${parts.length}|sig=${parts.join(',')}`;
}

export function initDrawGrid(panel){
  if (!panel || panel.__drawgridInit) return panel?.__drawToy;
  const artOwnerId = String(panel?.dataset?.artOwnerId || '').trim();
  const artPanel = artOwnerId ? document.getElementById(artOwnerId) : null;
  const isBeatSwarmSubboard = String(artPanel?.dataset?.beatSwarmSubboard || '') === '1';
  let revealDeferredForHydration = false;
  let revealFallbackTimer = 0;
  let waitForBeatSwarmReveal = false;
  const revealPanel = () => {
    if (revealFallbackTimer) {
      try { clearTimeout(revealFallbackTimer); } catch {}
      revealFallbackTimer = 0;
    }
    try { panel.style.visibility = ''; } catch {}
  };
  if (isBeatSwarmSubboard) {
    try { panel.dataset.disableRandomEvents = '0'; } catch {}
    try { panel.style.visibility = 'hidden'; } catch {}
    try { panel.dataset.beatSwarmAwaitReveal = '1'; } catch {}
    waitForBeatSwarmReveal = true;
    try {
      const onReveal = () => {
        try { panel.dataset.beatSwarmAwaitReveal = '0'; } catch {}
        revealPanel();
      };
      panel.__beatSwarmDeferredRevealHandler = onReveal;
      panel.addEventListener('beat-swarm:reveal-subboard-panel', onReveal, { once: true });
    } catch {}
  }
  const initDebugAtCreate = drawgridInitDebugEnabled();
  // Use the canonical instrument_id directly to avoid a race condition where
  // the display name lookup fails because the instrument catalog hasn't loaded yet.
  initToyUI(panel, { toyName: 'Draw Grid', defaultInstrument: 'acoustic_guitar', });
  const toy = createDrawGrid(panel, { toyId: panel.id });
  if (initDebugAtCreate) {
    try { console.log('[drawgrid-init] create', { id: panel.id, toyId: panel.id }); } catch {}
  }
  try {
    if (panel.dataset.chainParent) {
      panel.dataset.autoplay = 'chain';
    }
  } catch {}
  connectDrawGridToPlayer(panel);
  // --- Hydrate drawgrid state (pending stash or persisted local) ---
  try {
    let pending = panel.__pendingDrawGridState;
    const initDebug = drawgridInitDebugEnabled() || isBeatSwarmSubboard;
    if (initDebug) {
      try {
        console.log('[BS-SUBBOARD-INIT] drawgrid-init:enter', {
          panelId: panel?.id || null,
          artOwnerId: artOwnerId || null,
          isBeatSwarmSubboard,
          hasPendingState: !!pending,
          skipPersistedRestore: String(panel?.dataset?.skipDrawgridPersistedRestore || '') === '1',
        });
      } catch {}
    }
    if (!pending) {
      if (isBeatSwarmSubboard) {
        try { panel.dataset.skipDrawgridPersistedRestore = '1'; } catch {}
        pending = window.BeatSwarmMode?.getSubBoardPendingDrawgridState?.(artOwnerId, panel?.id || '') || null;
        if (pending && typeof pending === 'object') {
          try { panel.__pendingDrawGridState = pending; } catch {}
        }
      }
    }
    if (pending && typeof toy?.setState === 'function') {
      if (initDebug) {
        console.log('[drawgrid-init] HYDRATE (pending)', panel.id, {
          hasStrokes: !!(pending?.strokes?.length),
          activeCols: Array.isArray(pending?.nodes?.active) ? pending.nodes.active.filter(Boolean).length : 0,
          steps: typeof pending?.steps === 'number' ? pending.steps : undefined,
          signature: drawgridStateSignature(pending),
        });
      }
      if (typeof toy?.setState === 'function') toy.setState(pending);
      else toy.restoreState(pending);
      if (initDebug) {
        setTimeout(() => {
          try {
            const st = toy.getState?.();
            console.log('[drawgrid-init] HYDRATE (post-50ms)', panel.id, {
              signature: drawgridStateSignature(st),
            });
          } catch {}
        }, 50);
      }
      revealDeferredForHydration = !!isBeatSwarmSubboard;
      if (revealDeferredForHydration) {
        // setState applies on nested rAF; hold visibility until that settles.
        const pendingSignature = drawgridStateSignature(pending);
        setTimeout(() => {
          try {
            const st = toy.getState?.();
            const nowSig = drawgridStateSignature(st);
            if (nowSig !== pendingSignature) {
              if (typeof toy?.setState === 'function') toy.setState(pending);
              else if (typeof toy?.restoreState === 'function') toy.restoreState(pending);
              if (initDebug) {
                console.log('[drawgrid-init] HYDRATE (reapply-before-reveal)', panel.id, {
                  from: nowSig,
                  to: pendingSignature,
                });
              }
            } else if (initDebug) {
              console.log('[drawgrid-init] HYDRATE (reapply-before-reveal-skip)', panel.id, {
                signature: nowSig,
              });
            }
          } catch {}
        }, 520);
        revealFallbackTimer = setTimeout(() => {
          if (initDebug) {
            try {
              const st = toy.getState?.();
              console.log('[drawgrid-init] HYDRATE (pre-reveal)', panel.id, {
                signature: drawgridStateSignature(st),
              });
            } catch {}
          }
          if (!waitForBeatSwarmReveal) revealPanel();
        }, 760);
      }
      try { delete panel.__pendingDrawGridState; } catch {}
    } else {
      // Try persisted localStorage state if no pending stash
      const local = panel.__getDrawgridPersistedState?.();
      if (local && (typeof toy?.setState === 'function' || typeof toy?.restoreState === 'function')) {
        if (initDebug) {
          console.log('[drawgrid-init] HYDRATE (localStorage)', panel.id, {
            hasStrokes: !!(local?.strokes?.length),
            activeCols: Array.isArray(local?.nodes?.active) ? local.nodes.active.filter(Boolean).length : 0,
            steps: typeof local?.steps === 'number' ? local.steps : undefined,
          });
        }
        if (typeof toy?.setState === 'function') toy.setState(local);
        else toy.restoreState(local);
      } else if (initDebug) {
        console.log('[drawgrid-init] HYDRATE (none)', panel.id);
      }
    }
  } catch (err) {
    console.warn('[drawgrid-init] hydrate failed', err);
  } finally {
    if (isBeatSwarmSubboard) {
      if (!revealDeferredForHydration) {
        try { panel.style.visibility = ''; } catch {}
      }
    }
  }
  try {
    setTimeout(() => {
      try {
        window.Persistence?.markDirty?.();
        window.Persistence?.flushAutosaveNow?.();
      } catch {}
    }, 0);
  } catch {}
  panel.__drawgridInit = true;
  panel.__drawToy = toy;
  return toy;
}

