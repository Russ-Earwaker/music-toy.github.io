// src/drawgrid/dg-persist.js
// Persistence + hydration guard helpers for DrawGrid.

export function computeSerializedNodeStats(list, disabledList) {
  let nodeCount = 0;
  let nonEmptyColumns = 0;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      const disabledColRaw = Array.isArray(disabledList) ? disabledList[i] : null;
      const disabledSet = disabledColRaw instanceof Set
        ? disabledColRaw
        : (Array.isArray(disabledColRaw) ? new Set(disabledColRaw) : null);
      let columnActive = 0;
      if (col instanceof Set) {
        col.forEach((row) => {
          if (!disabledSet || !disabledSet.has(row)) columnActive++;
        });
      } else if (Array.isArray(col)) {
        for (const row of col) {
          const rowNum = typeof row === 'number' ? row : Number(row);
          if (Number.isNaN(rowNum)) continue;
          if (!disabledSet || !disabledSet.has(rowNum)) columnActive++;
        }
      } else if (col && typeof col.forEach === 'function') {
        try {
          col.forEach((row) => {
            if (!disabledSet || !disabledSet.has(row)) columnActive++;
          });
        } catch {}
      } else if (col && typeof col.size === 'number' && columnActive === 0) {
        const delta = col.size - (disabledSet ? disabledSet.size : 0);
        columnActive = Math.max(0, delta);
      }
      if (columnActive > 0) {
        nonEmptyColumns++;
        nodeCount += columnActive;
      }
    }
  }
  return { nodeCount, nonEmptyColumns };
}

export function computeCurrentMapNodeStats(nodes, disabled) {
  let nodeCount = 0;
  let nonEmptyColumns = 0;
  if (Array.isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      const col = nodes[i];
      const disabledColRaw = Array.isArray(disabled) ? disabled[i] : null;
      const disabledSet = disabledColRaw instanceof Set
        ? disabledColRaw
        : (Array.isArray(disabledColRaw) ? new Set(disabledColRaw) : null);
      let columnActive = 0;
      if (col instanceof Set) {
        col.forEach((row) => {
          if (!disabledSet || !disabledSet.has(row)) columnActive++;
        });
      } else if (Array.isArray(col)) {
        for (const row of col) {
          const rowNum = typeof row === 'number' ? row : Number(row);
          if (Number.isNaN(rowNum)) continue;
          if (!disabledSet || !disabledSet.has(rowNum)) columnActive++;
        }
      } else if (col && typeof col.forEach === 'function') {
        try {
          col.forEach((row) => {
            if (!disabledSet || !disabledSet.has(row)) columnActive++;
          });
        } catch {}
      } else if (col && typeof col.size === 'number' && columnActive === 0) {
        const delta = col.size - (disabledSet ? disabledSet.size : 0);
        columnActive = Math.max(0, delta);
      }
      if (columnActive > 0) {
        nonEmptyColumns++;
        nodeCount += columnActive;
      }
    }
  }
  return { nodeCount, nonEmptyColumns };
}

function dgNow() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return Date.now();
}

