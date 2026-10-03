const cleanTick = value => Math.max(0, Math.round(Number(value) || 0));

export const BOUNCER_PRIME_GLOW_MIN = 0.25;
export const BOUNCER_PRIME_GLOW_MAX = 0.65;

export function acceptBouncerPendingHit(source, { impactTick, fireTick, eventId } = {}) {
  if (!source) return false;
  const impact = cleanTick(impactTick);
  const fire = Math.max(impact, cleanTick(fireTick));
  const pending = source.pendingHit;
  if (pending && impact < cleanTick(pending.fireTick)) return false;
  source.pendingHit = { impactTick: impact, fireTick: fire, eventId };
  return true;
}

export function clearBouncerPendingHit(source, eventId = null) {
  if (!source?.pendingHit) return false;
  if (eventId != null && source.pendingHit.eventId !== eventId) return false;
  source.pendingHit = null;
  return true;
}

export function getBouncerPrimeGlow(source, currentTick) {
  const pending = source?.pendingHit;
  if (!pending) return 0;
  const impact = cleanTick(pending.impactTick);
  const fire = Math.max(impact, cleanTick(pending.fireTick));
  if (fire <= impact || cleanTick(currentTick) >= fire) return 0;
  const progress = Math.max(0, Math.min(1, (cleanTick(currentTick) - impact) / (fire - impact)));
  return BOUNCER_PRIME_GLOW_MIN + ((BOUNCER_PRIME_GLOW_MAX - BOUNCER_PRIME_GLOW_MIN) * progress);
}

export function clearBouncerPendingHits(sources) {
  for (const source of sources || []) if (source) source.pendingHit = null;
}
