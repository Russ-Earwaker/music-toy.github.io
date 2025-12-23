// src/persistence.js
// Lightweight scene save/load with versioning and localStorage backend.

import { bpm, setBpm, stop as stopTransport } from './audio-core.js';
import { setGestureTransform as zcSetGestureTransform, commitGesture as zcCommitGesture, getZoomState as zcGetZoomState } from './zoom/ZoomCoordinator.js';
import { getActiveThemeKey, setActiveThemeKey } from './theme-manager.js';

// ---- Persistence diagnostics ----
const PERSIST_DIAG = (typeof window !== 'undefined') ? (window.__PERSIST_DIAG = window.__PERSIST_DIAG || {}) : {};
function __diagNow() {
  try { return performance.now(); }
  catch { return Date.now(); }
}
// Toggle for verbose persistence diagnostics. Set true while chasing save/load issues.
const PERSIST_TRACE_DEBUG = false;
const persistTraceLog = (...args) => { if (PERSIST_TRACE_DEBUG) console.log(...args); };
const persistTraceWarn = (...args) => { if (PERSIST_TRACE_DEBUG) console.warn(...args); };
let __quotaWarned = false;
let __quotaCleanupAttempted = false;
function __isQuotaExceededError(err) {
  try {
    if (!err) return false;
    if (err.name === 'QuotaExceededError') return true;
    if (err.code === 22 || err.code === 1014) return true;
    return typeof err.message === 'string' && err.message.toLowerCase().includes('quota');
  } catch {
    return false;
  }
}
function __evictDrawgridCache() {
  try {
    const keys = Object.keys(localStorage);
    let removed = 0;
    for (const k of keys) {
      if (k.startsWith('drawgrid:saved:')) {
        try { localStorage.removeItem(k); removed++; } catch {}
      }
    }
    return removed;
  } catch {
    return 0;
  }
}
function __stateStats(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.payload && typeof payload.payload === 'object') {
      payload = payload.payload;
    } else if (payload.state && typeof payload.state === 'object') {
      payload = payload.state;
    }
  }
  if (!payload || typeof payload !== 'object') return { strokes: 0, nodeCount: 0, activeCols: 0, nonEmpty: false };
  const strokes = Array.isArray(payload.strokes) ? payload.strokes.length : ((payload.strokes | 0) || 0);
  const list = payload?.nodes?.list;
  const activeList = Array.isArray(payload?.nodes?.active) ? payload.nodes.active : null;
  let nodeCount = 0;
  let activeCols = 0;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      let count = 0;
      if (col instanceof Set) {
        count = col.size;
      } else if (Array.isArray(col)) {
        count = col.length;
      } else if (col && typeof col.size === 'number') {
        count = col.size;
      }
      if (count > 0) {
        nodeCount += count;
        activeCols++;
      } else if (activeList && activeList[i]) {
        activeCols++;
      }
    }
  } else if (activeList) {
    activeCols = activeList.filter(Boolean).length;
  }
  const nonEmpty = (strokes > 0) || (nodeCount > 0) || (activeCols > 0);
  return { strokes, nodeCount, activeCols, nonEmpty };
}

function snapInstrumentPitch(panel){
  const out = {};
  try{
    if (!panel || !panel.dataset) return out;
    if (Object.prototype.hasOwnProperty.call(panel.dataset, 'instrumentPitchShift')) {
      const flag = String(panel.dataset.instrumentPitchShift || '').toLowerCase();
      out.instrumentPitchShift = (flag === '1' || flag === 'true');
    }
    if (panel.dataset.instrumentOctave != null && panel.dataset.instrumentOctave !== '') {
      const oct = parseInt(panel.dataset.instrumentOctave, 10);
      if (Number.isFinite(oct)) out.instrumentOctave = oct;
    }
    if (panel.dataset.instrumentNote != null && panel.dataset.instrumentNote !== '') {
      out.instrumentNote = String(panel.dataset.instrumentNote);
    }
  }catch{}
  return out;
}

function applyInstrumentPitch(panel, state){
  try{
    if (!panel || !panel.dataset || !state || typeof state !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(state, 'instrumentPitchShift')) {
      const flag = state.instrumentPitchShift;
      const enabled = (flag === true || flag === 1 || String(flag).toLowerCase() === 'true' || String(flag) === '1');
      panel.dataset.instrumentPitchShift = enabled ? '1' : '0';
      if (!enabled && !Object.prototype.hasOwnProperty.call(state, 'instrumentNote')) {
        delete panel.dataset.instrumentNote;
      }
    }
    if (Object.prototype.hasOwnProperty.call(state, 'instrumentOctave')) {
      const oct = parseInt(state.instrumentOctave, 10);
      if (Number.isFinite(oct)) panel.dataset.instrumentOctave = String(oct);
    }
    if (Object.prototype.hasOwnProperty.call(state, 'instrumentNote')) {
      const note = state.instrumentNote;
      if (note) panel.dataset.instrumentNote = String(note);
      else delete panel.dataset.instrumentNote;
    }
  }catch{}
}
function __shouldVetoEmptyOverwrite(prevPayload, nextPayload, meta) {
  const prev = __stateStats(prevPayload);
  const next = __stateStats(nextPayload);
  const userCleared = !!(meta && meta.userCleared);
  return (prev.nonEmpty && !next.nonEmpty && !userCleared);
}

const SCHEMA_VERSION = 1;
const AUTOSAVE_KEY = 'scene:autosave';
const LAST_SCENE_KEY = 'prefs:lastScene';

// --- Scene package + slot config ---

const SCENE_PACKAGE_TYPE = 'music-toys-scene';
const SCENE_PACKAGE_SCHEMA_VERSION = 1;

// How many fixed save slots we expose in the UI.
// We can change this later if needed.
const MAX_SCENE_SLOTS = 12;

// slot-1, slot-2, ... slot-12
const SCENE_SLOT_IDS = Array.from({ length: MAX_SCENE_SLOTS }, (_, i) => `slot-${i + 1}`);
const CURRENT_SCENE_SLOT_KEY = 'scene:current-slot-id';

