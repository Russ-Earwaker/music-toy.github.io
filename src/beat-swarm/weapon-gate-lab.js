import { triggerInstrument } from '../audio-samples.js';
import { createSeededRng, createWeaponGateRatioState, decideGateType, applyWeaponGateSelection } from './weapon-gate-lab-ratio.js';
import { createWeaponGate, createWeaponTuneChainFromSelections, summarizeWeaponGateSelection } from './weapon-gate-lab-gates.js';
import { renderWeaponGateLab } from './weapon-gate-lab-render.js';
import { createWeaponGateLoopPlayer } from './weapon-gate-lab-playback.js';

const NOTE_POOL = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
const TOTAL_SLOTS = 16;
let lab = null;
let loopPlayer = createWeaponGateLoopPlayer();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

function makeOverlay() {
  const root = document.createElement('div');
  root.className = 'weapon-gate-lab';
  root.innerHTML = `
    <div class="weapon-gate-lab__bar">
      <strong>Weapon Gate Lab</strong>
      <label>Seed <input data-wgl-seed value="1337" /></label>
      <label>Target Silences <input data-wgl-silences type="number" min="0" max="16" value="6" /></label>
      <label>Max Silence Streak <input data-wgl-streak type="number" min="1" max="16" value="2" /></label>
      <button type="button" data-wgl-restart>Restart</button>
      <button type="button" data-wgl-speed>Slow Motion</button>
      <button type="button" data-wgl-print>Print Decisions</button>
      <button type="button" data-wgl-close>Close</button>
    </div>
    <canvas></canvas>
  `;
  document.body.appendChild(root);
  installStyles();
  return root;
}

function installStyles() {
  if (document.getElementById('weapon-gate-lab-style')) return;
  const style = document.createElement('style');
  style.id = 'weapon-gate-lab-style';
  style.textContent = `
    .weapon-gate-lab{position:fixed;inset:0;z-index:99999;background:#071018;color:#e8f8ff;font:14px system-ui,sans-serif}
    .weapon-gate-lab__bar{height:46px;display:flex;align-items:center;gap:10px;padding:0 12px;background:#0d2233;border-bottom:1px solid #28506b;box-sizing:border-box}
    .weapon-gate-lab__bar label{display:flex;align-items:center;gap:5px}
    .weapon-gate-lab__bar input{width:74px;background:#071018;color:#e8f8ff;border:1px solid #38647e;border-radius:4px;padding:4px 6px}
    .weapon-gate-lab__bar button{background:#183653;color:#e8f8ff;border:1px solid #64d8ff;border-radius:5px;padding:5px 9px;cursor:pointer}
    .weapon-gate-lab__bar button:hover{background:#245273}
    .weapon-gate-lab canvas{display:block;width:100%;height:calc(100% - 46px)}
  `;
  document.head.appendChild(style);
}

function createState(root) {
  const seed = String(root.querySelector('[data-wgl-seed]')?.value || '1337');
  const targetSilences = Math.max(0, Math.min(TOTAL_SLOTS, Math.trunc(Number(root.querySelector('[data-wgl-silences]')?.value) || 6)));
  const maxSilenceStreak = Math.max(1, Math.min(TOTAL_SLOTS, Math.trunc(Number(root.querySelector('[data-wgl-streak]')?.value) || 2)));
  const rng = createSeededRng(hashSeed(seed));
  const ratioState = createWeaponGateRatioState({ totalSlots: TOTAL_SLOTS, targetSilences, maxSilenceStreak });
  const state = {
    root,
    canvas: root.querySelector('canvas'),
    ctx: root.querySelector('canvas').getContext('2d'),
    seed,
    rng,
    gates: [],
    ratioState,
    selections: Array.from({ length: TOTAL_SLOTS }, () => null),
    selectionSummary: Array.from({ length: TOTAL_SLOTS }, () => '-'),
    nextGateIndex: 0,
    complete: false,
    slowMotion: false,
    width: 1,
    height: 1,
    corridorTop: 90,
    corridorBottom: 500,
    cameraX: 0,
    player: { x: 140, y: 280, vy: 0, speed: 340 },
    keys: new Set(),
    pointerY: null,
    bullets: [],
    target: null,
    feedbackTtl: 0,
    feedbackKind: '',
    feedbackText: '',
    wallPulseTtl: 0,
    wallPulseY: 0,
    lastTs: performance.now(),
    raf: 0,
  };
  appendNextGate(state);
  return state;
}

