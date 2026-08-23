import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBeatSwarmPerfHistogram,
  getBeatSwarmPerfPercentiles,
  recordBeatSwarmPerfHistogram,
} from '../src/beat-swarm/beat-swarm-perf-histogram.js';

test('records duration samples into percentile buckets', () => {
  const histogram = createBeatSwarmPerfHistogram();
  for (const duration of [0.05, 0.5, 1.5, 8, 18, 40, 120, 600]) {
    recordBeatSwarmPerfHistogram(histogram, duration);
  }

  assert.deepEqual(getBeatSwarmPerfPercentiles(histogram, 8), {
    p50Ms: 8,
    p90Ms: 1000,
    p95Ms: 1000,
    p99Ms: 1000,
  });
});

test('returns zero percentiles without samples', () => {
  assert.deepEqual(getBeatSwarmPerfPercentiles(createBeatSwarmPerfHistogram(), 0), {
    p50Ms: 0,
    p90Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
  });
});