function getCurrentSceneSlotId() {
  try {
    return window.localStorage.getItem(CURRENT_SCENE_SLOT_KEY);
  } catch (err) {
    console.warn('[Persistence] getCurrentSceneSlotId failed', err);
    return null;
  }
}

function setCurrentSceneSlotId(slotId) {
  try {
    if (!slotId) {
      window.localStorage.removeItem(CURRENT_SCENE_SLOT_KEY);
    } else {
      window.localStorage.setItem(CURRENT_SCENE_SLOT_KEY, String(slotId));
    }
  } catch (err) {
    console.warn('[Persistence] setCurrentSceneSlotId failed', err);
  }
}

// Storage key helpers
function makeSceneStorageKeyFromSlot(slotId) {
  return `scene:${slotId}`;
}

// Type guard: is this object a full scene package?
function isScenePackage(obj) {
  return !!(
    obj &&
    obj.type === SCENE_PACKAGE_TYPE &&
    typeof obj.schemaVersion === 'number' &&
    obj.payload
  );
}

// Turn a bare snapshot into a scene package with some metadata.
// `overrides` can include slotId, displayName, createdAt, thumbnail.
function wrapSnapshotAsPackage(snapshot, overrides = {}) {
  const nowIso = new Date().toISOString();
  return {
    type: SCENE_PACKAGE_TYPE,
    schemaVersion: SCENE_PACKAGE_SCHEMA_VERSION,
    slotId: overrides.slotId ?? null,
    displayName: overrides.displayName ?? 'Untitled Scene',
    createdAt: overrides.createdAt ?? nowIso,
    updatedAt: nowIso,
    thumbnail: overrides.thumbnail ?? null,
    payload: snapshot
  };
}

// --- Scene slot helpers ---

// Read a scene package from a given slot.
// If the stored data is an old-style bare snapshot, wrap it as a package.
function getScenePackageFromSlot(slotId) {
  const key = makeSceneStorageKeyFromSlot(slotId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (isScenePackage(parsed)) {
      // Ensure slotId is set
      if (!parsed.slotId) {
        parsed.slotId = slotId;
      }
      return parsed;
    }

    // Legacy format: bare snapshot
    const legacySnapshot = parsed;
    const slotIndex = SCENE_SLOT_IDS.indexOf(slotId);
    const defaultName =
      slotIndex >= 0 ? `Save ${slotIndex + 1}` : 'Imported Scene';

    const pkg = wrapSnapshotAsPackage(legacySnapshot, {
      slotId,
      displayName: defaultName
    });

    // Write back as a proper package so next time is cheaper
    window.localStorage.setItem(key, JSON.stringify(pkg));
    return pkg;
  } catch (err) {
    console.warn('[Persistence] Failed to parse scene slot', slotId, err);
    return null;
  }
}

// Save / update a scene package in a given slot.
function saveScenePackageToSlot(slotId, pkg) {
  const key = makeSceneStorageKeyFromSlot(slotId);
  const nowIso = new Date().toISOString();

  const merged = {
    ...pkg,
    type: SCENE_PACKAGE_TYPE,
    schemaVersion: SCENE_PACKAGE_SCHEMA_VERSION,
    slotId,
    updatedAt: nowIso,
    // createdAt should be stable if it already existed.
    createdAt: pkg.createdAt || nowIso
  };

  window.localStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

// Delete all data from a slot.
function deleteSceneSlot(slotId) {
  const key = makeSceneStorageKeyFromSlot(slotId);
  window.localStorage.removeItem(key);
}

// Return metadata for all slots for UI: slotId, isEmpty, displayName, pkg.
function listSceneSlots() {
  return SCENE_SLOT_IDS.map((slotId, index) => {
    const pkg = getScenePackageFromSlot(slotId);
    if (!pkg) {
      return {
        slotId,
        index,
        isEmpty: true,
        displayName: `Save ${index + 1}`,
        package: null
      };
    }

    return {
      slotId,
      index,
      isEmpty: false,
      displayName: pkg.displayName || `Save ${index + 1}`,
      package: pkg
    };
  });
}

function nowIso(){ try{ return new Date().toISOString(); }catch{ return '';} }

function readNumber(v, def){ const n = Number(v); return Number.isFinite(n) ? n : def; }

function panelId(panel){ return panel.id || panel.dataset.toyid || panel.dataset.toy || `panel-${Math.random().toString(36).slice(2)}`; }

function readUI(panel){
  const cs = getComputedStyle(panel);
  const toy = panel?.dataset?.toy;
  // Let drawgrid compute its own height from aspect ratio; persisting height
  // causes header/footer hide/show to stretch the body after reload.
  const shouldSkipHeight = toy === 'drawgrid';
  return {
    left: cs.left || panel.style.left || '0px',
    top: cs.top || panel.style.top || '0px',
    width: cs.width || panel.style.width || '',
    height: shouldSkipHeight ? '' : (cs.height || panel.style.height || ''),
    z: readNumber(panel.style.zIndex, undefined)
  };
}

function applyUI(panel, ui){
  if (!ui) return;
   const toy = panel?.dataset?.toy;
  panel.style.position = 'absolute';
  if (ui.left) panel.style.left = String(ui.left);
  if (ui.top) panel.style.top = String(ui.top);
  if (ui.width) panel.style.width = String(ui.width);
  if (toy === 'drawgrid') {
    panel.style.height = '';
  } else if (ui.height) {
    panel.style.height = String(ui.height);
  }
  if (ui.z !== undefined) panel.style.zIndex = String(ui.z);
}

// --- Toy-specific snapshotters ---

function snapLoopGrid(panel){
  const st = panel.__gridState || {};
  return {
    steps: Array.isArray(st.steps) ? Array.from(st.steps) : [],
    notes: Array.isArray(st.notes) ? Array.from(st.notes) : undefined,
    noteIndices: Array.isArray(st.noteIndices) ? Array.from(st.noteIndices) : [],
    instrument: panel.dataset.instrument || undefined,
    ...snapInstrumentPitch(panel),
  };
}

function applyLoopGrid(panel, state){
  if (!state) return;
  try{
    if (panel.__gridState){
      if (Array.isArray(state.steps)){
        panel.__gridState.steps = Array.from(state.steps).map(v=>!!v);
      }
      if (Array.isArray(state.notes)){
        panel.__gridState.notes = Array.from(state.notes).map(x=> x|0);
      }
      if (Array.isArray(state.noteIndices)){
        panel.__gridState.noteIndices = Array.from(state.noteIndices).map(x=> x|0);
      }
      // try{ persistTraceLog('[persistence] applied loopgrid state to initialized toy', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
    } else {
      // Defer: toy not initialized yet; stash and let the toy pick this up on boot
      panel.__pendingLoopGridState = {
        steps: Array.isArray(state.steps) ? Array.from(state.steps).map(v=>!!v) : undefined,
        notes: Array.isArray(state.notes) ? Array.from(state.notes).map(x=>x|0) : undefined,
        noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices).map(x=>x|0) : undefined,
        instrument: state.instrument,
        instrumentPitchShift: state.instrumentPitchShift,
        instrumentOctave: state.instrumentOctave,
        instrumentNote: state.instrumentNote,
      };
      // try{ persistTraceLog('[persistence] stashed loopgrid state for later apply', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
    }
    if (state.instrument){
      panel.dataset.instrument = state.instrument;
      panel.dataset.instrumentPersisted = '1';
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    } else {
      delete panel.dataset.instrumentPersisted;
    }
    applyInstrumentPitch(panel, state);
  }catch(e){ console.warn('[persistence] applyLoopGrid failed', e); }
}

