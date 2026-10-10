// Shared graph presentation tuning, in world pixels and milliseconds.
export const GRAPH_ENDPOINT_DIAMETER = 52;
export const GRAPH_ENDPOINT_HIT_DIAMETER = 64;
export const GRAPH_MIDPOINT_DIAMETER = 32;
export const GRAPH_MIDPOINT_HIT_DIAMETER = 56;
export const CONNECTION_FLASH_DURATION = 150;
export const STRUCTURE_FLASH_DURATION = 320;
export function structureFlashStrength(pulses, objectId, now) {
  let strength = 0;
  for (const pulse of pulses.values()) if (pulse.fromId === objectId)
    strength = Math.max(strength, Math.max(0, (pulse.structureUntil - now) / STRUCTURE_FLASH_DURATION));
  return Math.pow(Math.min(1, strength), 3);
}
