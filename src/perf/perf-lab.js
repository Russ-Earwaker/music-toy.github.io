// src/perf/perf-lab.js
// Perf Lab: generates stress scenes + runs scripted benchmarks + copies JSON results.

import { setParticleQualityLock } from '../particles/ParticleQuality.js';
import { start as startTransport, stop as stopTransport, isRunning } from '../audio-core.js';
import { runBenchmark } from './PerfHarness.js';
import { makePanZoomScript, makeOverviewSpamScript, makeOverviewOnceScript } from './PerfScripts.js';
import { buildParticleWorstCase } from './StressSceneParticles.js';
import { buildChainedLoopgridStress } from './StressSceneChains.js';

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

  // --- Build button lists (sorted) -----------------------------------------
  function btn(act, text, cls = '') {
    return `<button class="perf-lab-btn ${cls}" data-act="${act}">${text}</button>`;
  }

  function section(title, buttonsHtml) {
    return `
      <div class="perf-lab-section">
        <div class="perf-lab-section-title">${title}</div>
        <div class="perf-lab-section-buttons">${buttonsHtml}</div>
      </div>
    `;
  }

  function sortByLabel(arr) {
    return arr.slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  const P2 = {
    title: 'P2 — Particles',
    build: btn('buildP2', 'Build P2: Particle Worst-Case', 'primary'),
    runs: sortByLabel([
      { act: 'runP2a', label: 'Run P2a: Static (30s)' },
      { act: 'runP2b', label: 'Run P2b: Pan/Zoom (30s)' },
      { act: 'runP2c', label: 'Run P2c: Overview (30s)' },
    ]),
  };

  const P3 = {
    title: 'P3 — DrawGrid',
    build: btn('buildP3', 'Build P3: DrawGrid Worst-Case', 'primary'),
    runs: sortByLabel([
      { act: 'runP3a', label: 'Run P3a: Static (30s)' },
      { act: 'runP3b', label: 'Run P3b: Pan/Zoom (30s)' },
      { act: 'runP3c', label: 'Run P3c: Overview (30s)' },
      { act: 'runP3d', label: 'Run P3d: Overview Once (30s)' },
    ]),
  };

  const P4 = {
    title: 'P4 — Chained Simple Rhythm (Loopgrid)',
    build: [
      btn('buildP4',  'Build P4: Chained Simple Rhythm (Random)', 'primary'),
      btn('buildP4h', 'Build P4H: Chained SR (Heavy Play)', 'primary'),
    ].join(''),
    runs: sortByLabel([
      { act: 'runP4a',  label: 'Run P4a: Playing Static (30s)' },
      { act: 'runP4b',  label: 'Run P4b: Playing Pan/Zoom (30s)' },
      { act: 'runP4c',  label: 'Run P4c: Playing Static (No Particle Draw)' },
      { act: 'runP4d',  label: 'Run P4d: Playing Static (No Particle Update+Draw)' },
      { act: 'runP4e',  label: 'Run P4e: Pan/Zoom (Toy Draw ÷2)' },
      { act: 'runP4f',  label: 'Run P4f: Pan/Zoom (Freeze Unfocused)' },
      { act: 'runP4g',  label: 'Run P4g: Pan/Zoom (Unfocused ÷2)' },
      { act: 'runP4h2', label: 'Run P4h2: Pan/Zoom (Unfocused ÷4)' },
      { act: 'runP4i',  label: 'Run P4i: Pan/Zoom (Unfocused Pulse-Only)' },
      { act: 'runP4j',  label: 'Run P4j: Pan/Zoom (Unfocused Step-Only)' },
      { act: 'runP4k',  label: 'Run P4k: Playing Pan/Zoom (No zoom-tick relayout)' },
      { act: 'runP4m',  label: 'Run P4m: Pan/Zoom (No Loopgrid Visuals)' },
      { act: 'runP4n',  label: 'Run P4n: Pan/Zoom (No Chains/Dots/Overlays)' },
      { act: 'runP4o',  label: 'Run P4o: Playing Pan/Zoom (No Pulses)' },
      { act: 'runP4p',  label: 'Run P4p: Playing Pan/Zoom (Audio+Step Only)' },
      { act: 'runP4q',  label: 'Run P4q: Playing Pan/Zoom (No Chains)' },
      { act: 'runP4r',  label: 'Run P4r: Playing Pan/Zoom (No Tap Dots)' },
      { act: 'runP4s',  label: 'Run P4s: Playing Pan/Zoom (No Overlays)' },
      { act: 'runP4t',  label: 'Run P4t: Playing Pan/Zoom (No Loopgrid Render)' },
      { act: 'runP4u',  label: 'Run P4u: Playing Pan/Zoom (Gesture Render ÷2)' },
      { act: 'runP4v',  label: 'Run P4v: Playing Pan/Zoom (Gesture Render ÷4)' },
      { act: 'runP4w',  label: 'Run P4w: Playing Pan/Zoom (Gesture ÷4 + No Tap Dots)' },
      { act: 'runP4x',  label: 'Run P4x: Pan/Zoom (Gesture ÷4 + No Tap Dots + Chain Cache)' },
    ]),
  };

  const sectionsHtml = [
    section(P2.title, `${P2.build}${P2.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P3.title, `${P3.build}${P3.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P4.title, `${P4.build}${P4.runs.map(r => btn(r.act, r.label)).join('')}`),
  ].join('');

  ov.innerHTML = `
    <div class="perf-lab-panel">
      <div class="perf-lab-header">
        <div>
          <div class="perf-lab-title">Perf Lab</div>
          <div class="perf-lab-sub">Repeatable stress tests</div>
        </div>
        <button class="perf-lab-btn" data-act="close">✕</button>
      </div>

      <div class="perf-lab-body perf-lab-split">
        <div class="perf-lab-left">
          <div class="perf-lab-controls">
            <div class="perf-lab-row perf-lab-toggles">
              <label class="perf-lab-toggle"><input type="checkbox" data-tog="skipUpdate" /> Skip particle update</label>
              <label class="perf-lab-toggle"><input type="checkbox" data-tog="skipDraw" /> Skip particle draw</label>
              <label class="perf-lab-toggle">Budget
                <select class="perf-lab-select" data-tog="budgetMul">
                  <option value="1">100%</option><option value="0.5">50%</option><option value="0.25">25%</option><option value="0.1">10%</option>
                </select>
              </label>
              <label class="perf-lab-toggle">Gesture draw
                <select class="perf-lab-select" data-tog="gestureDrawModulo">
                  <option value="1">Every frame</option><option value="2">Every 2nd</option><option value="3">Every 3rd</option><option value="4">Every 4th</option>
                </select>
              </label>
              <label class="perf-lab-toggle">Gesture fields
                <select class="perf-lab-select" data-tog="gestureFieldModulo">
                  <option value="1">All</option><option value="2">1/2</option><option value="4">1/4</option><option value="8">1/8</option><option value="16">1/16</option>
                </select>
              </label>
              <label class="perf-lab-toggle"><input type="checkbox" data-tog="freezeUnfocusedDuringGesture" checked /> Freeze unfocused</label>
            </div>
          </div>

          <div class="perf-lab-tests" id="perf-lab-tests">
            ${sectionsHtml}
          </div>

          <div class="perf-lab-row perf-lab-footer">
            <button class="perf-lab-btn" data-act="copy">Copy Last Results</button>
            <div class="perf-lab-status" id="perf-lab-status">Idle</div>
          </div>
        </div>

        <div class="perf-lab-right">
          <div class="perf-lab-output-title">Last Result</div>
          <pre class="perf-lab-output" id="perf-lab-output"></pre>
        </div>
      </div>
    </div>
  `;

  // --- one-time CSS injection for split layout ------------------------------
  if (!document.getElementById('perf-lab-style')) {
    const style = document.createElement('style');
    style.id = 'perf-lab-style';
    style.textContent = `
      .perf-lab-split{
        display:grid;
        grid-template-columns: minmax(420px, 1fr) minmax(320px, 520px);
        gap: 12px;
        height: min(78vh, 720px);
      }
      .perf-lab-left{
        display:flex;
        flex-direction:column;
        min-height:0;
      }
      .perf-lab-tests{
        flex:1;
        min-height:0;
        overflow:auto;
        padding-right:6px;
        border-top:1px solid rgba(255,255,255,0.08);
      }
      .perf-lab-right{
        display:flex;
        flex-direction:column;
        min-height:0;
        border-left:1px solid rgba(255,255,255,0.10);
        padding-left:10px;
      }
      .perf-lab-output-title{
        font-size:12px;
        opacity:0.75;
        margin:4px 0 8px;
      }
      .perf-lab-output{
        flex:1;
        min-height:0;
        overflow:auto;
        max-height:100%;
      }
      .perf-lab-section{ padding:10px 0; }
      .perf-lab-section-title{
        font-weight:600;
        font-size:12px;
        opacity:0.85;
        margin:0 0 8px;
      }
      .perf-lab-section-buttons{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      }
      .perf-lab-footer{
        margin-top:10px;
        border-top:1px solid rgba(255,255,255,0.08);
        padding-top:10px;
      }
    `;
    document.head.appendChild(style);
  }
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
    if (act === 'runP3d') await runP3d();
    if (act === 'buildP4') buildP4();
    if (act === 'buildP4h') buildP4h();
    if (act === 'runP4a') await runP4a();
    if (act === 'runP4b') await runP4b();
    if (act === 'runP4o') await runP4o();
    if (act === 'runP4p') await runP4p();
    if (act === 'runP4q') await runP4q();
    if (act === 'runP4r') await runP4r();
    if (act === 'runP4s') await runP4s();
    if (act === 'runP4t') await runP4t();
    if (act === 'runP4u') await runP4u();
    if (act === 'runP4v') await runP4v();
    if (act === 'runP4w') await runP4w();
    if (act === 'runP4x') await runP4x();
    if (act === 'runP4e') await runP4e();
    if (act === 'runP4c') await runP4c();
    if (act === 'runP4d') await runP4d();
    if (act === 'runP4f') await runP4f();
    if (act === 'runP4g') await runP4g();
    if (act === 'runP4h2') await runP4h2();
    if (act === 'runP4i') await runP4i();
    if (act === 'runP4j') await runP4j();
    if (act === 'runP4k') await runP4k();
    if (act === 'runP4m') await runP4m();
    if (act === 'runP4n') await runP4n();
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
  setStatus('Building P2â€¦');
  // Particles worst-case: lots of loopgrids (heavy particle fields).
  buildParticleWorstCase({ toyType: 'loopgrid', rows: 8, cols: 10, spacing: 400 });
  setStatus('P2 built');
}

function buildP3() {
  setStatus('Building P3â€¦');
  // DrawGrid worst-case: lots of drawgrids for canvas-heavy stress.
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 6, cols: 8, spacing: 420 });
  setStatus('P3 built');
}

