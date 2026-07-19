import { getWeaponGateCorridorScreenBoundsAtX, getWeaponGateEndProgress, getWeaponGateLogicalBounds, getWeaponGateShipScreenPoint } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';

const WEAPON_GATE_INTRO_STYLE_VERSION = '2026-07-19-rhythm-visuals-v32';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

export function ensureWeaponGateIntroStyle() {
  let style = document.getElementById('beat-swarm-weapon-gate-intro-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'beat-swarm-weapon-gate-intro-style';
    document.head.appendChild(style);
  }
  if (style.dataset.beatSwarmVersion === WEAPON_GATE_INTRO_STYLE_VERSION) return;
  style.dataset.beatSwarmVersion = WEAPON_GATE_INTRO_STYLE_VERSION;
  style.textContent = `
    .beat-swarm-weapon-gate-intro{position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden}
    .beat-swarm-weapon-gate-corridor{position:absolute;inset:0;overflow:visible}
    .beat-swarm-weapon-gate-corridor-fill{fill:rgba(10,29,43,.36);filter:drop-shadow(0 0 18px rgba(76,205,255,.12))}
    .beat-swarm-weapon-gate-corridor-edge{fill:none;stroke:rgba(100,216,255,.8);stroke-width:4;filter:drop-shadow(0 0 8px rgba(76,205,255,.2))}
    .beat-swarm-weapon-gate-flow{position:absolute;left:0;top:0;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;transform-origin:50% 50%;background:rgba(100,216,255,.96);box-shadow:0 0 8px rgba(100,216,255,.5),0 0 18px rgba(100,216,255,.22);mix-blend-mode:screen}
    .beat-swarm-weapon-gate-ricochet{position:absolute;width:330px;height:110px;margin:-55px 0 0 -165px;transform-origin:50% 50%;opacity:1}
    .beat-swarm-weapon-gate-ricochet-flash{position:absolute;left:50%;top:50%;width:320px;height:17px;margin:-8.5px 0 0 -160px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(255,245,155,.2),rgba(255,245,155,.64),rgba(255,255,255,.98),#fff59b,rgba(255,245,155,.64),rgba(255,245,155,.2),transparent);box-shadow:0 0 28px #fff59b,0 0 58px rgba(255,245,155,.48),0 0 78px rgba(100,216,255,.24)}
    .beat-swarm-weapon-gate-ricochet-line{position:absolute;left:50%;top:50%;height:3px;border-radius:999px;transform-origin:0 50%;background:linear-gradient(90deg,#fff,rgba(255,245,155,.96),transparent);box-shadow:0 0 14px rgba(255,245,155,.9),0 0 28px rgba(255,245,155,.44)}
    .beat-swarm-weapon-gate-ricochet-line.is-main{width:88px}
    .beat-swarm-weapon-gate-ricochet-line.is-side{width:54px;height:2px;opacity:.82}
    .beat-swarm-weapon-gate-ricochet-spark{position:absolute;left:50%;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#fff59b;box-shadow:0 0 18px #fff,0 0 34px rgba(255,245,155,.72)}
    .beat-swarm-weapon-gate{position:absolute;width:64px;border:2px solid rgba(142,232,255,.86);box-shadow:0 0 18px rgba(100,216,255,.22)}
    .beat-swarm-weapon-gate.is-next{border-color:#fff59b;box-shadow:0 0 26px rgba(255,245,155,.5)}
    .beat-swarm-weapon-gate.is-selected{opacity:1}
    .beat-swarm-weapon-gate.is-hero{border-color:#fff59b;box-shadow:0 0 32px rgba(255,245,155,.62),0 0 70px rgba(255,245,155,.2)}
    .beat-swarm-weapon-gate-section{display:grid;place-items:center;border-bottom:1px solid rgba(255,255,255,.2);font:700 13px system-ui,sans-serif;color:#f5fbff;transition:opacity 90ms linear,filter 90ms linear,transform 90ms linear}
    .beat-swarm-weapon-gate.is-selected .beat-swarm-weapon-gate-section{opacity:.22;filter:saturate(.58) brightness(.72)}
    .beat-swarm-weapon-gate-section.is-damage{background:rgba(93,36,47,.92);color:#ffd6dc}
    .beat-swarm-weapon-gate-section.is-note{background:rgba(24,54,83,.92)}
    .beat-swarm-weapon-gate-section.is-picked{opacity:1!important;filter:none!important;outline:4px solid #fff59b;outline-offset:-4px;background:rgba(255,245,155,.38);color:#fff;text-shadow:0 0 12px rgba(255,255,255,.9);box-shadow:inset 0 0 24px rgba(255,245,155,.42),0 0 24px rgba(255,245,155,.45)}
    .beat-swarm-weapon-gate-section.is-picked.is-hero{animation:beat-swarm-gate-picked-hero 560ms ease-out both;z-index:1}
    @keyframes beat-swarm-gate-picked-hero{0%{transform:scale(1);background:rgba(255,245,155,.38)}24%{transform:scale(1.13);background:rgba(255,255,255,.9);box-shadow:inset 0 0 30px rgba(255,255,255,.9),0 0 42px rgba(255,245,155,.86),0 0 92px rgba(255,245,155,.42)}100%{transform:scale(1);background:rgba(255,245,155,.38)}}
    .beat-swarm-weapon-gate-label{position:absolute;left:50%;top:-34px;transform:translateX(-50%);font:800 12px system-ui,sans-serif;color:#fff59b;white-space:nowrap}
    .beat-swarm-weapon-gate-hud{position:absolute;left:18px;top:18px;padding:10px 12px;border:1px solid rgba(100,216,255,.45);border-radius:8px;background:rgba(0,0,0,.5);font:13px ui-monospace,Consolas,monospace;color:#e8f8ff}
    .beat-swarm-weapon-gate-impact{position:absolute;left:50%;top:13%;transform:translateX(-50%);font:800 40px system-ui,sans-serif;text-shadow:0 0 24px currentColor;color:#fff59b}
    .beat-swarm-weapon-gate-impact.is-damage{color:#ff6a72}
    .beat-swarm-weapon-gate-target{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:1px solid rgba(222,245,255,.48);box-shadow:0 0 16px rgba(172,228,255,.28)}
    .beat-swarm-weapon-gate-target.is-hit{background:rgba(222,245,255,.28);box-shadow:0 0 24px rgba(172,228,255,.54);transform:scale(1.18)}
    .beat-swarm-weapon-gate-shot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(222,245,255,.96);box-shadow:0 0 10px rgba(172,228,255,.84)}
    .beat-swarm-weapon-note-handoff{position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden;transition:opacity 120ms linear}
    .beat-swarm-weapon-note-map{position:absolute;inset:0;overflow:visible}.beat-swarm-weapon-note-line{stroke:rgba(170,232,255,.36);stroke-width:1.6;filter:drop-shadow(0 0 5px rgba(170,232,255,.38))}.beat-swarm-weapon-note-star{position:absolute;border-radius:50%;background:#d9f7ff;box-shadow:0 0 12px rgba(170,232,255,.72),0 0 26px rgba(170,232,255,.32);transition:opacity 80ms linear}.beat-swarm-weapon-note-burst{position:absolute;width:78px;height:78px;margin:-39px 0 0 -39px;border-radius:50%;border:2px solid rgba(255,255,255,.9);box-shadow:0 0 20px rgba(255,255,255,.72),0 0 52px rgba(170,232,255,.54);animation:beat-swarm-note-burst 560ms ease-out both}.beat-swarm-weapon-note-burst:before,.beat-swarm-weapon-note-burst:after{content:"";position:absolute;left:50%;top:50%;width:120px;height:2px;margin:-1px 0 0 -60px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.92),transparent);box-shadow:0 0 12px rgba(170,232,255,.58)}.beat-swarm-weapon-note-burst:after{transform:rotate(90deg)}@keyframes beat-swarm-note-burst{0%{opacity:1;transform:scale(.22)}70%{opacity:.72;transform:scale(1)}100%{opacity:0;transform:scale(1.36)}}
    .beat-swarm-weapon-dash-pickup{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#b7f4ff;box-shadow:0 0 18px rgba(183,244,255,.9),0 0 34px rgba(183,244,255,.45)}
  `;
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
  const pulse = renderWallPulse(state);
  const targetHtml = state.targets.map((target) => `<div class="beat-swarm-weapon-gate-target${target.hit ? ' is-hit' : ''}" style="left:${target.x}px;top:${target.y}px;opacity:${Math.min(1, target.ttl * 2).toFixed(2)}"></div>`).join('');
  const shotHtml = state.shots.map((shot) => `<div class="beat-swarm-weapon-gate-shot" style="left:${shot.x}px;top:${shot.y}px"></div>`).join('');
  const impactClass = state.feedbackKind === 'damage' ? ' is-damage' : '';
  state.layer.innerHTML = `
    ${renderCorridorBand(state, corridorX, corridorOpacity)}
    ${renderCorridorFlowParticles(state, corridorX, corridorOpacity)}
    ${renderNoteMap(state, notePool, totalSlots)}${pulse}${gateHtml}${renderDashPickup(state)}${targetHtml}${shotHtml}
    <div class="beat-swarm-weapon-gate-hud">Gate ${Math.min(state.nextGateIndex + 1, totalSlots)}/${totalSlots}<br>Notes ${state.ratioState.selectedNotes}/${state.ratioState.targetNotes} Silence ${state.ratioState.selectedSilences}/${state.ratioState.targetSilences}<br>${state.summary.join(' ')}</div>
    ${state.feedbackTtl > 0 ? `<div class="beat-swarm-weapon-gate-impact${impactClass}">${state.feedbackText}</div>` : ''}
  `;
}

