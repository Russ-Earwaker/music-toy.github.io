// src/drawgrid/dg-state-io.js
// Capture/restore state helpers for DrawGrid.

import { drawGridLogicalPointToNormalized } from './drawgrid-viewport-space.js';
import {
  DRAWGRID_PERSISTENCE_COORDINATE_SPACE,
  DRAWGRID_PERSISTENCE_VERSION,
  upgradeDrawGridStrokes,
} from './drawgrid-stroke-persistence.js';

export function createDgStateIo({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function applyInstrumentFromState(value, { emitEvents = true } = {}) {
    const resolved = (typeof value === 'string') ? value.trim() : '';
    if (!resolved) return false;
    const prev = s.panel?.dataset?.instrument || '';
    const changed = prev !== resolved;
    if (s.panel?.dataset) {
      s.panel.dataset.instrument = resolved;
      s.panel.dataset.instrumentPersisted = '1';
    }
    if (changed && emitEvents) {
      try { s.panel?.dispatchEvent?.(new CustomEvent('toy-instrument', { detail: { value: resolved }, bubbles: true })); } catch {}
      try { s.panel?.dispatchEvent?.(new CustomEvent('toy:instrument', { detail: { name: resolved, value: resolved }, bubbles: true })); } catch {}
    }
    return changed;
  }

  function captureState() {
    try {
      const serializeSetArr = (arr) => Array.isArray(arr) ? arr.map((set) => Array.from(set || [])) : [];
      const serializeNodes = (arr) => Array.isArray(arr) ? arr.map((set) => Array.from(set || [])) : [];
      return {
        schemaVersion: DRAWGRID_PERSISTENCE_VERSION,
        coordinateSpace: DRAWGRID_PERSISTENCE_COORDINATE_SPACE,
        steps: s.cols | 0,
        autotune: !!s.autoTune,
        instrument: s.panel?.dataset?.instrument || undefined,
        strokes: (s.strokes || []).map((stroke) => ({
          // Runtime logical points are authoritative. Rebuild normalized
          // persistence data at the serialization boundary so it cannot stale.
          ptsN: Array.isArray(stroke.pts) ? stroke.pts.map(drawGridLogicalPointToNormalized) : [],
          color: stroke.color,
          isSpecial: !!stroke.isSpecial,
          generatorId: (typeof stroke.generatorId === 'number') ? stroke.generatorId : undefined,
          overlayColorize: !!stroke.overlayColorize,
        })),
        nodes: {
          active: (s.currentMap?.active && Array.isArray(s.currentMap.active)) ? s.currentMap.active.slice() : Array(s.cols).fill(false),
          disabled: serializeSetArr(s.persistentDisabled || []),
          list: serializeNodes(s.currentMap?.nodes || []),
          groups: (s.nodeGroupMap || []).map((map) => map instanceof Map ? Array.from(map.entries()) : []),
        },
        manualOverrides: Array.isArray(s.manualOverrides) ? s.manualOverrides.map((set) => Array.from(set || [])) : [],
      };
    } catch (e) {
      return {
        schemaVersion: DRAWGRID_PERSISTENCE_VERSION,
        coordinateSpace: DRAWGRID_PERSISTENCE_COORDINATE_SPACE,
        steps: s.cols | 0,
        autotune: !!s.autoTune,
      };
    }
  }

  function restoreFromState(state) {
    const prevRestoring = s.isRestoring;
    s.isRestoring = true;
    if (state && typeof state.instrument === 'string') {
      applyInstrumentFromState(state.instrument, { emitEvents: true });
    }
    const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
    const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
    const hasNodeList = Array.isArray(state?.nodes?.list) && state.nodes.list.some((arr) => Array.isArray(arr) && arr.length > 0);
    try {
      const stats = {
        strokes: Array.isArray(state?.strokes) ? state.strokes.length : 0,
        nodeCount: d.computeSerializedNodeStats?.(state?.nodes?.list, state?.nodes?.disabled).nodeCount,
        activeCols: Array.isArray(state?.nodes?.active) ? state.nodes.active.filter(Boolean).length : 0,
      };
      const stack = (new Error('restore-state')).stack?.split('\n').slice(0, 6).join('\n');
      d.dgTraceLog?.('[drawgrid][RESTORE] requested', { panelId: s.panel?.id, stats, stack });
    } catch {}
    d.updateHydrateInboundFromState?.(state, { reason: 'restoreFromState', panelId: s.panel?.id });
    if (!hasStrokes && !hasActiveNodes && !hasNodeList) {
      s.isRestoring = prevRestoring;
      return;
    }
    try {
      d.R.clearCanvas(s.pctx);
      d.emitDG?.('paint-clear', { reason: 'restore-state' });
      d.R.clearCanvas(s.nctx);
      const flashSurface = d.getActiveFlashCanvas?.();
      const __flashDpr = d.__dgGetCanvasDprFromCss?.(flashSurface, s.cssW, s.paintDpr);
      d.R.resetCtx(s.fctx);
      d.__dgWithLogicalSpaceDpr(d.R, s.fctx, __flashDpr, () => {
        const { x, y, w, h } = d.R.getOverlayClearRect({
          canvas: flashSurface,
          pad: d.R.getOverlayClearPad(),
          allowFull: !!s.panel?.__dgFlashOverlayOutOfGrid,
          gridArea: s.gridArea,
        });
        s.fctx.clearRect(x, y, w, h);
        d.emitDG?.('overlay-clear', { reason: 'restore-state' });
      });

      s.strokes = upgradeDrawGridStrokes(state?.strokes);

      d.FD?.markRegenSource?.('restore-state');
      d.FD?.markRegenSource?.('randomize');
      d.regenerateMapFromStrokes?.();
      s.currentMap = d.normalizeMapColumns?.(s.currentMap, s.cols);

      d.__dgWithLogicalSpace(s.pctx, () => {
        d.R.clearCanvas(s.pctx);
        for (const stroke of s.strokes) d.drawFullStroke?.(s.pctx, stroke, { skipReset: true, skipTransform: true });
      });

      s.__hydrationJustApplied = true;
      s.__dgHydrationPendingRedraw = true;
      d.HY?.scheduleHydrationLayoutRetry?.(s.panel, () => d.layout?.(true));
      setTimeout(() => { s.__hydrationJustApplied = false; }, 32);

      // Hydration replaces vector state, so guarantee one complete presentation
      // redraw/composite before the restored frame is shown.
      try {
        d.markStaticDirty?.('restore-from-state');
      } catch {}
      try {
        s.panel.__dgSingleCompositeDirty = true;
      } catch {}
      s.__dgNeedsUIRefresh = true;
      s.__dgFrontSwapNextDraw = true;
      s.__dgForceFullDrawNext = true;
      s.__dgForceFullDrawFrames = Math.max(s.__dgForceFullDrawFrames || 0, 8);

      d.ensurePostCommitRedraw?.('restoreFromState');
      try {
        if (typeof d.requestFrontSwap === 'function') {
          d.requestFrontSwap(d.useFrontBuffers);
        }
      } catch {}

      d.emitDrawgridUpdate?.({ activityOnly: false });
      d.markStaticDirty?.('external-state-change');
    } catch (e) {
      d.emitDrawgridUpdate?.({ activityOnly: false });
    } finally {
      s.isRestoring = prevRestoring;
      s.__dgNeedsUIRefresh = true;
      s.__dgStableFramesAfterCommit = 0;
      try {
        const hasStrokesFinal = Array.isArray(s.strokes) && s.strokes.length > 0;
        const hasNodesFinal = Array.isArray(s.currentMap?.nodes)
          ? s.currentMap.nodes.some((set) => set && set.size > 0)
          : false;
        try {
          d.updateHydrateInboundFromState?.(captureState(), { reason: 'restore-from-state-applied', panelId: s.panel?.id });
        } catch {}

        if (hasStrokesFinal || hasNodesFinal) {
          d.schedulePersistState?.({ source: 'restore-from-state' });
        }
      } catch {
        // Ignore persist errors during hydration; keep prior local save intact.
      }
    }
  }

  return {
    applyInstrumentFromState,
    captureState,
    restoreFromState,
  };
}
