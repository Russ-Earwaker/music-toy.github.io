export function renderWeaponGateLab(ctx, state) {
  const w = state.width;
  const h = state.height;
  const top = state.corridorTop;
  const bottom = state.corridorBottom;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#0b1d2b';
  ctx.fillRect(0, top, w, bottom - top);
  ctx.strokeStyle = '#48d7ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(w, top);
  ctx.moveTo(0, bottom);
  ctx.lineTo(w, bottom);
  ctx.stroke();
  renderWallPulse(ctx, state);

  const camX = state.cameraX;
  for (const gate of state.gates) renderGate(ctx, state, gate, gate.x - camX);
  renderNextGateCue(ctx, state);
  renderTarget(ctx, state);
  renderBullets(ctx, state);
  renderPlayer(ctx, state);
  renderImpact(ctx, state);
  renderHud(ctx, state);
}

function renderGate(ctx, state, gate, x) {
  if (x < -120 || x > state.width + 160) return;
  const top = state.corridorTop;
  const h = state.corridorBottom - top;
  const sectionH = h / gate.sections.length;
  const isNext = gate.slotIndex === state.nextGateIndex && !gate.selected;
  ctx.save();
  ctx.globalAlpha = gate.selected ? 0.42 : 1;
  for (let i = 0; i < gate.sections.length; i++) {
    const section = gate.sections[i];
    const y = top + (i * sectionH);
    const isDamage = section.kind === 'damage';
    ctx.fillStyle = isDamage ? '#462329' : '#183653';
    ctx.fillRect(x, y, gate.width, sectionH - 2);
    ctx.strokeStyle = isDamage ? '#ff6a72' : '#64d8ff';
    ctx.lineWidth = isNext ? 3 : 2;
    ctx.strokeRect(x, y, gate.width, sectionH - 2);
    if (gate.selectedSectionIndex === i) {
      ctx.fillStyle = isDamage ? 'rgba(255, 106, 114, 0.42)' : 'rgba(255, 245, 155, 0.42)';
      ctx.fillRect(x - 8, y + 2, gate.width + 16, sectionH - 6);
      ctx.strokeStyle = '#fff59b';
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 8, y + 2, gate.width + 16, sectionH - 6);
    }
    ctx.fillStyle = '#f5fbff';
    ctx.font = isDamage ? '700 15px system-ui, sans-serif' : '600 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isDamage ? 'DMG' : section.note, x + gate.width / 2, y + sectionH / 2);
  }
  ctx.fillStyle = '#c9efff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`T${gate.toyIndex + 1}.${gate.toySlotIndex + 1}`, x + gate.width / 2, top - 14);
  if (isNext) {
    ctx.fillStyle = '#fff59b';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('NEXT', x + gate.width / 2, top - 34);
  }
  ctx.restore();
}

function renderWallPulse(ctx, state) {
  if (!(state.wallPulseTtl > 0)) return;
  const a = Math.min(1, state.wallPulseTtl / 0.28);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#fff59b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, state.wallPulseY);
  ctx.lineTo(state.width, state.wallPulseY);
  ctx.stroke();
  ctx.restore();
}

function renderNextGateCue(ctx, state) {
  const gate = state.gates[state.nextGateIndex];
  if (!gate) return;
  const x = gate.x - state.cameraX;
  const clampedX = Math.max(78, Math.min(state.width - 78, x + gate.width / 2));
  const label = gate.type === 'damage' ? 'DMG GATE' : gate.type === 'mixed' ? 'MIXED GATE' : 'NOTE GATE';
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(clampedX - 70, state.corridorTop + 10, 140, 30);
  ctx.fillStyle = gate.type === 'damage' ? '#ff8e98' : gate.type === 'mixed' ? '#fff59b' : '#8ee8ff';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, clampedX, state.corridorTop + 30);
  if (x > state.width) {
    ctx.beginPath();
    ctx.moveTo(state.width - 30, state.corridorTop + 25);
    ctx.lineTo(state.width - 48, state.corridorTop + 15);
    ctx.lineTo(state.width - 48, state.corridorTop + 35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderPlayer(ctx, state) {
  const p = state.player;
  const x = p.x - state.cameraX;
  ctx.save();
  ctx.translate(x, p.y);
  ctx.fillStyle = '#ffe66f';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderTarget(ctx, state) {
  const t = state.target;
  if (!t || t.ttl <= 0) return;
  const x = t.x - state.cameraX;
  if (x < -60 || x > state.width + 80) return;
  ctx.fillStyle = t.hit ? '#fff3a3' : '#ff8ec7';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, t.y, t.hit ? 22 : 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function renderBullets(ctx, state) {
  ctx.fillStyle = '#7df8ff';
  for (const b of state.bullets) {
    const x = b.x - state.cameraX;
    if (x < -30 || x > state.width + 40) continue;
    ctx.beginPath();
    ctx.arc(x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderImpact(ctx, state) {
  if (!(state.feedbackTtl > 0)) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.feedbackTtl / 0.35);
  ctx.fillStyle = state.feedbackKind === 'damage' ? '#ff5c6c' : '#fff59b';
  ctx.font = '800 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = state.feedbackKind === 'damage' ? '#ff5c6c' : '#fff59b';
  ctx.shadowBlur = 22;
  ctx.fillText(state.feedbackText, state.width * 0.5, 96);
  ctx.restore();
}

function renderHud(ctx, state) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.fillRect(14, 14, 360, 178);
  ctx.fillStyle = '#e8f8ff';
  ctx.font = '13px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  const r = state.ratioState;
  const lines = [
    `Weapon Gate Lab`,
    `Gate ${Math.min(state.nextGateIndex + 1, 16)}/16  Toy ${Math.floor(state.nextGateIndex / 8) + 1} Slot ${(state.nextGateIndex % 8) + 1}`,
    `Notes ${r.selectedNotes}/${r.targetNotes}  Silences ${r.selectedSilences}/${r.targetSilences}`,
    `Streak N:${r.currentNoteStreak} S:${r.currentSilenceStreak}`,
    `Seed ${state.seed}  ${state.slowMotion ? 'SLOW' : 'NORMAL'}`,
    `Controls: Up/Down or pointer. R restart.`,
    `Tune: ${state.selectionSummary.join(' ')}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 28, 38 + (i * 21)));
}
