// src/perf-meter.js
// Tiny frame-time sampler for pinpointing expensive systems.
// Enable via ?perf=1 or localStorage.mt_perf_meter = '1'.

const enabled = (() => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('perf') === '1' || params.get('perfMeter') === '1') return true;
    const ls = window.localStorage?.getItem('mt_perf_meter');
    if (ls === '0' || ls === 'false') return false;
    if (ls === '1' || ls === 'true') return true;
    // Default to on so we can spot hot systems; opt out with mt_perf_meter=0.
    return true;
  } catch {
    return false;
  }
})();

const buckets = new Map();
let lastFlush = typeof performance !== 'undefined' ? performance.now() : Date.now();
let frames = 0;

function recordSample(name, dt) {
  if (!enabled || !Number.isFinite(dt)) return;
  const bucket = buckets.get(name) || { sum: 0, count: 0, max: 0 };
  bucket.sum += dt;
  bucket.count += 1;
  if (dt > bucket.max) bucket.max = dt;
  buckets.set(name, bucket);
}

function flush() {
  if (!enabled) return;
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  if (now - lastFlush < 1000) return;
  if (!frames) {
    lastFlush = now;
    return;
  }

  const rows = [];
  for (const [name, bucket] of buckets.entries()) {
    const perFrame = bucket.sum / frames;
    rows.push({
      name,
      perFrame,
      max: bucket.max,
      count: bucket.count,
    });
  }
  buckets.clear();

  rows.sort((a, b) => b.perFrame - a.perFrame);
  const top = rows.slice(0, 5);
  if (top.length) {
    const summary = top
      .map((r) => `${r.name}: ${r.perFrame.toFixed(2)}ms avg (${r.max.toFixed(1)} max, n=${r.count})`)
      .join(' | ');
    try {
      console.debug('[perf-meter]', summary);
      window.__mtFrameMeterLast = top;
    } catch {}
  }

  frames = 0;
  lastFlush = now;
}

function rafTick() {
  if (enabled) {
    frames += 1;
    flush();
    requestAnimationFrame(rafTick);
  }
}
if (enabled && typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(rafTick);
}

export function startSection(name = 'unknown') {
  if (!enabled || typeof performance === 'undefined' || typeof performance.now !== 'function') {
    return () => {};
  }
  const t0 = performance.now();
  return () => recordSample(name, performance.now() - t0);
}

export function measureSection(name, fn) {
  const end = startSection(name);
  try {
    return fn();
  } finally {
    end();
  }
}

export function isFrameMeterEnabled() {
  return enabled;
}
