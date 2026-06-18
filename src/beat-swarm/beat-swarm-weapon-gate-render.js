import { getWeaponGateCorridorScreenBoundsAtX, getWeaponGateEndProgress, getWeaponGateLogicalBounds } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

export function ensureWeaponGateIntroStyle() {
  if (document.getElementById('beat-swarm-weapon-gate-intro-style')) return;
  const style = document.createElement('style');
  style.id = 'beat-swarm-weapon-gate-intro-style';
  style.textContent = `
    .beat-swarm-weapon-gate-intro{position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden}
    .beat-swarm-weapon-gate-corridor{position:absolute;inset:0;overflow:visible}
    .beat-swarm-weapon-gate-corridor-fill{fill:rgba(10,29,43,.36);filter:drop-shadow(0 0 18px rgba(76,205,255,.12))}
    .beat-swarm-weapon-gate-corridor-edge{fill:none;stroke:rgba(100,216,255,.8);stroke-width:4;filter:drop-shadow(0 0 8px rgba(76,205,255,.2))}
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

export function renderWeaponGateIntro(state, options = {}) {
  if (!state?.layer) return;
  const notePool = Array.isArray(options.notePool) ? options.notePool : [];
  const totalSlots = Math.max(1, Math.trunc(Number(options.totalSlots) || 1));
  const corridorBounds = options.corridorBounds && typeof options.corridorBounds === 'object'
    ? options.corridorBounds
    : getWeaponGateLogicalBounds();
  const top = Number(corridorBounds.top) || 0;
  const bottom = Number(corridorBounds.bottom) || 0;
  const h = bottom - top;
  const outroT = state.phase === 'outro' ? Math.max(0, state.outroDuration - state.completeDelay) : 0;
  const outroN = state.phase === 'outro' ? clamp(outroT / Math.max(0.001, state.outroDuration), 0, 1) : 0;
  const corridorX = state.phase === 'outro' ? -Math.min(window.innerWidth + 180, outroN * (window.innerWidth + 180)) : 0;
  const corridorOpacity = state.phase === 'outro' ? Math.max(0, 1 - Math.max(0, outroN - 0.42) / 0.58) : 1;
  const gateHtml = state.gates.map((gate) => renderGate(state, gate, gate.x - state.progress)).join('');
  const pulse = state.wallPulseTtl > 0
    ? `<div class="beat-swarm-weapon-gate-wall-pulse" style="top:${state.wallPulseY}px;opacity:${Math.min(1, state.wallPulseTtl / 0.25).toFixed(2)}"></div>`
    : '';
  const targetHtml = state.targets.map((target) => `<div class="beat-swarm-weapon-gate-target${target.hit ? ' is-hit' : ''}" style="left:${target.x}px;top:${target.y}px;opacity:${Math.min(1, target.ttl * 2).toFixed(2)}"></div>`).join('');
  const shotHtml = state.shots.map((shot) => `<div class="beat-swarm-weapon-gate-shot" style="left:${shot.x}px;top:${shot.y}px"></div>`).join('');
  const impactClass = state.feedbackKind === 'damage' ? ' is-damage' : '';
  state.layer.innerHTML = `
    ${renderCorridorBand(state, corridorX, corridorOpacity)}
    ${renderNoteMap(state, notePool, totalSlots)}${pulse}${gateHtml}${renderDashPickup(state)}${targetHtml}${shotHtml}
    <div class="beat-swarm-weapon-gate-hud">Gate ${Math.min(state.nextGateIndex + 1, totalSlots)}/${totalSlots}<br>Notes ${state.ratioState.selectedNotes}/${state.ratioState.targetNotes} Silence ${state.ratioState.selectedSilences}/${state.ratioState.targetSilences}<br>${state.summary.join(' ')}</div>
    ${state.feedbackTtl > 0 ? `<div class="beat-swarm-weapon-gate-impact${impactClass}">${state.feedbackText}</div>` : ''}
  `;
}

function renderDashPickup(state) {
  const p = state.dashPickup;
  if (!p) return '';
  const sx = p.x - state.progress;
  const sy = p.y + ((window.innerHeight * 0.5) - state.y);
  return `<div class="beat-swarm-weapon-dash-pickup" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px"></div>`;
}

