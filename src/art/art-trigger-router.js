// src/art/art-trigger-router.js
// Shared art-toy trigger routing contract.
//
// Purpose:
// - normalize note/step trigger data into a shared payload
// - reuse existing ownership data (panel.dataset.artOwnerId)
// - provide one routing entrypoint for current + future art toy visuals

export const ART_TRIGGER_SLOTS = 8;

function nowMs() {
  try { return performance.now(); } catch {}
  return Date.now();
}

export function normalizeArtSlotIndex(raw, slots = ART_TRIGGER_SLOTS) {
  const n = Number(raw);
  const s = Number(slots);
  if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return null;
  const i = Math.trunc(n);
  if (i < 0) return null;
  return i % s;
}

function mapNoteNameToSlot(noteName) {
  if (!noteName) return null;
  const raw = String(noteName).trim().toUpperCase();
  const m = raw.match(/^([A-G])([#B]?)/);
  if (!m) return null;
  const key = `${m[1]}${m[2] || ''}`;
  // Deterministic 8-slot mapping for fallback paths where step/column is unavailable.
  const map = {
    C: 0,
    D: 1,
    E: 2,
    F: 3,
    G: 4,
    A: 5,
    B: 6,
    'C#': 7,
    DB: 7,
    'D#': 0,
    EB: 0,
    'F#': 1,
    GB: 1,
    'G#': 2,
    AB: 2,
    'A#': 3,
    BB: 3,
  };
  return normalizeArtSlotIndex(map[key], ART_TRIGGER_SLOTS);
}

function resolveSlotIndex(input) {
  if (!input || typeof input !== 'object') return null;
  const direct =
    normalizeArtSlotIndex(input.slotIndex) ??
    normalizeArtSlotIndex(input.col) ??
    normalizeArtSlotIndex(input.step) ??
    normalizeArtSlotIndex(input.index);
  if (direct != null) return direct;
  // Sequence-position mapping is authoritative for art triggers.
  // Do not fall back to note-name mapping.
  return null;
}

function makeTriggerPayload(panel, input) {
  const src = (input && typeof input === 'object') ? input : {};
  const ownerArtToyId = String(
    panel?.dataset?.artOwnerId ||
    src.artToyId ||
    src.ownerArtToyId ||
    ''
  ) || null;
  if (!ownerArtToyId) return null;

  const toyIdCandidate =
    src.toyId ||
    panel?.id ||
    panel?.dataset?.audiotoyid ||
    panel?.dataset?.toyid ||
    null;

  const velocityRaw = Number(src.velocity);
  const payload = {
    version: 1,
    source: String(src.source || 'unknown'),
    artToyId: ownerArtToyId,
    panelId: panel?.id || null,
    toyId: toyIdCandidate ? String(toyIdCandidate) : null,
    slotIndex: resolveSlotIndex(src),
    note: src.note != null ? String(src.note) : null,
    velocity: Number.isFinite(velocityRaw) ? velocityRaw : null,
    timestamp: Number.isFinite(Number(src.timestamp)) ? Number(src.timestamp) : nowMs(),
    meta: (src.meta && typeof src.meta === 'object') ? src.meta : null,
  };
  return payload;
}

export function createArtTriggerRouter({
  resolvePanelByToyId = null,
  getActiveInternalArtToyId = null,
} = {}) {
  const listeners = new Set();

  function emit(payload) {
    if (!payload) return null;
    for (const fn of Array.from(listeners)) {
      try { fn(payload); } catch {}
    }
    try {
      window.dispatchEvent(new CustomEvent('art:trigger', { detail: payload }));
    } catch {}
    return payload;
  }

  function routeFromPanel(panel, input = {}) {
    const payload = makeTriggerPayload(panel, input);
    return emit(payload);
  }

  function routeFromToyId(toyId, input = {}) {
    if (!toyId) return null;
    const resolvedInput = { ...(input || {}), toyId: String(toyId) };
    let panel = null;
    if (typeof resolvePanelByToyId === 'function') {
      try { panel = resolvePanelByToyId(String(toyId)); } catch {}
    }
    if (panel) return routeFromPanel(panel, resolvedInput);

    // Internal-board fallback: when toy id can't resolve to a panel, route to current art toy.
    if (typeof getActiveInternalArtToyId === 'function') {
      try {
        const activeArtToyId = getActiveInternalArtToyId();
        if (activeArtToyId) {
          return emit(makeTriggerPayload(null, {
            ...resolvedInput,
            artToyId: String(activeArtToyId),
          }));
        }
      } catch {}
    }

    return null;
  }

  function onTrigger(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    routeFromPanel,
    routeFromToyId,
    onTrigger,
    normalizeSlotIndex: normalizeArtSlotIndex,
  };
}
