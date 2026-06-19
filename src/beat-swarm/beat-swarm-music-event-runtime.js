const VALID_EVENT_TYPES = Object.freeze([
  'foundation_rewrite',
  'lead_rewrite',
  'accent_rewrite',
  'power_rewrite',
]);

const VALID_STATUSES = Object.freeze([
  'queued',
  'active',
  'committing',
  'complete',
  'cancelled',
]);

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeBar(value = 0) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function normalizeDurationBars(value = 8) {
  return Math.max(1, Math.trunc(Number(value) || 8));
}

function normalizeEventType(value = '') {
  const type = normalizeText(value, 'foundation_rewrite').toLowerCase();
  return VALID_EVENT_TYPES.includes(type) ? type : 'foundation_rewrite';
}

function normalizeStatus(value = '') {
  const status = normalizeText(value, 'queued').toLowerCase();
  return VALID_STATUSES.includes(status) ? status : 'queued';
}

function clonePayload(value = null) {
  if (!value || typeof value !== 'object') return {};
  try { return JSON.parse(JSON.stringify(value)); } catch {}
  return { ...value };
}

function cloneEvent(event = null) {
  if (!event || typeof event !== 'object') return null;
  return {
    id: normalizeText(event.id),
    type: normalizeEventType(event.type),
    laneId: normalizeText(event.laneId),
    themeId: normalizeText(event.themeId),
    source: normalizeText(event.source),
    reason: normalizeText(event.reason),
    status: normalizeStatus(event.status),
    requestedBar: normalizeBar(event.requestedBar),
    startBar: normalizeBar(event.startBar),
    expiresBar: normalizeBar(event.expiresBar),
    completedBar: event.completedBar == null ? -1 : normalizeBar(event.completedBar),
    cancelledBar: event.cancelledBar == null ? -1 : normalizeBar(event.cancelledBar),
    cancelReason: normalizeText(event.cancelReason),
    result: clonePayload(event.result),
    payload: clonePayload(event.payload),
  };
}

function createEventFromRequest(request = null, id = '') {
  const req = request && typeof request === 'object' ? request : {};
  const requestedBar = normalizeBar(req.requestedBar ?? req.bar);
  const durationBars = normalizeDurationBars(req.durationBars);
  return {
    id,
    type: normalizeEventType(req.type),
    laneId: normalizeText(req.laneId),
    themeId: normalizeText(req.themeId),
    source: normalizeText(req.source, 'director'),
    reason: normalizeText(req.reason),
    status: 'queued',
    requestedBar,
    startBar: -1,
    expiresBar: requestedBar + durationBars,
    completedBar: -1,
    cancelledBar: -1,
    cancelReason: '',
    result: {},
    payload: clonePayload(req.payload),
  };
}

export function createBeatSwarmMusicEventRuntime() {
  let nextEventId = 1;
  const queue = [];
  const history = [];
  let activeEvent = null;

  function pushHistory(event = null) {
    const cloned = cloneEvent(event);
    if (!cloned) return null;
    history.push(cloned);
    while (history.length > 32) history.shift();
    return cloned;
  }

  function requestEvent(request = null) {
    const event = createEventFromRequest(request, `music-event-${nextEventId}`);
    nextEventId += 1;
    queue.push(event);
    return cloneEvent(event);
  }

  function startNext(options = null) {
    if (activeEvent || !queue.length) return cloneEvent(activeEvent);
    const opts = options && typeof options === 'object' ? options : {};
    const bar = normalizeBar(opts.bar);
    activeEvent = queue.shift();
    activeEvent.status = 'active';
    activeEvent.startBar = bar;
    if (!(activeEvent.expiresBar > bar)) {
      activeEvent.expiresBar = bar + normalizeDurationBars(opts.durationBars || activeEvent.payload?.durationBars);
    }
    return cloneEvent(activeEvent);
  }

  function markCommitting(options = null) {
    if (!activeEvent) return null;
    const opts = options && typeof options === 'object' ? options : {};
    activeEvent.status = 'committing';
    if (opts.payload && typeof opts.payload === 'object') {
      activeEvent.payload = { ...activeEvent.payload, ...clonePayload(opts.payload) };
    }
    return cloneEvent(activeEvent);
  }

  function completeActive(options = null) {
    if (!activeEvent) return null;
    const opts = options && typeof options === 'object' ? options : {};
    activeEvent.status = 'complete';
    activeEvent.completedBar = normalizeBar(opts.bar);
    activeEvent.result = clonePayload(opts.result);
    const completed = pushHistory(activeEvent);
    activeEvent = null;
    return completed;
  }

  function cancelActive(options = null) {
    if (!activeEvent) return null;
    const opts = options && typeof options === 'object' ? options : {};
    activeEvent.status = 'cancelled';
    activeEvent.cancelledBar = normalizeBar(opts.bar);
    activeEvent.cancelReason = normalizeText(opts.reason, 'cancelled');
    const cancelled = pushHistory(activeEvent);
    activeEvent = null;
    return cancelled;
  }

  function tick(options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const bar = normalizeBar(opts.bar);
    if (!activeEvent && queue.length) startNext({ bar });
    if (activeEvent && activeEvent.expiresBar >= 0 && bar > activeEvent.expiresBar) {
      return cancelActive({ bar, reason: 'expired' });
    }
    return cloneEvent(activeEvent);
  }

  function reset() {
    queue.length = 0;
    history.length = 0;
    activeEvent = null;
    nextEventId = 1;
  }

  function getSnapshot() {
    return {
      activeEvent: cloneEvent(activeEvent),
      queue: queue.map(cloneEvent).filter(Boolean),
      history: history.map(cloneEvent).filter(Boolean),
      queuedCount: queue.length,
      hasActiveEvent: !!activeEvent,
    };
  }

  function isActive(type = '') {
    if (!activeEvent) return false;
    const eventType = normalizeText(type).toLowerCase();
    return !eventType || activeEvent.type === eventType;
  }

  return {
    requestEvent,
    startNext,
    markCommitting,
    completeActive,
    cancelActive,
    tick,
    reset,
    getSnapshot,
    isActive,
  };
}
