const DEFAULT_NOTES = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);

function pick(arr, rng) {
  const list = Array.isArray(arr) && arr.length ? arr : DEFAULT_NOTES;
  return list[Math.max(0, Math.min(list.length - 1, Math.trunc(rng() * list.length)))] || list[0];
}

function noteOctave(note) {
  const m = /(-?\d+)$/.exec(String(note || '').trim());
  return m ? Math.trunc(Number(m[1]) || 0) : 4;
}

function makeNoteSections(notePool, rng, count = 5) {
  const sections = [];
  const sourceOctave = noteOctave(notePool[0] || DEFAULT_NOTES[0]);
  const notes = notePool
    .filter((note) => noteOctave(note) === sourceOctave)
    .slice()
    .reverse();
  for (let i = 0; i < count; i++) {
    sections.push({ kind: 'note', note: notes[i % notes.length] || pick(notePool, rng) });
  }
  return sections;
}

function insertDamageSection(sections, rng) {
  const insertAt = Math.max(0, Math.min(sections.length, Math.trunc(rng() * (sections.length + 1))));
  return [
    ...sections.slice(0, insertAt),
    { kind: 'damage', label: 'DMG' },
    ...sections.slice(insertAt),
  ];
}

export function createWeaponGate(slotIndex, ratioDecision, options = {}) {
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const notePool = Array.isArray(options.notePool) && options.notePool.length ? options.notePool : DEFAULT_NOTES;
  const noteSectionCount = Math.max(3, Math.min(7, Math.trunc(Number(options.sectionCount) || notePool.length || 5)));
  const gateSpacing = Math.max(320, Math.trunc(Number(options.gateSpacing) || 690));
  const startX = Math.max(480, Math.trunc(Number(options.startX) || 760));
  const type = String(ratioDecision?.type || 'mixed');
  let sections = [];

  if (type === 'damage') {
    sections = Array.from({ length: noteSectionCount }, () => ({ kind: 'damage', label: 'DMG' }));
  } else {
    sections = makeNoteSections(notePool, rng, noteSectionCount);
    if (type === 'mixed') {
      sections = insertDamageSection(sections, rng);
    }
  }

  return {
    id: `gate-${slotIndex + 1}`,
    slotIndex,
    toyIndex: Math.floor(slotIndex / 8),
    toySlotIndex: slotIndex % 8,
    x: startX + (slotIndex * gateSpacing),
    width: 64,
    type,
    reason: String(ratioDecision?.reason || ''),
    damageSectionCount: Math.max(0, Math.trunc(Number(ratioDecision?.damageSectionCount) || 0)),
    sections,
    selected: false,
    selectedSectionIndex: -1,
  };
}

export function createWeaponTuneChainFromSelections(selections, notePool = DEFAULT_NOTES) {
  const notes = Array.isArray(notePool) && notePool.length ? notePool.slice() : DEFAULT_NOTES.slice();
  const chain = [];
  for (let toy = 0; toy < 2; toy++) {
    const active = Array.from({ length: 8 }, () => false);
    const list = Array.from({ length: 8 }, () => []);
    const disabled = Array.from({ length: 8 }, () => []);
    for (let step = 0; step < 8; step++) {
      const slotIndex = (toy * 8) + step;
      const sel = selections[slotIndex] || null;
      if (sel?.kind === 'note') {
        const row = Math.max(0, notes.indexOf(sel.note));
        active[step] = row >= 0;
        list[step] = row >= 0 ? [row] : [];
      } else {
        active[step] = false;
        disabled[step] = notes.map((_, i) => i);
      }
    }
    chain.push({ kind: 'drawgrid', steps: 8, notes, active, list, disabled });
  }
  return chain;
}

export function summarizeWeaponGateSelection(selection) {
  if (!selection) return '-';
  if (selection.kind === 'damage') return 'DMG';
  return String(selection.note || '?');
}
