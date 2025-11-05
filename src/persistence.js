// src/persistence.js
// Lightweight scene save/load with versioning and localStorage backend.

import { bpm, setBpm } from './audio-core.js';
import { getActiveThemeKey, setActiveThemeKey } from './theme-manager.js';

// ---- Persistence diagnostics ----
const PERSIST_DIAG = (typeof window !== 'undefined') ? (window.__PERSIST_DIAG = window.__PERSIST_DIAG || {}) : {};
function __diagNow() {
  try { return performance.now(); }
  catch { return Date.now(); }
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
function __shouldVetoEmptyOverwrite(prevPayload, nextPayload, meta) {
  const prev = __stateStats(prevPayload);
  const next = __stateStats(nextPayload);
  const userCleared = !!(meta && meta.userCleared);
  return (prev.nonEmpty && !next.nonEmpty && !userCleared);
}

const SCHEMA_VERSION = 1;
const AUTOSAVE_KEY = 'scene:autosave';
const LAST_SCENE_KEY = 'prefs:lastScene';

function nowIso(){ try{ return new Date().toISOString(); }catch{ return '';} }

function readNumber(v, def){ const n = Number(v); return Number.isFinite(n) ? n : def; }

function panelId(panel){ return panel.id || panel.dataset.toyid || panel.dataset.toy || `panel-${Math.random().toString(36).slice(2)}`; }

function readUI(panel){
  const cs = getComputedStyle(panel);
  return {
    left: cs.left || panel.style.left || '0px',
    top: cs.top || panel.style.top || '0px',
    width: cs.width || panel.style.width || '',
    height: cs.height || panel.style.height || '',
    z: readNumber(panel.style.zIndex, undefined)
  };
}

function applyUI(panel, ui){
  if (!ui) return;
  panel.style.position = 'absolute';
  if (ui.left) panel.style.left = String(ui.left);
  if (ui.top) panel.style.top = String(ui.top);
  if (ui.width) panel.style.width = String(ui.width);
  if (ui.height) panel.style.height = String(ui.height);
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
      // try{ console.log('[persistence] applied loopgrid state to initialized toy', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
    } else {
      // Defer: toy not initialized yet; stash and let the toy pick this up on boot
      panel.__pendingLoopGridState = {
        steps: Array.isArray(state.steps) ? Array.from(state.steps).map(v=>!!v) : undefined,
        notes: Array.isArray(state.notes) ? Array.from(state.notes).map(x=>x|0) : undefined,
        noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices).map(x=>x|0) : undefined,
        instrument: state.instrument
      };
      // try{ console.log('[persistence] stashed loopgrid state for later apply', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
    }
    if (state.instrument){
      panel.dataset.instrument = state.instrument;
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    }
  }catch(e){ console.warn('[persistence] applyLoopGrid failed', e); }
}

function snapBouncer(panel){
  try{
    if (typeof panel.__getBouncerSnapshot === 'function'){
      return panel.__getBouncerSnapshot();
    }
  }catch{}
  // Fallback
  return {
    instrument: panel.dataset.instrument || undefined,
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
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    }
    if (typeof state?.speed === 'number'){
      try{ panel.dataset.speed = String(state.speed); }catch{}
    }
    if (typeof state?.quantDiv !== 'undefined'){
      try{ panel.dataset.quantDiv = String(state.quantDiv); }catch{}
    }
  }catch(e){ console.warn('[persistence] applyBouncer failed', e); }
}

function snapRippler(panel){
  try{ if (typeof panel.__getRipplerSnapshot === 'function') return panel.__getRipplerSnapshot(); }catch{}
  return { instrument: panel.dataset.instrument || undefined };
}
function applyRippler(panel, state){
  try{
    if (typeof panel.__applyRipplerSnapshot === 'function'){ panel.__applyRipplerSnapshot(state||{}); return; }
    // Not initialized yet; stash and set minimal hints.
    try{ panel.__pendingRipplerState = state || {}; }catch{}
    if (state?.instrument){
      panel.dataset.instrument = state.instrument;
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: state.instrument, value: state.instrument }, bubbles:true })); }catch{}
    }
    if (typeof state?.quantDiv !== 'undefined'){
      try{ panel.dataset.quantDiv = String(state.quantDiv); }catch{}
    }
  }catch(e){ console.warn('[persistence] applyRippler failed', e); }
}