function renderNoteMap(state, notePool, totalSlots) {
  const stars = state.noteStars;
  if (!stars.length) return '';
  const endProgress = getWeaponGateEndProgress(totalSlots);
  const completion = Math.max(0, Math.min(1, (state.progress + 520) / Math.max(1, endProgress + 520)));
  const ox = window.innerWidth * 0.24 * (1 - completion);
  const oy = ((window.innerHeight * 0.5) - state.y) * 0.08;
  const pulse = Math.max(0, Math.min(1, (Number(state.noteStarPulseT) || 0) / 0.18));
  const lines = stars.slice(1).map((star, i) => {
    const prev = stars[i];
    return `<line class="beat-swarm-weapon-note-line" x1="${(prev.x + ox).toFixed(1)}" y1="${(prev.y + oy).toFixed(1)}" x2="${(star.x + ox).toFixed(1)}" y2="${(star.y + oy).toFixed(1)}"></line>`;
  }).join('');
  const dots = stars.map((star) => {
    const flash = Math.max(0, 1 - (Number(star.age) || 0) / 0.55);
    const stepPulse = star.slot === state.noteStarPulseSlot ? pulse : 0;
    const glow = Math.max(flash, stepPulse);
    const size = 12 + glow * 10;
    const note = String(star.note || notePool[0] || '').trim();
    return `<div class="beat-swarm-weapon-note-star" title="${note}" style="left:${(star.x + ox).toFixed(1)}px;top:${(star.y + oy).toFixed(1)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;margin:${(-size / 2).toFixed(1)}px 0 0 ${(-size / 2).toFixed(1)}px;opacity:${(0.58 + glow * 0.36).toFixed(2)}"></div>`;
  }).join('');
  return `<svg class="beat-swarm-weapon-note-map" aria-hidden="true">${lines}</svg>${dots}`;
}

function renderCorridorBand(state, corridorX = 0, opacity = 1) {
  const step = 96;
  const startX = -180;
  const endX = window.innerWidth + 220;
  const samples = [];
  for (let x = startX; x <= endX; x += step) {
    samples.push({ x, bounds: getWeaponGateCorridorScreenBoundsAtX(state, x) });
  }
  if (!samples.length || samples[samples.length - 1].x < endX) {
    samples.push({ x: endX, bounds: getWeaponGateCorridorScreenBoundsAtX(state, endX) });
  }
  const topPath = samples.map((sample, idx) => `${idx === 0 ? 'M' : 'L'} ${(sample.x + corridorX).toFixed(1)} ${sample.bounds.top.toFixed(1)}`).join(' ');
  const bottomPath = samples.map((sample, idx) => `${idx === 0 ? 'M' : 'L'} ${(sample.x + corridorX).toFixed(1)} ${sample.bounds.bottom.toFixed(1)}`).join(' ');
  const fillPath = `${topPath} ${samples.slice().reverse().map((sample) => `L ${(sample.x + corridorX).toFixed(1)} ${sample.bounds.bottom.toFixed(1)}`).join(' ')} Z`;
  return `<svg class="beat-swarm-weapon-gate-corridor" aria-hidden="true" style="opacity:${Number(opacity).toFixed(2)}"><path class="beat-swarm-weapon-gate-corridor-fill" d="${fillPath}"></path><path class="beat-swarm-weapon-gate-corridor-edge" d="${topPath}"></path><path class="beat-swarm-weapon-gate-corridor-edge" d="${bottomPath}"></path></svg>`;
}

function renderGate(state, gate, x) {
  if (x < -100 || x > window.innerWidth + 140) return '';
  const bounds = getWeaponGateCorridorScreenBoundsAtX(state, x);
  const top = bounds.top;
  const h = Math.max(1, bounds.bottom - bounds.top);
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