function renderWallPulse(state) {
  if (!(state?.wallPulseTtl > 0)) return '';
  const x = Number(state.wallPulseX) || (window.innerWidth * 0.5);
  const dir = Number(state.wallPulseDir) >= 0 ? 1 : -1;
  const bounds = getWeaponGateCorridorScreenBoundsAtX(state, x);
  const next = getWeaponGateCorridorScreenBoundsAtX(state, x + 72);
  const angle = Math.atan2(next.center - bounds.center, 72) * 180 / Math.PI;
  const y = dir > 0 ? bounds.top : bounds.bottom;
  const opacity = Math.min(1, Math.max(0, Number(state.wallPulseTtl) || 0) / 0.25);
  const bounceSign = dir > 0 ? 1 : -1;
  const baseAngle = bounceSign * 34;
  const scale = 0.78 + opacity * 0.34;
  return `
    <div class="beat-swarm-weapon-gate-ricochet" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;opacity:${opacity.toFixed(2)};transform:rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(2)})">
      <div class="beat-swarm-weapon-gate-ricochet-flash"></div>
      <div class="beat-swarm-weapon-gate-ricochet-spark"></div>
      <div class="beat-swarm-weapon-gate-ricochet-line is-main" style="transform:rotate(${baseAngle.toFixed(2)}deg)"></div>
      <div class="beat-swarm-weapon-gate-ricochet-line is-side" style="transform:rotate(${(baseAngle + bounceSign * 26).toFixed(2)}deg)"></div>
      <div class="beat-swarm-weapon-gate-ricochet-line is-side" style="transform:rotate(${(baseAngle - bounceSign * 30).toFixed(2)}deg)"></div>
      <div class="beat-swarm-weapon-gate-ricochet-line is-side" style="transform:rotate(${(baseAngle + 180 - bounceSign * 18).toFixed(2)}deg);width:34px;opacity:.58"></div>
    </div>
  `;
}

