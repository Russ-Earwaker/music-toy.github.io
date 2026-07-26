import { applyWeaponGateSelection } from './beat-swarm-weapon-gate-ratio.js';
import { summarizeWeaponGateSelection } from './beat-swarm-weapon-gate-core.js';
import { WEAPON_GATE_TOTAL_SLOTS } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';
import { addWeaponGateNoteStar, spawnWeaponGateShot } from './beat-swarm-weapon-gate-effects.js?v=2026-07-26-weapon-gate-ghosts-v3';
import { clampWeaponGateValue, getWeaponGateCorridorScreenBoundsAtX, getWeaponGateCorridorWorldBounds, getWeaponGateShipScreenPoint, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-07-26-weapon-gate-ghosts-v1';
import { appendNextWeaponGate } from './beat-swarm-weapon-gate-state.js?v=2026-07-26-weapon-gate-transport-v2';

export function chooseCurrentWeaponGate(state, options = {}) {
  if (!state) return null;
  const gate = state.gates[state.nextGateIndex];
  if (!gate) return null;
  const shipX = getWeaponGateShipScreenPoint().x;
  const gateScreenX = gate.x - state.progress;
  const selectionLeadSeconds = Math.min(
    0.024,
    Math.max(0.008, (Number(state.gateStepSeconds) || 0.22) * 0.11)
  );
  const selectionLookahead = Math.max(6, (Number(state.speed) || 0) * selectionLeadSeconds);
  if (gateScreenX > shipX + selectionLookahead) return null;
  const { top, bottom } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
  const rel = clampWeaponGateValue((state.y - top) / Math.max(1, bottom - top), 0, 0.999);
  const idx = Math.max(0, Math.min(gate.sections.length - 1, Math.floor(rel * gate.sections.length)));
  const section = gate.sections[idx];
  const selection = {
    slotIndex: gate.slotIndex,
    kind: section.kind,
    note: section.note || '',
    gateType: gate.type,
    reason: gate.reason,
    availableSections: gate.sections,
    selectedSection: section,
    gateScreenX,
    crossingOffsetX: gateScreenX - shipX,
    selectionLeadSeconds,
    playbackStepIndex: Math.max(0, Math.trunc(Number(gate.playbackStepIndex) || 0)),
  };
  gate.selected = true;
  gate.selectedSectionIndex = idx;
  gate.heroTtl = 0.72;
  gate.heroSectionIndex = idx;
  state.selections[gate.slotIndex] = selection;
  state.summary[gate.slotIndex] = summarizeWeaponGateSelection(selection);
  applyWeaponGateSelection(state.ratioState, selection);
  state.feedbackKind = selection.kind;
  state.feedbackText = selection.kind === 'damage'
    ? `Damage Up: slot ${selection.slotIndex + 1} silent`
    : `${selection.note} selected`;
  state.feedbackTtl = 0.58;
  let handledByLiveWeapon = false;
  try {
    handledByLiveWeapon = options.onSelection?.(selection, state.selections.slice(), state) === true;
  } catch {}
  if (selection.kind === 'note') {
    const screenBounds = getWeaponGateCorridorScreenBoundsAtX(state, gateScreenX);
    const sectionHeight = Math.max(1, screenBounds.bottom - screenBounds.top) / Math.max(1, gate.sections.length);
    addWeaponGateNoteStar(state, selection, {
      x: gateScreenX,
      y: screenBounds.top + ((idx + 0.5) * sectionHeight),
    });
    if (!handledByLiveWeapon) {
      spawnWeaponGateShot(state, selection.note);
      try { options.triggerWeaponNote?.(selection.note, 'weapon-gate-intro'); } catch {}
    }
  }
  state.nextGateIndex += 1;
  if (state.nextGateIndex >= WEAPON_GATE_TOTAL_SLOTS) {
    finishWeaponGateSelection(state, options);
  } else {
    appendNextWeaponGate(state);
  }
  return selection;
}

export function finishWeaponGateSelection(state, options = {}) {
  if (!state) return;
  const selections = Array.isArray(state.selections) ? state.selections.slice() : [];
  try { options.applySelections?.(0, selections); } catch {}
  try { options.onComplete?.(); } catch {}
  state.phase = 'outro';
  state.hideNoteMap = true;
  state.completeDelay = state.outroDuration;
  state.feedbackKind = 'complete';
  state.feedbackText = 'Weapon tune complete';
  state.feedbackTtl = 0.9;
  state.shots = [];
  state.targets = [];
}
