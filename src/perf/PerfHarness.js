// src/perf/PerfHarness.js
// Lightweight benchmark harness: collects frame times and reports p95/p99/worst.

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

function statsFromFrameMs(frameMs) {
  const sorted = frameMs.slice().sort((a, b) => a - b);
  const sum = frameMs.reduce((a, b) => a + b, 0);
  const avg = frameMs.length ? sum / frameMs.length : 0;

  const over16 = frameMs.filter(v => v > 16.7).length;
  const over33 = frameMs.filter(v => v > 33.3).length;
  const over50 = frameMs.filter(v => v > 50.0).length;

  return {
    samples: frameMs.length,
    frameMs: {
      avg,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      worst: sorted.length ? sorted[sorted.length - 1] : 0,
    },
    counts: {
      over16ms: over16,
      over33ms: over33,
      over50ms: over50,
    }
  };
}

export async function runBenchmark({
  durationMs = 30000,
  warmupMs = 1000,
  label = 'benchmark',
  step = null, // (tMs, dtMs, progress01) => void
  warmupAction = null, // () => void, invoked once during warmup
  requireVisible = true, // abort (mark invalid) if tab not visible
  skipDtAboveMs = 1000, // skip absurd dt spikes (e.g. tab suspended); set 0 to disable
}) {
  const now = () => (performance && performance.now) ? performance.now() : Date.now();
  const raf = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(() => fn(now()), 16));

  const startMs = now();
  let lastMs = startMs;
  let ended = false;
  let warmupDid = false;
  const warmupTriggerMs = Math.max(0, Math.min(warmupMs - 50, warmupMs * 0.5));

  const frameMs = [];
  let skippedDtCount = 0;

  return await new Promise((resolve) => {
    function onFrame(ts) {
      if (ended) return;
      const t = ts - startMs;
      const dt = ts - lastMs;
      lastMs = ts;

      // Abort if the tab/window isn't visible. Background throttling makes results meaningless.
      if (requireVisible && typeof document !== 'undefined') {
        const vis = document.visibilityState || (document.hidden ? 'hidden' : 'visible');
        if (vis !== 'visible') {
          ended = true;
          resolve({
            label,
            durationMs,
            warmupMs,
            createdAt: new Date().toISOString(),
            invalid: true,
            invalidReason: `visibility:${vis}`,
            skippedDtCount,
          });
          return;
        }
      }

      // run scripted actions
      try {
        if (typeof step === 'function') step(t, dt, Math.min(1, t / durationMs));
      } catch (err) {
        // keep bench alive; step errors shouldn't abort sampling
        console.warn('[PerfHarness] step error', err);
      }

      // optional warmup hook (fires once before sampling)
      if (!warmupDid && typeof warmupAction === 'function' && t >= warmupTriggerMs && t <= warmupMs) {
        warmupDid = true;
        try { warmupAction(); } catch (err) { console.warn('[PerfHarness] warmupAction error', err); }
      }

      // warmup skip (avoid first-frame noise)
      if (t > warmupMs) {
        if (skipDtAboveMs && dt > skipDtAboveMs) {
          skippedDtCount++;
        } else {
          frameMs.push(dt);
        }
      }

      if (t >= durationMs) {
        ended = true;
        const s = statsFromFrameMs(frameMs);
        const result = {
          label,
          durationMs,
          warmupMs,
          createdAt: new Date().toISOString(),
          skippedDtCount,
          ...s,
        };
        resolve(result);
        return;
      }
      raf(onFrame);
    }
    onFrame.__perfRafTag = 'perf.raf.benchmark';
    raf(onFrame);
  });
}