function renderCorridorFlowParticles(state, corridorX = 0, opacity = 1) {
  const laneOffsets = [-0.94, -0.78, -0.62, -0.46, -0.3, -0.14, 0.02, 0.18, 0.34, 0.5, 0.66, 0.82, 0.96];
  const spacing = 150;
  const width = Math.max(1, window.innerWidth);
  const progress = Number(state?.progress) || 0;
  const flowDistance = progress + (Math.max(0, Number(state?.flowTime) || 0) * 510);
  const ship = getWeaponGateShipScreenPoint();
  const shipX = Number(ship?.x) || 0;
  const shipY = Number(ship?.y) || 0;
  const items = [];
  laneOffsets.forEach((offset, laneIndex) => {
    const laneSpacing = spacing + ((laneIndex % 2) * 28);
    const phase = ((flowDistance * (0.55 + laneIndex * 0.035) + laneIndex * 43) % laneSpacing + laneSpacing) % laneSpacing;
    for (let i = -3; i < Math.ceil(width / laneSpacing) + 3; i += 1) {
      const x = (i * laneSpacing) + phase - laneSpacing + corridorX;
      if (x < -110 || x > width + 120) continue;
      const localX = x - corridorX;
      const bounds = getWeaponGateCorridorScreenBoundsAtX(state, localX);
      const next = getWeaponGateCorridorScreenBoundsAtX(state, localX + 72);
      const angle = Math.atan2(next.center - bounds.center, 72) * 180 / Math.PI;
      const jitter = Math.sin((i * 12.9898) + (laneIndex * 78.233)) * 0.08;
      let y = bounds.center + ((offset + jitter) * bounds.halfHeight * 0.82);
      let drawX = x;
      const dx = drawX - shipX;
      const dy = y - shipY;
      const dist = Math.hypot(dx, dy);
      const react = dist > 0.001 && dist < 82 ? Math.pow(1 - (dist / 82), 1.65) : 0;
      if (react > 0) {
        drawX += (dx / dist) * react * 46;
        y += (dy / dist) * react * 46;
      }
      const alpha = Math.max(0, Math.min(1, opacity));
      const scale = 1 + react * 1.25;
      const glow = react > 0
        ? `background:rgba(218,248,255,.98);box-shadow:0 0 ${(9 + react * 16).toFixed(1)}px rgba(218,248,255,.76),0 0 ${(20 + react * 26).toFixed(1)}px rgba(100,216,255,.42);`
        : '';
      items.push(`<div class="beat-swarm-weapon-gate-flow" style="left:${drawX.toFixed(1)}px;top:${y.toFixed(1)}px;opacity:${alpha.toFixed(2)};${glow}transform:rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(2)})"></div>`);
    }
  });
  return items.join('');
}

