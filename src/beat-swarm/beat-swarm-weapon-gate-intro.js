import { createSeededRng, createWeaponGateRatioState, decideGateType, applyWeaponGateSelection } from './weapon-gate-lab-ratio.js';
import { createWeaponGate, summarizeWeaponGateSelection } from './weapon-gate-lab-gates.js';
const NOTE_POOL = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
const TOTAL_SLOTS = 16;
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}
function hashSeed(seed) {
  const s = String(seed || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function ensureStyle() {
  if (document.getElementById('beat-swarm-weapon-gate-intro-style')) return;
  const style = document.createElement('style');
  style.id = 'beat-swarm-weapon-gate-intro-style';
  style.textContent = `
    .beat-swarm-weapon-gate-intro{position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden}
    .beat-swarm-weapon-gate-corridor{position:absolute;width:100vw;border-top:4px solid rgba(100,216,255,.8);border-bottom:4px solid rgba(100,216,255,.8);background:rgba(10,29,43,.36);box-shadow:inset 0 0 42px rgba(76,205,255,.1)}
    .beat-swarm-weapon-gate-wall-pulse{position:absolute;left:0;right:0;height:8px;margin-top:-4px;background:#fff59b;box-shadow:0 0 26px #fff59b}
    .beat-swarm-weapon-gate{position:absolute;width:64px;border:2px solid rgba(142,232,255,.86);box-shadow:0 0 18px rgba(100,216,255,.22)}
    .beat-swarm-weapon-gate.is-next{border-color:#fff59b;box-shadow:0 0 26px rgba(255,245,155,.5)}
    .beat-swarm-weapon-gate.is-selected{opacity:.42}
    .beat-swarm-weapon-gate-section{display:grid;place-items:center;border-bottom:1px solid rgba(255,255,255,.2);font:700 13px system-ui,sans-serif;color:#f5fbff}
    .beat-swarm-weapon-gate-section.is-damage{background:rgba(93,36,47,.92);color:#ffd6dc}
    .beat-swarm-weapon-gate-section.is-note{background:rgba(24,54,83,.92)}
    .beat-swarm-weapon-gate-section.is-picked{outline:4px solid #fff59b;outline-offset:-4px;background:rgba(255,245,155,.32);color:#fff}
    .beat-swarm-weapon-gate-label{position:absolute;left:50%;top:-34px;transform:translateX(-50%);font:800 12px system-ui,sans-serif;color:#fff59b;white-space:nowrap}
    .beat-swarm-weapon-gate-hud{position:absolute;left:18px;top:18px;padding:10px 12px;border:1px solid rgba(100,216,255,.45);border-radius:8px;background:rgba(0,0,0,.5);font:13px ui-monospace,Consolas,monospace;color:#e8f8ff}
    .beat-swarm-weapon-gate-impact{position:absolute;left:50%;top:13%;transform:translateX(-50%);font:800 40px system-ui,sans-serif;text-shadow:0 0 24px currentColor;color:#fff59b}
    .beat-swarm-weapon-gate-impact.is-damage{color:#ff6a72}
    .beat-swarm-weapon-gate-target{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:1px solid rgba(222,245,255,.48);box-shadow:0 0 16px rgba(172,228,255,.28)}
    .beat-swarm-weapon-gate-target.is-hit{background:rgba(222,245,255,.28);box-shadow:0 0 24px rgba(172,228,255,.54);transform:scale(1.18)}
    .beat-swarm-weapon-gate-shot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(222,245,255,.96);box-shadow:0 0 10px rgba(172,228,255,.84)}
    .beat-swarm-weapon-note-map{position:absolute;inset:0;overflow:visible}.beat-swarm-weapon-note-line{stroke:rgba(170,232,255,.34);stroke-width:1.5;filter:drop-shadow(0 0 4px rgba(170,232,255,.35))}.beat-swarm-weapon-note-star{position:absolute;border-radius:50%;background:#d9f7ff;box-shadow:0 0 12px rgba(170,232,255,.72),0 0 26px rgba(170,232,255,.32)}
    .beat-swarm-weapon-dash-pickup{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#b7f4ff;box-shadow:0 0 18px rgba(183,244,255,.9),0 0 34px rgba(183,244,255,.45)}
  `;
  document.head.appendChild(style);
}
export function createBeatSwarmWeaponGateIntroRuntime(deps = {}) {
  let state = null;
  function getLayer() {
    const overlay = deps.getOverlayEl?.();
    if (!(overlay instanceof HTMLElement)) return null;
    let layer = overlay.querySelector('.beat-swarm-weapon-gate-intro');
    if (!(layer instanceof HTMLElement)) {
      layer = document.createElement('div');
      layer.className = 'beat-swarm-weapon-gate-intro';
      overlay.appendChild(layer);
    }
    return layer;
  }
  function appendNextGate() {
    const slotIndex = state.gates.length;
    if (slotIndex >= TOTAL_SLOTS) return;
    const decision = decideGateType(state.ratioState, slotIndex, state.rng);
    state.gates.push(createWeaponGate(slotIndex, decision, { rng: state.rng, notePool: NOTE_POOL, gateSpacing: 690, startX: 760 }));
  }

  function start(options = {}) {
    ensureStyle();
    const layer = getLayer();
    if (!layer) return false;
    const seed = String(options.seed || `level-start-${Date.now()}`);
    state = {
      layer,
      rng: createSeededRng(hashSeed(seed)),
      ratioState: createWeaponGateRatioState({ totalSlots: TOTAL_SLOTS, targetSilences: 6, maxSilenceStreak: 2 }),
      gates: [],
      selections: Array.from({ length: TOTAL_SLOTS }, () => null),
      summary: Array.from({ length: TOTAL_SLOTS }, () => '-'),
      nextGateIndex: 0,
      progress: -1120,
      speed: 0,
      y: window.innerHeight * 0.5,
      vy: 0,
      shots: [],
      targets: [],
      dashPickup: null,
      dashPickupCooldown: 0.9,
      noteStars: [],
      noteStarPulseT: 0,
      noteStarPulseSlot: -1,
      motifStep: 0,
      motifTimer: 0.35,
      feedbackText: 'Pull back to launch',
      feedbackKind: '',
      feedbackTtl: 1.2,
      wallPulseTtl: 0,
      wallPulseY: 0,
      phase: 'prelaunch',
      completeDelay: 0,
      outroDuration: 2.35,
    };
    appendNextGate();
    render();
    return true;
  }

  function stop() {
    if (state?.layer) {
      const layer = state.layer;
      layer.style.transition = 'opacity 420ms ease';
      layer.style.opacity = '0';
      setTimeout(() => {
        if (layer.isConnected) {
          layer.innerHTML = '';
          layer.style.transition = '';
          layer.style.opacity = '';
        }
      }, 450);
    }
    state = null;
  }

  function chooseCurrentGate() {
    const gate = state.gates[state.nextGateIndex];
    if (!gate) return;
    const shipX = window.innerWidth * 0.5;
    if ((gate.x - state.progress) > shipX) return;
    const { top, bottom } = getLogicalBounds();
    const rel = clamp((state.y - top) / Math.max(1, bottom - top), 0, 0.999);
    const idx = Math.max(0, Math.min(gate.sections.length - 1, Math.floor(rel * gate.sections.length)));
    const section = gate.sections[idx];
    const selection = { slotIndex: gate.slotIndex, kind: section.kind, note: section.note || '', gateType: gate.type, reason: gate.reason, availableSections: gate.sections, selectedSection: section };
    gate.selected = true;
    gate.selectedSectionIndex = idx;
    state.selections[gate.slotIndex] = selection;
    state.summary[gate.slotIndex] = summarizeWeaponGateSelection(selection);
    applyWeaponGateSelection(state.ratioState, selection);
    state.feedbackKind = selection.kind;
    state.feedbackText = selection.kind === 'damage' ? `Damage Up: slot ${selection.slotIndex + 1} silent` : `${selection.note} selected`;
    state.feedbackTtl = 0.58;
    if (selection.kind === 'note') {
      addNoteStar(selection);
      spawnShot(selection.note);
      triggerWeaponNote(selection.note, 'weapon-gate-intro');
    }
    state.nextGateIndex += 1;
    if (state.nextGateIndex >= TOTAL_SLOTS) finish();
    else appendNextGate();
  }

  function finish() {
    const selections = Array.isArray(state?.selections) ? state.selections.slice() : [];
    try { deps.applySelections?.(0, selections); } catch {}
    try { deps.onComplete?.(); } catch {}
    state.phase = 'outro';
    state.completeDelay = state.outroDuration;
    state.feedbackKind = 'complete';
    state.feedbackText = 'Weapon tune complete';
    state.feedbackTtl = 0.9;
    state.shots = [];
    state.targets = [];
  }

  function update(dt, input = null, options = null) {
    if (!state) return false;
    const forwardDelta = Math.max(0, Number(options?.forwardDelta) || 0);
    const sideDelta = Number(options?.sideDelta) || 0;
    let appliedSideDelta = sideDelta;
    let reflectedY = false;
    state.feedbackTtl = Math.max(0, state.feedbackTtl - dt);
    state.wallPulseTtl = Math.max(0, state.wallPulseTtl - dt);
    state.noteStarPulseT = Math.max(0, (Number(state.noteStarPulseT) || 0) - dt);
    updateShots(dt);
    const pickupDash = updateDashPickup(dt, input);
    for (const star of state.noteStars) star.age = (Number(star.age) || 0) + dt;
    if (state.phase === 'prelaunch') {
      const { top, bottom } = getLogicalBounds();
      state.speed = 0;
      state.y += sideDelta * 0.55;
      state.y += ((window.innerHeight * 0.5) - state.y) * Math.min(1, dt * 4.8);
      state.y = clamp(state.y, top + 34, bottom - 34);
      render();
      return { active: true, sideDelta: (state.y - window.innerHeight * 0.5) * -0.18 * dt, reflectedY, pickupDash, prelaunch: true };
    }
    if (state.phase === 'outro') {
      state.speed = Math.min(820, state.speed + 28 * dt);
      state.progress += forwardDelta || (state.speed * dt);
      state.y += sideDelta;
      state.y += ((window.innerHeight * 0.5) - state.y) * Math.min(1, dt * 2.3);
      state.completeDelay -= dt;
      render();
      if (state.completeDelay <= 0) {
        stop();
        return { active: false, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
      }
      return { active: true, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
    }
    const { top, bottom } = getLogicalBounds();
    state.speed = Math.min(700, state.speed + 16 * dt);
    state.progress += forwardDelta || (state.speed * dt);
    state.vy += clamp(Number(input?.y) || 0, -1, 1) * 1400 * dt;
    state.vy *= Math.pow(0.05, dt);
    state.y += (state.vy * dt) + sideDelta;
    if (state.y < top + 20) {
      if (sideDelta < 0) appliedSideDelta = Math.abs(sideDelta) * 0.78;
      reflectedY = true;
      bounce(top + 20, 1);
    }
    if (state.y > bottom - 20) {
      if (sideDelta > 0) appliedSideDelta = -Math.abs(sideDelta) * 0.78;
      reflectedY = true;
      bounce(bottom - 20, -1);
    }
    chooseCurrentGate();
    if (!state) {
      return { active: false, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
    }
    render();
    return { active: true, sideDelta: appliedSideDelta, reflectedY, pickupDash };
  }

  function updateDashPickup(dt, input = null) {
    if (state.phase !== 'gate') return null;
    state.dashPickupCooldown = Math.max(0, (Number(state.dashPickupCooldown) || 0) - dt);
    if (!state.dashPickup && state.dashPickupCooldown <= 0) {
      state.dashPickup = { x: state.progress + window.innerWidth + 180, y: state.y };
    }
    const p = state.dashPickup;
    if (!p) return null;
    const sx = p.x - state.progress, sy = p.y + ((window.innerHeight * 0.5) - state.y);
    const shipX = window.innerWidth * 0.5, shipY = window.innerHeight * 0.5;
    if (sx < -40) {
      state.dashPickup = null;
      state.dashPickupCooldown = 1.25;
      return null;
    }
    if (Math.hypot(sx - shipX, sy - shipY) > 34) return null;
    state.dashPickup = null;
    state.dashPickupCooldown = 1.8;
    const ix = Number(input?.x) || 0, iy = Number(input?.y) || 0, mag = Math.hypot(ix, iy);
    if (mag > 0.2) return { x: ix / mag, y: iy / mag, power: 760 };
    const angle = (state.rng() < 0.5 ? -1 : 1) * ((Math.PI / 8) + (state.rng() * Math.PI / 8));
    return { x: Math.cos(angle), y: Math.sin(angle), power: 760 };
  }

  function spawnShot(note) {
    const shipX = window.innerWidth * 0.5;
    const shipY = window.innerHeight * 0.5;
    const target = { x: shipX + 250, y: shipY, ttl: 0.95, hit: false };
    state.targets.push(target);
    state.shots.push({ x: shipX + 26, y: shipY, vx: 780, note, ttl: 0.95, target });
  }

  function updateShots(dt) {
    for (const shot of state.shots) {
      shot.x += shot.vx * dt;
      shot.ttl -= dt;
      if (shot.target && !shot.target.hit && Math.abs(shot.x - shot.target.x) < 18) {
        shot.target.hit = true;
        shot.ttl = 0;
      }
    }
    for (const target of state.targets) target.ttl -= dt;
    state.shots = state.shots.filter((shot) => shot.ttl > 0);
    state.targets = state.targets.filter((target) => target.ttl > 0);
  }

  function addNoteStar(selection) {
    const slot = Math.max(0, Math.min(TOTAL_SLOTS - 1, Number(selection?.slotIndex) || 0));
    const noteIndex = Math.max(0, NOTE_POOL.indexOf(selection?.note || 'C4'));
    state.noteStars.push({ x: window.innerWidth * (0.14 + (slot / Math.max(1, TOTAL_SLOTS - 1)) * 0.72), y: window.innerHeight * (0.24 + ((NOTE_POOL.length - 1 - noteIndex) / Math.max(1, NOTE_POOL.length - 1)) * 0.52), note: selection.note || '', slot, age: 0 });
  }

  function triggerWeaponNote(note, source) {
    try {
      if (typeof deps.triggerWeaponNote === 'function') {
        deps.triggerWeaponNote(note || 'C4', source);
        return true;
      }
      deps.triggerInstrument?.('LASER', note || 'C4', undefined, 'weapon-gate-intro', { source }, 0.85);
      return true;
    } catch {}
    return false;
  }
  function bounce(y, dir) {
    state.y = y;
    state.vy = dir * Math.max(460, Math.abs(state.vy) * 0.9);
    state.speed = Math.min(740, state.speed + 80);
    state.wallPulseTtl = 0.25;
    const bounds = getCorridorBounds();
    state.wallPulseY = dir > 0 ? bounds.top : bounds.bottom;
  }

  function getCorridorBounds() {
    const b = getLogicalBounds(), offset = (window.innerHeight * 0.5) - state.y;
    return { top: b.top + offset, bottom: b.bottom + offset };
  }
  function getLogicalBounds() { return { top: window.innerHeight / 3, bottom: window.innerHeight * 2 / 3 }; }

  function render() {
    if (!state?.layer) return;
    const { top, bottom } = getCorridorBounds();
    const h = bottom - top;
    const outroT = state.phase === 'outro' ? Math.max(0, state.outroDuration - state.completeDelay) : 0;
    const outroN = state.phase === 'outro' ? clamp(outroT / Math.max(0.001, state.outroDuration), 0, 1) : 0;
    const corridorX = state.phase === 'outro' ? -Math.min(window.innerWidth + 180, outroN * (window.innerWidth + 180)) : 0;
    const corridorOpacity = state.phase === 'outro' ? Math.max(0, 1 - Math.max(0, outroN - 0.42) / 0.58) : 1;
    const gateHtml = state.gates.map((gate) => renderGate(gate, gate.x - state.progress, top, h)).join('');
    const pulse = state.wallPulseTtl > 0 ? `<div class="beat-swarm-weapon-gate-wall-pulse" style="top:${state.wallPulseY}px;opacity:${Math.min(1, state.wallPulseTtl / 0.25).toFixed(2)}"></div>` : '';
    const targetHtml = state.targets.map((target) => `<div class="beat-swarm-weapon-gate-target${target.hit ? ' is-hit' : ''}" style="left:${target.x}px;top:${target.y}px;opacity:${Math.min(1, target.ttl * 2).toFixed(2)}"></div>`).join('');
    const shotHtml = state.shots.map((shot) => `<div class="beat-swarm-weapon-gate-shot" style="left:${shot.x}px;top:${shot.y}px"></div>`).join('');
    const pickupHtml = renderDashPickup();
    const noteMapHtml = renderNoteMap();
    const impactClass = state.feedbackKind === 'damage' ? ' is-damage' : '';
    state.layer.innerHTML = `
      <div class="beat-swarm-weapon-gate-corridor" style="left:${corridorX}px;top:${top}px;height:${h}px;opacity:${corridorOpacity.toFixed(2)}"></div>
      ${noteMapHtml}${pulse}${gateHtml}${pickupHtml}${targetHtml}${shotHtml}
      <div class="beat-swarm-weapon-gate-hud">Gate ${Math.min(state.nextGateIndex + 1, TOTAL_SLOTS)}/${TOTAL_SLOTS}<br>Notes ${state.ratioState.selectedNotes}/${state.ratioState.targetNotes} Silence ${state.ratioState.selectedSilences}/${state.ratioState.targetSilences}<br>${state.summary.join(' ')}</div>
      ${state.feedbackTtl > 0 ? `<div class="beat-swarm-weapon-gate-impact${impactClass}">${state.feedbackText}</div>` : ''}
    `;
  }
  function renderDashPickup() {
    const p = state.dashPickup;
    if (!p) return '';
    const sx = p.x - state.progress, sy = p.y + ((window.innerHeight * 0.5) - state.y);
    return `<div class="beat-swarm-weapon-dash-pickup" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px"></div>`;
  }
  function renderNoteMap() {
    const stars = state.noteStars;
    if (!stars.length) return '';
    const endProgress = 760 + ((TOTAL_SLOTS - 1) * 690) - (window.innerWidth * 0.5);
    const completion = Math.max(0, Math.min(1, (state.progress + 520) / Math.max(1, endProgress + 520)));
    const ox = window.innerWidth * 0.24 * (1 - completion), oy = ((window.innerHeight * 0.5) - state.y) * 0.08;
    const pulse = Math.max(0, Math.min(1, (Number(state.noteStarPulseT) || 0) / 0.18));
    const lines = stars.slice(1).map((star, i) => {
      const prev = stars[i];
      return `<line class="beat-swarm-weapon-note-line" x1="${(prev.x + ox).toFixed(1)}" y1="${(prev.y + oy).toFixed(1)}" x2="${(star.x + ox).toFixed(1)}" y2="${(star.y + oy).toFixed(1)}"></line>`;
    }).join('');
    const dots = stars.map((star) => { const flash = Math.max(0, 1 - (Number(star.age) || 0) / 0.55), stepPulse = star.slot === state.noteStarPulseSlot ? pulse : 0, glow = Math.max(flash, stepPulse), size = 12 + glow * 10; return `<div class="beat-swarm-weapon-note-star" title="${star.note}" style="left:${(star.x + ox).toFixed(1)}px;top:${(star.y + oy).toFixed(1)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;margin:${(-size / 2).toFixed(1)}px 0 0 ${(-size / 2).toFixed(1)}px;opacity:${(0.58 + glow * 0.36).toFixed(2)}"></div>`; }).join('');
    return `<svg class="beat-swarm-weapon-note-map" aria-hidden="true">${lines}</svg>${dots}`;
  }
  function renderGate(gate, x, top, h) {
    if (x < -100 || x > window.innerWidth + 140) return '';
    const sectionH = h / gate.sections.length;
    const next = gate.slotIndex === state.nextGateIndex && !gate.selected ? ' is-next' : '';
    const selected = gate.selected ? ' is-selected' : '';
    const sections = gate.sections.map((section, i) => {
      const kind = section.kind === 'damage' ? 'damage' : 'note';
      const picked = gate.selectedSectionIndex === i ? ' is-picked' : '';
      return `<div class="beat-swarm-weapon-gate-section is-${kind}${picked}" style="height:${sectionH - 2}px">${kind === 'damage' ? 'DMG' : section.note}</div>`;
    }).join('');
    return `<div class="beat-swarm-weapon-gate${next}${selected}" style="left:${x}px;top:${top}px;height:${h}px">${next ? '<div class="beat-swarm-weapon-gate-label">NEXT</div>' : ''}${sections}</div>`;
  }

  return {
    start,
    stop,
    launch() {
      if (!state || state.phase !== 'prelaunch') return false;
      state.phase = 'gate';
      state.speed = 620;
      state.feedbackKind = 'launch';
      state.feedbackText = 'Launch';
      state.feedbackTtl = 0.65;
      return true;
    },
    update,
    isActive: () => !!state,
    getState: () => state,
    getPhase: () => state?.phase || '',
    getArenaBlend,
  };
  function getArenaBlend() {
    if (!state || state.phase !== 'outro') return 0;
    const t = Math.max(0, state.outroDuration - state.completeDelay);
    return clamp(t / 0.95, 0, 1);
  }
}
