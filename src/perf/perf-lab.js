// src/perf/perf-lab.js
// Perf Lab: generates stress scenes + runs scripted benchmarks + copies JSON results.

import { setParticleQualityLock } from '../particles/ParticleQuality.js';
import { runBenchmark } from './PerfHarness.js';
import { makePanZoomScript, makeOverviewSpamScript } from './PerfScripts.js';
import { buildParticleWorstCase } from './StressSceneParticles.js';

// Global perf toggles consumed by shared particle code.
// Keep it simple: one object, easy to inspect in console.
try {
  window.__PERF_PARTICLES = window.__PERF_PARTICLES || {
    skipUpdate: false,
    skipDraw: false,
    budgetMul: 1,
    gestureDrawModulo: 4,
    gestureFieldModulo: 1,
    freezeUnfocusedDuringGesture: true,
    logFreeze: false,
  };
} catch {}

function ensureUI() {
  let ov = document.getElementById('perf-lab-overlay');
  if (ov) return ov;

  ov = document.createElement('div');
  ov.id = 'perf-lab-overlay';
  ov.className = 'perf-lab-overlay';
  ov.innerHTML = `
    <div class="perf-lab-panel">
      <div class="perf-lab-header">
        <div>
          <div class="perf-lab-title">Perf Lab</div>
          <div class="perf-lab-sub">Repeatable stress tests (particles-first)</div>
        </div>
        <button class="perf-lab-btn" data-act="close">✕</button>
      </div>
      <div class="perf-lab-body">
        <div class="perf-lab-row">
          <button class="perf-lab-btn primary" data-act="buildP2">Build P2: Particle Worst-Case</button>
          <button class="perf-lab-btn" data-act="runP2a">Run P2a: Static (30s)</button>
          <button class="perf-lab-btn" data-act="runP2b">Run P2b: Pan/Zoom (30s)</button>
          <button class="perf-lab-btn" data-act="runP2c">Run P2c: Overview (30s)</button>
        </div>
        <div class="perf-lab-row">
          <button class="perf-lab-btn primary" data-act="buildP3">Build P3: DrawGrid Worst-Case</button>
          <button class="perf-lab-btn" data-act="runP3a">Run P3a: Static (30s)</button>
          <button class="perf-lab-btn" data-act="runP3b">Run P3b: Pan/Zoom (30s)</button>
          <button class="perf-lab-btn" data-act="runP3c">Run P3c: Overview (30s)</button>
        </div>
        <div class="perf-lab-row">
          <label class="perf-lab-toggle">
            <input type="checkbox" data-tog="skipUpdate" />
            Skip particle update
          </label>
          <label class="perf-lab-toggle">
            <input type="checkbox" data-tog="skipDraw" />
            Skip particle draw
          </label>
          <label class="perf-lab-toggle">
            Budget
            <select class="perf-lab-select" data-tog="budgetMul">
              <option value="1">100%</option>
              <option value="0.5">50%</option>
              <option value="0.25">25%</option>
              <option value="0.1">10%</option>
            </select>
          </label>
          <label class="perf-lab-toggle">
            Gesture draw
            <select class="perf-lab-select" data-tog="gestureDrawModulo">
              <option value="1">Every frame</option>
              <option value="2">Every 2nd</option>
              <option value="3">Every 3rd</option>
              <option value="4">Every 4th</option>
            </select>
          </label>
          <label class="perf-lab-toggle">
            Gesture fields
            <select class="perf-lab-select" data-tog="gestureFieldModulo">
              <option value="1">All</option>
              <option value="2">1/2</option>
              <option value="4">1/4</option>
              <option value="8">1/8</option>
              <option value="16">1/16</option>
            </select>
          </label>
          <label class="perf-lab-toggle">
            <input type="checkbox" data-tog="freezeUnfocusedDuringGesture" checked />
            Freeze unfocused
          </label>
        </div>
        <div class="perf-lab-row">
          <button class="perf-lab-btn" data-act="copy">Copy Last Results</button>
          <div class="perf-lab-status" id="perf-lab-status">Idle</div>
        </div>
        <pre class="perf-lab-output" id="perf-lab-output"></pre>
      </div>
    </div>
  `;

  // Initialise toggle UI from current global state (so defaults match what you see)
  try {
    const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
    ov.querySelectorAll('[data-tog]').forEach((el) => {
      const key = el.getAttribute('data-tog');
      if (!key) return;
      const v = st[key];
      if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v;
      if (el.tagName === 'SELECT') {
        const val = Number.isFinite(v) ? v : el.value;
        el.value = String(Number(val));
      }
    });
  } catch {}

  ov.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'close') hide();
    if (act === 'buildP2') buildP2();
    if (act === 'runP2a') await runP2a();
    if (act === 'runP2b') await runP2b();
    if (act === 'runP2c') await runP2c();
    if (act === 'buildP3') buildP3();
    if (act === 'runP3a') await runP3a();
    if (act === 'runP3b') await runP3b();
    if (act === 'runP3c') await runP3c();
    if (act === 'copy') copyLast();
  });

  // Toggle wiring (checkboxes/select)
  ov.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;
    const key = t.getAttribute && t.getAttribute('data-tog');
    if (!key) return;
    try {
      const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
      if (t.tagName === 'INPUT' && t.type === 'checkbox') st[key] = !!t.checked;
      else if (t.tagName === 'SELECT') st[key] = Math.max(0, Number(t.value) || 1);
      console.log('[PerfLab] particle toggles', { ...st });
    } catch {}
  });

  document.body.appendChild(ov);
  return ov;
}