function snapBouncer(panel){
  try{
    if (typeof panel.__getBouncerSnapshot === 'function'){
      const snap = panel.__getBouncerSnapshot();
      return { ...(snap || {}), ...snapInstrumentPitch(panel) };
    }
  }catch{}
  // Fallback
    return {
      instrument: panel.dataset.instrument || undefined,
      ...snapInstrumentPitch(panel),
      speed: parseFloat(panel.dataset.speed||'') || undefined,
      quantDiv: parseFloat(panel.dataset.quantDiv||panel.dataset.quant||'') || undefined,
    };
}

function applyBouncer(panel, state){
  try{
    if (typeof panel.__applyBouncerSnapshot === 'function'){
      panel.__applyBouncerSnapshot(state||{});
      return;
    }
    // Toy not initialized yet. Stash full state for init, and apply light dataset hints now.
    try{ panel.__pendingBouncerState = state || {}; }catch{}
    // Fallbacks: set instrument/speed/quant in dataset so UI picks them up later
    if (state?.instrument){
      panel.dataset.instrument = state.instrument;
      panel.dataset.instrumentPersisted = '1';
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    } else {
      delete panel.dataset.instrumentPersisted;
    }
    applyInstrumentPitch(panel, state);
    applyInstrumentPitch(panel, state);
    if (typeof state?.speed === 'number'){
      try{ panel.dataset.speed = String(state.speed); }catch{}
    }
    if (typeof state?.quantDiv !== 'undefined'){
      try{ panel.dataset.quantDiv = String(state.quantDiv); }catch{}
    }
  }catch(e){ console.warn('[persistence] applyBouncer failed', e); }
}

function snapRippler(panel){
  try{
    if (typeof panel.__getRipplerSnapshot === 'function') {
      const snap = panel.__getRipplerSnapshot();
      return { ...(snap || {}), ...snapInstrumentPitch(panel) };
    }
  }catch{}
  return { instrument: panel.dataset.instrument || undefined, ...snapInstrumentPitch(panel) };
}
function applyRippler(panel, state){
  try{
    if (typeof panel.__applyRipplerSnapshot === 'function'){ panel.__applyRipplerSnapshot(state||{}); return; }
    // Not initialized yet; stash and set minimal hints.
    try{ panel.__pendingRipplerState = state || {}; }catch{}
    if (state?.instrument){
      panel.dataset.instrument = state.instrument;
      panel.dataset.instrumentPersisted = '1';
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    } else {
      delete panel.dataset.instrumentPersisted;
    }
    if (typeof state?.quantDiv !== 'undefined'){
      try{ panel.dataset.quantDiv = String(state.quantDiv); }catch{}
    }
  }catch(e){ console.warn('[persistence] applyRippler failed', e); }
}

function snapDrawGrid(panel) {
  const toy = panel.__drawToy;
  if (toy && typeof toy.getState === 'function') {
    return { ...toy.getState(), ...snapInstrumentPitch(panel) };
  }
  return { ...snapInstrumentPitch(panel) };
}

