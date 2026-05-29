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
    .beat-swarm-weapon-gate-corridor{position:absolute;left:0;right:0;border-top:4px solid rgba(100,216,255,.8);border-bottom:4px solid rgba(100,216,255,.8);background:rgba(10,29,43,.36);box-shadow:inset 0 0 42px rgba(76,205,255,.1)}
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
    .beat-swarm-weapon-gate-target{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#ff8ec7;border:2px solid #fff;box-shadow:0 0 22px rgba(255,142,199,.75)}
    .beat-swarm-weapon-gate-target.is-hit{background:#fff59b;box-shadow:0 0 30px rgba(255,245,155,.95);transform:scale(1.35)}
    .beat-swarm-weapon-gate-shot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#7df8ff;box-shadow:0 0 18px rgba(125,248,255,.9)}
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
      progress: -520,
      speed: 360,
      y: window.innerHeight * 0.5,
      vy: 0,
      shots: [],
      targets: [],
      motifStep: 0,
      motifTimer: 0.35,
      feedbackText: 'Shape your weapon rhythm',
      feedbackKind: '',
      feedbackTtl: 1.2,
      wallPulseTtl: 0,
      wallPulseY: 0,
      phase: 'gate',
      completeDelay: 0,
    };
    appendNextGate();
    render();
    return true;
  }

  function stop() {
    const ship = deps.getOverlayEl?.()?.querySelector?.('.beat-swarm-ship-wrap');
    if (ship instanceof HTMLElement) {
      ship.style.transition = 'top 420ms ease';
      ship.style.left = '50%';
      ship.style.top = '50%';
      ship.style.transform = 'translate(-50%, -50%)';
      setTimeout(() => {
        if (!ship.isConnected) return;
        ship.style.transition = '';
        ship.style.left = '';
        ship.style.top = '';
        ship.style.transform = '';
      }, 460);
    }
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
    const top = window.innerHeight * 0.22;
    const bottom = window.innerHeight * 0.82;
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
      spawnShot(selection.note);
      try { deps.triggerInstrument?.('retro square', selection.note || 'C4', undefined, 'weapon-gate-intro', { source: 'weapon-gate-intro' }, 0.8); } catch {}
    }
    state.nextGateIndex += 1;
    if (state.nextGateIndex >= TOTAL_SLOTS) finish();
    else appendNextGate();
  }

  function finish() {
    state.phase = 'motif';
    state.completeDelay = 4.1;
    state.motifStep = 0;
    state.motifTimer = 0.2;
    state.feedbackKind = 'complete';
    state.feedbackText = 'Weapon tune complete';
    state.feedbackTtl = 1.4;
    try { deps.applySelections?.(0, state.selections); } catch {}
  }

  function update(dt, input = null) {
    if (!state) return false;
    state.feedbackTtl = Math.max(0, state.feedbackTtl - dt);
    state.wallPulseTtl = Math.max(0, state.wallPulseTtl - dt);
    updateShots(dt);
    if (state.phase === 'motif') {
      state.speed = Math.min(760, state.speed + 24 * dt);
      state.progress += state.speed * dt;
      updateMotifPreview(dt);
      state.completeDelay -= dt;
      moveShip();
      render();
      if (state.completeDelay <= 0) {
        stop();
        try { deps.onComplete?.(); } catch {}
      }
      return true;
    }
    const top = window.innerHeight * 0.22;
    const bottom = window.innerHeight * 0.82;
    state.speed = Math.min(700, state.speed + 16 * dt);
    state.progress += state.speed * dt;
    state.vy += clamp(Number(input?.y) || 0, -1, 1) * 1400 * dt;
    state.vy *= Math.pow(0.05, dt);
    state.y += state.vy * dt;
    if (state.y < top + 20) bounce(top + 20, 1);
    if (state.y > bottom - 20) bounce(bottom - 20, -1);
    moveShip();
    chooseCurrentGate();
    render();
    return true;
  }

  function spawnShot(note) {
    const shipX = window.innerWidth * 0.5;
    const target = { x: shipX + 250, y: state.y, ttl: 0.95, hit: false };
    state.targets.push(target);
    state.shots.push({ x: shipX + 26, y: state.y, vx: 780, note, ttl: 0.95, target });
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

  function updateMotifPreview(dt) {
    state.motifTimer -= dt;
    while (state.motifTimer <= 0 && state.motifStep < TOTAL_SLOTS) {
      const sel = state.selections[state.motifStep] || null;
      if (sel?.kind === 'note') {
        spawnShot(sel.note);
        try { deps.triggerInstrument?.('retro square', sel.note || 'C4', undefined, 'weapon-gate-intro', { source: 'weapon-gate-motif-preview' }, 0.82); } catch {}
      }
      state.motifStep += 1;
      state.motifTimer += 0.2;
    }
  }

  function bounce(y, dir) {
    state.y = y;
    state.vy = dir * Math.max(380, Math.abs(state.vy) * 0.9);
    state.speed = Math.min(740, state.speed + 80);
    state.wallPulseTtl = 0.25;
    state.wallPulseY = y;
  }

  function moveShip() {
    const ship = deps.getOverlayEl?.()?.querySelector?.('.beat-swarm-ship-wrap');
    if (!(ship instanceof HTMLElement)) return;
    ship.style.transition = 'none';
    ship.style.left = '50%';
    ship.style.top = `${state.y.toFixed(1)}px`;
    ship.style.transform = 'translate(-50%, -50%)';
  }

  function render() {
    if (!state?.layer) return;
    const top = window.innerHeight * 0.22;
    const bottom = window.innerHeight * 0.82;
    const h = bottom - top;
    const gateHtml = state.gates.map((gate) => renderGate(gate, gate.x - state.progress, top, h)).join('');
    const pulse = state.wallPulseTtl > 0 ? `<div class="beat-swarm-weapon-gate-wall-pulse" style="top:${state.wallPulseY}px;opacity:${Math.min(1, state.wallPulseTtl / 0.25).toFixed(2)}"></div>` : '';
    const targetHtml = state.targets.map((target) => `<div class="beat-swarm-weapon-gate-target${target.hit ? ' is-hit' : ''}" style="left:${target.x}px;top:${target.y}px;opacity:${Math.min(1, target.ttl * 2).toFixed(2)}"></div>`).join('');
    const shotHtml = state.shots.map((shot) => `<div class="beat-swarm-weapon-gate-shot" style="left:${shot.x}px;top:${shot.y}px"></div>`).join('');
    const impactClass = state.feedbackKind === 'damage' ? ' is-damage' : '';
    state.layer.innerHTML = `
      <div class="beat-swarm-weapon-gate-corridor" style="top:${top}px;height:${h}px"></div>
      ${pulse}${gateHtml}${targetHtml}${shotHtml}
      <div class="beat-swarm-weapon-gate-hud">Gate ${Math.min(state.nextGateIndex + 1, TOTAL_SLOTS)}/${TOTAL_SLOTS}<br>Notes ${state.ratioState.selectedNotes}/${state.ratioState.targetNotes} Silence ${state.ratioState.selectedSilences}/${state.ratioState.targetSilences}<br>${state.summary.join(' ')}</div>
      ${state.feedbackTtl > 0 ? `<div class="beat-swarm-weapon-gate-impact${impactClass}">${state.feedbackText}</div>` : ''}
    `;
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
    update,
    isActive: () => !!state,
    getState: () => state,
  };
}