function snapDrawGrid(panel) {
  const toy = panel.__drawToy;
  if (toy && typeof toy.getState === 'function') {
    return toy.getState();
  }
  return {};
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
      console.log('[persistence][drawgrid] STASH (toy-not-ready)', panel.id, sum(state));
    } catch {}
    return;
  }

  try {
    const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
    const hasErase = Array.isArray(state?.eraseStrokes) && state.eraseStrokes.length > 0;
    const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
    const meaningful = hasStrokes || hasErase || hasActiveNodes || (typeof state?.steps === 'number');

    if (meaningful) {
      console.log('[persistence][drawgrid] APPLY (meaningful)', panel.id, sum(state));
      toy.setState(state);
      return;
    }

    // Fallback path: empty snapshot — hydrate directly from localStorage.
    let local = null;
    try { local = panel.__getDrawgridPersistedState?.(); } catch {}
    if (local && typeof local === 'object') {
      console.log('[persistence][drawgrid] APPLY (fallback-local)', panel.id, sum(local));
      try { toy.setState(local); return; }
      catch (err) { console.warn('[persistence] drawgrid local fallback failed', err); }
    }

    console.log('[persistence][drawgrid] NO-OP (empty-state, no-local)', panel.id, sum(state));
  } catch(e) {
    console.warn('[persistence] applyDrawGrid failed', e);
  }
}

const ToySnapshotters = {
  loopgrid: { snap: snapLoopGrid, apply: applyLoopGrid },
  'loopgrid-drum': { snap: snapLoopGrid, apply: applyLoopGrid },
  bouncer: { snap: snapBouncer, apply: applyBouncer },
  rippler: { snap: snapRippler, apply: applyRippler },
  chordwheel: {
    snap: (panel)=>{
      try{ if (typeof panel.__getChordwheelSnapshot === 'function') return panel.__getChordwheelSnapshot(); }catch{}
      // Fallback minimal snapshot
      return { instrument: panel.dataset.instrument || undefined, steps: Number(panel.dataset.steps)||undefined };
    },
    apply: (panel, state)=>{
      try{
        if (typeof panel.__applyChordwheelSnapshot === 'function'){ panel.__applyChordwheelSnapshot(state||{}); return; }
        // Stash until toy init; also apply light hints now
        try{ panel.__pendingChordwheelState = state || {}; }catch{}
        if (state?.instrument){ try{ panel.dataset.instrument = state.instrument; }catch{} }
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
  // --- Capture chain links (parent → child) ---
  const chains = [];
  try {
    const chainedPanels = Array.from(document.querySelectorAll('.toy-panel[id]'));
    for (const el of chainedPanels) {
      const childId = el.id;
      const parentId = el.dataset.chainParent;
      if (childId && parentId) chains.push({ parentId, childId });
    }
  } catch {}
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    transport: { bpm },
    themeId: getActiveThemeKey?.() || undefined,
    toys,
    chains,
  };
}

export function applySnapshot(snap){
  if (!snap || typeof snap !== 'object') return false;
  try{
    // try{ console.log('[persistence] applySnapshot begin', { toys: snap?.toys?.length||0, theme: snap?.themeId, bpm: snap?.transport?.bpm }); }catch{}
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

    // Toys: match by id first, else by type order.
    const panels = Array.from(document.querySelectorAll('#board > .toy-panel'));
    const byId = new Map(panels.map(p => [panelId(p), p]));
    const factory = window.MusicToyFactory;
    const usedPanels = new Set();
    const posMap = {};
    let appliedCount = 0;
    for (const t of (snap.toys||[])){
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
          }
        }catch(err){
          console.warn('[persistence] create panel failed', err);
        }
      }
      if (!panel) continue;
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
              console.log('[persist][APPLY]', { storageKey: `drawgrid:${panel.id}`, stats, stack });
              PERSIST_DIAG.lastApply = { t: __diagNow(), storageKey: `drawgrid:${panel.id}`, stats, stack };
            } catch {}
            const summary = {
              strokes: Array.isArray(s.strokes) ? s.strokes.length : 0,
              erases: Array.isArray(s.eraseStrokes) ? s.eraseStrokes.length : 0,
              activeCols: Array.isArray(s?.nodes?.active) ? s.nodes.active.filter(Boolean).length : 0,
              steps: typeof s.steps === 'number' ? s.steps : undefined,
            };
            console.log('[persistence] APPLY SNAPSHOT -> drawgrid', panel.id, summary);
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
            console.log('[chain] graph (restored)', graph);
          } catch {}
        });
      } catch {}

      console.log('[persistence] chains restored', edges.length);
    } catch (err) {
      console.warn('[persistence] chain restore failed', err);
    }
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
    // try{ console.log('[persistence] applySnapshot end', { applied: appliedCount }); }catch{}
    return true;
  }catch(e){ console.warn('[persistence] applySnapshot failed', e); return false; }
}

