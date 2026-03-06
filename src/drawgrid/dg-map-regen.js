// src/drawgrid/dg-map-regen.js
// Regenerate node map from strokes.

export function createDgMapRegen({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function isBeatSwarmSubboardPanel() {
    try {
      const ownerId = String(s?.panel?.dataset?.artOwnerId || s?.panel?.dataset?.artOwnerID || '').trim();
      if (!ownerId) return false;
      const owner = document.getElementById(ownerId);
      return String(owner?.dataset?.beatSwarmSubboard || '') === '1';
    } catch {
      return false;
    }
  }

  function processGeneratorStroke(stroke, newMap, newGroups) {
    const partial = d.snapToGridFromStroke(stroke);
    const filledNodes = d.fillGapsInNodeArray(partial.nodes, s.cols);

    for (let c = 0; c < s.cols; c++) {
      if (filledNodes[c]?.size > 0) {
        filledNodes[c].forEach(row => {
          newMap.nodes[c].add(row);
          if (stroke.generatorId) {
            const stack = newGroups[c].get(row) || [];
            if (!stack.includes(stroke.generatorId)) stack.push(stroke.generatorId);
            newGroups[c].set(row, stack);
          }
        });

        if (partial.nodes[c]?.size === 0) {
          if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
          filledNodes[c].forEach(row => newMap.disabled[c].add(row));
        }
        // Add any nodes that were explicitly marked as disabled by the snapping logic (e.g., out of bounds)
        if (partial.disabled && partial.disabled[c]?.size > 0) {
          if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
          partial.disabled[c].forEach(row => newMap.disabled[c].add(row));
        }
      }
    }
  }

  function regenerateMapFromStrokes() {
    const regenSource = s.__dgRegenSource || 'unknown';
    s.__dgRegenSource = '';
    const sourceLower = String(regenSource || '').toLowerCase();
    const isUserEditSource =
      sourceLower.includes('stroke-commit') ||
      sourceLower.includes('randomize');
    if (isUserEditSource) s.__dgPreserveNodesOverStrokes = false;
    const beatSwarmSubboard = isBeatSwarmSubboardPanel();
    if ((s.__dgPreserveNodesOverStrokes || beatSwarmSubboard) && s.currentMap && !isUserEditSource) {
      // Keep externally hydrated node map authoritative (Beat Swarm subboard),
      // while still allowing stroke redraw for the animated visual guide line.
      try { d.drawNodes(s.currentMap.nodes); } catch {}
      try { d.drawGrid(); } catch {}
      if (d.DG_SINGLE_CANVAS) {
        d.__dgMarkSingleCanvasDirty(s.panel);
        try { d.compositeSingleCanvas(); } catch {}
      }
      return;
    }
    const isZoomed = s.panel.classList.contains('toy-zoomed');
    const newMap = {
      active: Array(s.cols).fill(false),
      nodes: Array.from({ length: s.cols }, () => new Set()),
      disabled: Array.from({ length: s.cols }, () => new Set())
    };
    const newGroups = Array.from({ length: s.cols }, () => new Map());

    if (isZoomed) {
      // Advanced view: snap each generator line separately and union nodes.
      const gens = s.strokes.filter(st => st.generatorId);
      gens.forEach(st => processGeneratorStroke(st, newMap, newGroups));
    } else {
      // Standard view: keep a single generator line to avoid double nodes.
      const gens = s.strokes.filter(st => st.generatorId);
      if (gens.length > 0) {
        const specialGen = gens.find(st => st.isSpecial) || gens[gens.length - 1];
        if (specialGen) processGeneratorStroke(specialGen, newMap, newGroups);
      } else {
        // Prefer a special stroke, otherwise use the latest stroke.
        const specialStroke = s.strokes.find(st => st.isSpecial) || (s.strokes.length ? s.strokes[s.strokes.length - 1] : null);
        if (specialStroke) processGeneratorStroke(specialStroke, newMap, newGroups);
      }
      // ...manual overrides (unchanged)...
      try {
        if (s.manualOverrides && Array.isArray(s.manualOverrides)) {
          for (let c = 0; c < s.cols; c++) {
            const ov = s.manualOverrides[c];
            if (ov && ov.size > 0) {
              newMap.nodes[c] = new Set(ov);
              // recompute active based on disabled set
              const dis = newMap.disabled?.[c] || new Set();
              const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
              newMap.active[c] = anyOn;
              // carry over groups from nodeGroupMap so we still avoid cross-line connections
              if (s.nodeGroupMap && s.nodeGroupMap[c] instanceof Map) {
                for (const r of newMap.nodes[c]) {
                  const g = s.nodeGroupMap[c].get(r);
                  if (g != null) {
                    const stack = Array.isArray(g) ? g.slice() : [g];
                    newGroups[c].set(r, stack);
                  }
                }
              }
            }
          }
        }
      } catch {}
    }

    // Finalize active mask: a column is active if it has at least one non-disabled node
    for (let c = 0; c < s.cols; c++) {
      const nodes = newMap.nodes?.[c] || new Set();
      const dis = newMap.disabled?.[c] || new Set();
      let anyOn = false;
      if (nodes.size > 0) {
        for (const r of nodes) { if (!dis.has(r)) { anyOn = true; break; } }
      }
      newMap.active[c] = anyOn;
    }

    // If NOTHING is active but there are nodes, default to active for columns that have nodes.
    if (!newMap.active.some(Boolean)) {
      for (let c = 0; c < s.cols; c++) {
        if ((newMap.nodes?.[c] || new Set()).size > 0) newMap.active[c] = true;
      }
    }

    // If a pending active mask exists (e.g., after steps change), map it to new cols
    if (s.pendingActiveMask && Array.isArray(s.pendingActiveMask.prevActive)) {
      const prevCols = s.pendingActiveMask.prevCols || newMap.active.length;
      const prevActive = s.pendingActiveMask.prevActive;
      const newCols = s.cols;
      const mapped = Array(newCols).fill(false);
      if (prevCols === newCols) {
        for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
      } else if (newCols > prevCols && newCols % prevCols === 0) { // Upscaling (e.g., 8 -> 16)
        const factor = newCols / prevCols;
        for (let i = 0; i < prevCols; i++) {
          for (let j = 0; j < factor; j++) mapped[i * factor + j] = !!prevActive[i];
        }
      } else if (prevCols > newCols && prevCols % newCols === 0) { // Downscaling (e.g., 16 -> 8)
        const factor = prevCols / newCols;
        for (let i = 0; i < newCols; i++) {
          let any = false;
          for (let j = 0; j < factor; j++) any = any || !!prevActive[i * factor + j];
          mapped[i] = any;
        }
      } else {
        // fallback proportional map
        for (let i = 0; i < newCols; i++) {
          const src = Math.floor(i * prevCols / newCols);
          mapped[i] = !!prevActive[src];
        }
      }
      newMap.active = mapped;
      // Rebuild the disabled sets based on the new active state
      for (let c = 0; c < newCols; c++) {
        if (newMap.active[c]) {
          newMap.disabled[c].clear();
        } else if (newMap.nodes[c]) {
          newMap.nodes[c].forEach(r => newMap.disabled[c].add(r));
        }
      }
      s.pendingActiveMask = null; // consume
    } else {
      // Preserve disabled nodes from the persistent set where positions still exist
      for (let c = 0; c < s.cols; c++) {
        const prevDis = s.persistentDisabled[c] || new Set();
        for (const r of prevDis) {
          if (newMap.nodes[c]?.has(r)) newMap.disabled[c].add(r);
        }
      }
    }

    if (d.DG_DEBUG) {
      console.log('[DG][regen]', {
        panelId: s.panel?.id || null,
        source: regenSource,
        strokes: Array.isArray(s.strokes) ? s.strokes.length : 0,
        generators: Array.isArray(s.strokes) ? s.strokes.filter(st => st && st.generatorId).length : 0,
        cols: s.cols,
        nodeCount: newMap.nodes.reduce((n, set) => n + (set?.size || 0), 0),
      });
    }
    d.DG.log('rebuild map', {
      cols: newMap.nodes.length,
      activeCount: newMap.active.filter(Boolean).length
    });

    const prevRev = (s.currentMap && Number.isFinite(s.currentMap.__dgRev)) ? s.currentMap.__dgRev : 0;

    const prevActive = s.currentMap?.active ? s.currentMap.active.slice() : null;
    const prevNodes = s.currentMap?.nodes ? s.currentMap.nodes.map(set => set ? new Set(set) : new Set()) : null;

    s.currentMap = newMap;
    // Bump a simple revision counter so drawNodes() can cheaply know whether the node layout/render cache is still valid.
    s.currentMap.__dgRev = ((prevRev | 0) + 1) | 0;
    try { s.panel.__dgNodesRev = s.currentMap.__dgRev; } catch {}
    // Any regen implies nodes layer is dirty.
    try { d.resetNodesCache?.(); } catch {}
    s.nodeGroupMap = newGroups;
    s.persistentDisabled = s.currentMap.disabled; // Update persistent set
    try { (s.panel.__dgUpdateButtons || function () { })(); } catch {}

    let didChange = true;
    if (prevActive && Array.isArray(s.currentMap.active) && prevActive.length === s.currentMap.active.length) {
      didChange = s.currentMap.active.some((v, i) => v !== prevActive[i]);
      if (!didChange && prevNodes && Array.isArray(s.currentMap.nodes) && prevNodes.length === s.currentMap.nodes.length) {
        didChange = s.currentMap.nodes.some((set, i) => {
          const a = prevNodes[i], b = set || new Set();
          if (a.size !== b.size) return true;
          for (const v of a) if (!b.has(v)) return true;
          return false;
        });
      }
    }

    if (didChange) {
      d.emitDrawgridUpdate({ activityOnly: false });
    } else {
      // noise-free activity: do not notify the guide as a progress update
      d.emitDrawgridUpdate({ activityOnly: true });
    }

    try {
      d.dgTraceLog('[drawgrid] drawNodes', s.panel.id, {
        cols: s.currentCols,
        nodesCols: s.currentMap?.nodes?.length ?? 0,
      });
    } catch {}
    d.drawNodes(s.currentMap.nodes);
    d.drawGrid();
    if (d.DG_SINGLE_CANVAS) {
      d.__dgMarkSingleCanvasDirty(s.panel);
      try { d.compositeSingleCanvas(); } catch {}
    }
  }

  return { regenerateMapFromStrokes };
}
