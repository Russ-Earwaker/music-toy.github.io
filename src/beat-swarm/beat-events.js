export const BEAT_EVENT_ROLES = Object.freeze({
  BASS: 'bass',
  LEAD: 'lead',
  ACCENT: 'accent',
  MOTION: 'motion',
});

export const BEAT_EVENT_THREAT = Object.freeze({
  FULL: 'full',
  LIGHT: 'light',
  COSMETIC: 'cosmetic',
  ACCENT: 'accent',
});

function normalizeString(value, fallback = '') {
  const s = String(value || '').trim();
  return s || fallback;
}

function normalizeIndex(value, fallback = 0) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return Math.max(0, Math.trunc(Number(fallback) || 0));
  return Math.max(0, n);
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return { ...payload };
}

export function createPerformedBeatEvent(input = null) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    eventId: normalizeIndex(src.eventId, 0),
    actorId: normalizeIndex(src.actorId, 0),
    beatIndex: normalizeIndex(src.beatIndex, 0),
    stepIndex: normalizeIndex(src.stepIndex, 0),
    role: normalizeString(src.role, BEAT_EVENT_ROLES.ACCENT),
    note: normalizeString(src.note, ''),
    instrumentId: normalizeString(src.instrumentId, ''),
    actionType: normalizeString(src.actionType, ''),
    threatClass: normalizeString(src.threatClass, BEAT_EVENT_THREAT.COSMETIC),
    visualSyncType: normalizeString(src.visualSyncType, ''),
    payload: normalizePayload(src.payload),
  };
}