function renderDashPickup(state) {
  const p = state.dashPickup;
  if (!p) return '';
  const sx = p.x - state.progress;
  const sy = p.y + ((window.innerHeight * 0.5) - state.y);
  return `<div class="beat-swarm-weapon-dash-pickup" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px"></div>`;
}

function renderNoteMap(state, notePool, totalSlots) {
  if (state?.hideNoteMap === true) return '';
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
    const burst = Math.max(0, Math.min(1, (Number(star.burstT) || 0) / 0.56));
    const stepPulse = star.slot === state.noteStarPulseSlot ? pulse : 0;
    const glow = Math.max(flash, stepPulse, burst);
    const size = 12 + glow * 16;
    const note = String(star.note || notePool[0] || '').trim();
    const shadow = glow > 0
      ? `0 0 ${(14 + glow * 10).toFixed(1)}px rgba(255,255,255,${(0.5 + glow * 0.42).toFixed(2)}),0 0 ${(32 + glow * 24).toFixed(1)}px rgba(170,232,255,${(0.32 + glow * 0.34).toFixed(2)})`
      : '0 0 12px rgba(170,232,255,.72),0 0 26px rgba(170,232,255,.32)';
    const x = star.x + ox;
    const y = star.y + oy;
    const burstHtml = burst > 0
      ? `<div class="beat-swarm-weapon-note-burst" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;opacity:${burst.toFixed(2)}"></div>`
      : '';
    return `${burstHtml}<div class="beat-swarm-weapon-note-star" title="${note}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;margin:${(-size / 2).toFixed(1)}px 0 0 ${(-size / 2).toFixed(1)}px;opacity:${(0.58 + glow * 0.4).toFixed(2)};box-shadow:${shadow};background:${glow > 0.55 ? '#fff' : '#d9f7ff'}"></div>`;
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
  const hero = gate.heroTtl > 0 ? ' is-hero' : '';
  const sections = gate.sections.map((section, i) => {
    const kind = section.kind === 'damage' ? 'damage' : 'note';
    const picked = gate.selectedSectionIndex === i ? ` is-picked${gate.heroTtl > 0 ? ' is-hero' : ''}` : '';
    return `<div class="beat-swarm-weapon-gate-section is-${kind}${picked}" style="height:${sectionH - 2}px">${kind === 'damage' ? 'DMG' : section.note}</div>`;
  }).join('');
  return `<div class="beat-swarm-weapon-gate${next}${selected}${hero}" style="left:${x}px;top:${top}px;height:${h}px">${next ? '<div class="beat-swarm-weapon-gate-label">NEXT</div>' : ''}${sections}</div>`;
}