function applyDrawGrid(panel, state) {
  const toy = panel.__drawToy;

  // Summarize state for logs
  const sum = (st = {}) => {
    const strokes = Array.isArray(st.strokes) ? st.strokes.length : 0;
    const er = Array.isArray(st.eraseStrokes) ? st.eraseStrokes.length : 0;
    const act = Array.isArray(st?.nodes?.active) ? st.nodes.active.filter(Boolean).length : 0;
    const steps = (typeof st.steps === 'number') ? st.steps : undefined;
    return { strokes, erases: er, activeCols: act, steps };
  };

  // If toy isn't initialized yet, stash full state for init-time apply.
    if (!toy || typeof toy.setState !== 'function') {
      try {
        panel.__pendingDrawGridState = state || {};
        applyInstrumentPitch(panel, state);
        persistTraceLog('[persistence][drawgrid] STASH (toy-not-ready)', panel.id, sum(state));
      } catch {}
      return;
    }

    try {
      const incomingStats = __stateStats(state);
      if (!incomingStats.nonEmpty) {
        let existingStats = null;
        try { existingStats = __stateStats(toy.getState?.()); } catch {}
        if (!existingStats || !existingStats.nonEmpty) {
          try { existingStats = __stateStats(panel.__getDrawgridPersistedState?.()); } catch {}
        }
        if (existingStats?.nonEmpty) {
          persistTraceLog('[persistence][drawgrid] SKIP (empty incoming would overwrite existing)', {
            panelId: panel.id,
            incoming: incomingStats,
            existing: existingStats,
          });
          return;
        }
      }
      const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
      const hasErase = Array.isArray(state?.eraseStrokes) && state.eraseStrokes.length > 0;
      const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
      const hasExplicitStrokes = !!state && Object.prototype.hasOwnProperty.call(state, 'strokes');
      const hasExplicitErase = !!state && Object.prototype.hasOwnProperty.call(state, 'eraseStrokes');
      const hasExplicitNodes = !!state && Object.prototype.hasOwnProperty.call(state, 'nodes');
      const hasExplicitSteps = typeof state?.steps === 'number';
      const hasExplicitMeta =
        !!state &&
        (Object.prototype.hasOwnProperty.call(state, 'autotune') ||
          Object.prototype.hasOwnProperty.call(state, 'instrument') ||
          Object.prototype.hasOwnProperty.call(state, 'manualOverrides'));
      const meaningful =
        hasStrokes ||
        hasErase ||
        hasActiveNodes ||
        hasExplicitStrokes ||
        hasExplicitErase ||
        hasExplicitNodes ||
        hasExplicitSteps ||
        hasExplicitMeta;

      if (meaningful) {
        persistTraceLog('[persistence][drawgrid] APPLY (meaningful)', panel.id, sum(state));
        applyInstrumentPitch(panel, state);
        toy.setState(state);
        return;
      }

    // Fallback path: empty snapshot — hydrate directly from localStorage.
    let local = null;
    try { local = panel.__getDrawgridPersistedState?.(); } catch {}
    if (local && typeof local === 'object') {
      persistTraceLog('[persistence][drawgrid] APPLY (fallback-local)', panel.id, sum(local));
      try { toy.setState(local); return; }
      catch (err) { console.warn('[persistence] drawgrid local fallback failed', err); }
    }

    persistTraceLog('[persistence][drawgrid] NO-OP (empty-state, no-local)', panel.id, sum(state));
  } catch(e) {
    console.warn('[persistence] applyDrawGrid failed', e);
  }
}

function captureCameraState() {
  try {
    const viewport = document.querySelector('.board-viewport');
    const board = document.getElementById('board');
    if (!viewport || !board) return null;

    const zoom = (typeof zcGetZoomState === 'function') ? zcGetZoomState() : (typeof window !== 'undefined' && typeof window.getZoomState === 'function' ? window.getZoomState() : null);
    const zoomScale = Number.isFinite(zoom?.currentScale) ? zoom.currentScale : Number.isFinite(zoom?.targetScale) ? zoom.targetScale : Number(window?.__boardScale);
    const zoomX = Number.isFinite(zoom?.currentX) ? zoom.currentX : Number.isFinite(zoom?.targetX) ? zoom.targetX : Number(window?.__boardX);
    const zoomY = Number.isFinite(zoom?.currentY) ? zoom.currentY : Number.isFinite(zoom?.targetY) ? zoom.targetY : Number(window?.__boardY);

    const cs = getComputedStyle(board);
    const bvScale = cs.getPropertyValue('--bv-scale') || '';
    const bvOffsetX = cs.getPropertyValue('--bv-offset-x') || '';
    const bvOffsetY = cs.getPropertyValue('--bv-offset-y') || '';

    const overviewActive = !!(window.__overviewMode?.state?.isActive || window.overviewMode?.state?.isActive);

    return {
      boardTransform: board.style.transform || '',
      viewportScrollLeft: viewport.scrollLeft || 0,
      viewportScrollTop: viewport.scrollTop || 0,
      bvScale: bvScale.trim() || undefined,
      bvOffsetX: bvOffsetX.trim() || undefined,
      bvOffsetY: bvOffsetY.trim() || undefined,
      scale: Number.isFinite(zoomScale) ? zoomScale : undefined,
      x: Number.isFinite(zoomX) ? zoomX : undefined,
      y: Number.isFinite(zoomY) ? zoomY : undefined,
      overviewActive
    };
  } catch (err) {
    console.warn('[persistence] captureCameraState failed', err);
    return null;
  }
}