function appendNextGate(state) {
  const slotIndex = state.gates.length;
  if (slotIndex >= TOTAL_SLOTS) return;
  const decision = decideGateType(state.ratioState, slotIndex, state.rng);
  state.gates.push(createWeaponGate(slotIndex, decision, { rng: state.rng, notePool: NOTE_POOL }));
}

function hashSeed(seed) {
  const s = String(seed || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function resize(state) {
  const rect = state.canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  state.width = Math.max(320, Math.floor(rect.width));
  state.height = Math.max(240, Math.floor(rect.height));
  state.canvas.width = Math.floor(state.width * dpr);
  state.canvas.height = Math.floor(state.height * dpr);
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.corridorTop = 86;
  state.corridorBottom = state.height - 48;
}

function update(state, dt) {
  const p = state.player;
  const scale = state.slowMotion ? 0.45 : 1;
  const up = state.keys.has('arrowup') || state.keys.has('w');
  const down = state.keys.has('arrowdown') || state.keys.has('s');
  if (state.pointerY != null) p.vy += clamp(state.pointerY - p.y, -180, 180) * 7 * dt;
  if (up) p.vy -= 640 * dt;
  if (down) p.vy += 640 * dt;
  p.vy *= Math.pow(0.08, dt);
  p.y += p.vy * dt * scale;
  p.x += p.speed * dt * scale;
  if (p.y < state.corridorTop + 18) bounce(state, state.corridorTop + 18, 1);
  if (p.y > state.corridorBottom - 18) bounce(state, state.corridorBottom - 18, -1);
  state.cameraX = Math.max(0, p.x - 180);
  updateGateCrossings(state);
  updatePreview(state, dt * scale);
  state.feedbackTtl = Math.max(0, state.feedbackTtl - dt);
  state.wallPulseTtl = Math.max(0, state.wallPulseTtl - dt);
}

function bounce(state, y, dir) {
  const player = state.player;
  player.y = y;
  player.vy = dir * Math.max(360, Math.abs(player.vy) * 0.95);
  player.speed = Math.min(760, player.speed + 88);
  state.wallPulseTtl = 0.28;
  state.wallPulseY = y;
}

function updateGateCrossings(state) {
  if (state.complete) return;
  const gate = state.gates[state.nextGateIndex];
  if (!gate || state.player.x < gate.x) return;
  const h = state.corridorBottom - state.corridorTop;
  const rel = clamp((state.player.y - state.corridorTop) / Math.max(1, h), 0, 0.999);
  const idx = Math.max(0, Math.min(gate.sections.length - 1, Math.floor(rel * gate.sections.length)));
  const section = gate.sections[idx];
  const selection = { slotIndex: gate.slotIndex, kind: section.kind, note: section.note || '', gateType: gate.type, reason: gate.reason, availableSections: gate.sections, selectedSection: section };
  gate.selected = true;
  gate.selectedSectionIndex = idx;
  state.selections[gate.slotIndex] = selection;
  state.selectionSummary[gate.slotIndex] = summarizeWeaponGateSelection(selection);
  applyWeaponGateSelection(state.ratioState, selection);
  handleSelectionFeedback(state, selection);
  state.nextGateIndex += 1;
  if (state.nextGateIndex >= TOTAL_SLOTS) finishLab(state);
  else appendNextGate(state);
}

function handleSelectionFeedback(state, selection) {
  if (selection.kind === 'damage') {
    state.feedbackKind = 'damage';
    state.feedbackText = `Damage Up: slot ${selection.slotIndex + 1} silent`;
    state.feedbackTtl = 0.55;
    return;
  }
  const startX = state.player.x + 22;
  const y = state.player.y;
  state.target = { x: startX + 260, y, ttl: 1.2, hit: false };
  state.bullets.push({ x: startX, y, vx: 620, note: selection.note, ttl: 1.2 });
  try { triggerInstrument('retro square', selection.note || 'C4', undefined, 'weapon-gate-lab', { source: 'weapon-gate-preview' }, 0.8); } catch {}
  state.feedbackKind = 'note';
  state.feedbackText = `${selection.note} selected`;
  state.feedbackTtl = 0.42;
}

function updatePreview(state, dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.ttl -= dt;
    if (state.target && !state.target.hit && Math.abs(b.x - state.target.x) < 14 && Math.abs(b.y - state.target.y) < 22) {
      state.target.hit = true;
      b.ttl = 0;
    }
  }
  state.bullets = state.bullets.filter((b) => b.ttl > 0);
  if (state.target) {
    state.target.ttl -= dt;
    if (state.target.ttl <= 0) state.target = null;
  }
}

function finishLab(state) {
  state.complete = true;
  const chain = createWeaponTuneChainFromSelections(state.selections, NOTE_POOL);
  state.completedTuneChain = chain;
  state.feedbackKind = 'complete';
  state.feedbackText = 'Weapon tune complete';
  state.feedbackTtl = 4;
  try { window.BeatSwarmMode?.applyWeaponGateSelectionsToWeapon?.(0, state.selections); } catch {}
  loopPlayer.start(state.selections);
  try { console.log('[WeaponGateLab] completed tune chain', { chain, selections: state.selections, ratio: state.ratioState }); } catch {}
}

function frame(ts) {
  if (!lab) return;
  const dt = Math.min(0.05, Math.max(0.001, (ts - lab.lastTs) / 1000));
  lab.lastTs = ts;
  resize(lab);
  update(lab, dt);
  renderWeaponGateLab(lab.ctx, lab);
  lab.raf = requestAnimationFrame(frame);
}

function bind(root) {
  root.querySelector('[data-wgl-close]')?.addEventListener('click', closeWeaponGateLab);
  root.querySelector('[data-wgl-restart]')?.addEventListener('click', () => restartWeaponGateLab());
  root.querySelector('[data-wgl-speed]')?.addEventListener('click', () => {
    if (!lab) return;
    lab.slowMotion = !lab.slowMotion;
    root.querySelector('[data-wgl-speed]').textContent = lab.slowMotion ? 'Normal Speed' : 'Slow Motion';
  });
  root.querySelector('[data-wgl-print]')?.addEventListener('click', () => {
    try { console.log('[WeaponGateLab] gate decisions', { gates: lab?.gates, selections: lab?.ratioState?.decisions || [] }); } catch {}
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', onPointerLeave);
}

function unbind(root) {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  root?.removeEventListener('pointermove', onPointerMove);
  root?.removeEventListener('pointerleave', onPointerLeave);
}
function onKeyDown(e) {
  if (!lab) return;
  if (e.key === 'r' || e.key === 'R') restartWeaponGateLab();
  lab.keys.add(String(e.key || '').toLowerCase());
}

function onKeyUp(e) {
  lab?.keys?.delete?.(String(e.key || '').toLowerCase());
}
function onPointerMove(e) {
  if (!lab) return;
  const rect = lab.canvas.getBoundingClientRect();
  lab.pointerY = e.clientY - rect.top;
}
function onPointerLeave() {
  if (lab) lab.pointerY = null;
}
export function openWeaponGateLab() {
  closeWeaponGateLab();
  const root = makeOverlay();
  bind(root);
  lab = createState(root);
  resize(lab);
  lab.raf = requestAnimationFrame(frame);
  return lab;
}
export function restartWeaponGateLab() {
  if (!lab?.root) return openWeaponGateLab();
  const root = lab.root;
  cancelAnimationFrame(lab.raf);
  loopPlayer.stop();
  lab = createState(root);
  resize(lab);
  lab.raf = requestAnimationFrame(frame);
  return lab;
}
export function closeWeaponGateLab() {
  if (!lab) return;
  const root = lab.root;
  cancelAnimationFrame(lab.raf);
  loopPlayer.stop();
  unbind(root);
  root?.remove?.();
  lab = null;
}
export const getWeaponGateLabState = () => lab;
try {
  window.__WeaponGateLab = Object.freeze({
    open: openWeaponGateLab,
    restart: restartWeaponGateLab,
    close: closeWeaponGateLab,
    getState: getWeaponGateLabState,
  });
} catch {}