let lastResult = null;

function setStatus(s) {
  const el = document.getElementById('perf-lab-status');
  if (el) el.textContent = s;
}

function setOutput(obj) {
  const el = document.getElementById('perf-lab-output');
  if (!el) return;
  el.textContent = obj ? JSON.stringify(obj, null, 2) : '';
}

function show() {
  const ov = ensureUI();
  ov.style.display = 'flex';
}

function hide() {
  const ov = ensureUI();
  ov.style.display = 'none';
}

function toggle() {
  const ov = ensureUI();
  ov.style.display = (ov.style.display === 'flex') ? 'none' : 'flex';
}

function buildP2() {
  setStatus('Building P2…');
  // Particles worst-case: lots of loopgrids (heavy particle fields).
  buildParticleWorstCase({ toyType: 'loopgrid', rows: 8, cols: 10, spacing: 400 });
  setStatus('P2 built');
}

function buildP3() {
  setStatus('Building P3…');
  // DrawGrid worst-case: lots of drawgrids for canvas-heavy stress.
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 6, cols: 8, spacing: 420 });
  setStatus('P3 built');
}

async function runVariant(label, step, statusText) {
  setStatus(statusText || `Running ${label}…`);
  setOutput(null);
  lastResult = null;

  // Lock particle quality so FPS-driven LOD doesn’t “save us” during the test.
  setParticleQualityLock('ultra');

  const result = await runBenchmark({
    label,
    durationMs: 30000,
    warmupMs: 1200,
    step,
  });

  // Unlock
  setParticleQualityLock(null);

  // Attach toggle state to results for easier comparisons.
  try {
    result.particleToggles = {
      ...(window.__PERF_PARTICLES || {}),
      logFreeze: !!(window.__PERF_PARTICLES && window.__PERF_PARTICLES.logFreeze),
    };
  } catch {}
  lastResult = result;
  setOutput(result);
  setStatus('Done');
  try { console.log('[PerfLab] result', result); } catch {}
}

async function runP2a() {
  // Static: no pan/zoom, no overview.
  const step = () => {};
  await runVariant('P2a_particles_static', step, 'Running P2a (static)…');
}

async function runP2b() {
  // Pan/Zoom only: no overview toggles.
  const step = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 3000,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  await runVariant('P2b_particles_panzoom', step, 'Running P2b (pan/zoom)…');
}

async function runP2c() {
  // Overview spam only: no camera motion.
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P2c_particles_overview', step, 'Running P2c (overview spam)…');
}

async function runP3a() {
  const step = () => {};
  await runVariant('P3a_drawgrid_static', step, 'Running P3a (static)…');
}

async function runP3b() {
  const step = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 3000,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  await runVariant('P3b_drawgrid_panzoom', step, 'Running P3b (pan/zoom)…');
}

async function runP3c() {
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P3c_drawgrid_overview', step, 'Running P3c (overview spam)…');
}

async function copyLast() {
  if (!lastResult) {
    setStatus('No results to copy');
    return;
  }
  const txt = JSON.stringify(lastResult, null, 2);
  try {
    await navigator.clipboard.writeText(txt);
    setStatus('Copied JSON to clipboard');
  } catch {
    setStatus('Clipboard failed (see console)');
    console.log(txt);
  }
}

// Hotkey: Ctrl+Shift+P (P = Perf)
window.addEventListener('keydown', (e) => {
  const isP = (String(e.key || '').toLowerCase() === 'p');
  if (!isP) return;
  if (!(e.ctrlKey && e.shiftKey)) return;
  e.preventDefault();
  toggle();
});

// Expose for manual console use
try { window.__PerfLab = { show, hide, toggle, buildP2, buildP3, runP2a, runP2b, runP2c, runP3a, runP3b, runP3c }; } catch {}
