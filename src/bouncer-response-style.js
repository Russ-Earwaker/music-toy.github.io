export const BOUNCER_BASE_ORANGE = '#ff8c00';
export const BOUNCER_IMPACT_ORANGE = '#ffb52e';

export function getBouncerResponseColor(source) {
  return source?.active !== false && source?.pendingHit
    ? BOUNCER_IMPACT_ORANGE : BOUNCER_BASE_ORANGE;
}