// --- Storage helpers (localStorage) ---

function saveToKey(key, data){
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
          console.warn('[persist] failed to parse previous payload for veto check', parseErr);
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
        console.warn('[persist][VETO] blocked empty overwrite', { key, prev: prevStats, next: nextStats, meta: stateToWrite?.meta || null });
        PERSIST_DIAG.lastVeto = { t: __diagNow(), storageKey: key, prev: prevStats, next: nextStats };
        return false;
      }
    } catch (guardErr) {
      console.warn('[persist] veto check failed (continuing)', guardErr);
    }
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    try {
      let payloadForStats = stateToWrite;
      if (stateToWrite && typeof stateToWrite === 'object') {
        if (stateToWrite.payload !== undefined) payloadForStats = stateToWrite.payload;
        else if (stateToWrite.state !== undefined) payloadForStats = stateToWrite.state;
      }
      const stats = __stateStats(payloadForStats);
      console.log('[persist][WRITE]', { storageKey: key, meta: stateToWrite?.meta || null, stats });
      PERSIST_DIAG.lastWrite = { t: __diagNow(), storageKey: key, stats };
    } catch (logErr) {
      console.warn('[persist] write stat log failed', logErr);
    }
    return true;
  }catch(e){ console.warn('[persistence] save failed', e); return false; }
}
function loadFromKey(key){
  try{
    const s = localStorage.getItem(key);
    if (!s) return null;
    const parsed = JSON.parse(s);
    try {
      const payload = (parsed && typeof parsed === 'object' && parsed.payload !== undefined) ? parsed.payload : parsed;
      const stats = __stateStats(payload);
      console.log('[persist][READ]', { storageKey: key, stats });
      PERSIST_DIAG.lastRead = { t: __diagNow(), storageKey: key, stats };
    } catch (logErr) {
      console.warn('[persist] read stat log failed', logErr);
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
  const flush = ()=>{ try{ const s = getSnapshot(); saveToKey(AUTOSAVE_KEY, s); console.log('[persistence] autosave flush on hide/unload'); }catch{} };
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
        // console.log('[persistence] reset flag detected; skipping restore once');
      }catch{}
      return false;
    }
    const sceneQ = url.searchParams.get('scene');
    const last = localStorage.getItem(LAST_SCENE_KEY);
    const auto = loadFromKey(AUTOSAVE_KEY);
    // try{ console.log('[persistence] tryRestoreOnBoot', { hasReset:false, sceneQ, hasAuto: !!auto, last }); }catch{}
    if (sceneQ){ /* try{ console.log('[persistence] restoring from ?scene=', sceneQ); }catch{} */ return loadScene(sceneQ); }
    if (auto){
      // try{ console.log('[persistence] restoring from autosave'); }catch{}
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

// Expose in window for quick manual access/debug
try{ window.Persistence = { getSnapshot, applySnapshot, saveScene, loadScene, listScenes, deleteScene, exportScene, importScene, startAutosave, stopAutosave, markDirty, tryRestoreOnBoot, flushAutosaveNow, flushBeforeRefresh }; }catch{}
if (typeof window !== 'undefined') {
  window.__PERSIST_DEBUG = {
    readKey: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    writeKey: (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} },
    stat: __stateStats,
  };
}
