export function normalizeCallResponseLane(lane, fallback = 'call') {
  const s = String(lane || '').trim().toLowerCase();
  if (s === 'call' || s === 'response' || s === 'solo') return s;
  const fb = String(fallback || 'call').trim().toLowerCase();
  if (fb === 'response') return 'response';
  if (fb === 'solo') return 'solo';
  return 'call';
}

export function chooseIndexed(items, index = 0, fallback = null) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return fallback;
  const i = ((Math.trunc(Number(index) || 0) % list.length) + list.length) % list.length;
  return list[i] ?? fallback;
}

export function getComposerGroupTemplateById(templateList, templateId = '') {
  const key = String(templateId || '').trim().toLowerCase();
  if (!key) return null;
  const list = Array.isArray(templateList) ? templateList : [];
  return list.find((t) => String(t?.id || '').trim().toLowerCase() === key) || null;
}

export function pickComposerGroupTemplate(options = null) {
  const list = Array.isArray(options?.templates) ? options.templates : [];
  if (!list.length) return null;
  const energy = String(options?.energyState || '').trim().toLowerCase();
  const groupIndex = Math.trunc(Number(options?.groupIndex) || 0);
  const normalizeRole = typeof options?.normalizeRole === 'function' ? options.normalizeRole : ((x) => String(x || '').trim().toLowerCase());
  const bassRole = String(options?.bassRole || 'bass').trim().toLowerCase();
  const fullThreat = String(options?.fullThreat || 'full').trim().toLowerCase();

  let pool = list;
  if (energy === 'intro' || energy === 'break') {
    pool = list.filter((t) => String(t?.threatLevel || '').trim().toLowerCase() !== fullThreat);
    if (!pool.length) pool = list;
  } else if (energy === 'peak' || energy === 'clash') {
    pool = list.filter((t) => normalizeRole(t?.role || '') !== bassRole);
    if (!pool.length) pool = list;
  }
  return chooseIndexed(pool, groupIndex, list[0] || null);
}

export function createComposerGroupStepLoop(options = null) {
  const stepsPerBar = Math.max(1, Math.trunc(Number(options?.stepsPerBar) || 8));
  const minHits = Math.max(1, Math.trunc(Number(options?.minHits) || 2));
  const maxHits = Math.max(minHits, Math.trunc(Number(options?.maxHits) || 3));
  const rand = typeof options?.rand === 'function' ? options.rand : Math.random;
  const steps = Array.from({ length: stepsPerBar }, () => false);
  const hitCount = Math.max(minHits, Math.min(maxHits, Math.trunc(minHits + (rand() * ((maxHits - minHits) + 1)))));
  const phase = Math.max(0, Math.min(stepsPerBar - 1, Math.trunc(rand() * stepsPerBar)));
  const stride = Math.max(1, Math.floor(stepsPerBar / Math.max(1, hitCount)));
  for (let i = 0; i < hitCount; i++) {
    const idx = (phase + (i * stride)) % stepsPerBar;
    steps[idx] = true;
  }
  if (!steps.some(Boolean)) steps[phase] = true;
  return steps;
}

export function chooseResponseNoteFromPool(options = null) {
  const normalizeNoteName = typeof options?.normalizeNoteName === 'function' ? options.normalizeNoteName : ((n) => String(n || '').trim());
  const fallback = normalizeNoteName(options?.fallbackNote || '') || '';
  const call = normalizeNoteName(options?.callNote || '') || '';
  const notePool = Array.isArray(options?.notePool) ? options.notePool : [];
  if (!call || notePool.length <= 1) return fallback;
  const callIdx = notePool.findIndex((n) => normalizeNoteName(n) === call);
  if (!(callIdx >= 0)) return fallback;
  const stepAbs = Math.max(0, Math.trunc(Number(options?.stepAbs) || 0));
  const dir = (stepAbs % 2) === 0 ? 1 : -1;
  const idx = (callIdx + dir + notePool.length) % notePool.length;
  return normalizeNoteName(notePool[idx]) || fallback;
}