function applyCameraState(camera) {
  if (!camera || typeof camera !== 'object') return;
  try {
    const parseNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Parse translate/scale from a transform string if present (e.g., "translate3d(xpx, ypx, 0) scale(s)")
    const parseTransform = (tr) => {
      if (!tr || typeof tr !== 'string') return {};
      const match = tr.match(/translate3d?\s*\(\s*([-0-9.]+)px[^0-9.-]*([-0-9.]+)px/i);
      const scaleMatch = tr.match(/scale\s*\(\s*([-0-9.]+)\s*\)/i);
      const tx = match ? parseNum(match[1]) : null;
      const ty = match ? parseNum(match[2]) : null;
      const sc = scaleMatch ? parseNum(scaleMatch[1]) : null;
      return { tx, ty, sc };
    };

    const { tx: parsedTx, ty: parsedTy, sc: parsedScale } = parseTransform(camera.boardTransform);
    const scaleVal = parseNum(camera.scale ?? camera.bvScale ?? parsedScale);
    const xVal = parseNum(camera.x ?? camera.bvOffsetX ?? parsedTx);
    const yVal = parseNum(camera.y ?? camera.bvOffsetY ?? parsedTy);

    const viewport = document.querySelector('.board-viewport');
    const board = document.getElementById('board');

    // If ZoomCoordinator is available, drive it so internal state matches the restored view.
    if (typeof zcSetGestureTransform === 'function' && typeof zcCommitGesture === 'function') {
      const targetScale = Number.isFinite(scaleVal) ? scaleVal : 1;
      const targetX = Number.isFinite(xVal) ? xVal : 0;
      const targetY = Number.isFinite(yVal) ? yVal : 0;
      try { zcSetGestureTransform({ scale: targetScale, x: targetX, y: targetY }); } catch {}
      try { zcCommitGesture({ scale: targetScale, x: targetX, y: targetY }, { delayMs: 0 }); } catch {}
      try { localStorage.setItem('boardViewport', JSON.stringify({ scale: targetScale, x: targetX, y: targetY })); } catch {}
    }

    if (viewport) {
      if (Number.isFinite(camera.viewportScrollLeft)) {
        viewport.scrollLeft = camera.viewportScrollLeft;
      }
      if (Number.isFinite(camera.viewportScrollTop)) {
        viewport.scrollTop = camera.viewportScrollTop;
      }
    }

    if (board) {
      if (typeof camera.boardTransform === 'string' && camera.boardTransform) {
        board.style.transform = camera.boardTransform;
      }

      const setVar = (name, val) => {
        if (val === undefined || val === null) return;
        const s = String(val).trim();
        if (!s) return;
        try { board.style.setProperty(name, s); } catch {}
      };

      setVar('--bv-scale', camera.bvScale);
      setVar('--bv-offset-x', camera.bvOffsetX);
      setVar('--bv-offset-y', camera.bvOffsetY);
    }

    // Restore overview mode toggle if captured
    if (typeof camera.overviewActive === 'boolean') {
      const ov = window.__overviewMode || window.overviewMode;
      if (ov && ov.state) {
        try {
          if (camera.overviewActive && !ov.state.isActive) {
            ov.enter?.(false);
          } else if (!camera.overviewActive && ov.state.isActive) {
            ov.exit?.(false);
          }
        } catch {}
      } else {
        // Overview module not ready yet; request a deferred restore.
        try { window.__pendingOverviewRestore = camera.overviewActive; } catch {}
      }
    }
  } catch (err) {
    console.warn('[persistence] applyCameraState failed', err);
  }
}

const ToySnapshotters = {
  loopgrid: { snap: snapLoopGrid, apply: applyLoopGrid },
  'loopgrid-drum': { snap: snapLoopGrid, apply: applyLoopGrid },
  bouncer: { snap: snapBouncer, apply: applyBouncer },
  rippler: { snap: snapRippler, apply: applyRippler },
    chordwheel: {
      snap: (panel)=>{
        try{
          if (typeof panel.__getChordwheelSnapshot === 'function') {
            const snap = panel.__getChordwheelSnapshot();
            return { ...(snap || {}), ...snapInstrumentPitch(panel) };
          }
        }catch{}
        // Fallback minimal snapshot
        return { instrument: panel.dataset.instrument || undefined, steps: Number(panel.dataset.steps)||undefined, ...snapInstrumentPitch(panel) };
      },
    apply: (panel, state)=>{
      try{
        if (typeof panel.__applyChordwheelSnapshot === 'function'){ panel.__applyChordwheelSnapshot(state||{}); return; }
        // Stash until toy init; also apply light hints now
        try{ panel.__pendingChordwheelState = state || {}; }catch{}
          if (state?.instrument){
            try{
              panel.dataset.instrument = state.instrument;
              panel.dataset.instrumentPersisted = '1';
            }catch{}
          } else {
            delete panel.dataset.instrumentPersisted;
          }
          applyInstrumentPitch(panel, state);
        if (typeof state?.steps === 'number'){ try{ panel.dataset.steps = String(state.steps); }catch{} }
      }catch(e){ console.warn('[persistence] applyChordwheel failed', e); }
    }
  },
  drawgrid: { snap: snapDrawGrid, apply: applyDrawGrid },
};

export function getSnapshot(){
  const panels = Array.from(document.querySelectorAll('#board > .toy-panel'));
  const toys = panels.map(panel => {
    const type = String(panel.dataset.toy||'').toLowerCase();
    const id = panelId(panel);
    const snapper = ToySnapshotters[type]?.snap || (()=>({}));
    return {
      id, type,
      ui: readUI(panel),
      state: snapper(panel) || {},
      muted: undefined,
      solo: undefined,
    };
  });

  // --- Capture chain links (parent -> child) ---
  const chains = [];
  try {
    const chainedPanels = Array.from(document.querySelectorAll('.toy-panel[id]'));
    for (const el of chainedPanels) {
      const childId = el.id;
      const parentId = el.dataset.chainParent;
      if (childId && parentId) chains.push({ parentId, childId });
    }
  } catch {}

  // --- Capture camera / board view ---
  const camera = captureCameraState();

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    transport: { bpm },
    themeId: getActiveThemeKey?.() || undefined,
    toys,
    chains,
    camera,
  };
}

export function applySnapshot(snap){
  if (!snap || typeof snap !== 'object') return false;
  return applySceneSnapshot(snap);
}

