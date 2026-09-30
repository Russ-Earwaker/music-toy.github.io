export function createChordWheelStrumTimes(authoritativeTime, count = 6, {
  sweep = 0.065,
  jitter = 0.003,
  random = Math.random,
} = {}) {
  const total = Math.max(1, Math.trunc(Number(count) || 1));
  const step = Number(sweep) / Math.max(1, total - 1);
  return Array.from({ length: total }, (_, index) => (
    Number(authoritativeTime) + (index * step) + ((random() * jitter * 2) - jitter)
  ));
}
