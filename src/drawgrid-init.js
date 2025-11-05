// src/drawgrid-init.js
// Boot drawing grid only for panels with data-toy="drawgrid".
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { initToyUI } from './toyui.js';

const DRAWGRID_INIT_DEBUG = false;

export function initDrawGrid(panel){
  if (!panel || panel.__drawgridInit) return panel?.__drawToy;
  // Use the canonical instrument_id directly to avoid a race condition where
  // the display name lookup fails because the instrument catalog hasn't loaded yet.
  initToyUI(panel, { toyName: 'Draw Grid', defaultInstrument: 'acoustic_guitar', });
  const toy = createDrawGrid(panel, { toyId: panel.id });
  if (DRAWGRID_INIT_DEBUG) {
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
    const pending = panel.__pendingDrawGridState;
    if (pending && typeof toy?.setState === 'function') {
      if (DRAWGRID_INIT_DEBUG) {
        console.log('[drawgrid-init] HYDRATE (pending)', panel.id, {
          hasStrokes: !!(pending?.strokes?.length),
          hasErase: !!(pending?.eraseStrokes?.length),
          activeCols: Array.isArray(pending?.nodes?.active) ? pending.nodes.active.filter(Boolean).length : 0,
          steps: typeof pending?.steps === 'number' ? pending.steps : undefined,
        });
      }
      toy.setState(pending);
      try { delete panel.__pendingDrawGridState; } catch {}
    } else {
      // Try persisted localStorage state if no pending stash
      const local = panel.__getDrawgridPersistedState?.();
      if (local && typeof toy?.setState === 'function') {
        if (DRAWGRID_INIT_DEBUG) {
          console.log('[drawgrid-init] HYDRATE (localStorage)', panel.id, {
            hasStrokes: !!(local?.strokes?.length),
            hasErase: !!(local?.eraseStrokes?.length),
            activeCols: Array.isArray(local?.nodes?.active) ? local.nodes.active.filter(Boolean).length : 0,
            steps: typeof local?.steps === 'number' ? local.steps : undefined,
          });
        }
        toy.setState(local);
      } else if (DRAWGRID_INIT_DEBUG) {
        console.log('[drawgrid-init] HYDRATE (none)', panel.id);
      }
    }
  } catch (err) {
    console.warn('[drawgrid-init] hydrate failed', err);
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