export function applySceneSnapshot(snap){
  if (!snap || typeof snap !== 'object') return false;
  try{
    // Always pause transport when applying a scene so it doesn't auto-play after load.
    try { if (typeof stopTransport === 'function') stopTransport(); } catch {}
    // try{ persistTraceLog('[persistence] applySnapshot begin', { toys: snap?.toys?.length||0, theme: snap?.themeId, bpm: snap?.transport?.bpm }); }catch{}
    // Theme first so instrument resolution matches theme
    if (snap.themeId && typeof setActiveThemeKey === 'function'){
      try{ setActiveThemeKey(snap.themeId); }catch{}
      if (window.ThemeBoot && window.ThemeBoot.setTheme){
        try{ window.ThemeBoot.setTheme(snap.themeId); }catch{}
        try{ window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
      }
    }

    // Transport
    if (snap.transport && typeof snap.transport.bpm !== 'undefined'){
      try{ setBpm(Number(snap.transport.bpm)||bpm); }catch{}
    }

    // Camera / board view (newer snapshots)
    if (snap.camera || snap.boardView) {
      try {
        // support either .camera (new) or .boardView (if we ever rename) 
        applyCameraState(snap.camera || snap.boardView);
      } catch (err) {
        console.warn('[persistence] camera restore failed', err);
      }
    }

    // Toys: match by id first, else by type order.
    const panels = Array.from(document.querySelectorAll('#board > .toy-panel'));
    const byId = new Map(panels.map(p => [panelId(p), p]));
    const factory = window.MusicToyFactory;
    const usedPanels = new Set();
    const posMap = {};
    let appliedCount = 0;
    for (const t of (snap.toys||[])){
      let createdFromFactory = false;
      let panel = byId.get(t.id);
      if (!panel){
        // Try to find first panel of same type not yet used
        panel = panels.find(p => String(p.dataset.toy||'').toLowerCase() === t.type && !usedPanels.has(p));
      }
      if (!panel && factory && typeof factory.create === 'function'){
        try{
          const ui = t.ui || {};
          const left = parseFloat(ui.left);
          const top = parseFloat(ui.top);
          const width = parseFloat(ui.width);
          const height = parseFloat(ui.height);
          const opts = {};
          if (Number.isFinite(left) && Number.isFinite(width)) opts.centerX = left + width / 2;
          if (Number.isFinite(top) && Number.isFinite(height)) opts.centerY = top + height / 2;
          if (t.state && typeof t.state === 'object' && t.state.instrument) opts.instrument = t.state.instrument;
          panel = factory.create(t.type, opts);
          if (panel){
            panels.push(panel);
            byId.set(panelId(panel), panel);
            createdFromFactory = true;
          }
        }catch(err){
          console.warn('[persistence] create panel failed', err);
        }
      }
      if (!panel) continue;
      if (createdFromFactory) {
        try { panel.__restoringFromSnapshot = true; } catch {}
      }
      if (t.id){
        try{
          const existing = document.getElementById(t.id);
          if (!existing || existing === panel){
            panel.id = t.id;
          }
        }catch{}
      }
      byId.set(panelId(panel), panel);
      usedPanels.add(panel);
      // Restores should land at their normal scale; drop the spawn bounce hint added for brand-new toys.
      try {
        delete panel.dataset.spawnScaleHint;
        panel.removeAttribute?.('data-spawn-scale-hint');
      } catch {}
      try{
        applyUI(panel, t.ui);
        // collect positions for board.js persistence too
        posMap[panelId(panel)] = { left: panel.style.left, top: panel.style.top };
      }catch{}
      const applier = ToySnapshotters[t.type]?.apply;
      if (typeof applier === 'function'){
        try {
          if (t.type === 'drawgrid') {
            const s = t.state || {};
            try {
              const stats = __stateStats(s);
              let stack = null;
              try { stack = (new Error('apply-snapshot')).stack?.split('\n').slice(0, 5).join('\n'); } catch {}
              persistTraceLog('[persist][APPLY]', { storageKey: `drawgrid:${panel.id}`, stats, stack });
              PERSIST_DIAG.lastApply = { t: __diagNow(), storageKey: `drawgrid:${panel.id}`, stats, stack };
            } catch {}
            const summary = {
              strokes: Array.isArray(s.strokes) ? s.strokes.length : 0,
              erases: Array.isArray(s.eraseStrokes) ? s.eraseStrokes.length : 0,
              activeCols: Array.isArray(s?.nodes?.active) ? s.nodes.active.filter(Boolean).length : 0,
              steps: typeof s.steps === 'number' ? s.steps : undefined,
            };
            persistTraceLog('[persistence] APPLY SNAPSHOT -> drawgrid', panel.id, summary);
          }
        } catch {}
        try{ applier(panel, t.state||{}); }catch(e){ console.warn('[persistence] apply failed for', t.type, e); }
      } else {
        // If the toy isn't ready yet, stash the state for init-time apply (bouncer)
        if (t.type === 'bouncer'){
          try{ panel.__pendingBouncerState = t.state || {}; }catch{}
        }
      }
      appliedCount++;
    }
    // --- Re-link chain edges AFTER all toys exist ---
    try {
      const edges = Array.isArray(snap.chains) ? snap.chains : [];

      // 1) Clear any stale prev/next links first (we will rebuild from edges)
      Array.from(document.querySelectorAll('.toy-panel[id]')).forEach(el => {
        delete el.dataset.prevToyId;
        delete el.dataset.nextToyId;
        // NOTE: keep chainParent; we'll set it from edges below
        if (!el.dataset.chainParent) delete el.dataset.chainParent;
      });

      // 2) Rebuild chainParent + linear prev/next links
      const parentHasNext = new Set(); // prevent multiple next links on the same parent
      for (const e of edges) {
        const parent = document.getElementById(e.parentId);
        const child = document.getElementById(e.childId);
        if (!parent || !child) continue;

        // Always restore the parent pointer used by play DFS
        child.dataset.chainParent = parent.id;

        // Rebuild linear prev/next if not already set
        if (!child.dataset.prevToyId) child.dataset.prevToyId = parent.id;

        // Mark the parent as having at least one child so UI can disable "+" immediately
        parent.dataset.chainHasChild = '1';
        // Pre-mark disabled state so hover styles stay off until UI refresh runs
        try { parent.setAttribute('data-chaindisabled', '1'); } catch {}

        // Only set parent's next if it isn't already taken or points to this child
        if (!parent.dataset.nextToyId || parent.dataset.nextToyId === child.id) {
          if (!parentHasNext.has(parent.id)) {
            parent.dataset.nextToyId = child.id;
            parentHasNext.add(parent.id);
          }
        }

        // Keep existing event for any listeners/visuals
        document.dispatchEvent(new CustomEvent('chain:linked', {
          detail: { parent: e.parentId || null, child: e.childId, phase: 'restore' }
        }));
      }

      // 3) Nudge any chain UI/derived state to refresh (best-effort, non-fatal)
      try {
        const raf = window.requestAnimationFrame?.bind(window) ?? (fn => setTimeout(fn, 16));
        raf(() => {
          try { window.updateChains?.(); } catch {}
          try { window.updateAllChainUIs?.(); } catch {}
          // Optional: log graph for diagnostics
          try {
            const graph = Array.from(document.querySelectorAll('.toy-panel[id]')).map(el => ({
              id: el.id,
              parent: el.dataset.chainParent || null,
              prev: el.dataset.prevToyId || null,
              next: el.dataset.nextToyId || null,
            }));
            persistTraceLog('[chain] graph (restored)', graph);
          } catch {}
        });
      } catch {}

      persistTraceLog('[persistence] chains restored', edges.length);
    } catch (err) {
      console.warn('[persistence] chain restore failed', err);
    }
    // Final pass to sync chain UI states after all restores are applied.
    try { window.updateAllChainUIs?.(); } catch {}
    try { setTimeout(() => { window.updateAllChainUIs?.(); }, 300); } catch {}

    // Remove any panels that were not part of the snapshot so the board matches the saved scene.
    panels.forEach(panel => {
      if (usedPanels.has(panel)) return;
      try{
        const destroy = window.MusicToyFactory?.destroy;
        if (typeof destroy === 'function'){
          destroy(panel);
        }
      }catch{}
      try{ panel.remove(); }catch{}
    });
    // Persist positions for board.js so refresh preserves locations
    try{
      const keys = Object.keys(posMap);
      if (keys.length){
        localStorage.setItem('toyPositions', JSON.stringify(posMap));
      } else {
        localStorage.removeItem('toyPositions');
      }
    }catch{}
    // try{ persistTraceLog('[persistence] applySnapshot end', { applied: appliedCount }); }catch{}
    return true;
  }catch(e){ console.warn('[persistence] applySnapshot failed', e); return false; }
}

// Apply a scene from a given slotId.
// Returns true if successful, false if the slot is empty or invalid.
function loadSceneFromSlot(slotId) {
  const pkg = getScenePackageFromSlot(slotId);
  if (!pkg) {
    console.warn('[Persistence] No scene in slot', slotId);
    return false;
  }

  const snapshot = isScenePackage(pkg) ? pkg.payload : pkg;

  try {
    applySceneSnapshot(snapshot);
    return true;
  } catch (err) {
    console.error('[Persistence] Failed to load scene from slot', slotId, err);
    return false;
  }
}

// --- Storage helpers (localStorage) ---

function saveToKey(key, data){
  let serialized = null;
  try{
    const stateToWrite = data && typeof data === 'object' ? data : null;
    try {
      const prevRaw = localStorage.getItem(key);
      let prevPayload = null;
      if (prevRaw) {
        try {
          const prevParsed = JSON.parse(prevRaw);
          prevPayload = (prevParsed && typeof prevParsed === 'object' && prevParsed.payload !== undefined)
            ? prevParsed.payload
            : prevParsed;
        } catch (parseErr) {
          persistTraceWarn('[persist] failed to parse previous payload for veto check', parseErr);
        }
      }
      let nextPayload = stateToWrite;
      if (stateToWrite && typeof stateToWrite === 'object') {
        if (stateToWrite.payload !== undefined) nextPayload = stateToWrite.payload;
        else if (stateToWrite.state !== undefined) nextPayload = stateToWrite.state;
      }
      const veto = __shouldVetoEmptyOverwrite(prevPayload, nextPayload, stateToWrite?.meta);
      if (veto) {
        const prevStats = __stateStats(prevPayload);
        const nextStats = __stateStats(nextPayload);
        persistTraceWarn('[persist][VETO] blocked empty overwrite', { key, prev: prevStats, next: nextStats, meta: stateToWrite?.meta || null });
        PERSIST_DIAG.lastVeto = { t: __diagNow(), storageKey: key, prev: prevStats, next: nextStats };
        return false;
      }
    } catch (guardErr) {
      persistTraceWarn('[persist] veto check failed (continuing)', guardErr);
    }
    serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    try {
      let payloadForStats = stateToWrite;
      if (stateToWrite && typeof stateToWrite === 'object') {
        if (stateToWrite.payload !== undefined) payloadForStats = stateToWrite.payload;
        else if (stateToWrite.state !== undefined) payloadForStats = stateToWrite.state;
      }
      const stats = __stateStats(payloadForStats);
      persistTraceLog('[persist][WRITE]', { storageKey: key, meta: stateToWrite?.meta || null, stats });
      PERSIST_DIAG.lastWrite = { t: __diagNow(), storageKey: key, stats };
    } catch (logErr) {
      persistTraceWarn('[persist] write stat log failed', logErr);
    }
    return true;
  }catch(e){
    if (__isQuotaExceededError(e)) {
      if (!__quotaCleanupAttempted) {
        __quotaCleanupAttempted = true;
        const removed = __evictDrawgridCache();
        if (removed && serialized !== null) {
          try {
            localStorage.setItem(key, serialized);
            return true;
          } catch {}
        }
      }
      if (!__quotaWarned) {
        __quotaWarned = true;
        console.warn('[persistence] save failed (storage quota exceeded)', e);
      }
      return false;
    }
    console.warn('[persistence] save failed', e);
    return false;
  }
}
function loadFromKey(key){
  try{
    const s = localStorage.getItem(key);
    if (!s) return null;
    const parsed = JSON.parse(s);
    try {
      const payload = (parsed && typeof parsed === 'object' && parsed.payload !== undefined) ? parsed.payload : parsed;
      const stats = __stateStats(payload);
      persistTraceLog('[persist][READ]', { storageKey: key, stats });
      PERSIST_DIAG.lastRead = { t: __diagNow(), storageKey: key, stats };
    } catch (logErr) {
      persistTraceWarn('[persist] read stat log failed', logErr);
    }
    return parsed;
  }catch(e){ console.warn('[persistence] load failed', e); return null; }
}

export function saveScene(name){
  const snap = getSnapshot();
  snap.updatedAt = nowIso();
  const ok = saveToKey(`scene:${name||'default'}`, snap);
  if (ok){ try{ localStorage.setItem(LAST_SCENE_KEY, name||'default'); }catch{} }
  return ok;
}

export function loadScene(name){
  const data = loadFromKey(`scene:${name||'default'}`);
  if (!data) return false;
  return applySnapshot(data);
}

export function listScenes(){
  const keys = Object.keys(localStorage);
  return keys.filter(k => k.startsWith('scene:')).map(k => k.slice('scene:'.length));
}

export function deleteScene(name){ try{ localStorage.removeItem(`scene:${name}`); return true; }catch{ return false; } }

export function exportScene(name){
  const data = loadFromKey(`scene:${name||'default'}`) || getSnapshot();
  return JSON.stringify(data, null, 2);
}

export function importScene(json){
  try{ const data = JSON.parse(json); return applySnapshot(data); }catch(e){ console.warn('[persistence] import failed', e); return false; }
}

// --- Autosave ---
let __autosaveTimer = 0; let __dirty = false; let __interval = 2000;

function scheduleAutosave(){
  if (__autosaveTimer) return;
  __autosaveTimer = setTimeout(()=>{
    __autosaveTimer = 0;
    if (!__dirty) return;
    __dirty = false;
    try{
      const snap = getSnapshot();
      const lc = (snap.toys||[]).filter(t=>t.type==='loopgrid' || t.type==='loopgrid-drum').length;
      saveToKey(AUTOSAVE_KEY, snap);
      // try{ console.log(`[persistence] autosaved (${lc} loopgrid variants, bpm=${snap.transport?.bpm}, theme=${snap.themeId})`); }catch{}
    }catch{}
  }, __interval);
}

export function markDirty(){ __dirty = true; scheduleAutosave(); }

export function startAutosave(intervalMs){
  if (Number.isFinite(intervalMs)) __interval = Math.max(500, intervalMs|0);
  // Coarse signals for state changes
  ['click','change','pointerdown','pointerup','keyup'].forEach(evt => document.addEventListener(evt, markDirty, true));
  window.addEventListener('resize', markDirty, true);
  // Listen to toy custom events that change state
  const toyEvents = ['grid:notechange','toy-random','toy-random-notes','toy-clear','toy-reset','toy-speed','bouncer:quant','toy-random-cubes','toy-random-blocks'];
  toyEvents.forEach(evt => document.addEventListener(evt, markDirty, true));
  // Save when page is being hidden/unloaded
  const flush = ()=>{ try{ const s = getSnapshot(); saveToKey(AUTOSAVE_KEY, s); persistTraceLog('[persistence] autosave flush on hide/unload'); }catch{} };
  window.addEventListener('beforeunload', flush, true);
  document.addEventListener('visibilitychange', ()=>{ if (document.hidden) flush(); }, true);
  // Mark initial state dirty to ensure a snapshot is captured shortly after boot
  setTimeout(()=>{ try{ markDirty(); }catch{} }, 250);
}

export function flushAutosaveNow(){
  try{
    const snap = getSnapshot();
    saveToKey(AUTOSAVE_KEY, snap);
  }catch{}
}

// Helper to ensure snapshots are up to date before a manual refresh.
export function flushBeforeRefresh(){
  try { flushAutosaveNow(); } catch {}
}

export function stopAutosave(){
  ['click','change','pointerdown','pointerup','keyup'].forEach(evt => document.removeEventListener(evt, markDirty, true));
  window.removeEventListener('resize', markDirty, true);
  if (__autosaveTimer) { clearTimeout(__autosaveTimer); __autosaveTimer = 0; }
}

export function tryRestoreOnBoot(){
  try{
    const url = new URL(window.location.href);
    if (url.searchParams.has('reset')){
      // One-shot reset: remove the flag from the URL to re-enable restore next boot
      try{
        url.searchParams.delete('reset');
        window.history.replaceState({}, document.title, url.toString());
        // persistTraceLog('[persistence] reset flag detected; skipping restore once');
      }catch{}
      return false;
    }
    const sceneQ = url.searchParams.get('scene');
    const last = localStorage.getItem(LAST_SCENE_KEY);
    const auto = loadFromKey(AUTOSAVE_KEY);
    // try{ persistTraceLog('[persistence] tryRestoreOnBoot', { hasReset:false, sceneQ, hasAuto: !!auto, last }); }catch{}
    if (sceneQ){ /* try{ persistTraceLog('[persistence] restoring from ?scene=', sceneQ); }catch{} */ return loadScene(sceneQ); }
    if (auto){
      // try{ persistTraceLog('[persistence] restoring from autosave'); }catch{}
      const applied = applySnapshot(auto);
      if (applied) {
        try {
          setTimeout(() => {
            try { markDirty(); flushAutosaveNow(); } catch {}
          }, 0);
        } catch {}
      }
      return applied;
    }
    if (last){ return loadScene(last); }
  }catch{}
  return false;
}

// Ensure autosave flushes on browser refresh / tab close
try {
  window.addEventListener('beforeunload', () => {
    try { flushAutosaveNow(); } catch {}
  }, { capture: true });
} catch {}

// Expose in window for quick manual access/debug
try{ window.Persistence = {
  getSnapshot,
  applySnapshot,
  saveScene,
  loadScene,
  listScenes,
  deleteScene,
  exportScene,
  importScene,
  startAutosave,
  stopAutosave,
  markDirty,
  tryRestoreOnBoot,
  flushAutosaveNow,
  flushBeforeRefresh,
  listSceneSlots,
  getScenePackageFromSlot,
  saveScenePackageToSlot,
  deleteSceneSlot,
  loadSceneFromSlot,
  SCENE_SLOT_IDS,
  MAX_SCENE_SLOTS,
  wrapSnapshotAsPackage,
  isScenePackage,
  getCurrentSceneSlotId,
  setCurrentSceneSlotId,
}; }catch{}
if (typeof window !== 'undefined') {
  window.__PERSIST_DEBUG = {
    readKey: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    writeKey: (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} },
    stat: __stateStats,
  };
}
