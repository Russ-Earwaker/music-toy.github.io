// src/drawgrid/dg-set-state.js
// External state application for DrawGrid.

import { upgradeDrawGridStrokes } from './drawgrid-stroke-persistence.js';

export function createDgSetState({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function setState(st = {}) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!s.panel?.isConnected) return;
        s.isRestoring = true;
        const fallbackHydrationState = d.getFallbackHydrationState?.();
        try {
          const stats = {
            strokes: Array.isArray(st?.strokes) ? st.strokes.length : 0,
            nodeCount: d.computeSerializedNodeStats?.(st?.nodes?.list, st?.nodes?.disabled).nodeCount,
            activeCols: Array.isArray(st?.nodes?.active) ? st.nodes.active.filter(Boolean).length : 0,
          };
          const stack = (new Error('set-state')).stack?.split('\n').slice(0, 6).join('\n');
          d.dgTraceLog?.('[drawgrid][SETSTATE] requested', { panelId: s.panel?.id, stats, stack });
        } catch {}
        const guardStrokesCandidate = Array.isArray(st?.strokes) && st.strokes.length > 0
          ? st.strokes
          : (Array.isArray(fallbackHydrationState?.strokes) ? fallbackHydrationState.strokes : []);
        const guardNodesListCandidate = Array.isArray(st?.nodes?.list) && st.nodes.list.length > 0
          ? st.nodes.list
          : (fallbackHydrationState?.nodes?.list || []);
        const guardNodesActiveCandidate = Array.isArray(st?.nodes?.active) && st.nodes.active.length > 0
          ? st.nodes.active
          : (fallbackHydrationState?.nodes?.active || []);
        const guardNodesDisabledCandidate = Array.isArray(st?.nodes?.disabled) && st.nodes.disabled.length > 0
          ? st.nodes.disabled
          : (fallbackHydrationState?.nodes?.disabled || []);
        d.updateHydrateInboundFromState?.({
          strokes: guardStrokesCandidate,
          nodes: {
            list: guardNodesListCandidate,
            active: guardNodesActiveCandidate,
            disabled: guardNodesDisabledCandidate,
          },
        }, { reason: 'setState-pre', panelId: s.panel?.id });
        if (typeof st?.instrument === 'string') {
          d.applyInstrumentFromState?.(st.instrument, { emitEvents: true });
        }
        try {
          const preserveNodesOverStrokes =
            !!st?.meta?.preserveNodesOverStrokes ||
            !!st?.__preserveNodesOverStrokes;
          // Steps first
          if (typeof st.steps === 'number' && (st.steps === 8 || st.steps === 16)) {
            if ((st.steps | 0) !== s.cols) {
              s.cols = st.steps | 0;
              s.currentCols = s.cols;
              if (s.panel?.dataset) s.panel.dataset.steps = String(s.cols);
              s.flashes = new Float32Array(s.cols);
              s.persistentDisabled = Array.from({ length: s.cols }, () => new Set());
              s.manualOverrides = Array.from({ length: s.cols }, () => new Set());
              // Force layout for new resolution
              d.resnapAndRedraw?.(true);
            }
          }
          // Ensure geometry is current before de-normalizing
          try { d.layout?.(true); } catch {}
          if (typeof st.autotune !== 'undefined') {
            s.autoTune = !!st.autotune;
            try {
              const btn = s.panel?.querySelector?.('.drawgrid-autotune');
              if (btn) {
                btn.textContent = `Auto-tune: ${s.autoTune ? 'On' : 'Off'}`;
                btn.setAttribute('aria-pressed', String(s.autoTune));
              }
            } catch {}
          }
          // Restore strokes (fallback to persisted paint data if external state omits it)
          const hasIncomingStrokes = Object.prototype.hasOwnProperty.call(st, 'strokes');
          const incomingStrokes = Array.isArray(st.strokes) ? st.strokes : null;
          const fallbackStrokes = (!hasIncomingStrokes && Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0)
            ? fallbackHydrationState.strokes
            : null;
          const strokeSource = (incomingStrokes && incomingStrokes.length > 0) ? incomingStrokes : fallbackStrokes;
          if (strokeSource) {
            s.strokes = upgradeDrawGridStrokes(strokeSource, { fallbackColor: s.STROKE_COLORS?.[0] });
            if (preserveNodesOverStrokes) s.__dgSkipMapRegenOnce = true;
            d.clearAndRedrawFromStrokes?.(null, 'setState-strokes');
          } else if (hasIncomingStrokes && Array.isArray(st.strokes)) {
            const hasFallback = Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0;
            if (!hasFallback) {
              s.strokes = [];
              d.clearAndRedrawFromStrokes?.(null, 'setState-strokes-empty');
            }
          }

          // Restore node masks if provided
          if (st.nodes && typeof st.nodes === 'object') {
            try {
              const act = Array.isArray(st.nodes.active) ? st.nodes.active.slice(0, s.cols) : null;
              const dis = Array.isArray(st.nodes.disabled) ? st.nodes.disabled.slice(0, s.cols).map((arr) => new Set(arr || [])) : null;
              const list = Array.isArray(st.nodes.list) ? st.nodes.list.slice(0, s.cols).map((arr) => new Set(arr || [])) : null;
              const groups = Array.isArray(st.nodes.groups) ? st.nodes.groups.map((g) => new Map(g || [])) : null;

              // If a node list is present in the saved state, it is the source of truth.
              if (list) {
                if (!s.currentMap) {
                  // If strokes were not restored, currentMap is null. Build it from saved node list.
                  s.currentMap = { active: Array(s.cols).fill(false), nodes: list, disabled: Array.from({ length: s.cols }, () => new Set()) };
                } else {
                  // If strokes were restored, currentMap exists. Overwrite its nodes with the saved list.
                  s.currentMap.nodes = list;
                }
              }

              if (s.currentMap && (act || dis || groups)) {
                if (groups) s.nodeGroupMap = groups;
                for (let c = 0; c < s.cols; c++) {
                  if (act && act[c] !== undefined) s.currentMap.active[c] = !!act[c];
                  if (dis && dis[c] !== undefined) s.currentMap.disabled[c] = dis[c];
                }
              }

              s.persistentDisabled = s.currentMap.disabled;
              s.__dgPreserveNodesOverStrokes = !!(preserveNodesOverStrokes && list);
              d.__dgBumpNodesRev?.('setState-nodes');

              d.drawGrid?.();
              d.drawNodes?.(s.currentMap.nodes);
              try {
                d.emitDrawgridUpdate?.({ activityOnly: false });
              } catch {}
            } catch (e) { }
          }
          if (Array.isArray(st.manualOverrides)) {
            try { s.manualOverrides = st.manualOverrides.slice(0, s.cols).map((arr) => new Set(arr || [])); } catch {}
          }
          // Refresh UI affordances
          try { (s.panel?.__dgUpdateButtons || d.updateGeneratorButtons)?.(); } catch {}
          // After all state is applied and layout is stable, sync the dropdown.
          try {
            const stepsSel = s.panel?.querySelector?.('.drawgrid-steps');
            if (stepsSel) stepsSel.value = String(s.cols);
          } catch {}
          if (s.currentMap) {
            try {
              d.emitDrawgridUpdate?.({ activityOnly: false });
            } catch {}
          }
          s.__hydrationJustApplied = true;
          s.__dgHydrationPendingRedraw = true;
          d.HY?.scheduleHydrationLayoutRetry?.(s.panel, () => d.layout?.(true));
          setTimeout(() => { s.__hydrationJustApplied = false; }, 32);

          // Chained toys usually hydrate through setState(). Guarantee one
          // complete presentation redraw/composite for the new vector state.
          try {
            d.markStaticDirty?.('set-state');
          } catch {}
          try {
            s.panel.__dgSingleCompositeDirty = true;
          } catch {}
          s.__dgNeedsUIRefresh = true;
          s.__dgFrontSwapNextDraw = true;
          s.__dgForceFullDrawNext = true;
          s.__dgForceFullDrawFrames = Math.max(s.__dgForceFullDrawFrames || 0, 8);
          d.ensurePostCommitRedraw?.('setState');
          try {
            if (typeof d.requestFrontSwap === 'function') {
              d.requestFrontSwap(d.useFrontBuffers);
            }
          } catch {}
        } catch (e) { }
        s.isRestoring = false;
        // Re-check after hydration completes
        d.scheduleGhostIfEmpty?.({ initialDelay: 0 });
        try {
          d.updateHydrateInboundFromState?.(d.captureState?.(), { reason: 'setState-applied', panelId: s.panel?.id });
        } catch {}
        const strokeCount = Array.isArray(s.strokes) ? s.strokes.length : 0;
        const { nodeCount: postNodeCount } = d.computeCurrentMapNodeStats?.(s.currentMap?.nodes, s.currentMap?.disabled) || { nodeCount: 0 };
        const guardBlocksPostSetState =
          s.DG_HYDRATE?.guardActive &&
          !s.DG_HYDRATE?.seenUserChange &&
          d.inboundWasNonEmpty?.() &&
          strokeCount === 0 &&
          postNodeCount === 0;
        if (guardBlocksPostSetState) {
          d.dgTraceLog?.('[drawgrid][persist-guard] skip post-setState persist (guard active & snapshot empty)', {
            inbound: { ...s.DG_HYDRATE?.inbound },
            strokeCount,
            nodeCount: postNodeCount,
            seenUserChange: s.DG_HYDRATE?.seenUserChange,
            lastPersistNonEmpty: s.DG_HYDRATE?.lastPersistNonEmpty,
          });
        } else {
          d.schedulePersistState?.({ source: 'setState-complete' });
        }
        try { d.dgTraceLog?.('[drawgrid] SETSTATE complete', s.panel?.id); } catch {}
      });
    });
  }

  return {
    setState,
  };
}