export function createDgPersist({
  panel,
  storageKey,
  dgTraceLog,
  DG_DEBUG,
  DG_TRACE_DEBUG,
  captureState,
  getStrokes,
  getCurrentMap,
  warn,
} = {}) {
  const trace = (typeof dgTraceLog === 'function') ? dgTraceLog : () => {};
  const warnFn = (typeof warn === 'function')
    ? warn
    : (typeof console !== 'undefined' && typeof console.warn === 'function')
      ? console.warn.bind(console)
      : () => {};
  const resolveStrokes = (typeof getStrokes === 'function') ? getStrokes : () => null;
  const resolveCurrentMap = (typeof getCurrentMap === 'function') ? getCurrentMap : () => null;

  const DG_HYDRATE = {
    guardActive: false,
    hydratedAt: 0,
    inbound: { strokes: 0, nodeCount: 0, nonEmptyColumns: 0, activeColumns: 0 },
    seenUserChange: false,
    lastPersistNonEmpty: null,
    pendingUserClear: false,
  };
  const PERSIST_DEBOUNCE_MS = 150;
  let persistStateTimer = null;
  let persistedStateCache = null;
  let fallbackHydrationState = null;

  function inboundWasNonEmpty() {
    const inbound = DG_HYDRATE.inbound || {};
    return ((inbound.strokes || 0) > 0) ||
      ((inbound.nodeCount || 0) > 0) ||
      ((inbound.nonEmptyColumns || 0) > 0) ||
      ((inbound.activeColumns || 0) > 0);
  }

  function maybeDropPersistGuard(reason, extra = {}) {
    if (!DG_HYDRATE.guardActive) return;
    const inbound = DG_HYDRATE.inbound || {};
    if (!DG_HYDRATE.seenUserChange && (inbound.strokes || 0) > 0 && DG_HYDRATE.lastPersistNonEmpty === false) {
      trace('[drawgrid][persist-guard] keep guard ON (no non-empty persist yet)', {
        reason,
        inbound: { ...inbound },
        seenUserChange: DG_HYDRATE.seenUserChange,
        lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
        ...extra,
      });
      return;
    }
    DG_HYDRATE.guardActive = false;
    const payload = {
      reason,
      inbound: { ...inbound },
      seenUserChange: DG_HYDRATE.seenUserChange,
      lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
      ...extra,
    };
    if (DG_HYDRATE.lastPersistNonEmpty === true) {
      trace('[drawgrid][persist-guard] guard OFF (non-empty persist confirmed)', payload);
    } else {
      trace('[drawgrid][persist-guard] guard OFF', payload);
    }
  }

  function markUserChange(reason, extra = {}) {
    if (DG_HYDRATE.seenUserChange) return;
    DG_HYDRATE.seenUserChange = true;
    if (DG_TRACE_DEBUG) {
      try {
        const stack = (new Error('user-change')).stack?.split('\n').slice(0, 4).join('\n');
        console.log('[drawgrid][user-change]', { reason, guardActive: DG_HYDRATE.guardActive, stack });
      } catch {}
    }
    maybeDropPersistGuard(reason || 'user-change', { ...extra, userChange: true });
  }

  function updateHydrateInboundFromState(state, { reason = 'hydrate' } = {}) {
    if (!state || typeof state !== 'object') {
      DG_HYDRATE.inbound = { strokes: 0, nodeCount: 0, nonEmptyColumns: 0, activeColumns: 0 };
      DG_HYDRATE.guardActive = false;
      DG_HYDRATE.lastPersistNonEmpty = null;
      DG_HYDRATE.seenUserChange = false;
      DG_HYDRATE.pendingUserClear = false;
      DG_HYDRATE.hydratedAt = dgNow();
      return;
    }
    const strokes = Array.isArray(state?.strokes) ? state.strokes.length : 0;
    const { nodeCount, nonEmptyColumns } = computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled);
    const activeColumns = Array.isArray(state?.nodes?.active)
      ? state.nodes.active.reduce((acc, cur) => acc + (cur ? 1 : 0), 0)
      : 0;
    const inbound = {
      strokes,
      nodeCount,
      nonEmptyColumns,
      activeColumns,
    };
    DG_HYDRATE.inbound = inbound;
    DG_HYDRATE.hydratedAt = dgNow();
    DG_HYDRATE.seenUserChange = false;
    DG_HYDRATE.pendingUserClear = false;
    const inboundNonEmpty = inboundWasNonEmpty();
    DG_HYDRATE.lastPersistNonEmpty = inboundNonEmpty ? false : null;
    DG_HYDRATE.guardActive = inboundNonEmpty;
    if (inboundNonEmpty) {
      trace('[drawgrid][persist-guard] inbound hydrate', { reason, inbound: { ...inbound } });
    } else {
      trace('[drawgrid][persist-guard] inbound hydrate empty', { reason });
    }
  }

  function persistStateNow(arg, extraMeta = null) {
    if (!storageKey) return;
    const opts = (arg && typeof arg === 'object' && !Array.isArray(arg) && (Object.prototype.hasOwnProperty.call(arg, 'source') || Object.prototype.hasOwnProperty.call(arg, 'bypassGuard')))
      ? arg
      : { source: (arg && typeof arg?.type === 'string') ? arg.type : 'immediate' };
    const source = typeof opts.source === 'string' ? opts.source : 'immediate';
    if (persistStateTimer) {
      clearTimeout(persistStateTimer);
      persistStateTimer = null;
    }
    try {
      const state = (typeof captureState === 'function') ? captureState() : null;
      const strokeCount = Array.isArray(state?.strokes) ? state.strokes.length : 0;
      const { nodeCount, nonEmptyColumns } = computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled);
      const nonEmptyFromNodes = nodeCount > 0 || nonEmptyColumns > 0;
      const nonEmptyFromActive = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
      const nonEmpty = (strokeCount > 0) || nonEmptyFromNodes || nonEmptyFromActive;
      const wouldPersistEmpty = !nonEmpty;
      const now = dgNow();
      const hydratedAt = DG_HYDRATE.hydratedAt || 0;
      const msSinceHydrate = now - hydratedAt;
      const inbound = DG_HYDRATE.inbound || {};
      const inboundNonEmpty = inboundWasNonEmpty();
      const wouldOverwriteNonEmptyWithEmpty = wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange;
      const forbidEmptyUntilNonEmpty =
        (DG_HYDRATE.lastPersistNonEmpty === false) && wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange;
      const isEarlyHydrateWindow = hydratedAt > 0 && msSinceHydrate >= 0 && msSinceHydrate < 2000;

      let skipReason = null;
      if (wouldOverwriteNonEmptyWithEmpty) skipReason = 'empty_overwrite_guard';
      if (!skipReason && isEarlyHydrateWindow && wouldOverwriteNonEmptyWithEmpty) skipReason = 'hydrate_window_guard';
      if (!skipReason && forbidEmptyUntilNonEmpty) skipReason = 'awaiting_first_non_empty';

      if (skipReason && !DG_HYDRATE.pendingUserClear) {
        trace('[drawgrid][persist-guard] SKIP write (empty would replace hydrated non-empty)', {
          reason: skipReason,
          source,
          msSinceHydrate,
          inbound: { ...inbound },
          seenUserChange: DG_HYDRATE.seenUserChange,
          lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
          wouldPersistEmpty,
        });
        return;
      } else if (skipReason && DG_HYDRATE.pendingUserClear) {
        trace('[drawgrid][persist-guard] overriding skip due to user-clear', {
          originalReason: skipReason,
          source,
          inbound: { ...inbound },
        });
      }

      persistedStateCache = state;
      try {
        fallbackHydrationState = JSON.parse(JSON.stringify(state));
      } catch {
        fallbackHydrationState = state;
      }
      let meta = {
        source,
        userCleared: !!DG_HYDRATE.pendingUserClear,
        t: dgNow(),
      };
      if (extraMeta && typeof extraMeta === 'object') {
        meta = { ...meta, ...extraMeta };
      }
      if (opts && typeof opts.meta === 'object') {
        meta = { ...meta, ...opts.meta };
      }
      if (Object.prototype.hasOwnProperty.call(meta, 'userCleared')) {
        meta.userCleared = !!meta.userCleared;
      } else {
        meta.userCleared = !!DG_HYDRATE.pendingUserClear;
      }
      const payload = { v: 1, state, meta };
      try {
        const serialized = JSON.stringify(payload);
        localStorage.setItem(storageKey, serialized);
        try {
          const stack = (new Error('persist-state')).stack?.split('\n').slice(0, 5).join('\n');
          trace('[drawgrid] PERSIST', storageKey, { bytes: serialized.length, source, nonEmpty, meta, stack });
        } catch {
          trace('[drawgrid] PERSIST', storageKey, { source, nonEmpty, meta });
        }
      } catch (e) {
        if (DG_DEBUG) console.warn('[drawgrid] PERSIST failed', e);
        return;
      }
      if (nonEmpty) {
        DG_HYDRATE.lastPersistNonEmpty = true;
        maybeDropPersistGuard('persist-non-empty', { source });
      } else if (meta.userCleared) {
        DG_HYDRATE.lastPersistNonEmpty = false;
        maybeDropPersistGuard('persist-user-clear', { source, userCleared: true });
      } else if (DG_HYDRATE.lastPersistNonEmpty == null) {
        DG_HYDRATE.lastPersistNonEmpty = null;
      }
      if (DG_HYDRATE.pendingUserClear) DG_HYDRATE.pendingUserClear = false;
    } catch (err) {
      if (DG_DEBUG) warnFn('persistState failed', err);
    }
  }

  function schedulePersistState(opts = {}) {
    if (!storageKey) return;
    const source = typeof opts.source === 'string' ? opts.source : 'debounced';
    const bypassGuard = !!opts.bypassGuard;
    const strokes = resolveStrokes();
    const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
    const currentMap = resolveCurrentMap();
    const { nodeCount } = computeCurrentMapNodeStats(currentMap?.nodes, currentMap?.disabled);
    const hasNodes = nodeCount > 0;
    const wouldPersistEmpty = strokeCount === 0 && !hasNodes;
    try {
      const now = dgNow();
      const lastRead = (typeof window !== 'undefined' && window.__PERSIST_DIAG) ? window.__PERSIST_DIAG.lastRead : null;
      if (!DG_HYDRATE.pendingUserClear && lastRead && lastRead.stats && lastRead.stats.nonEmpty) {
        const sinceRead = now - lastRead.t;
        const looksEmptyNow = wouldPersistEmpty;
        if (looksEmptyNow && Number.isFinite(sinceRead) && sinceRead < 4000) {
          if (DG_DEBUG) console.warn('[drawgrid][persist-guard] drop schedule (recent non-empty READ -> transient empty)', {
            source,
            sinceRead,
            strokeCount,
            nodeCount,
            guardActive: DG_HYDRATE.guardActive,
          });
          return;
        }
      }
    } catch (assertErr) {
      if (DG_DEBUG) console.warn('[drawgrid] persist schedule assertion failed', assertErr);
    }
    const inbound = DG_HYDRATE.inbound || {};
    const inboundNonEmpty = inboundWasNonEmpty();
    if (!bypassGuard && DG_HYDRATE.guardActive && !DG_HYDRATE.pendingUserClear) {
      const guardBlocksEmpty =
        (wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange) ||
        ((DG_HYDRATE.lastPersistNonEmpty === false) && wouldPersistEmpty && inboundNonEmpty);
      if (guardBlocksEmpty) {
        trace('[drawgrid][persist-guard] SKIP schedule (guardActive & empty would overwrite)', {
          source,
          inbound: { ...inbound },
          strokeCount,
          nodeCount,
          seenUserChange: DG_HYDRATE.seenUserChange,
          lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
        });
        return;
      }
    }
    if (persistStateTimer) clearTimeout(persistStateTimer);
    persistStateTimer = setTimeout(() => {
      persistStateTimer = null;
      persistStateNow({ source });
    }, PERSIST_DEBOUNCE_MS);
  }

  const persistBeforeUnload = () => persistStateNow({ source: 'beforeunload' });

  function loadPersistedState() {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const state = parsed.state || parsed;
        if (state && typeof state === 'object') {
          persistedStateCache = state;
          try {
            fallbackHydrationState = JSON.parse(JSON.stringify(state));
          } catch {
            fallbackHydrationState = state;
          }
          return state;
        }
      }
    } catch (err) {
      if (DG_DEBUG) warnFn('loadPersistedState failed', err);
    }
    return null;
  }

  if (storageKey && typeof window !== 'undefined') {
    try { window.addEventListener('beforeunload', persistBeforeUnload); } catch {}
  }

  return {
    dgNow,
    getHydrateState: () => DG_HYDRATE,
    getFallbackHydrationState: () => fallbackHydrationState,
    inboundWasNonEmpty,
    loadPersistedState,
    markUserChange,
    persistBeforeUnload,
    persistStateNow,
    schedulePersistState,
    updateHydrateInboundFromState,
  };
}
