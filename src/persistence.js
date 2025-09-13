// src/persistence.js
// Lightweight scene save/load with versioning and localStorage backend.

import { bpm, setBpm } from './audio-core.js';
import { getActiveThemeKey, setActiveThemeKey } from './theme-manager.js';

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
      try{ console.log('[persistence] applied loopgrid state to initialized toy', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
    } else {
      // Defer: toy not initialized yet; stash and let the toy pick this up on boot
      panel.__pendingLoopGridState = {
        steps: Array.isArray(state.steps) ? Array.from(state.steps).map(v=>!!v) : undefined,
        notes: Array.isArray(state.notes) ? Array.from(state.notes).map(x=>x|0) : undefined,
        noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices).map(x=>x|0) : undefined,
        instrument: state.instrument
      };
      try{ console.log('[persistence] stashed loopgrid state for later apply', { steps: state.steps?.length, noteIndices: state.noteIndices?.length }); }catch{}
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
  if (toy && typeof toy.setState === 'function') {
    try { toy.setState(state); }
    catch(e) { console.warn('[persistence] applyDrawGrid failed', e); }
  }
}

const ToySnapshotters = {
  loopgrid: { snap: snapLoopGrid, apply: applyLoopGrid },
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
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    transport: { bpm },
    themeId: getActiveThemeKey?.() || undefined,
    toys,
  };
}

export function applySnapshot(snap){
  if (!snap || typeof snap !== 'object') return false;
  try{
    try{ console.log('[persistence] applySnapshot begin', { toys: snap?.toys?.length||0, theme: snap?.themeId, bpm: snap?.transport?.bpm }); }catch{}
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
    const posMap = {};
    let appliedCount = 0;
    for (const t of (snap.toys||[])){
      let panel = byId.get(t.id);
      if (!panel){
        // Try to find first panel of same type not yet used
        panel = panels.find(p => String(p.dataset.toy||'').toLowerCase() === t.type && !p.___usedForApply);
      }
      if (!panel) continue;
      panel.___usedForApply = true;
      try{
        applyUI(panel, t.ui);
        // collect positions for board.js persistence too
        posMap[panelId(panel)] = { left: panel.style.left, top: panel.style.top };
      }catch{}
      const applier = ToySnapshotters[t.type]?.apply;
      if (typeof applier === 'function'){
        try{ applier(panel, t.state||{}); }catch(e){ console.warn('[persistence] apply failed for', t.type, e); }
      } else {
        // If the toy isn't ready yet, stash the state for init-time apply (bouncer)
        if (t.type === 'bouncer'){
          try{ panel.__pendingBouncerState = t.state || {}; }catch{}
        }
      }
      appliedCount++;
    }
    panels.forEach(p => delete p.___usedForApply);
    // Persist positions for board.js so refresh preserves locations
    try{ if (Object.keys(posMap).length){ localStorage.setItem('toyPositions', JSON.stringify(posMap)); } }catch{}
    try{ console.log('[persistence] applySnapshot end', { applied: appliedCount }); }catch{}
    return true;
  }catch(e){ console.warn('[persistence] applySnapshot failed', e); return false; }
}

// --- Storage helpers (localStorage) ---

function saveToKey(key, data){
  try{
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  }catch(e){ console.warn('[persistence] save failed', e); return false; }
}
function loadFromKey(key){ try{ const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }catch(e){ console.warn('[persistence] load failed', e); return null; } }

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
      const lc = (snap.toys||[]).filter(t=>t.type==='loopgrid').length;
      saveToKey(AUTOSAVE_KEY, snap);
      try{ console.log(`[persistence] autosaved (${lc} loopgrid, bpm=${snap.transport?.bpm}, theme=${snap.themeId})`); }catch{}
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

export function stopAutosave(){
  ['click','change','pointerup','keyup'].forEach(evt => document.removeEventListener(evt, markDirty, true));
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
        console.log('[persistence] reset flag detected; skipping restore once');
      }catch{}
      return false;
    }
    const sceneQ = url.searchParams.get('scene');
    const last = localStorage.getItem(LAST_SCENE_KEY);
    const auto = loadFromKey(AUTOSAVE_KEY);
    try{ console.log('[persistence] tryRestoreOnBoot', { hasReset:false, sceneQ, hasAuto: !!auto, last }); }catch{}
    if (sceneQ){ try{ console.log('[persistence] restoring from ?scene=', sceneQ); }catch{} return loadScene(sceneQ); }
    if (auto){
      try{ console.log('[persistence] restoring from autosave'); }catch{}
      return applySnapshot(auto);
    }
    if (last){ return loadScene(last); }
  }catch{}
  return false;
}

// Expose in window for quick manual access/debug
try{ window.Persistence = { getSnapshot, applySnapshot, saveScene, loadScene, listScenes, deleteScene, exportScene, importScene, startAutosave, stopAutosave, markDirty, tryRestoreOnBoot }; }catch{}