function buildP4() {
  setStatus('Building P4...');
  // Chained Simple Rhythm === loopgrid
  buildChainedLoopgridStress({
    toyType: 'loopgrid',
    chains: 6,          // tweak up/down for stress
    chainLength: 10,    // tweak up/down for stress
    gridCols: 3,
    seed: 1337,
    density: 0.33,
    noteMin: 0,
    noteMax: 35,
    headSpacingX: 560,
    headSpacingY: 420,
    linkSpacingX: 420,
  });
  setStatus('P4 built');
}

function buildP4h() {
  setStatus('Building P4H...');
  buildChainedLoopgridStress({
    toyType: 'loopgrid',
    chains: 6,
    chainLength: 10,
    gridCols: 3,
    seed: 1337,
    density: 0.85,   // heavier
    steps: 16,       // more steps
    noteMin: 0,
    noteMax: 35,
    headSpacingX: 560,
    headSpacingY: 420,
    linkSpacingX: 420,
  });
  setStatus('P4H built');
}

async function runVariant(label, step, statusText) {
  setStatus(statusText || `Running ${label}â€¦`);
  setOutput(null);
  lastResult = null;

  // Lock particle quality so FPS-driven LOD doesnâ€™t â€œsave usâ€ during the test.
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

async function runVariantPlaying(label, step, statusText) {
  setStatus(statusText || `Running ${label}...`);
  setOutput(null);
  lastResult = null;

  // Lock particle quality so FPS-driven LOD does not save us during the test.
  setParticleQualityLock('ultra');

  // Ensure transport is running during the sample window
  try {
    if (!isRunning()) startTransport();
  } catch {}

  // Reset per-run pulse/outline counters
  try {
    window.__PERF_PULSE_COUNT = 0;
    window.__PERF_OUTLINE_SYNC_COUNT = 0;
  } catch {}

  const result = await runBenchmark({
    label,
    durationMs: 30000,
    warmupMs: 1200,
    step,
  });

  try {
    result.pulseCount = window.__PERF_PULSE_COUNT || 0;
    result.outlineSyncCount = window.__PERF_OUTLINE_SYNC_COUNT || 0;
  } catch {}

  try {
    const toys = document.querySelectorAll('.toy-panel, .toy').length;
    const chains = document.querySelectorAll('[data-chain-parent], [data-chain-has-child]').length;
    result.sceneMeta = {
      toys,
      chainMarkers: chains,
      cam: window.__ZoomCoordinator?.getCommittedState?.() || null,
    };
  } catch {}

  // Stop after test to avoid surprise audio continuing
  try { stopTransport(); } catch {}

  setParticleQualityLock(null);

  try {
    result.particleToggles = { ...(window.__PERF_PARTICLES || {}) };
    result.particleTempPatch = window.__PERF_PARTICLES__TEMP_PATCH || null;
    result.playing = true;
    result.flags = {
      disableLoopgridRender: !!window.__PERF_DISABLE_LOOPGRID_RENDER,
      disableChains: !!window.__PERF_DISABLE_CHAINS,
      disableTapDots: !!window.__PERF_DISABLE_TAP_DOTS,
      disableOverlays: !!window.__PERF_DISABLE_OVERLAYS,
      disablePulses: !!window.__PERF_DISABLE_PULSES,
      freezeAllUnfocused: !!window.__PERF_FREEZE_ALL_UNFOCUSED,
      loopgridGestureRenderMod: Number(window.__PERF_LOOPGRID_GESTURE_RENDER_MOD) || 1,
      loopgridChainCache: !!window.__PERF_LOOPGRID_CHAIN_CACHE,
    };
    result.gestureSkipCount = window.__PERF_LOOPGRID_GESTURE_SKIP || 0;
  } catch {}

  lastResult = result;
  setOutput(result);
  setStatus('Done');
  try { console.log('[PerfLab] result', result); } catch {}
}

async function withTempPerfParticles(patch, fn) {
  const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
  const prev = { ...st };
  Object.assign(st, patch || {});
  window.__PERF_PARTICLES__TEMP_PATCH = patch || null;
  try { return await fn(); }
  finally {
    window.__PERF_PARTICLES__TEMP_PATCH = null;
    Object.assign(st, prev);
  }
}

async function runP2a() {
  // Static: no pan/zoom, no overview.
  const step = () => {};
  await runVariant('P2a_particles_static', step, 'Running P2a (static)â€¦');
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
  await runVariant('P2b_particles_panzoom', step, 'Running P2b (pan/zoom)â€¦');
}

async function runP2c() {
  // Overview spam only: no camera motion.
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P2c_particles_overview', step, 'Running P2c (overview spam)â€¦');
}

async function runP3a() {
  const step = () => {};
  await runVariant('P3a_drawgrid_static', step, 'Running P3a (static)â€¦');
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
  await runVariant('P3b_drawgrid_panzoom', step, 'Running P3b (pan/zoom)â€¦');
}

async function runP3c() {
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P3c_drawgrid_overview', step, 'Running P3c (overview spam)â€¦');
}

async function runP3d() {
  const step = makeOverviewOnceScript({
    idleMs: 2000,
    onMs: 6000,
  });
  await runVariant('P3d_drawgrid_overview_once', step, 'Running P3d (overview once)â€¦');
}

async function runP4a() {
  const step = () => {};
  await runVariantPlaying('P4a_chain_loopgrid_playing_static', step, 'Running P4a (playing static)...');
}

async function runP4b() {
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
  await runVariantPlaying('P4b_chain_loopgrid_playing_panzoom', step, 'Running P4b (playing pan/zoom)...');
}

async function runP4o() {
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

  window.__PERF_DISABLE_PULSES = true;
  console.log('[PerfLab] __PERF_DISABLE_PULSES =', window.__PERF_DISABLE_PULSES);
  try {
    await runVariantPlaying(
      'P4o_chain_loopgrid_playing_panzoom_no_pulses',
      step,
      'Running P4o (no border pulses)â€¦'
    );
    console.log('[PerfLab] P4o pulseCount', window.__PERF_PULSE_COUNT, 'outlineSyncCount', window.__PERF_OUTLINE_SYNC_COUNT);
  } finally {
    window.__PERF_DISABLE_PULSES = false;
  }
}

async function runP4p() {
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

  // Hard-disable visuals
  window.__PERF_DISABLE_LOOPGRID_RENDER = true;
  window.__PERF_DISABLE_CHAINS = true;
  window.__PERF_DISABLE_TAP_DOTS = true;
  window.__PERF_DISABLE_OVERLAYS = true;
  window.__PERF_DISABLE_PULSES = true;

  await withTempPerfParticles({ skipUpdate: true, skipDraw: true }, async () => {
    try {
      await runVariantPlaying(
        'P4p_chain_loopgrid_playing_panzoom_audio_step_only',
        step,
        'Running P4p (audio+sequencer only)â€¦'
      );
    } finally {
      window.__PERF_DISABLE_LOOPGRID_RENDER = false;
      window.__PERF_DISABLE_CHAINS = false;
      window.__PERF_DISABLE_TAP_DOTS = false;
      window.__PERF_DISABLE_OVERLAYS = false;
      window.__PERF_DISABLE_PULSES = false;
    }
  });
}

async function runP4q() {
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

  window.__PERF_DISABLE_CHAINS = true;
  try {
    await runVariantPlaying(
      'P4q_chain_loopgrid_playing_panzoom_no_chains',
      step,
      'Running P4q (no chains)...'
    );
  } finally {
    window.__PERF_DISABLE_CHAINS = false;
  }
}

async function runP4r() {
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

  window.__PERF_DISABLE_TAP_DOTS = true;
  try {
    await runVariantPlaying(
      'P4r_chain_loopgrid_playing_panzoom_no_tap_dots',
      step,
      'Running P4r (no tap dots)...'
    );
  } finally {
    window.__PERF_DISABLE_TAP_DOTS = false;
  }
}

async function runP4s() {
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

  window.__PERF_DISABLE_OVERLAYS = true;
  try {
    await runVariantPlaying(
      'P4s_chain_loopgrid_playing_panzoom_no_overlays',
      step,
      'Running P4s (no overlays)...'
    );
  } finally {
    window.__PERF_DISABLE_OVERLAYS = false;
  }
}

async function runP4t() {
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

  window.__PERF_DISABLE_LOOPGRID_RENDER = true;
  try {
    await runVariantPlaying(
      'P4t_chain_loopgrid_playing_panzoom_no_loopgrid_render',
      step,
      'Running P4t (no loopgrid render)...'
    );
  } finally {
    window.__PERF_DISABLE_LOOPGRID_RENDER = false;
  }
}

async function runP4u() {
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

  const prev = window.__PERF_LOOPGRID_GESTURE_RENDER_MOD;
  window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = 2;
  const prevVerbose = window.__PERF_LAB_VERBOSE;
  window.__PERF_LAB_VERBOSE = true;
  window.__PERF_LOOPGRID_GESTURE_SKIP = 0;
  try {
    await runVariantPlaying(
      'P4u_chain_loopgrid_playing_panzoom_gesture_render_div2',
      step,
      'Running P4u (gesture render Ã·2)...'
    );
  } finally {
    window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = prev;
    window.__PERF_LAB_VERBOSE = prevVerbose;
  }
}

async function runP4v() {
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

  const prev = window.__PERF_LOOPGRID_GESTURE_RENDER_MOD;
  window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = 4;
  const prevVerbose = window.__PERF_LAB_VERBOSE;
  window.__PERF_LAB_VERBOSE = true;
  window.__PERF_LOOPGRID_GESTURE_SKIP = 0;
  try {
    await runVariantPlaying(
      'P4v_chain_loopgrid_playing_panzoom_gesture_render_div4',
      step,
      'Running P4v (gesture render Ã·4)...'
    );
  } finally {
    window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = prev;
    window.__PERF_LAB_VERBOSE = prevVerbose;
  }
}

async function runP4w() {
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

  const prevMod = window.__PERF_LOOPGRID_GESTURE_RENDER_MOD;
  const prevTapDots = window.__PERF_DISABLE_TAP_DOTS;
  window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = 4;
  window.__PERF_DISABLE_TAP_DOTS = true;
  const prevVerbose = window.__PERF_LAB_VERBOSE;
  window.__PERF_LAB_VERBOSE = true;
  window.__PERF_LOOPGRID_GESTURE_SKIP = 0;
  try {
    await runVariantPlaying(
      'P4w_chain_loopgrid_playing_panzoom_gesture_render_div4_no_tapdots',
      step,
      'Running P4w (gesture Ã·4 + no tap dots)...'
    );
  } finally {
    window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = prevMod;
    window.__PERF_DISABLE_TAP_DOTS = prevTapDots;
    window.__PERF_LAB_VERBOSE = prevVerbose;
  }
}


async function runP4x() {
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

  const prevMod = window.__PERF_LOOPGRID_GESTURE_RENDER_MOD;
  const prevTapDots = window.__PERF_DISABLE_TAP_DOTS;
  const prevChainCache = window.__PERF_LOOPGRID_CHAIN_CACHE;
  window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = 4;
  window.__PERF_DISABLE_TAP_DOTS = true;
  window.__PERF_LOOPGRID_CHAIN_CACHE = true;

  const prevVerbose = window.__PERF_LAB_VERBOSE;
  window.__PERF_LAB_VERBOSE = true;
  window.__PERF_LOOPGRID_GESTURE_SKIP = 0;

  try {
    await runVariantPlaying(
      'P4x_chain_loopgrid_playing_panzoom_gesture_div4_no_tapdots_chain_cache',
      step,
      'Running P4x (gesture ÷4 + no tap dots + chain cache)...'
    );
  } finally {
    window.__PERF_LOOPGRID_GESTURE_RENDER_MOD = prevMod;
    window.__PERF_DISABLE_TAP_DOTS = prevTapDots;
    window.__PERF_LOOPGRID_CHAIN_CACHE = prevChainCache;
    window.__PERF_LAB_VERBOSE = prevVerbose;
  }
}async function runP4e() {
  // Simple throttle: every other frame, skip heavy toy redraw hooks.
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

  await withTempPerfParticles({ gestureDrawModulo: 2 }, async () => {
    await runVariantPlaying(
      'P4e_chain_loopgrid_playing_panzoom_toydraw_div2',
      step,
      'Running P4e (pan/zoom, toy draw Ã·2)...'
    );
  });
}

async function runP4c() {
  const step = () => {};
  await withTempPerfParticles({ skipDraw: true }, async () => {
    await runVariantPlaying(
      'P4c_chain_loopgrid_playing_static_no_particle_draw',
      step,
      'Running P4c (playing static, no particle draw)...'
    );
  });
}

async function runP4d() {
  const step = () => {};
  await withTempPerfParticles({ skipUpdate: true, skipDraw: true }, async () => {
    await runVariantPlaying(
      'P4d_chain_loopgrid_playing_static_no_particle_update_draw',
      step,
      'Running P4d (playing static, no particle update+draw)...'
    );
  });
}

async function runP4f() {
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

  window.__PERF_FREEZE_ALL_UNFOCUSED = true;
  try {
    await runVariantPlaying(
      'P4f_chain_loopgrid_playing_panzoom_freeze_unfocused',
      step,
      'Running P4f (pan/zoom, freeze unfocused)...'
    );
  } finally {
    window.__PERF_FREEZE_ALL_UNFOCUSED = false;
  }
}

async function runP4g() {
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

  window.__PERF_LOOPGRID_UNFOCUSED_MOD = 2;
  try {
    await runVariantPlaying(
      'P4g_chain_loopgrid_playing_panzoom_unfocused_div2',
      step,
      'Running P4g (unfocused Ã·2)...'
    );
  } finally {
    window.__PERF_LOOPGRID_UNFOCUSED_MOD = 0;
  }
}

async function runP4h2() {
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

  window.__PERF_LOOPGRID_UNFOCUSED_MOD = 4;
  try {
    await runVariantPlaying(
      'P4h2_chain_loopgrid_playing_panzoom_unfocused_div4',
      step,
      'Running P4h2 (unfocused Ã·4)...'
    );
  } finally {
    window.__PERF_LOOPGRID_UNFOCUSED_MOD = 0;
  }
}

async function runP4i() {
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

  window.__PERF_LOOPGRID_UNFOCUSED_MOD = 4;
  window.__PERF_LOOPGRID_UNFOCUSED_MODE = 'pulseOnly';
  try {
    await runVariantPlaying(
      'P4i_chain_loopgrid_playing_panzoom_unfocused_pulseOnly',
      step,
      'Running P4i (unfocused pulse-only)...'
    );
  } finally {
    window.__PERF_LOOPGRID_UNFOCUSED_MOD = 0;
    window.__PERF_LOOPGRID_UNFOCUSED_MODE = null;
  }
}

async function runP4j() {
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

  window.__PERF_LOOPGRID_UNFOCUSED_MOD = 4;
  window.__PERF_LOOPGRID_UNFOCUSED_MODE = 'stepOnly';
  try {
    await runVariantPlaying(
      'P4j_chain_loopgrid_playing_panzoom_unfocused_stepOnly',
      step,
      'Running P4j (unfocused step-only)...'
    );
  } finally {
    window.__PERF_LOOPGRID_UNFOCUSED_MOD = 0;
    window.__PERF_LOOPGRID_UNFOCUSED_MODE = null;
  }
}

async function runP4k() {
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

  await runVariantPlaying(
    'P4k_chain_loopgrid_playing_panzoom_no_zoom_tick_relayout',
    step,
    'Running P4k (no zoom-tick relayout)...'
  );
}

async function runP4m() {
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

  window.__PERF_DISABLE_LOOPGRID_RENDER = true;
  try {
    await runVariantPlaying(
      'P4m_chain_loopgrid_playing_panzoom_no_visuals',
      step,
      'Running P4m (no loopgrid visuals)...'
    );
  } finally {
    window.__PERF_DISABLE_LOOPGRID_RENDER = false;
  }
}

async function runP4n() {
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

  window.__PERF_DISABLE_LOOPGRID_RENDER = true;
  window.__PERF_DISABLE_CHAINS = true;
  window.__PERF_DISABLE_TAP_DOTS = true;
  window.__PERF_DISABLE_OVERLAYS = true;

  try {
    await runVariantPlaying(
      'P4n_chain_loopgrid_playing_panzoom_no_chains_dots_overlays',
      step,
      'Running P4n (no chains/dots/overlays)â€¦'
    );
  } finally {
    window.__PERF_DISABLE_LOOPGRID_RENDER = false;
    window.__PERF_DISABLE_CHAINS = false;
    window.__PERF_DISABLE_TAP_DOTS = false;
    window.__PERF_DISABLE_OVERLAYS = false;
  }
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
try { window.__PerfLab = { show, hide, toggle, buildP2, buildP3, buildP4, buildP4h, runP2a, runP2b, runP2c, runP3a, runP3b, runP3c, runP3d, runP4a, runP4b, runP4o, runP4p, runP4q, runP4r, runP4s, runP4t, runP4u, runP4v, runP4w, runP4x, runP4e, runP4c, runP4d, runP4f, runP4g, runP4h2, runP4i, runP4j, runP4k, runP4m, runP4n }; } catch {}









