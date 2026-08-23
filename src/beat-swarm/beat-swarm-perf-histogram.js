export const BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS = Object.freeze([
  0.1, 0.25, 0.5, 1, 2, 4, 8, 12, 16, 24, 33, 50, 75, 100, 150, 250, 500, 1000,
]);

export function createBeatSwarmPerfHistogram() {
  return Array.from({ length: BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS.length + 1 }, () => 0);
}

export function recordBeatSwarmPerfHistogram(histogram, durationMs) {
  if (!Array.isArray(histogram)) return;
  const ms = Math.max(0, Number(durationMs) || 0);
  let index = 0;
  while (
    index < BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS.length
    && ms > BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS[index]
  ) index += 1;
  histogram[Math.min(histogram.length - 1, index)] += 1;
}

export function getBeatSwarmPerfPercentiles(histogram, countLike = 0) {
  const count = Math.max(0, Math.trunc(Number(countLike) || 0));
  const percentile = (ratio) => {
    if (!count || !Array.isArray(histogram)) return 0;
    const target = Math.max(1, Math.ceil(count * ratio));
    let seen = 0;
    for (let index = 0; index < histogram.length; index += 1) {
      seen += Math.max(0, Math.trunc(Number(histogram[index]) || 0));
      if (seen >= target) {
        return index < BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS.length
          ? BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS[index]
          : BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS.at(-1);
      }
    }
    return BEAT_SWARM_PERF_HISTOGRAM_BOUNDS_MS.at(-1);
  };
  return {
    p50Ms: percentile(0.5),
    p90Ms: percentile(0.9),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
  };
}
