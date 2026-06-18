import { applyWeaponGateSelection } from './beat-swarm-weapon-gate-ratio.js';
import { summarizeWeaponGateSelection } from './beat-swarm-weapon-gate-core.js';
import { WEAPON_GATE_TOTAL_SLOTS } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';
import { addWeaponGateNoteStar, spawnWeaponGateShot } from './beat-swarm-weapon-gate-effects.js?v=2026-06-18-corridor-curve-v1';
import { clampWeaponGateValue, getWeaponGateCorridorWorldBounds, getWeaponGateShipScreenPoint, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';
import { appendNextWeaponGate } from './beat-swarm-weapon-gate-state.js?v=2026-06-18-corridor-curve-v1';

export function chooseCurrentWeaponGate(state, options = {}) {
  if (!state) return null;
  const gate = state.gates[state.nextGateIndex];
  if (!gate) return null;
  const shipX = getWeaponGateShipScreenPoint().x;
  if ((gate.x - state.progress) > shipX) return null;
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
  };
  gate.selected = true;
  gate.selectedSectionIndex = idx;
  state.selections[gate.slotIndex] = selection;
  state.summary[gate.slotIndex] = summarizeWeaponGateSelection(selection);
  applyWeaponGateSelection(state.ratioState, selection);
  state.feedbackKind = selection.kind;
  state.feedbackText = selection.kind === 'damage'
    ? `Damage Up: slot ${selection.slotIndex + 1} silent`
    : `${selection.note} selected`;
  state.feedbackTtl = 0.58;
  if (selection.kind === 'note') {
    addWeaponGateNoteStar(state, selection);
    spawnWeaponGateShot(state, selection.note);
    try { options.triggerWeaponNote?.(selection.note, 'weapon-gate-intro'); } catch {}
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
  state.completeDelay = state.outroDuration;
  state.feedbackKind = 'complete';
  state.feedbackText = 'Weapon tune complete';
  state.feedbackTtl = 0.9;
  state.shots = [];
  state.targets = [];
}
