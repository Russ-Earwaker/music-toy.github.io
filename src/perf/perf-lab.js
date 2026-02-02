// src/perf/perf-lab.js
// Perf Lab: generates stress scenes + runs scripted benchmarks + copies JSON results.

import { setParticleQualityLock } from '../particles/ParticleQuality.js';
import { start as startTransport, stop as stopTransport, isRunning } from '../audio-core.js';
import { initBoardAnchor } from '../board-anchor.js';
import { getCommittedState } from '../zoom/ZoomCoordinator.js';
import { runBenchmark } from './PerfHarness.js';
import { makePanZoomScript, makePanZoomCommitSpamScript, makeOverviewSpamScript, makeOverviewOnceScript, makeDrawgridRandomiseOnceScript } from './PerfScripts.js';
import { buildParticleWorstCase } from './StressSceneParticles.js';
import { buildChainedLoopgridStress } from './StressSceneChains.js';
import { overviewMode } from '../overview-mode.js';

// Global perf toggles consumed by shared particle code.
// Keep it simple: one object, easy to inspect in console.
try {
  window.__PERF_PARTICLES = window.__PERF_PARTICLES || {
    skipUpdate: false,
    skipDraw: false,
    budgetMul: 1,
    freezeUnfocusedDuringGesture: false,
    logFreeze: false,
  };
} catch {}

// ---------------------------------------------------------------------------
// Disable noisy debug traces during perf runs
//
// Perf Lab measures frame cost; verbose DG/FG traces distort results.
// You can re-enable any of these from the console for targeted debugging.
try {
  window.__DG_REFRESH_SIZE_TRACE = false;
  window.__DG_REFRESH_TRACE = false;
  window.__DG_GHOST_TRACE = false;
  window.__DG_LAYER_DEBUG = false;
  window.__TUTORIAL_STREAM_DEBUG = false;
} catch {}

// ---------------------------------------------------------------------------
// Perf trace buffering (avoid console.log during perf runs)
//
// Some debug traces (DG/FG DPR + canvas size snapshots) are extremely expensive if they
// hit console.log during heavy RAF. Instead, we buffer them in memory and attach a
// small snapshot to each perf result bundle.
try {
  const MAX = 3000;
  window.__PERF_TRACE_BUFFER = window.__PERF_TRACE_BUFFER || { events: [], max: MAX };
  window.__PERF_TRACE_KEEP_BUFFER = window.__PERF_TRACE_KEEP_BUFFER || false;
  window.__PERF_TRACE_TO_CONSOLE = window.__PERF_TRACE_TO_CONSOLE || false; // opt-in
  window.__PERF_TRACE_CLEAR = function __PERF_TRACE_CLEAR() {
    try {
      const b = window.__PERF_TRACE_BUFFER;
      if (b && Array.isArray(b.events)) b.events.length = 0;
    } catch {}
  };
  window.__PERF_TRACE_PUSH = function __PERF_TRACE_PUSH(kind, payload) {
    try {
      const b = window.__PERF_TRACE_BUFFER;
      if (!b || !Array.isArray(b.events)) return;
      const evt = {
        t: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
        kind: String(kind || ''),
        payload: payload || null,
      };
      b.events.push(evt);
      const max = Number.isFinite(b.max) ? b.max : MAX;
      if (b.events.length > max) b.events.splice(0, b.events.length - max);
    } catch {}
  };
  window.__PERF_TRACE_SNAPSHOT = function __PERF_TRACE_SNAPSHOT(limit = 200) {
    try {
      const b = window.__PERF_TRACE_BUFFER;
      const ev = (b && Array.isArray(b.events)) ? b.events : [];
      const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 200;
      const slice = n > 0 ? ev.slice(Math.max(0, ev.length - n)) : [];
      return { total: ev.length, tail: slice };
    } catch {
      return { total: 0, tail: [] };
    }
  };
} catch {}

// ---------------------------------------------------------------------------
// Trace summary helpers (PASS/FAIL signals for current focus)
//
// We intentionally avoid console logging during perf. Instead, we scan the buffered trace at the end
// of an auto-run and attach a compact summary to the bundle meta.
function computePerfTraceSummary() {
  try {
    const b = window.__PERF_TRACE_BUFFER;
    const ev = (b && Array.isArray(b.events)) ? b.events : [];
    let fgMinPressure = 1;
    let fgSawPressure = false;
    let fgSamples = 0;

    // Resize churn signals (if enabled)
    let dgSkipNotReady = 0;

    for (const e of ev) {
      if (!e || !e.kind) continue;
      if (e.kind === 'FG.dpr' && e.payload) {
        fgSamples++;
        const pm = Number(e.payload.pressureMul);
        if (Number.isFinite(pm)) {
          fgMinPressure = Math.min(fgMinPressure, pm);
          if (pm < 0.999) fgSawPressure = true;
        }
      }
      if (e.kind === 'DG.size-trace' && e.payload && e.payload.event === 'drawGrid:skip-not-ready') {
        dgSkipNotReady++;
      }
    }

    return {
      fg: {
        samples: fgSamples,
        minPressureMul: Number.isFinite(fgMinPressure) ? fgMinPressure : 1,
        sawPressure: !!fgSawPressure,
      },
      dg: {
        skipNotReadyCount: dgSkipNotReady,
      },
      traceEventCount: ev.length,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auto-run queues
//
// Goal: keep the footer workflow stable:
//   1) Generic baseline (mixed → lots of DrawGrid → lots of Simple Rhythm)
//   2) Current Focus (changes as we iterate)
//   3) Focus Micro (short, high-signal, usually trace-enabled)
//
// Edit these arrays to change what the footer buttons run.

const AUTO_GENERIC_QUEUE = [
  'traceOff',
  // Mixed
  'buildP6',
  'runP6a',
  // Lots of DrawGrid
  'buildP3',
  'runP3f',
  // Lots of Simple Rhythm
  'buildP4',
  'runP4b',
];

// Current focus for this cycle:
//   - reduce DrawGrid "nodes" script time (layout/cache-hit)
//   - reduce particle update cost where possible
//
// IMPORTANT: After the DrawGrid restructure, building P3 (48 drawgrids + randomise)
// can dominate time and starve the actual pan/zoom script. For focus diagnosis, we
// build ONCE and run variants back-to-back on the same scene.
const AUTO_FOCUS_QUEUE = [
  'traceDprOn',

  // Build once
  'buildP3Focus',
  'warmupFirstAppearance',
  'warmupSettle',

  // Focus runs (high-signal isolates for overlay churn)
  'runP3fFocusShort',
  'warmupSettle',
  'runP3fNoOverlaysFocusShort',
  'warmupSettle',
  'runP3fNoOverlayCoreShort',
  'warmupSettle',
  'runP3fNoOverlayStrokesShort',
  'warmupSettle',
  'runP3fNoParticlesFocusShort',

  'traceDprOff',
  'traceOff',
];

// Validation focus: same intent as AUTO_FOCUS_QUEUE but with more toys (stronger pressure signal).
// Use this to confirm pressure-DPR actually engages on stronger machines.
const AUTO_FOCUS_HEAVY_QUEUE = [
  'traceDprOn',

  // Build once (heavier than P3Focus)
  'buildP3FocusHeavy',
  'warmupFirstAppearance',
  'warmupSettle',

  // Same focus variants back-to-back on the same scene
  'runP3fFocusShort',
  'warmupSettle',
  // Repeat baseline once to spot run-to-run noise.
  'runP3fFocusShort2',
  'warmupSettle',
  'runP3fNoOverlaysFocusShort',
  'warmupSettle',
  'runP3fNoParticlesFocusShort',

  'traceDprOff',
  'traceOff',
];

// Focus Micro: short, high-signal runs (quickly verifies LOD, overlays, etc).
// Intended to be run frequently while iterating.
const AUTO_MICRO_QUEUE = [
  'traceDprOn',
  'buildP3Focus',
  'warmupFirstAppearance',
  'warmupSettle',
  'runP3fFocusShort',
  'warmupSettle',
  'runP3fNoParticlesFocusShort',
  'traceDprOff',
  'traceOff',
];

// Most diagnostic micro-run for the current focus.
// Usually trace ON + shortest script we have.
const AUTO_FOCUS_MICRO_QUEUE = [
  // IMPORTANT: micro should be apples-to-apples (trace adds overhead and noise).
  'traceOff',
  'buildP3Lite',
  // Warmup: reduce variance from "first time on screen" (canvas alloc / decode / first raster).
  'warmupFirstAppearance',
  'warmupSettle',
  // Baseline x2 (stability check)
  'runP3fShort',
  'runP3fShort2',

  // Overlays isolated x2
  'buildP3Lite',
  'warmupFirstAppearance',
  'warmupSettle',
  'runP3fNoOverlaysShort',
  'runP3fNoOverlaysShort2',

  // Particles isolated x2
  'buildP3Lite',
  'warmupFirstAppearance',
  'warmupSettle',
  'runP3fNoParticlesShort',
  'runP3fNoParticlesShort2',
];

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
    title: 'P2 ? Particles',
    build: btn('buildP2', 'Build P2: Particle Worst-Case', 'primary'),
    runs: sortByLabel([
      { act: 'runP2a', label: 'Run P2a: Static (30s)' },
      { act: 'runP2b', label: 'Run P2b: Pan/Zoom (30s)' },
      { act: 'runP2c', label: 'Run P2c: Overview (30s)' },
    ]),
  };

  const P3 = {
    title: 'P3 ? DrawGrid',
    build:
      btn('buildP3Focus',      'Build P3Focus: DrawGrid (Tiny)', 'primary') +
      btn('buildP3FocusHeavy', 'Build P3FocusHeavy: DrawGrid (Heavy)', 'primary') +
      btn('buildP3Lite',       'Build P3Lite: DrawGrid (Fast)') +
      btn('buildP3',           'Build P3: DrawGrid Worst-Case'),
    runs: sortByLabel([
      { act: 'runP3f',  label: 'Run P3f: Playing Pan/Zoom + Random Notes (Anchor ON)' },
      { act: 'runP3fPlayheadSeparateOff', label: 'Run P3f: Playhead Separate OFF' },
      { act: 'runP3fPlayheadSeparateOn', label: 'Run P3f: Playhead Separate ON' },
      { act: 'runP3fMixedSomeEmpty', label: 'Run P3f: Playing Pan/Zoom (Mostly Full + Some Empty)' },
      { act: 'runP3fNoGrid', label: 'Run P3f: Playing Pan/Zoom + Random Notes (No Grid)' },
      { act: 'runP3fNoParticles', label: 'Run P3f: Playing Pan/Zoom + Random Notes (No Particles)' },
      { act: 'runP3fNoOverlays', label: 'Run P3f: Playing Pan/Zoom + Random Notes (No Overlays)' },
      { act: 'runP3fNoOverlayStrokes', label: 'Run P3f: Playing Pan/Zoom + Random Notes (No Overlay Strokes)' },
      { act: 'runP3fNoOverlayCore', label: 'Run P3f: Playing Pan/Zoom + Random Notes (No Overlay Core)' },
      { act: 'runP3fParticleProfile', label: 'Run P3f: Playing Pan/Zoom + Random Notes (Particle Profile)' }
    ]),
  };

  const P4 = {
    title: 'P4 ? Chained Simple Rhythm (Loopgrid)',
    build: [
      btn('buildP4',  'Build P4: Chained Simple Rhythm (Random)', 'primary'),
      btn('buildP4h', 'Build P4H: Chained SR (Heavy Play)', 'primary'),
    ].join(''),
    runs: sortByLabel([
      { act: 'runP4a',  label: 'Run P4a: Playing Static (30s)' },
      { act: 'runP4b',  label: 'Run P4b: Playing Pan/Zoom (30s)' },
      { act: 'runP4c',  label: 'Run P4c: Playing Static (No Particle Draw)' },
      { act: 'runP4d',  label: 'Run P4d: Playing Static (No Particle Update+Draw)' },
      { act: 'runP4e',  label: 'Run P4e: Pan/Zoom (Toy Draw ?2)' },
      { act: 'runP4f',  label: 'Run P4f: Pan/Zoom (Freeze Unfocused)' },
      { act: 'runP4g',  label: 'Run P4g: Pan/Zoom (Unfocused ?2)' },
      { act: 'runP4h2', label: 'Run P4h2: Pan/Zoom (Unfocused ?4)' },
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
      { act: 'runP4u',  label: 'Run P4u: Playing Pan/Zoom (Gesture Render ?2)' },
      { act: 'runP4v',  label: 'Run P4v: Playing Pan/Zoom (Gesture Render ?4)' },
      { act: 'runP4w',  label: 'Run P4w: Playing Pan/Zoom (Gesture ?4 + No Tap Dots)' },
      { act: 'runP4x',  label: 'Run P4x: Pan/Zoom (Gesture ?4 + No Tap Dots + Chain Cache)' },
    ]),
  };

  

  const P5 = {
    title: 'P5 - Mixed Draw + Simple Rhythm',
    build: btn('buildP5', 'Build P5: Mixed Draw + SR', 'primary'),
    runs: sortByLabel([
      { act: 'runP5a', label: 'Run P5a: Playing Pan/Zoom (Random Notes)' },
      { act: 'runP5b', label: 'Run P5b: Pan/Zoom (Gesture Draw 1/2)' },
      { act: 'runP5c', label: 'Run P5c: Pan/Zoom (Gesture Fields 1/2)' },
    ]),
  };

  const P6 = {
    title: 'P6 - Avg Mix (4 SR Chains + 4 Draw)',
    build: btn('buildP6', 'Build P6: Avg Mix', 'primary'),
    runs: sortByLabel([
      { act: 'runP6a', label: 'Run P6a: Playing Pan/Zoom (Random Notes)' },
      { act: 'runP6b', label: 'Run P6b: Playing Static (Random Notes)' },
      { act: 'runP6c', label: 'Run P6c: Playing Extreme Zoom (Random Notes)' },
      { act: 'runP6d', label: 'Run P6d: Extreme Zoom (Gesture Mod 1/4)' },
      { act: 'runP6e', label: 'Run P6e: Extreme Zoom + Zoom Profiling' },
      { act: 'runP6eNoPaint', label: 'Run P6e: Extreme Zoom + No Paint' },
      { act: 'runP6ePaintOnly', label: 'Run P6e: Extreme Zoom + Paint Only' },
      { act: 'runP6eNoDom', label: 'Run P6e: Extreme Zoom + No DOM Updates' },
    ]),
  };

  const P7 = {
    title: 'P7 - Mixed Chains (4x Draw + 4x SR)',
    build: btn('buildP7', 'Build P7: Mixed Chains', 'primary'),
    runs: sortByLabel([
      { act: 'runP7a', label: 'Run P7a: Playing Pan/Zoom (All Toys Active)' },
      { act: 'runP7b', label: 'Run P7b: Playing Pan/Zoom (Some Toys Empty)' },
    ]),
  };

  const tests = [...P3.runs, ...P7.runs];
  if (!window.__PERF_LAB_TESTS_LOGGED) {
    window.__PERF_LAB_TESTS_LOGGED = true;
    try { console.log('[perf-lab] tests:', tests.map(t => t.label)); } catch {}
  }

  const toolsHtml = section(
    'Tools',
    [
      btn('auto', 'Run Auto (Demon Hunt: traceOff → traceOn)'),
      btn('autoFast', 'Auto: Fast Loop (P3f A/B + NoParticles + P4b)'),
      btn('autoPauseDom', 'Auto: Pause DOM-in-RAF Probe'),
      btn('autoQuickTraceP3f', 'Auto: Quick Trace P3f (Short)'),
      btn('autoGenericAdaptiveCompare', 'Auto: Generic (Compare DG Adaptive DPR)'),
    ].join('')
  );

  const sectionsHtml = [
    section(P3.title, `${P3.build}${P3.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P7.title, `${P7.build}`),
    toolsHtml,
  ].join('');

  ov.innerHTML = `
    <div class="perf-lab-panel">
      <div class="perf-lab-header">
        <div>
          <div class="perf-lab-title">Perf Lab</div>
          <div class="perf-lab-sub">Repeatable stress tests</div>
        </div>
        <div class="perf-lab-header-right">
          <button class="perf-lab-btn" data-act="close">?</button>
        </div>
      </div>

      <div class="perf-lab-body perf-lab-split">
        <div class="perf-lab-left">
          <div class="perf-lab-tabs">
            <button class="perf-lab-tab is-active" data-tab="controls">Controls</button>
            <button class="perf-lab-tab" data-tab="tests">Tests</button>
          </div>

          <div class="perf-lab-tabpage is-active" data-tabpage="controls">
            <div class="perf-lab-controlsPanel">
              <div class="perf-lab-controlsGroup">
                <div class="perf-lab-controlsTitle">Quality Lab</div>
                <label class="perf-lab-toggle">Target FPS
                  <select class="perf-lab-select" data-qlab="targetFps">
                    <option value="0">Off</option>
                    <option value="60">60</option>
                    <option value="30">30</option>
                    <option value="20">20</option>
                    <option value="15">15</option>
                    <option value="10">10</option>
                    <option value="5">5</option>
                  </select>
                </label>
                <label class="perf-lab-toggle">CPU burn
                  <select class="perf-lab-select" data-qlab="cpuBurnMs">
                    <option value="0">0ms</option>
                    <option value="2">2ms</option>
                    <option value="5">5ms</option>
                    <option value="10">10ms</option>
                    <option value="15">15ms</option>
                    <option value="20">20ms</option>
                  </select>
                </label>
                <label class="perf-lab-toggle">Quality
                  <select class="perf-lab-select" data-qlab="forceScale">
                    <option value="">Auto</option>
                    <option value="1">High (1.0)</option>
                    <option value="0.7">Med (0.7)</option>
                    <option value="0.45">Low (0.45)</option>
                  </select>
                </label>
                <div class="perf-lab-row perf-lab-qlab-buttons">
                  <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityCycle">Cycle</button>
                  <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityReset">Reset</button>
                  <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityApply">Apply</button>
                  <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityShowState">Show state</button>
                  <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityPrintState">Print state</button>
                </div>
              </div>
            </div>
          </div>

          <div class="perf-lab-tabpage" data-tabpage="tests">
            <div class="perf-lab-tests" id="perf-lab-tests">
              <div class="perf-lab-controlsPanel" style="margin-bottom:10px;">
                <div class="perf-lab-controlsGroup">
                  <div class="perf-lab-controlsTitle">Perf toggles</div>
                  <div class="perf-lab-row perf-lab-toggles">
                    <label class="perf-lab-toggle"><input type="checkbox" data-tog="skipUpdate" /> Skip particle update</label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-tog="skipDraw" /> Skip particle draw</label>
                    <label class="perf-lab-toggle">Budget
                      <select class="perf-lab-select" data-tog="budgetMul">
                        <option value="1">100%</option><option value="0.5">50%</option><option value="0.25">25%</option><option value="0.1">10%</option>
                      </select>
                    </label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-tog="freezeUnfocusedDuringGesture" checked /> Freeze unfocused</label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-perf="freezeChainUi" /> Freeze chain UI</label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-perf="traceMarks" /> Trace marks</label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-perf="traceCanvasResize" /> Trace canvas resize</label>
                    <label class="perf-lab-toggle"><input type="checkbox" data-perf="traceDomInRaf" /> Trace DOM-in-RAF</label>
                    <div class="perf-lab-row" style="margin-top:8px;">
                      <button class="perf-lab-btn perf-lab-btn-mini" data-act="qualityApply">Apply</button>
                    </div>
                  </div>
                </div>
              </div>
              ${sectionsHtml}
            </div>
          </div>


          <div class="perf-lab-lastresult">
            <div class="perf-lab-output-title">Last Result</div>
            <pre class="perf-lab-output perf-lab-output-small" id="perf-lab-output"></pre>
          </div>
          <div class="perf-lab-row perf-lab-footer">
            <button class="perf-lab-btn" data-act="autoGeneric">Run-Auto (Generic)</button>
            <button class="perf-lab-btn" data-act="autoFocus">Auto: Current Focus</button>
            <button class="perf-lab-btn" data-act="autoFocusHeavy">Auto: Focus Validation (Heavy)</button>
            <button class="perf-lab-btn" data-act="autoMicro">Auto: Focus Micro (Best)</button>
            <div class="perf-lab-status" id="perf-lab-status">Idle</div>
          </div>
        </div>
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
      .perf-lab-overlay{
        position:fixed;
        right:12px;
        bottom:12px;
        left:auto;
        top:auto;
        transform:none;
        z-index:99999;
        max-width:calc(100vw - 24px);
        max-height:calc(100vh - 24px);
      }
      .perf-lab-panel{
        width:min(490px, calc(100vw - 24px));
      }
            .perf-lab-split{
        display:block;
        height: min(78vh, 720px);
      }
      .perf-lab-left{
        display:flex;
        flex-direction:column;
        min-height:0;
      }
      .perf-lab-tabs{
        display:flex;
        gap:8px;
        margin:0 0 8px;
      }
      .perf-lab-tab{
        appearance:none;
        border:1px solid rgba(255,255,255,0.14);
        background:rgba(255,255,255,0.06);
        color:inherit;
        border-radius:10px;
        padding:7px 10px;
        font-size:12px;
        line-height:1;
        cursor:pointer;
        user-select:none;
      }
      .perf-lab-tab.is-active{
        background:rgba(255,255,255,0.14);
        border-color:rgba(255,255,255,0.24);
      }
      .perf-lab-tabpage{
        display:none;
        min-height:0;
      }
      .perf-lab-tabpage.is-active{
        display:block;
        min-height:0;
      }      .perf-lab-tests{
        flex:1;
        min-height:0;
        overflow:auto;
        padding-right:6px;
        border-top:1px solid rgba(255,255,255,0.08);
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
      .perf-lab-lastresult{
        border-top:1px solid rgba(255,255,255,0.08);
        margin-top:10px;
        padding-top:10px;
        min-height:0;
      }
      .perf-lab-output-small{
        max-height:120px;
      }      .perf-lab-section{ padding:10px 0; }
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
      .perf-lab-header-right{
        display:flex;
        align-items:flex-start;
        gap:10px;
      }
      .perf-lab-btn-mini{
        padding:6px 10px;
        font-size:12px;
        line-height:1;
      }
      button.perf-lab-btn.is-active{
        background:rgba(255,255,255,0.16);
        border-color:rgba(255,255,255,0.28);
      }
      .perf-lab-controlsPanel{
        background:rgba(20,20,20,0.85);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:10px;
        padding:10px;
        box-shadow:0 10px 40px rgba(0,0,0,0.35);
      }      .perf-lab-controlsGroup{
        padding:6px 0;
      }
      .perf-lab-controlsGroup + .perf-lab-controlsGroup{
        border-top:1px solid rgba(255,255,255,0.08);
        margin-top:8px;
        padding-top:10px;
      }
      .perf-lab-controlsTitle{
        font-size:12px;
        font-weight:600;
        opacity:0.85;
        margin:0 0 8px;
      }
      .perf-lab-qlab-buttons{
        gap:8px;
        margin-top:8px;
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
    ov.querySelectorAll('[data-perf]').forEach((el) => {
      const key = el.getAttribute('data-perf');
      if (!key) return;
      const trace = (window.__PERF_TRACE || {});
      const v =
        (key === 'traceMarks') ? window.__PERF_TRACE_MARKS :
        (key === 'freezeChainUi') ? window.__PERF_DISABLE_CHAIN_UI :
        (key === 'traceCanvasResize') ? !!trace.traceCanvasResize :
        (key === 'traceDomInRaf') ? !!trace.traceDomInRaf :
        null;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v;
    });
  } catch {}
  // Quality Lab defaults
  try {
    const qlab = (window.__QUALITY_LAB = window.__QUALITY_LAB || {});
    if (!('targetFps' in qlab)) qlab.targetFps = 0;
    if (!('cpuBurnMs' in qlab)) qlab.cpuBurnMs = 0;
    if (!('forceScale' in qlab)) qlab.forceScale = null;
    if (!('_cycleToken' in qlab)) qlab._cycleToken = 0;
    if (!('_cycleActiveToken' in qlab)) qlab._cycleActiveToken = 0;
    // Legacy mirror (handy for console poking)
    if (typeof window.__QUALITY_FORCE_SCALE !== 'number') window.__QUALITY_FORCE_SCALE = null;
  } catch {}


  // Pending settings (only committed on Apply)
  const __pending = {
    qlab: null,
    particles: null,
    perf: null,
  };
  try {
    __pending.qlab = { ...(window.__QUALITY_LAB || {}) };
    __pending.particles = { ...(window.__PERF_PARTICLES || {}) };
    __pending.perf = {
      traceMarks: !!window.__PERF_TRACE_MARKS,
      freezeChainUi: !!window.__PERF_DISABLE_CHAIN_UI,
      traceCanvasResize: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceCanvasResize),
      traceDomInRaf: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceDomInRaf),
    };
  } catch {
    __pending.qlab = { targetFps: 0, cpuBurnMs: 0, forceScale: null, _cycleToken: 0, _cycleActiveToken: 0 };
    __pending.particles = {};
    __pending.perf = { traceMarks: false, freezeChainUi: false, traceCanvasResize: false, traceDomInRaf: false };
  }

  function setCycleBtnVisual() {
    try {
      const qlab = window.__QUALITY_LAB || {};
      const active = !!(qlab && qlab._cycleActiveToken && qlab._cycleActiveToken === qlab._cycleToken);
      ov.querySelectorAll('button[data-act="qualityCycle"]').forEach((b) => b.classList.toggle('is-active', active));
    } catch {}
  }

  function setShowStateBtnVisual() {
    try {
      const on = !!(typeof window !== 'undefined' && window.__DG_STATE_READOUT);
      ov.querySelectorAll('button[data-act="qualityShowState"]').forEach((b) => b.classList.toggle('is-active', on));
    } catch {}
  }

  function syncUiFromPending() {
    try {
      // Quality Lab controls
      ov.querySelectorAll('[data-qlab]').forEach((el) => {
        const k = el.getAttribute('data-qlab');
        if (!k) return;
        if (k === 'forceScale') {
          const v = (typeof __pending.qlab.forceScale === 'number' && isFinite(__pending.qlab.forceScale))
            ? String(__pending.qlab.forceScale) : '';
          if (el.tagName === 'SELECT') el.value = v;
          return;
        }
        const v = __pending.qlab[k];
        if (el.tagName === 'SELECT') el.value = String(Number(v) || 0);
      });

      // Particle toggles
      ov.querySelectorAll('[data-tog]').forEach((el) => {
        const key = el.getAttribute('data-tog');
        if (!key) return;
        const v = __pending.particles[key];
        if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v;
        if (el.tagName === 'SELECT') {
          const val = Number.isFinite(v) ? v : el.value;
          el.value = String(Number(val));
        }
      });

      // Perf toggles
      ov.querySelectorAll('[data-perf]').forEach((el) => {
        const key = el.getAttribute('data-perf');
        if (!key) return;
        const v =
          (key === 'traceMarks') ? __pending.perf.traceMarks :
          (key === 'freezeChainUi') ? __pending.perf.freezeChainUi :
          (key === 'traceCanvasResize') ? __pending.perf.traceCanvasResize :
          (key === 'traceDomInRaf') ? __pending.perf.traceDomInRaf :
          null;
        if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v;
      });
    } catch {}
  }

  function applyPendingToGlobals() {
    try {
      window.__QUALITY_LAB = window.__QUALITY_LAB || {};
      const qlab = window.__QUALITY_LAB;
      qlab.targetFps = Math.max(0, Number(__pending.qlab.targetFps) || 0);
      qlab.cpuBurnMs = Math.max(0, Number(__pending.qlab.cpuBurnMs) || 0);
      qlab.forceScale = (typeof __pending.qlab.forceScale === 'number' && isFinite(__pending.qlab.forceScale)) ? __pending.qlab.forceScale : null;
      window.__QUALITY_FORCE_SCALE = (typeof qlab.forceScale === 'number') ? qlab.forceScale : null;

      window.__PERF_PARTICLES = window.__PERF_PARTICLES || {};
      Object.assign(window.__PERF_PARTICLES, __pending.particles || {});

      window.__PERF_TRACE = window.__PERF_TRACE || {};
      window.__PERF_TRACE_MARKS = !!__pending.perf.traceMarks;
      window.__PERF_DISABLE_CHAIN_UI = !!__pending.perf.freezeChainUi;
      window.__PERF_TRACE.traceCanvasResize = !!__pending.perf.traceCanvasResize;
      window.__PERF_TRACE.traceDomInRaf = !!__pending.perf.traceDomInRaf;

      console.log('[PerfLab] APPLY', { qlab: { ...qlab }, particles: { ...window.__PERF_PARTICLES }, perf: { ...__pending.perf } });
    } catch {}
  }

  // Start UI by reflecting the pending state (not necessarily the globals)
  try { syncUiFromPending(); } catch {}
  try { setCycleBtnVisual(); } catch {}
  try { setShowStateBtnVisual(); } catch {}
  // Keep UI checkboxes/selects in sync with global perf state.
  // (Used by Trace Demon buttons and safe to call anytime.)
  function syncUiFromState() {
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

      const trace = (window.__PERF_TRACE || {});
      ov.querySelectorAll('[data-perf]').forEach((el) => {
        const key = el.getAttribute('data-perf');
        if (!key) return;
        const v =
          (key === 'traceMarks') ? window.__PERF_TRACE_MARKS :
          (key === 'freezeChainUi') ? window.__PERF_DISABLE_CHAIN_UI :
          (key === 'traceCanvasResize') ? !!trace.traceCanvasResize :
          (key === 'traceDomInRaf') ? !!trace.traceDomInRaf :
          null;
        if (el.tagName === 'INPUT' && el.type === 'checkbox') el.checked = !!v;
      });
      // Quality Lab controls (FPS throttle + forced quality scale)
      const qlab = (window.__QUALITY_LAB = window.__QUALITY_LAB || {});
      ov.querySelectorAll('[data-qlab]').forEach((el) => {
        const k = el.getAttribute('data-qlab');
        if (!k) return;
        if (k === 'forceScale') {
          // forceScale: null | number (empty string => auto)
          const v = (typeof qlab.forceScale === 'number' && isFinite(qlab.forceScale)) ? String(qlab.forceScale) : '';
          if (el.tagName === 'SELECT') el.value = v;
          return;
        }
        const v = qlab[k];
        if (el.tagName === 'SELECT') el.value = String(Number(v) || 0);
      });
    } catch {}
  }

  ov.addEventListener('click', async (e) => {
    // Tabs (Controls / Tests)
    const tabBtn = e.target && e.target.closest ? e.target.closest('button[data-tab]') : null;
    if (tabBtn) {
      try {
        const tab = String(tabBtn.getAttribute('data-tab') || 'controls');
        ov.querySelectorAll('.perf-lab-tab').forEach((b) => b.classList.toggle('is-active', b === tabBtn));
        ov.querySelectorAll('.perf-lab-tabpage').forEach((p) => {
          const key = String(p.getAttribute('data-tabpage') || '');
          p.classList.toggle('is-active', key === tab);
        });
      } catch {}
      return;
    }

    const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'close') hide();

    if (act === 'qualityApply') {
      try {
        applyPendingToGlobals();
        // After apply, mirror pending from globals again (keeps us deterministic if other code changed them).
        __pending.qlab = { ...(window.__QUALITY_LAB || {}) };
        __pending.particles = { ...(window.__PERF_PARTICLES || {}) };
        __pending.perf = {
          traceMarks: !!window.__PERF_TRACE_MARKS,
          freezeChainUi: !!window.__PERF_DISABLE_CHAIN_UI,
          traceCanvasResize: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceCanvasResize),
          traceDomInRaf: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceDomInRaf),
        };
        syncUiFromPending();
        setCycleBtnVisual();
        setShowStateBtnVisual();
      } catch {}

      // --------------------------------------------------------------
      // DrawGrid test harness:
      // If user sets a target FPS, we also provide an override signal
      // that DrawGrid can use for LOD decisions (playhead/particles/etc).
      // This avoids relying on the app's measured FPS (often rAF-based).
      // --------------------------------------------------------------
      try {
        const tf = Number(window.__QUALITY_LAB?.targetFps || 0);
        window.__DG_FPS_TEST_OVERRIDE = (tf > 0) ? tf : 0;
      } catch {}
    }
    if (act === 'qualityReset') {
      try {
        // Reset pending (does NOT apply until Apply is pressed)
        __pending.qlab.targetFps = 0;
        __pending.qlab.cpuBurnMs = 0;
        __pending.qlab.forceScale = null;
        // Also cancel any running cycle in globals immediately (safety)
        try {
          const qlab = (window.__QUALITY_LAB = window.__QUALITY_LAB || {});
          qlab._cycleToken = (qlab._cycleToken || 0) + 1;
          qlab._cycleActiveToken = 0;
          window.__QUALITY_FORCE_SCALE = null;
        } catch {}
        syncUiFromPending();
        setCycleBtnVisual();
        console.log('[PerfLab] quality lab reset (pending)');
      } catch {}
    }

    if (act === 'qualityShowState') {
      try {
        const next = !(typeof window !== 'undefined' && window.__DG_STATE_READOUT);
        window.__DG_STATE_READOUT = next;
        setShowStateBtnVisual();
        appendOutputLine(`[quality] drawgrid state readout: ${next ? 'ON' : 'off'}`);
      } catch {}
    }
    if (act === 'qualityPrintState') {
      try {
        let txt = null;
        if (typeof window !== 'undefined' && typeof window.__DG_PRINT_STATE === 'function') {
          const states = window.__DG_PRINT_STATE();
          try {
            if (Array.isArray(states) && states.length) {
              const blocks = [];
              for (const s of states) {
                const id = s?.panelId || '(no id)';
                const t = s?.text || '';
                blocks.push(`=== ${id} ===\n${t}`);
              }
              txt = blocks.join('\n\n');
            } else {
              txt = '[DG] no drawgrid state snapshots found';
            }
          } catch {}
        } else {
          txt = '[DG] window.__DG_PRINT_STATE() not available (drawgrid.js not patched?)';
        }
        if (txt) appendOutputLine(txt);
      } catch {}
    }
    if (act === 'qualityCycle') {
      try {
        const qlab = (window.__QUALITY_LAB = window.__QUALITY_LAB || {});
        // Toggle: if already active, stop; else start
        const alreadyActive = !!(qlab._cycleActiveToken && qlab._cycleActiveToken === qlab._cycleToken);
        qlab._cycleToken = (qlab._cycleToken || 0) + 1;
        const token = qlab._cycleToken;
        qlab._cycleActiveToken = alreadyActive ? 0 : token;
        setCycleBtnVisual();
        // Start a repeating cycle: low->high->med->auto (with FPS changes) until cancelled.
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        (async () => {
          console.log('[PerfLab] quality cycle start');
          while ((window.__QUALITY_LAB || {})._cycleActiveToken === token) {
            // Low detail + low FPS
            qlab.targetFps = 15;
            qlab.forceScale = 0.45;
            window.__QUALITY_FORCE_SCALE = 0.45;
            await delay(3000);

            if ((window.__QUALITY_LAB || {})._cycleActiveToken !== token) break;

            // High detail + high FPS
            qlab.targetFps = 60;
            qlab.forceScale = 1.0;
            window.__QUALITY_FORCE_SCALE = 1.0;
            await delay(3000);

            if ((window.__QUALITY_LAB || {})._cycleActiveToken !== token) break;

            // Medium detail + mid FPS
            qlab.targetFps = 30;
            qlab.forceScale = 0.7;
            window.__QUALITY_FORCE_SCALE = 0.7;
            await delay(3000);

            if ((window.__QUALITY_LAB || {})._cycleActiveToken !== token) break;

            // Back to Auto (no throttle)
            qlab.targetFps = 0;
            qlab.forceScale = null;
            window.__QUALITY_FORCE_SCALE = null;
            await delay(5000);
          }
          console.log('[PerfLab] quality cycle stop');
          try { setCycleBtnVisual(); } catch {}
        })();
      } catch {}
    }
    if (act === 'buildP2') buildP2();
    if (act === 'buildP2d') await buildP2d();
    if (act === 'runP2a') await runP2a();
    if (act === 'runP2b') await runP2b();
    if (act === 'runP2c') await runP2c();
    if (act === 'runP2d') await runP2d();
    if (act === 'runP2e') await runP2e();
    if (act === 'runP2f') await runP2f();
    if (act === 'runP2g') await runP2g();
    if (act === 'runP2h') await runP2h();
    if (act === 'runP2i') await runP2i();
    if (act === 'runP2j') await runP2j();
    if (act === 'runP2k') await runP2k();
    if (act === 'runP2l') await runP2l();
    if (act === 'runP2m') await runP2m();
    if (act === 'runP2n') await runP2n();
    if (act === 'runP2o') await runP2o();
    if (act === 'runP2p') await runP2p();
    if (act === 'runP2q') await runP2q();
    if (act === 'runP2r') await runP2r();
    if (act === 'runP2s') await runP2s();
    if (act === 'runP2t') await runP2t();
    if (act === 'runP2u') await runP2u();
    if (act === 'runP2v') await runP2v();
    if (act === 'runP2w') await runP2w();
    if (act === 'runP2x') await runP2x();
    if (act === 'runP2y') await runP2y();
    if (act === 'runP2z') await runP2z();

    // --------------------------------------------------------------
    // Footer auto-tests (these are the big buttons in the footer)
    // --------------------------------------------------------------
    if (act === 'autoGeneric') { await runAuto({ queue: AUTO_GENERIC_QUEUE, runId: 'autoGeneric' }); return; }
    if (act === 'autoFocus') { await runAuto({ queue: AUTO_FOCUS_QUEUE, runId: 'autoFocus' }); return; }
    if (act === 'autoFocusHeavy') { await runAuto({ queue: AUTO_FOCUS_HEAVY_QUEUE, runId: 'autoFocusHeavy' }); return; }
    if (act === 'autoMicro') { await runAuto({ queue: AUTO_MICRO_QUEUE, runId: 'autoMicro' }); return; }
  });ov.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;
    const key = t.getAttribute && t.getAttribute('data-tog');
    const perfKey = t.getAttribute && t.getAttribute('data-perf');
    const qKey = t.getAttribute && t.getAttribute('data-qlab');
    if (!key && !perfKey && !qKey) return;
    if (qKey) {
      try {
        if (qKey === 'forceScale') {
          const raw = String(t.value || '');
          __pending.qlab.forceScale = raw ? (Number(raw) || null) : null;
        } else {
          __pending.qlab[qKey] = Math.max(0, Number(t.value) || 0);
        }
        console.log('[PerfLab] quality lab (pending)', { ...__pending.qlab });
      } catch {}
    }
    if (key) {
      try {
        if (t.tagName === 'INPUT' && t.type === 'checkbox') __pending.particles[key] = !!t.checked;
        else if (t.tagName === 'SELECT') __pending.particles[key] = Math.max(0, Number(t.value) || 1);
        console.log('[PerfLab] particle toggles (pending)', { ...__pending.particles });
      } catch {}
    }
    if (perfKey === 'traceMarks') {
      try {
        __pending.perf.traceMarks = !!t.checked;
        console.log('[PerfLab] trace marks (pending)', { enabled: !!__pending.perf.traceMarks });
      } catch {}
    }
    if (perfKey === 'freezeChainUi') {
      try {
        __pending.perf.freezeChainUi = !!t.checked;
        console.log('[PerfLab] chain UI freeze (pending)', { enabled: !!__pending.perf.freezeChainUi });
      } catch {}
    }
    if (perfKey === 'traceCanvasResize' || perfKey === 'traceDomInRaf') {
      try {
        if (perfKey === 'traceCanvasResize') __pending.perf.traceCanvasResize = !!t.checked;
        if (perfKey === 'traceDomInRaf') __pending.perf.traceDomInRaf = !!t.checked;
        console.log('[PerfLab] trace toggles (pending)', { ...__pending.perf });
      } catch {}
    }
  });

  document.body.appendChild(ov);
  return ov;
}

let lastResult = null;
let lastResults = [];

let lastBundle = null;

const PERF_SPAWN_PADDING = 40;
const PERF_CHAIN_PAD_X = 80;
const PERF_MODE_PAD_X = 48;
const PERF_DRAWGRID_WIDTH = 800;
const PERF_DRAWGRID_HEIGHT_PAD = 160;
const PERF_DRAWGRID_ASPECT = 3 / 4;

const perfMeasuredFootprints = new Map();

async function waitForPanelReady(panel, { timeoutMs = 1200 } = {}) {
  if (!panel) return false;
  const start = performance?.now?.() ?? Date.now();
  const needsModeButtons = ['loopgrid', 'loopgrid-drum', 'bouncer', 'rippler', 'chordwheel', 'drawgrid']
    .includes(panel?.dataset?.toy || '');
  return await new Promise((resolve) => {
    const tick = () => {
      if (!panel.isConnected) return resolve(false);
      const body = panel.querySelector('.toy-body');
      const chain = panel.querySelector(':scope > .toy-chain-btn');
      const modeBtn = needsModeButtons ? panel.querySelector(':scope > .toy-mode-btn') : null;
      if (body && chain && (!needsModeButtons || modeBtn)) return resolve(true);
      const now = performance?.now?.() ?? Date.now();
      if ((now - start) > timeoutMs) return resolve(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function waitForStablePanelRect(panel, { stableFrames = 3, timeoutMs = 1200 } = {}) {
  if (!panel) return false;
  const start = performance?.now?.() ?? Date.now();
  let last = null;
  let stableCount = 0;
  return await new Promise((resolve) => {
    const tick = () => {
      if (!panel.isConnected) return resolve(false);
      const rect = panel.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        if (last && Math.abs(rect.width - last.width) < 0.5 && Math.abs(rect.height - last.height) < 0.5) {
          stableCount += 1;
        } else {
          stableCount = 0;
        }
        last = { width: rect.width, height: rect.height };
        if (stableCount >= stableFrames) return resolve(true);
      }
      const now = performance?.now?.() ?? Date.now();
      if ((now - start) > timeoutMs) return resolve(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function measurePanelFootprint(panel) {
  if (!panel) return null;
  const rects = [panel, ...panel.querySelectorAll(':scope > .toy-mode-btn, :scope > .toy-chain-btn')];
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  const readBox = (el) => {
    if (el === panel) {
      const w = el.offsetWidth || 0;
      const h = el.offsetHeight || 0;
      return (w > 0 && h > 0) ? { left: 0, top: 0, right: w, bottom: h } : null;
    }
    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || 0;
    if (w > 0 && h > 0) {
      const left = el.offsetLeft || 0;
      const top = el.offsetTop || 0;
      return { left, top, right: left + w, bottom: top + h };
    }
    const left = parseFloat(el.style.left || '0') || 0;
    const top = parseFloat(el.style.top || '0') || 0;
    const size = parseFloat(el.style.getPropertyValue('--c-btn-size') || '0') || 0;
    if (size > 0) {
      return { left, top, right: left + size, bottom: top + size };
    }
    return null;
  };

  for (const el of rects) {
    const r = readBox(el);
    if (!r) continue;
    minLeft = Math.min(minLeft, r.left);
    minTop = Math.min(minTop, r.top);
    maxRight = Math.max(maxRight, r.right);
    maxBottom = Math.max(maxBottom, r.bottom);
  }

  if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) return null;
  return { width: Math.max(1, maxRight - minLeft), height: Math.max(1, maxBottom - minTop) };
}

async function ensureMeasuredFootprint(toyType) {
  if (perfMeasuredFootprints.has(toyType)) return perfMeasuredFootprints.get(toyType);
  const factory = window.MusicToyFactory;
  const board = document.getElementById('board');
  if (!factory?.create || !factory?.destroy || !board) return null;

  let storedPositions = null;
  try { storedPositions = localStorage.getItem('toyPositions'); } catch {}

  let panel = null;
  try {
    panel = factory.create(toyType, { centerX: 120, centerY: 120, autoCenter: false });
    if (panel) {
      panel.style.opacity = '0';
      panel.style.pointerEvents = 'none';
    }
  } catch {}

  if (!panel) return null;
  await waitForPanelReady(panel);
  await waitForStablePanelRect(panel);

  const measured = measurePanelFootprint(panel);
  try { factory.destroy(panel); } catch {}
  try {
    if (storedPositions != null) localStorage.setItem('toyPositions', storedPositions);
    else localStorage.removeItem('toyPositions');
  } catch {}

  if (measured) {
    perfMeasuredFootprints.set(toyType, measured);
  }
  return measured;
}

function getCssPanelSize(toyType) {
  const board = document.getElementById('board');
  if (!board) return { width: 0, height: 0 };
  const probe = document.createElement('section');
  probe.className = 'toy-panel';
  probe.dataset.toy = toyType;
  probe.style.position = 'absolute';
  probe.style.left = '-10000px';
  probe.style.top = '-10000px';
  probe.style.visibility = 'hidden';
  board.appendChild(probe);
  let width = 0;
  let height = 0;
  try {
    const cs = getComputedStyle(probe);
    width = parseFloat(cs.width) || 0;
    height = parseFloat(cs.height) || 0;
  } catch {}
  probe.remove();
  return { width, height };
}

function getCatalogSize(toyType) {
  try {
    const catalog = window.MusicToyFactory?.getCatalog?.() || [];
    const match = catalog.find(entry => entry?.type === toyType);
    const size = match?.size || {};
    const cssSize = getCssPanelSize(toyType);
    const width = Math.max(Number(cssSize.width) || 0, Number(size.width) || 0, 380);
    const height = Math.max(Number(cssSize.height) || 0, Number(size.height) || 0, 320);
    return { width, height };
  } catch {
    return { width: 380, height: 320 };
  }
}

function estimateToyFootprint(toyType, { padding = PERF_SPAWN_PADDING, chainPadX = PERF_CHAIN_PAD_X } = {}) {
  const measured = perfMeasuredFootprints.get(toyType);
  const base = getCatalogSize(toyType);
  const hasExternalButtons = ['loopgrid', 'loopgrid-drum', 'bouncer', 'rippler', 'chordwheel', 'drawgrid'].includes(toyType);
  const leftPad = measured ? 0 : (hasExternalButtons ? PERF_MODE_PAD_X : 0);
  let baseWidth = Math.max(1, measured?.width || base.width);
  let baseHeight = Math.max(1, measured?.height || base.height);
  if (toyType === 'drawgrid') {
    baseWidth = Math.max(baseWidth, PERF_DRAWGRID_WIDTH);
    const inferredHeight = Math.round(baseWidth * PERF_DRAWGRID_ASPECT + PERF_DRAWGRID_HEIGHT_PAD);
    baseHeight = Math.max(baseHeight, inferredHeight);
  }
  const extraChainPad = measured ? 0 : chainPadX;
  const width = Math.max(1, baseWidth + (padding * 2) + extraChainPad + leftPad);
  const height = Math.max(1, baseHeight + (padding * 2));
  return { width, height };
}

function estimateGridSpacing(toyType, spacing) {
  const footprint = estimateToyFootprint(toyType);
  const minSpacing = Math.max(footprint.width, footprint.height);
  return Math.max(spacing || 0, minSpacing);
}

function logPerfFootprintDebug(toyType, spacing) {
  try {
    const measured = perfMeasuredFootprints.get(toyType) || null;
    const catalog = getCatalogSize(toyType);
    const footprint = estimateToyFootprint(toyType);
    const minSpacing = Math.max(footprint.width, footprint.height);
    console.log('[PerfLab][footprint]', {
      toyType,
      measured,
      catalog,
      footprint,
      baseSpacing: spacing,
      resolvedSpacing: Math.max(spacing || 0, minSpacing),
    });
  } catch (err) {
    console.warn('[PerfLab][footprint] debug failed', err);
  }
}

function getPanelBounds(panel) {
  if (!panel) return null;
  const rects = [panel, ...panel.querySelectorAll(':scope > .toy-mode-btn, :scope > .toy-chain-btn')];
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  const readBox = (el) => {
    if (el === panel) {
      const w = el.offsetWidth || 0;
      const h = el.offsetHeight || 0;
      return (w > 0 && h > 0) ? { left: 0, top: 0, right: w, bottom: h } : null;
    }
    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || 0;
    if (w > 0 && h > 0) {
      const left = el.offsetLeft || 0;
      const top = el.offsetTop || 0;
      return { left, top, right: left + w, bottom: top + h };
    }
    const left = parseFloat(el.style.left || '0') || 0;
    const top = parseFloat(el.style.top || '0') || 0;
    const size = parseFloat(el.style.getPropertyValue('--c-btn-size') || '0') || 0;
    if (size > 0) {
      return { left, top, right: left + size, bottom: top + size };
    }
    return null;
  };

  for (const el of rects) {
    const r = readBox(el);
    if (!r) continue;
    minLeft = Math.min(minLeft, r.left);
    minTop = Math.min(minTop, r.top);
    maxRight = Math.max(maxRight, r.right);
    maxBottom = Math.max(maxBottom, r.bottom);
  }

  if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) return null;
  const baseLeft = panel.offsetLeft || 0;
  const baseTop = panel.offsetTop || 0;
  return {
    left: baseLeft + minLeft,
    right: baseLeft + maxRight,
    top: baseTop + minTop,
    bottom: baseTop + maxBottom,
    width: Math.max(1, maxRight - minLeft),
    height: Math.max(1, maxBottom - minTop),
  };
}

function logOverlapReport(selector = '.toy-panel[data-toy="drawgrid"]', limit = 12) {
  try {
    const panels = Array.from(document.querySelectorAll(selector));
    const bounds = panels.map(panel => ({ panel, id: panel.id, bounds: getPanelBounds(panel) }))
      .filter(entry => entry.bounds);
    const overlaps = [];
    for (let i = 0; i < bounds.length; i++) {
      const a = bounds[i];
      for (let j = i + 1; j < bounds.length; j++) {
        const b = bounds[j];
        if (a.bounds.right <= b.bounds.left || a.bounds.left >= b.bounds.right) continue;
        if (a.bounds.bottom <= b.bounds.top || a.bounds.top >= b.bounds.bottom) continue;
        overlaps.push({
          a: a.id,
          b: b.id,
          aBounds: a.bounds,
          bBounds: b.bounds,
        });
        if (overlaps.length >= limit) break;
      }
      if (overlaps.length >= limit) break;
    }
    console.log('[PerfLab][overlap]', {
      selector,
      count: overlaps.length,
      overlaps,
    });
  } catch (err) {
    console.warn('[PerfLab][overlap] debug failed', err);
  }
}

const PERF_LAB_STORAGE_KEY = 'perfLab:lastResults';
const PERF_LAB_AUTO_KEY = 'perfLab:auto';

function normalizeQueue(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(s => String(s || '').trim()).filter(Boolean);
  if (typeof input === 'string') {
    return input
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function buildResultsBundle(results, meta = {}) {
  const href = (typeof location !== 'undefined' && location.href) ? location.href : '';
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  return {
    createdAt: new Date().toISOString(),
    href,
    userAgent: ua,
    meta: { ...meta },
    results: Array.isArray(results) ? results : [],
  };
}

function saveResultsBundle(bundle, key = PERF_LAB_STORAGE_KEY) {
  if (!bundle) return false;
  try {
    localStorage.setItem(key, JSON.stringify(bundle));
    return true;
  } catch (err) {
    console.warn('[PerfLab] saveResults failed', err);
    return false;
  }
}

async function postResultsBundle(bundle, url) {
  if (!bundle || !url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    return true;
  } catch (err) {
    console.warn('[PerfLab] postResults failed', err);
    return false;
  }
}

function downloadResultsBundle(bundle, filename = 'perf-lab-results.json') {
  if (!bundle) return false;
  try {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn('[PerfLab] downloadResults failed', err);
    return false;
  }
}

function readAutoConfig() {
  let cfg = null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const raw = params.get('perfAuto') || params.get('perfLabAuto') || '';
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (parsed && typeof parsed === 'object') cfg = parsed;
      else cfg = { queue: normalizeQueue(raw) };
      const delayMs = Number(params.get('perfAutoDelay') || '');
      if (Number.isFinite(delayMs)) cfg.delayMs = delayMs;
      const postUrl = params.get('perfResultsUrl');
      if (postUrl) cfg.postUrl = postUrl;
      const saveKey = params.get('perfSaveKey');
      if (saveKey) cfg.saveKey = saveKey;
      const download = params.get('perfDownload');
      const autoStart = params.get('perfAutoStart');
      if (autoStart === '1' || autoStart === 'true') cfg.autoStart = true;
      if (download === '1' || download === 'true') cfg.download = true;
    }
  } catch {}

  if (!cfg) {
    try {
      const stored = localStorage.getItem(PERF_LAB_AUTO_KEY);
      const parsed = safeJsonParse(stored || '');
      if (parsed && typeof parsed === 'object') cfg = parsed;
    } catch {}
  }

  if (!cfg && typeof window !== 'undefined' && window.__PERF_LAB_AUTO) {
    cfg = (typeof window.__PERF_LAB_AUTO === 'object')
      ? { ...window.__PERF_LAB_AUTO }
      : { queue: normalizeQueue(window.__PERF_LAB_AUTO) };
  }

  if (cfg) cfg.queue = normalizeQueue(cfg.queue || cfg.list || cfg.tests);
  return cfg;
}

async function readAutoConfigFromFile(filePath = 'resources/perf-lab-auto.json') {
  try {
    const res = await fetch(filePath, { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    data.queue = normalizeQueue(data.queue || data.list || data.tests);
    return data;
  } catch {
    return null;
  }
}


async function resolveResultsConfig() {
  const cfgFile = await readAutoConfigFromFile();
  const cfg = cfgFile || readAutoConfig() || {};

  // Default: never download results unless explicitly enabled.
  // Auto runs still control download via their own config object.
  try {
    const isAuto = window.__PERF_LAB_RUN_CONTEXT === 'auto';
    if (!isAuto && typeof cfg.download === 'undefined') cfg.download = false;
  } catch {}

  return cfg;
}

async function publishResultBundle(result, meta = {}) {
  if (!result) return null;
  const cfg = await resolveResultsConfig();
  const bundle = buildResultsBundle([result], {
    queue: meta.queue || cfg.queue || [],
    notes: (meta.notes != null) ? meta.notes : (cfg.notes || ''),
    runId: (meta.runId != null) ? meta.runId : (cfg.runId || ''),
  });
  lastBundle = bundle;

  const saveKey = cfg.saveKey || PERF_LAB_STORAGE_KEY;
  if (cfg.save !== false) saveResultsBundle(bundle, saveKey);

  const postUrl = cfg.postUrl || window.__PERF_LAB_RESULTS_URL;
  if (postUrl) await postResultsBundle(bundle, postUrl);

  if (cfg.download) {
    let name = cfg.downloadName || 'perf-lab-results.json';
    if (!cfg.downloadName) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        name = `perf-lab-${ts}.json`;
      } catch {}
    }
    downloadResultsBundle(bundle, name);
  }
  return bundle;
}

async function runAuto(config = {}) {
  const cfg = (config && typeof config === 'object') ? config : { queue: normalizeQueue(config) };
  const queue = normalizeQueue(cfg.queue || cfg.list || cfg.tests);
  if (!queue.length) {
    setStatus('Auto-run: no tests');
    return [];
  }

  if (cfg.clear === true) {
    lastResult = null;
    lastResults = [];
    setOutput(null);
  }

  setStatus('Auto-run: ' + queue.length + ' tests');
  const __prevCtx = window.__PERF_LAB_RUN_CONTEXT;
  const __prevRunTag = window.__PERF_RUN_TAG;
  const __prevTraceMarks = window.__PERF_TRACE_MARKS;
  const __prevTraceLongMs = window.__PERF_TRACE_LONG_MS;
  const __prevTapDotsSim = window.__PERF_TAP_DOTS_SIM;
  const __prevChainUiFreeze = window.__PERF_DISABLE_CHAIN_UI;
  const __prevTrace = (window.__PERF_TRACE && typeof window.__PERF_TRACE === 'object') ? { ...window.__PERF_TRACE } : null;
  let __prevParticles = null;
  const __prevGestureAutoLock = window.__PERF_GESTURE_AUTO_LOCK;
  window.__PERF_LAB_RUN_CONTEXT = 'auto';
  if (cfg.runTag != null) window.__PERF_RUN_TAG = String(cfg.runTag);
  if (cfg.traceMarks != null) window.__PERF_TRACE_MARKS = !!cfg.traceMarks;
  if (Number.isFinite(cfg.traceLongMs)) window.__PERF_TRACE_LONG_MS = Number(cfg.traceLongMs);
  if (cfg.tapDotsSim != null) window.__PERF_TAP_DOTS_SIM = !!cfg.tapDotsSim;
  if (cfg.freezeChainUi != null) window.__PERF_DISABLE_CHAIN_UI = !!cfg.freezeChainUi;
  if (cfg.traceCanvasResize != null || cfg.traceDomInRaf != null) {
    try {
      const st = (window.__PERF_TRACE = window.__PERF_TRACE || {});
      if (cfg.traceCanvasResize != null) st.traceCanvasResize = !!cfg.traceCanvasResize;
      if (cfg.traceDomInRaf != null) st.traceDomInRaf = !!cfg.traceDomInRaf;
      // Keep UI in sync (helpful when someone watches the run)
      try { syncUiFromState(); } catch {}
    } catch {}
  }
  if (cfg.particleToggles && typeof cfg.particleToggles === 'object') {
    try {
      const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
      __prevParticles = { ...st };
      Object.assign(st, cfg.particleToggles);
    } catch {}
  }
  const wantsGestureLock = cfg.gestureAutoLock === true
    || (cfg.particleToggles
      && (cfg.particleToggles.gestureDrawModulo === 1 || cfg.particleToggles.gestureFieldModulo === 1));
  if (wantsGestureLock) window.__PERF_GESTURE_AUTO_LOCK = true;
  let results;
  try {
    results = await runQueue(queue);
  } finally {
    window.__PERF_LAB_RUN_CONTEXT = __prevCtx;
    window.__PERF_RUN_TAG = __prevRunTag;
    window.__PERF_TRACE_MARKS = __prevTraceMarks;
    window.__PERF_TRACE_LONG_MS = __prevTraceLongMs;
    if (typeof __prevTapDotsSim === 'undefined') {
      try { delete window.__PERF_TAP_DOTS_SIM; } catch {}
    } else {
      window.__PERF_TAP_DOTS_SIM = __prevTapDotsSim;
    }
    if (__prevParticles) {
      try {
        const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
        Object.assign(st, __prevParticles);
      } catch {}
    }
    window.__PERF_DISABLE_CHAIN_UI = __prevChainUiFreeze;
    window.__PERF_GESTURE_AUTO_LOCK = __prevGestureAutoLock;
    if (__prevTrace) {
      try { window.__PERF_TRACE = { ...__prevTrace }; } catch {}
    }
  }
  const traceSummary = computePerfTraceSummary();
  const bundle = buildResultsBundle(results, {
    queue,
    traceSummary,
    executedQueue: Array.isArray(window.__PERF_LAB_EXECUTED_QUEUE) ? window.__PERF_LAB_EXECUTED_QUEUE : [],
    notes: cfg.notes || '',
    runId: cfg.runId || '',
  });
  lastBundle = bundle;

  const saveKey = cfg.saveKey || PERF_LAB_STORAGE_KEY;
  if (cfg.save !== false) saveResultsBundle(bundle, saveKey);

  const postUrl = cfg.postUrl || window.__PERF_LAB_RESULTS_URL;
  if (postUrl) await postResultsBundle(bundle, postUrl);

  if (cfg.download) downloadResultsBundle(bundle, cfg.downloadName || 'perf-lab-results.json');

  if (cfg.clearAfter !== false) {
    try { clearSceneViaSnapshot(); } catch {}
  }

  setStatus('Auto-run: done (' + results.length + ' results)');
  return results;
}

function scheduleAutoRun() {
  const cfg = readAutoConfig();
  if (!cfg || !cfg.queue || !cfg.queue.length) return;
  const autoStart = (cfg.autoStart === true) || (cfg.runNow === true);
  if (!autoStart) return;
  const delayMs = Number.isFinite(cfg.delayMs) ? cfg.delayMs : 1200;
  setTimeout(() => {
    runAuto(cfg).catch((err) => console.warn('[PerfLab] auto-run failed', err));
  }, Math.max(0, delayMs));
}


function setStatus(s) {
  const el = document.getElementById('perf-lab-status');
  if (el) el.textContent = s;
}

function setOutput(obj) {
  const el = document.getElementById('perf-lab-output');
  if (!el) return;
  el.textContent = obj ? JSON.stringify(obj, null, 2) : '';
}

function appendOutputLine(line) {
  try {
    const el = document.getElementById('perf-lab-output');
    if (!el) return;
    const prev = String(el.textContent || '');
    const next = prev ? (prev.replace(/\s+$/,'') + '\n' + String(line)) : String(line);
    el.textContent = next;
  } catch {}
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
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P2?O');
  // Particles worst-case: lots of loopgrids (heavy particle fields).
  buildParticleWorstCase({ toyType: 'loopgrid', rows: 8, cols: 10, spacing: 400 });
  setStatus('P2 built');
}

async function buildP2d() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P2D...');
  await ensureMeasuredFootprint('loopgrid-drum');
  const spacing = estimateGridSpacing('loopgrid-drum', 400);
  logPerfFootprintDebug('loopgrid-drum', 400);
  buildParticleWorstCase({ toyType: 'loopgrid-drum', rows: 8, cols: 10, spacing });
  try {
    setTimeout(() => {
      document.querySelectorAll('.toy-panel[data-toy="loopgrid-drum"]')
        .forEach(p => {
          try { p.dispatchEvent(new CustomEvent('toy-random', { bubbles: true })); } catch {}
          try { p.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
        });
    }, 0);
  } catch {}
  setStatus('P2D built');
}

async function buildP3() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P3?O');
  // DrawGrid worst-case: lots of drawgrids for canvas-heavy stress.
  await ensureMeasuredFootprint('drawgrid');
  const spacing = estimateGridSpacing('drawgrid', 420);
  logPerfFootprintDebug('drawgrid', 420);
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 6, cols: 8, spacing });
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => raf(() => window.resolveToyPanelOverlaps?.()));
  } catch {}
  // Seed drawgrid notes for worst-case visuals.
  try {
    setTimeout(() => {
      document.querySelectorAll('.toy-panel[data-toy=drawgrid]')
        .forEach(p => { try { p.dispatchEvent(new CustomEvent('toy-random', { bubbles: true })); } catch {} });
      document.querySelectorAll('.toy-panel[data-toy=drawgrid]')
        .forEach(p => { try { p.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {} });
    }, 0);
  } catch {}
  try {
    setTimeout(() => logOverlapReport('.toy-panel[data-toy="drawgrid"]'), 800);
  } catch {}
  setStatus('P3 built');
}

async function buildP3Lite() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P3Lite...');
  // Fast diagnostic variant: fewer drawgrids so build/seed doesn't dominate the run.
  await ensureMeasuredFootprint('drawgrid');
  const spacing = estimateGridSpacing('drawgrid', 420);
  logPerfFootprintDebug('drawgrid', 420);
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 3, cols: 4, spacing });
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => raf(() => window.resolveToyPanelOverlaps?.()));
  } catch {}
  // Seed drawgrid notes for comparable visuals.
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) =>
      setTimeout(() => fn((performance?.now?.() ?? Date.now())), 16));
    const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy=drawgrid]'));
    const dispatchBatched = async (evtName, batch = 2) => {
      for (let i = 0; i < panels.length; i += batch) {
        for (const p of panels.slice(i, i + batch)) {
          try { p.dispatchEvent(new CustomEvent(evtName, { bubbles: true })); } catch {}
        }
        // Yield between batches so toy init/seed doesn't block the main thread for seconds.
        await new Promise((r) => raf(() => r()));
      }
    };
    await dispatchBatched('toy-random', 2);
    await dispatchBatched('toy-random-notes', 2);
  } catch {}
  try {
    setTimeout(() => logOverlapReport('.toy-panel[data-toy="drawgrid"]'), 800);
  } catch {}
  setStatus('P3Lite built');
}

async function buildP3Focus() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P3Focus...');
  // Tiny build for Current Focus auto-runs: ensures we actually get pan/zoom motion.
  await ensureMeasuredFootprint('drawgrid');
  const spacing = estimateGridSpacing('drawgrid', 520);
  logPerfFootprintDebug('drawgrid', 520);
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 2, cols: 3, spacing });
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => raf(() => window.resolveToyPanelOverlaps?.()));
  } catch {}
  // Seed drawgrid notes for comparable visuals (batched + yielding).
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) =>
      setTimeout(() => fn((performance?.now?.() ?? Date.now())), 16));
    const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy=drawgrid]'));
    const dispatchBatched = async (evtName, batch = 1) => {
      for (let i = 0; i < panels.length; i += batch) {
        for (const p of panels.slice(i, i + batch)) {
          try { p.dispatchEvent(new CustomEvent(evtName, { bubbles: true })); } catch {}
        }
        await new Promise((r) => raf(() => r()));
      }
    };
    await dispatchBatched('toy-random', 1);
    await dispatchBatched('toy-random-notes', 1);
  } catch {}
  setStatus('P3Focus built');
}

async function buildP3FocusHeavy() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P3FocusHeavy...');
  // Heavy validation build: enough drawgrids to reliably engage pressure-DPR on stronger machines,
  // but still small enough that build/seed doesn't starve the pan/zoom scripts.
  await ensureMeasuredFootprint('drawgrid');
  const spacing = estimateGridSpacing('drawgrid', 520);
  logPerfFootprintDebug('drawgrid', 520);
  // 12 toys (3x4)
  buildParticleWorstCase({ toyType: 'drawgrid', rows: 3, cols: 4, spacing });
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => raf(() => window.resolveToyPanelOverlaps?.()));
  } catch {}
  // Seed drawgrid notes for comparable visuals (batched + yielding).
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) =>
      setTimeout(() => fn((performance?.now?.() ?? Date.now())), 16));
    const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy=drawgrid]'));
    const dispatchBatched = async (evtName, batch = 2) => {
      for (let i = 0; i < panels.length; i += batch) {
        for (const p of panels.slice(i, i + batch)) {
          try { p.dispatchEvent(new CustomEvent(evtName, { bubbles: true })); } catch {}
        }
        await new Promise((r) => raf(() => r()));
      }
    };
    await dispatchBatched('toy-random', 2);
    await dispatchBatched('toy-random-notes', 2);
  } catch {}
  setStatus('P3FocusHeavy built');
}

async function buildP4() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P4...');
  await ensureMeasuredFootprint('loopgrid');
  const spacing = estimateGridSpacing('loopgrid', 420);
  logPerfFootprintDebug('loopgrid', 420);
  const cam = getCommittedState();
  createToyGrid({ toyType: 'loopgrid', rows: 6, cols: 10, spacing, centerX: cam.x, centerY: cam.y });
  const finalize = (tries = 0) => {
    try {
      const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
      const ready = panels.length > 0 && panels.every(p => typeof p.__sequencerStep === 'function');
      if (!ready && tries < 20) {
        setTimeout(() => finalize(tries + 1), 120);
        return;
      }
      panels.forEach(clearPanelChainData);
      seedLoopgridPanels(panels, { density: 0.33, seed: 1337, randomizeNotes: true });
      window.updateChains?.();
      window.updateAllChainUIs?.();
      window.scheduleChainRedraw?.();
      window.resolveToyPanelOverlaps?.();
    } catch {}
  };
  setTimeout(() => finalize(0), 0);
  setStatus('P4 built');
}

function buildP4h() {
  try { clearSceneViaSnapshot(); } catch {}
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

function buildP5() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P5...');
  buildMixedScene({ drawRows: 3, drawCols: 4, loopRows: 3, loopCols: 4, spacing: 420, gap: 320 });
  setStatus('P5 built');
}

async function buildP6() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P6...');
  await ensureMeasuredFootprint('drawgrid');
  const loopFootprint = estimateToyFootprint('loopgrid');
  const headSpacingX = Math.max(560, loopFootprint.width);
  const headSpacingY = Math.max(420, loopFootprint.height);
  const linkSpacingX = Math.max(420, loopFootprint.width);
  const chainLength = 4;
  const gridCols = 2;
  buildChainedLoopgridStress({
    toyType: 'loopgrid',
    chains: 4,
    chainLength,
    gridCols,
    seed: 1337,
    density: 0.35,
    noteMin: 0,
    noteMax: 35,
    headSpacingX,
    headSpacingY,
    linkSpacingX,
    jitterY: 0,
  });
  const drawSpacing = estimateGridSpacing('drawgrid', 460);
  const cam = getCommittedState();
  const chainTotalW = (gridCols - 1) * headSpacingX + (chainLength - 1) * linkSpacingX;
  const drawTotalW = (2 - 1) * drawSpacing;
  const gap = Math.max(320, PERF_SPAWN_PADDING * 2);
  const drawCenterX = cam.x + chainTotalW / 2 + gap + drawTotalW / 2;
  createToyGrid({ toyType: 'drawgrid', rows: 2, cols: 2, spacing: drawSpacing, centerX: drawCenterX, centerY: cam.y });
  try {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => raf(() => window.resolveToyPanelOverlaps?.()));
  } catch {}
  setStatus('P6 built');
}

async function buildP7() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P7...');
  await ensureMeasuredFootprint('drawgrid');
  await ensureMeasuredFootprint('loopgrid');
  const cam = getCommittedState();
  const chainLength = 4;
  const chainCount = 4;
  const drawFootprint = estimateToyFootprint('drawgrid');
  const loopFootprint = estimateToyFootprint('loopgrid');
  const headSpacingY = Math.max(420, drawFootprint.height, loopFootprint.height);
  const drawLinkSpacingX = Math.max(420, drawFootprint.width);
  const loopLinkSpacingX = Math.max(420, loopFootprint.width);
  const drawBlockW = (chainLength - 1) * drawLinkSpacingX + drawFootprint.width;
  const loopBlockW = (chainLength - 1) * loopLinkSpacingX + loopFootprint.width;
  const gap = Math.max(320, PERF_SPAWN_PADDING * 2);
  const totalW = drawBlockW + loopBlockW + gap;
  const leftX = cam.x - totalW / 2;
  const drawHeadX = leftX + drawFootprint.width / 2;
  const loopHeadX = leftX + drawBlockW + gap + loopFootprint.width / 2;
  const drawChains = createChainedToys({
    toyType: 'drawgrid',
    chains: chainCount,
    chainLength,
    headX: drawHeadX,
    headSpacingY,
    linkSpacingX: drawLinkSpacingX,
    centerY: cam.y,
  });
  const loopChains = createChainedToys({
    toyType: 'loopgrid',
    chains: chainCount,
    chainLength,
    headX: loopHeadX,
    headSpacingY,
    linkSpacingX: loopLinkSpacingX,
    centerY: cam.y,
  });
  const drawPanels = collectPanelsFromChains(drawChains);
  const loopPanels = collectPanelsFromChains(loopChains);
  const finalize = (tries = 0) => {
    const readyDraw = drawPanels.every(p => p?.id && typeof p.__sequencerStep === 'function');
    const readyLoop = loopPanels.every(p => p?.id && p.__gridState && typeof p.__sequencerStep === 'function');
    if ((!readyDraw || !readyLoop) && tries < 20) {
      setTimeout(() => finalize(tries + 1), 120);
      return;
    }
    try {
      try {
        window.__PERF_FORCE_SEQUENCER_ALL = false;
        window.__PERF_FORCE_SEQUENCER_ALL_LOCK = true;
      } catch {}
      linkToyChains(drawChains);
      linkToyChains(loopChains);
      try {
        window.resetChainState?.({ clearDom: false });
      } catch {}
      const initChainActive = (chains) => {
        if (!Array.isArray(chains)) return;
        for (const panels of chains) {
          if (!Array.isArray(panels) || panels.length === 0) continue;
          panels.forEach(p => { if (p?.dataset) p.dataset.chainActive = 'false'; });
          const head = panels[0];
          if (head?.dataset) {
            head.dataset.chainActive = 'true';
            try { head.dispatchEvent(new CustomEvent('chain:set-active', { bubbles: true })); } catch {}
          }
        }
      };
      initChainActive(drawChains);
      initChainActive(loopChains);
        drawPanels.forEach(p => {
          if (p?.dataset && (p.dataset.prevToyId || p.dataset.nextToyId)) {
            p.dataset.autoplay = 'chain';
          }
        });
        loopPanels.forEach(p => {
          if (p?.dataset && (p.dataset.prevToyId || p.dataset.nextToyId)) {
            p.dataset.autoplay = 'chain';
          }
        });
      window.updateChains?.();
      window.updateAllChainUIs?.();
      window.scheduleChainRedraw?.();
      window.resolveToyPanelOverlaps?.();
    } catch {}
    try {
      drawPanels.forEach(p => { try { p.dispatchEvent(new CustomEvent('toy-random', { bubbles: true })); } catch {} });
      drawPanels.forEach(p => { try { p.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {} });
        seedLoopgridPanels(loopPanels, { density: 0.35, seed: 1337, randomizeNotes: false });
      syncChainInstruments(drawChains);
      syncChainInstruments(loopChains);
    } catch {}
    try {
      const rows = [];
      const panels = [...drawPanels, ...loopPanels];
      panels.forEach((panel) => {
        const toy = panel?.dataset?.toy || '';
        const headId = panel ? getChainHeadId(panel) : '';
        rows.push({
          id: panel?.id || '',
          toy,
          headId,
          chainActive: panel?.dataset?.chainActive || '',
          prev: panel?.dataset?.prevToyId || '',
          next: panel?.dataset?.nextToyId || '',
          instrument: panel?.dataset?.instrument || '',
        });
      });
      console.table(rows);
    } catch {}
    setTimeout(() => {
      try {
        const initChainActive = (chains) => {
          if (!Array.isArray(chains)) return;
          for (const panels of chains) {
            if (!Array.isArray(panels) || panels.length === 0) continue;
            panels.forEach(p => { if (p?.dataset) p.dataset.chainActive = 'false'; });
            const head = panels[0];
            if (head?.dataset) {
              head.dataset.chainActive = 'true';
              try { head.dispatchEvent(new CustomEvent('chain:set-active', { bubbles: true })); } catch {}
            }
          }
        };
        initChainActive(drawChains);
        initChainActive(loopChains);
        const activeDraw = drawPanels.filter(p => p?.dataset?.chainActive === 'true');
        const activeLoop = loopPanels.filter(p => p?.dataset?.chainActive === 'true');
        console.log('[PerfLab][P7] active counts', {
          draw: activeDraw.length,
          loop: activeLoop.length,
          forceSequencerAll: !!window.__PERF_FORCE_SEQUENCER_ALL,
          noteScheduler: !!window.__NOTE_SCHEDULER_ENABLED,
        });
        console.log('[PerfLab][P7] active draw IDs', activeDraw.map(p => p.id));
      } catch {}
    }, 900);
    setTimeout(() => {
      try {
        const rows = [];
        for (const panel of drawPanels) {
          const headId = panel ? getChainHeadId(panel) : '';
          rows.push({
            id: panel?.id || '',
            headId,
            chainActive: panel?.dataset?.chainActive || '',
            showPlaying: panel?.__dgShowPlaying ? 'true' : 'false',
            hasNotes: panel?.__dgHasNotes ? 'true' : 'false',
          });
        }
        console.table(rows);
      } catch {}
    }, 1800);
    setTimeout(() => {
      try {
        const byHead = new Map();
        drawPanels.forEach((panel) => {
          const headId = getChainHeadId(panel);
          if (!headId) return;
          const entry = byHead.get(headId) || { total: 0, active: [] };
          entry.total += 1;
          if (panel?.dataset?.chainActive === 'true') entry.active.push(panel.id);
          byHead.set(headId, entry);
        });
        for (const [headId, entry] of byHead.entries()) {
          if (entry.active.length !== 1) {
            console.warn('[PerfLab][P7] chainActive mismatch', { headId, total: entry.total, active: entry.active });
          }
        }
      } catch {}
    }, 2200);
    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type !== 'attributes' || m.attributeName !== 'data-chain-active') continue;
          const panel = m.target;
          console.log('[PerfLab][P7] chainActive change', {
            id: panel?.id,
            toy: panel?.dataset?.toy,
            chainActive: panel?.dataset?.chainActive,
          });
        }
      });
      drawPanels.forEach((panel) => {
        if (panel && panel.nodeType === 1) observer.observe(panel, { attributes: true });
      });
      setTimeout(() => { try { observer.disconnect(); } catch {} }, 6000);
    } catch {}
    try { window.Persistence?.markDirty?.(); } catch {}
  };
  setTimeout(() => finalize(0), 0);
  setStatus('P7 built');
}

async function runP7a() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const prevForce = window.__PERF_FORCE_SEQUENCER_ALL;
  try {
    window.__PERF_FORCE_SEQUENCER_ALL = false;
    await runVariantPlaying(
      'P7a_mixed_chains_playing_panzoom_all',
      panZoom,
      'Running P7a (mixed chains, all toys active)...'
    );
  } finally {
    window.__PERF_FORCE_SEQUENCER_ALL = prevForce;
  }
}

async function runP7b() {
  const drawPanels = Array.from(document.querySelectorAll('.toy-panel[data-toy="drawgrid"]'));
  const loopPanels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));

  const pickSome = (arr) => arr.filter((_, i) => (i % 3) === 0);

  // Drawgrid: truly empty (no strokes, no nodes)
  const drawEmptyIds = pickSome(drawPanels).map(panelIdSafe).filter(Boolean);
  if (drawEmptyIds.length) silenceDrawgridPanels(drawEmptyIds);

  // Loopgrid: truly empty (no rendered nodes)
  const loopEmptyPanels = pickSome(loopPanels);
  if (loopEmptyPanels.length) emptyLoopgridPanels(loopEmptyPanels);

  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const prevForce = window.__PERF_FORCE_SEQUENCER_ALL;
  try {
    window.__PERF_FORCE_SEQUENCER_ALL = false;
    await runVariantPlaying(
      'P7b_mixed_chains_playing_panzoom_some_empty',
      panZoom,
      'Running P7b (mixed chains, some toys empty)...'
    );
  } finally {
    window.__PERF_FORCE_SEQUENCER_ALL = prevForce;
  }
}

function collectToyTypeCounts() {
  const counts = {};
  try {
    document.querySelectorAll('.toy-panel').forEach((panel) => {
      const type = panel?.dataset?.toy || panel?.getAttribute?.('data-toy') || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
  } catch {}
  return counts;
}

function forcePerfWarmup() {
  try {
    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    let did = false;
    panels.forEach((panel) => {
      try {
        if (panel?.__dgPerfWarmup) {
          did = true;
          panel.__dgPerfWarmup();
        }
      } catch {}
    });
    if (did) {
      try {
        window.__PERF_WARMUP_COUNT = (window.__PERF_WARMUP_COUNT || 0) + 1;
        window.__PERF_WARMUP_TS = Date.now();
      } catch {}
      try { window.__PerfFrameProf?.mark?.('perf.warmup', 0.001); } catch {}
    }
  } catch {}
}

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

async function runVariant(label, step, statusText) {
  setStatus(statusText || `Running ${label}?O`);
  setOutput(null);
  lastResult = null;

  try { window.__PERF_CAM_BOUNDS = null; } catch {}

  // Lock particle quality so FPS-driven LOD doesn???t ??save us??? during the test.
  setParticleQualityLock('ultra');

  const durationMs = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_LAB_DURATION_MS))
    ? Math.max(1000, Number(window.__PERF_LAB_DURATION_MS))
    : 30000;
  const result = await runBenchmark({
    label,
    durationMs,
    warmupMs: 1200,
    step,
    warmupAction: forcePerfWarmup,
  });

  try {
    const toys = document.querySelectorAll('.toy-panel, .toy').length;
    const chains = document.querySelectorAll('[data-chain-parent], [data-chain-has-child]').length;
    result.sceneMeta = {
      toys,
      chainMarkers: chains,
      cam: window.__ZoomCoordinator?.getCommittedState?.() || null,
      toyTypes: collectToyTypeCounts(),
      camBounds: window.__PERF_CAM_BOUNDS || null,
    };
  } catch {}

  // Unlock
  setParticleQualityLock(null);

  // Attach toggle state to results for easier comparisons.
  try {
    result.particleToggles = {
      ...(window.__PERF_PARTICLES || {}),
      logFreeze: !!(window.__PERF_PARTICLES && window.__PERF_PARTICLES.logFreeze),
    };
  } catch {}

  // Mirror runVariantPlaying(): capture perf flags so bundles self-verify trace state.
  try {
    result.flags = {
      traceCanvasResize: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceCanvasResize),
      traceDomInRaf: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceDomInRaf),
      disableLoopgridRender: !!window.__PERF_DISABLE_LOOPGRID_RENDER,
      disableChains: !!window.__PERF_DISABLE_CHAINS,
      disableTapDots: !!window.__PERF_DISABLE_TAP_DOTS,
      disableOverlays: !!window.__PERF_DISABLE_OVERLAYS,
      disableOverlayStrokes: !!window.__PERF_DG_OVERLAY_STROKES_OFF,
      disableOverlayCore: !!window.__PERF_DG_OVERLAY_CORE_OFF,
      dgDisableParticles: !!window.__PERF_DG_DISABLE_PARTICLES,
      disablePulses: !!window.__PERF_DISABLE_PULSES,
      freezeAllUnfocused: !!window.__PERF_FREEZE_ALL_UNFOCUSED,
      loopgridGestureRenderMod: Number(window.__PERF_LOOPGRID_GESTURE_RENDER_MOD) || 1,
      loopgridChainCache: !!window.__PERF_LOOPGRID_CHAIN_CACHE,
      noPaint: !!window.__PERF_NO_PAINT,
      noPaintActive: !!window.__PERF_NO_PAINT_ACTIVE,
      paintOnlyActive: !!window.__PERF_PAINT_ONLY_ACTIVE,
      noDomUpdates: !!window.__PERF_NO_DOM_UPDATES,
      disableChainUi: !!window.__PERF_DISABLE_CHAIN_UI,
      traceMarks: !!window.__PERF_TRACE_MARKS,
      tapDotsSim: !!window.__PERF_TAP_DOTS_SIM,
      playheadSeparateCanvas: !!window.__DG_PLAYHEAD_SEPARATE_CANVAS,
      dgSingleCanvas: !!window.__DG_SINGLE_CANVAS,
      runTag: String(window.__PERF_RUN_TAG || ''),
    };
  } catch {}

  // Attach buffered trace (tail only) to avoid console overhead during perf.
  try {
    result.trace = window.__PERF_TRACE_SNAPSHOT ? window.__PERF_TRACE_SNAPSHOT(220) : null;
  } catch {}
  try {
    const keep = (typeof window !== 'undefined') ? !!window.__PERF_TRACE_KEEP_BUFFER : false;
    if (!keep && window.__PERF_TRACE_CLEAR) window.__PERF_TRACE_CLEAR();
  } catch {}
  lastResult = result;
  lastResults.push(result);
  setOutput(result);
  setStatus('Done');
  try { console.log('[PerfLab] result', result); } catch {}
  try { if (window.__PERF_LAB_RUN_CONTEXT !== 'auto') await publishResultBundle(result, { queue: [label], notes: statusText || '', runId: 'manual' }); } catch {}
}

async function runVariantPlaying(label, step, statusText) {
  const warmupMs = 1200;
  const slowMs = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_FRAME_PROF_SLOW_MS))
    ? window.__PERF_FRAME_PROF_SLOW_MS
    : 50;
  const traceLongMs = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_TRACE_LONG_MS))
    ? window.__PERF_TRACE_LONG_MS
    : slowMs;
  const maxSamples = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_FRAME_PROF_MAX))
    ? window.__PERF_FRAME_PROF_MAX
    : 120;
  const prof = makeFrameProfiler({ slowMs, maxSamples });
  window.__PerfFrameProf = prof; // so you can dump it from console
  const durationMs = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_LAB_DURATION_MS))
    ? Math.max(1000, Number(window.__PERF_LAB_DURATION_MS))
    : 30000;
  const scriptStep = step;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const raf = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(() => fn(nowMs()), 16));
  const defer = (fn) => (typeof setTimeout === 'function' ? setTimeout(fn, 0) : raf(fn));
  let warmupDid = false;
  let pendingFrame = null;
  let pendingFrameTimer = 0;
  let rafWrapped = false;
  let rafOriginal = null;
  const frameMs = [];
  const warmupTriggerMs = Math.max(0, Math.min(warmupMs - 50, warmupMs * 0.5));
  let startMs = null;
  let lastMs = null;
  setStatus(statusText || `Running ${label}...`);
  setOutput(null);
  lastResult = null;

  try { window.__PERF_CAM_BOUNDS = null; } catch {}
  const traceMarksEnabled = () => !!window.__PERF_TRACE_MARKS
    && typeof performance !== 'undefined'
    && typeof performance.measure === 'function';
  if (traceMarksEnabled() && typeof performance.clearMeasures === 'function') {
    try { performance.clearMeasures('mt:frame.long'); } catch {}
  }

  // Lock particle quality so FPS-driven LOD does not save us during the test.
  setParticleQualityLock('ultra');

  // Ensure transport is running during the sample window
  try {
    if (!isRunning()) startTransport();
  } catch {}

  // Wrap rAF to catch untagged work inside rAF callbacks.
  try {
    if (!window.__PERF_RAF_WRAPPED && typeof window.requestAnimationFrame === 'function') {
      rafOriginal = window.requestAnimationFrame;
      window.__PERF_RAF_ORIG = rafOriginal;
      window.requestAnimationFrame = function(callback) {
        return rafOriginal.call(window, function(ts) {
          const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
          const t0 = __perfOn ? performance.now() : 0;
          const tag = (callback && typeof callback.__perfRafTag === 'string') ? callback.__perfRafTag : 'perf.raf.other';
          try { return callback(ts); }
          finally {
            if (__perfOn && t0) {
              try { window.__PerfFrameProf.mark(tag, performance.now() - t0); } catch {}
            }
          }
        });
      };
      window.__PERF_RAF_WRAPPED = true;
      rafWrapped = true;
    }
  } catch {}

  // Reset per-run pulse/outline counters
  try {
    window.__PERF_PULSE_COUNT = 0;
    window.__PERF_OUTLINE_SYNC_COUNT = 0;
    window.__PERF_WARMUP_COUNT = 0;
    window.__PERF_DG_BACKING_RESIZE_COUNT = 0;
    window.__PERF_DG_OVERLAY_RESIZE_COUNT = 0;
  } catch {}

  const result = await new Promise((resolve) => {
    const finalizePendingFrame = () => {
      if (!pendingFrame) return;
      if (traceMarksEnabled()
        && pendingFrame.frameDt >= traceLongMs
        && Number.isFinite(pendingFrame.meta?.traceStart)
        && Number.isFinite(pendingFrame.meta?.traceEnd)) {
        try {
          performance.measure('mt:frame.long', {
            start: pendingFrame.meta.traceStart,
            end: pendingFrame.meta.traceEnd,
          });
        } catch {}
      }
      prof.endFrame(pendingFrame.frameDt, pendingFrame.meta);
      pendingFrame = null;
      pendingFrameTimer = 0;
    };

      const stepFrame = (ts) => {
        if (startMs === null) {
          startMs = ts;
          lastMs = ts;
      }

      const t = ts - startMs;
      const dtMs = ts - lastMs;
      lastMs = ts;

      if (pendingFrame) finalizePendingFrame();

      const t0 = nowMs();
      const s0 = nowMs();
      try { if (scriptStep) scriptStep(t, dtMs, Math.min(1, t / durationMs)); } catch {}
      let forceSample = false;
      let warmupTag = false;
      if (!warmupDid && t >= warmupTriggerMs && t <= warmupMs) {
        warmupDid = true;
        forceSample = true;
        warmupTag = true;
        try { forcePerfWarmup(); } catch {}
      }
      prof.mark('script', nowMs() - s0);
      const workMs = Math.max(0, nowMs() - t0);
      const frameDt = Number.isFinite(dtMs) ? dtMs : (nowMs() - t0);
      const idleMs = Math.max(0, frameDt - workMs);
        const frameStart = Number.isFinite(dtMs) ? (ts - dtMs) : ts;
        const frameEnd = ts;
        pendingFrame = {
          frameDt,
          meta: { workMs, idleMs, forceSample, warmupTag, traceStart: frameStart, traceEnd: frameEnd },
        };
        if (!pendingFrameTimer) pendingFrameTimer = defer(finalizePendingFrame);

      if (t > warmupMs) frameMs.push(frameDt);

      if (t >= durationMs) {
        if (pendingFrame) finalizePendingFrame();
        const s = statsFromFrameMs(frameMs);
        resolve({
          label,
          durationMs,
          warmupMs,
          createdAt: new Date().toISOString(),
          ...s,
        });
        return;
      }
        raf(stepFrame);
      };
      stepFrame.__perfRafTag = 'perf.raf.benchmark';
      raf(stepFrame);
    });

  try {
    result.pulseCount = window.__PERF_PULSE_COUNT || 0;
    result.outlineSyncCount = window.__PERF_OUTLINE_SYNC_COUNT || 0;
    result.warmupCount = window.__PERF_WARMUP_COUNT || 0;
    result.warmupTs = window.__PERF_WARMUP_TS || null;
    result.dgBackingResizeCount = window.__PERF_DG_BACKING_RESIZE_COUNT || 0;
    result.dgOverlayResizeCount = window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0;
  } catch {}

  try {
    const samples = prof.snapshot();
    const worstSample = prof.getWorst ? prof.getWorst() : null;
    result.frameProfile = summarizeFrameProfile(samples);
    result.warmupProfile = prof.getWarmup ? prof.getWarmup() : null;
    if (worstSample) {
      result.frameProfileWorst = summarizeWorstFrame([worstSample]);
    } else {
      result.frameProfileWorst = summarizeWorstFrame(samples);
    }
  } catch {}

  try {
    const toys = document.querySelectorAll('.toy-panel, .toy').length;
    const chains = document.querySelectorAll('[data-chain-parent], [data-chain-has-child]').length;
    result.sceneMeta = {
      toys,
      chainMarkers: chains,
      cam: window.__ZoomCoordinator?.getCommittedState?.() || null,
      toyTypes: collectToyTypeCounts(),
      camBounds: window.__PERF_CAM_BOUNDS || null,
    };
  } catch {}

  // Stop after test to avoid surprise audio continuing
  try { stopTransport(); } catch {}

  // Restore rAF if we wrapped it.
  if (rafWrapped && rafOriginal) {
    try { window.requestAnimationFrame = rafOriginal; } catch {}
    try { delete window.__PERF_RAF_WRAPPED; } catch {}
    try { delete window.__PERF_RAF_ORIG; } catch {}
  }

  setParticleQualityLock(null);

    try {
      result.particleToggles = { ...(window.__PERF_PARTICLES || {}) };
      result.particleTempPatch = window.__PERF_PARTICLES__TEMP_PATCH || null;
      result.playing = true;
      result.flags = {
        // Perf trace toggles (demon hunting)
        traceCanvasResize: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceCanvasResize),
        traceDomInRaf: !!(window.__PERF_TRACE && window.__PERF_TRACE.traceDomInRaf),

        disableLoopgridRender: !!window.__PERF_DISABLE_LOOPGRID_RENDER,
        disableChains: !!window.__PERF_DISABLE_CHAINS,
        disableTapDots: !!window.__PERF_DISABLE_TAP_DOTS,
        disableOverlays: !!window.__PERF_DISABLE_OVERLAYS,
        disableOverlayStrokes: !!window.__PERF_DG_OVERLAY_STROKES_OFF,
        disableOverlayCore: !!window.__PERF_DG_OVERLAY_CORE_OFF,
        dgDisableParticles: !!window.__PERF_DG_DISABLE_PARTICLES,
        disablePulses: !!window.__PERF_DISABLE_PULSES,
        freezeAllUnfocused: !!window.__PERF_FREEZE_ALL_UNFOCUSED,
        loopgridGestureRenderMod: Number(window.__PERF_LOOPGRID_GESTURE_RENDER_MOD) || 1,
        loopgridChainCache: !!window.__PERF_LOOPGRID_CHAIN_CACHE,
        noPaint: !!window.__PERF_NO_PAINT,
        noPaintActive: !!window.__PERF_NO_PAINT_ACTIVE,
        paintOnlyActive: !!window.__PERF_PAINT_ONLY_ACTIVE,
        noDomUpdates: !!window.__PERF_NO_DOM_UPDATES,
        disableChainUi: !!window.__PERF_DISABLE_CHAIN_UI,
        traceMarks: !!window.__PERF_TRACE_MARKS,
        tapDotsSim: !!window.__PERF_TAP_DOTS_SIM,
        playheadSeparateCanvas: !!window.__DG_PLAYHEAD_SEPARATE_CANVAS,
        dgSingleCanvas: !!window.__DG_SINGLE_CANVAS,
        runTag: String(window.__PERF_RUN_TAG || ''),
      };
    result.gestureSkipCount = window.__PERF_LOOPGRID_GESTURE_SKIP || 0;
  } catch {}

  // Attach buffered trace (tail only) to avoid console overhead during perf.
  try {
    result.trace = window.__PERF_TRACE_SNAPSHOT ? window.__PERF_TRACE_SNAPSHOT(220) : null;
  } catch {}
  try {
    const keep = (typeof window !== 'undefined') ? !!window.__PERF_TRACE_KEEP_BUFFER : false;
    if (!keep && window.__PERF_TRACE_CLEAR) window.__PERF_TRACE_CLEAR();
  } catch {}

  try { window.__PerfFrameProf?.dump?.(label); } catch {}

  lastResult = result;
  lastResults.push(result);
  setOutput(result);
  setStatus('Done');
  try { console.log('[PerfLab] result', result); } catch {}
  try { if (window.__PERF_LAB_RUN_CONTEXT !== 'auto') await publishResultBundle(result, { queue: [label], notes: statusText || '', runId: 'manual' }); } catch {}
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

function makeFrameProfiler({ slowMs = 50, maxSamples = 120 } = {}) {
  const out = [];
  let warmup = null;
  let worst = null;
  return {
    mark(name, dt) {
      // accumulate by name for the current frame
      const cur = (this.__cur ||= { t: performance.now(), parts: {} });
      cur.parts[name] = (cur.parts[name] || 0) + (dt || 0);
    },
    endFrame(frameDt, meta = {}) {
      if (!this.__cur) return;
      const cur = this.__cur;
      this.__cur = null;

      const parts = cur.parts || {};
      let sum = 0;
      for (const k in parts) {
        const v = parts[k];
        if (Number.isFinite(v)) sum += v;
      }
      const unattributed = Math.max(0, frameDt - sum);
      if (unattributed > 0) parts.unattributed = unattributed;
      const scriptMs = Number.isFinite(parts.script) ? parts.script : 0;
      const nonScript = Math.max(0, frameDt - scriptMs);
      if (nonScript > 0) parts['frame.nonScript'] = nonScript;

      if (meta.warmupTag) {
        warmup = {
          t: cur.t,
          frameDt,
          parts: { ...parts },
          workMs: meta.workMs,
          idleMs: meta.idleMs,
        };
      }
      const shouldCaptureMem =
        meta.forceSample ||
        frameDt >= slowMs ||
        !worst ||
        frameDt > (worst.frameDt || 0);
      const memory = shouldCaptureMem ? readPerfMemory() : null;
      const sample = { t: cur.t, frameDt, parts, workMs: meta.workMs, idleMs: meta.idleMs, memory };
      if (!worst || (sample.frameDt > (worst.frameDt || 0))) worst = sample;
      if (frameDt >= slowMs || meta.forceSample) {
        out.push(sample);
        if (out.length > maxSamples) out.shift();
      }
    },
    snapshot() { return out.slice(); },
    getWorst() { return worst ? { ...worst, parts: { ...(worst.parts || {}) } } : null; },
    getWarmup() { return warmup ? { ...warmup, parts: { ...(warmup.parts || {}) } } : null; },
    dump(label = 'frame-profiler') {
      console.log(`[${label}] samples=${out.length}`, out);
      return out;
    },
    reset() { out.length = 0; },
  };
}

function summarizeFrameProfile(samples) {
  const out = { samples: 0, parts: {}, work: { totalMs: 0, avgMs: 0 }, idle: { totalMs: 0, avgMs: 0 } };
  if (!Array.isArray(samples) || samples.length === 0) return out;
  out.samples = samples.length;
  for (const s of samples) {
    const parts = s?.parts || {};
    if (Number.isFinite(s?.workMs)) out.work.totalMs += s.workMs;
    if (Number.isFinite(s?.idleMs)) out.idle.totalMs += s.idleMs;
    for (const k in parts) {
      const v = parts[k];
      if (!Number.isFinite(v)) continue;
      const p = (out.parts[k] ||= { totalMs: 0 });
      p.totalMs += v;
    }
  }
  for (const k in out.parts) {
    const v = out.parts[k];
    if (!v || !Number.isFinite(v.totalMs)) continue;
    v.avgMs = v.totalMs / out.samples;
  }
  if (out.samples > 0) {
    out.work.avgMs = out.work.totalMs / out.samples;
    out.idle.avgMs = out.idle.totalMs / out.samples;
  }
  return out;
}
function composeSteps(...steps) {
  return function step(tMs, dtMs, progress) {
    for (const s of steps) {
      try { if (typeof s === 'function') s(tMs, dtMs, progress); } catch {}
    }
  };
}

async function withTempAnchorDisabled(disabled, fn) {
  const prev = window.__MT_ANCHOR_DISABLED;
  window.__MT_ANCHOR_DISABLED = !!disabled;
  try { initBoardAnchor(); } catch {}
  try { return await fn(); }
  finally {
    window.__MT_ANCHOR_DISABLED = prev;
    try { initBoardAnchor(); } catch {}
  }
}


async function withTempAnchorEnabled(fn) {
  let prev = null;
  let hadPrev = false;
  try {
    prev = localStorage.getItem('mt_anchor_enabled');
    hadPrev = prev !== null;
    localStorage.setItem('mt_anchor_enabled', '1');
  } catch {}
  try { return await withTempAnchorDisabled(false, fn); }
  finally {
    try {
      if (hadPrev) localStorage.setItem('mt_anchor_enabled', prev);
      else localStorage.removeItem('mt_anchor_enabled');
    } catch {}
  }
}

async function withTempPerfAnchor(patch, fn) {
  const st = (window.__PERF_ANCHOR = window.__PERF_ANCHOR || {});
  const prev = { ...st };
  Object.assign(st, patch || {});
  try { return await fn(); }
  finally { Object.assign(st, prev); }
}

function clearSceneViaSnapshot() {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') {
    console.warn('[PerfLab] Persistence API not ready');
    return false;
  }
  const snap = P.getSnapshot();
  snap.toys = [];
  snap.chains = [];
  const ok = !!P.applySnapshot(snap);
  try { window.resetChainState?.({ clearDom: true }); } catch {}
  return ok;
}

function createToyGrid({ toyType, rows, cols, spacing, centerX, centerY }) {
  const factory = window.MusicToyFactory;
  if (!factory || typeof factory.create !== 'function') {
    console.warn('[PerfLab] MusicToyFactory.create not ready');
    return false;
  }

  const totalW = (cols - 1) * spacing;
  const totalH = (rows - 1) * spacing;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = centerX + (c * spacing - totalW / 2);
      const y = centerY + (r * spacing - totalH / 2);
      try {
        factory.create(toyType, { centerX: x, centerY: y, autoCenter: false, allowOffscreen: true, skipSpawnPlacement: true });
      } catch (err) {
        console.warn('[PerfLab] create failed', { toyType, r, c }, err);
      }
    }
  }
  return true;
}

function createChainedToys({
  toyType,
  chains = 4,
  chainLength = 4,
  headX,
  headSpacingY,
  linkSpacingX,
  centerY,
  jitterY = 0,
} = {}) {
  const factory = window.MusicToyFactory;
  if (!factory || typeof factory.create !== 'function') {
    console.warn('[PerfLab] MusicToyFactory.create not ready');
    return [];
  }
  const rows = Math.max(1, chains | 0);
  const totalH = (rows - 1) * headSpacingY;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const baseY = centerY + (r * headSpacingY - totalH / 2);
    const panels = [];
    for (let k = 0; k < chainLength; k++) {
      const x = headX + k * linkSpacingX;
      const jitter = Math.max(0, Number.isFinite(jitterY) ? jitterY : 0);
      const y = baseY + (jitter ? Math.round((Math.random() * 2 - 1) * jitter) : 0);
      try {
        const panel = factory.create(toyType, {
          centerX: x,
          centerY: y,
          autoCenter: false,
          allowOffscreen: true,
          skipSpawnPlacement: true,
        });
        if (panel) panels.push(panel);
      } catch (err) {
        console.warn('[PerfLab] create failed', { toyType, r, k }, err);
      }
    }
    out.push(panels);
  }
  return out;
}

function readPerfMemory() {
  try {
    const mem = (typeof performance !== 'undefined') ? performance.memory : null;
    if (!mem) return null;
    return {
      used: mem.usedJSHeapSize,
      total: mem.totalJSHeapSize,
      limit: mem.jsHeapSizeLimit,
    };
  } catch {
    return null;
  }
}

function summarizeWorstFrame(samples, limit = 8) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  let worst = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if ((s?.frameDt || 0) > (worst?.frameDt || 0)) worst = s;
  }
  if (!worst) return null;
  const parts = worst.parts || {};
  const rows = Object.keys(parts)
    .map((name) => ({ name, ms: parts[name] }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, Math.max(1, limit | 0));
  return {
    frameDt: worst.frameDt,
    workMs: worst.workMs,
    idleMs: worst.idleMs,
    memory: worst.memory || null,
    parts: rows,
  };
}

function linkToyChains(chains) {
  if (!Array.isArray(chains)) return;
  for (const panels of chains) {
    for (let k = 0; k < (panels?.length || 0) - 1; k++) {
      const a = panels[k];
      const b = panels[k + 1];
      if (!a?.id || !b?.id) continue;
      a.dataset.nextToyId = b.id;
      a.dataset.chainHasChild = '1';
      b.dataset.prevToyId = a.id;
      b.dataset.chainParent = a.id;
    }
  }
}

function collectPanelsFromChains(chains) {
  const out = [];
  if (!Array.isArray(chains)) return out;
  for (const chain of chains) {
    if (!Array.isArray(chain)) continue;
    for (const panel of chain) {
      if (panel) out.push(panel);
    }
  }
  return out;
}

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedLoopgridPanels(panels, { density = 0.35, seed = 1337, randomizeNotes = true } = {}) {
  const rand = mulberry32(seed);
  let seeded = 0;
  for (const panel of panels) {
    const st = panel?.__gridState;
    if (!st || !Array.isArray(st.steps) || !Array.isArray(st.noteIndices)) continue;
    let anyOn = false;
    for (let i = 0; i < st.steps.length; i++) {
      const on = rand() < density;
      st.steps[i] = on;
      if (on) anyOn = true;
    }
    if (!anyOn && st.steps.length) {
      st.steps[Math.floor(rand() * st.steps.length)] = true;
    }
      if (randomizeNotes) {
        const palette = Array.isArray(st.notePalette) && st.notePalette.length ? st.notePalette : null;
        for (let i = 0; i < st.noteIndices.length; i++) {
          if (palette) {
            const pick = Math.floor(rand() * palette.length);
            st.noteIndices[i] = pick;
          }
        }
      }
    try {
      panel.dispatchEvent(new CustomEvent('loopgrid:update', {
        detail: {
          reason: 'perf-seed',
          steps: Array.from(st.steps),
          noteIndices: Array.from(st.noteIndices),
        },
      }));
    } catch {}
    seeded += 1;
  }
  return seeded;
}

function silenceLoopgridPanels(panels = []) {
  let changed = 0;
  for (const panel of panels) {
    const st = panel?.__gridState;
    if (!st || !Array.isArray(st.steps) || !Array.isArray(st.noteIndices)) continue;
    for (let i = 0; i < st.steps.length; i++) {
      st.steps[i] = false;
    }
    try {
      panel.dispatchEvent(new CustomEvent('loopgrid:update', {
        detail: {
          reason: 'perf-silence',
          steps: Array.from(st.steps),
          noteIndices: Array.from(st.noteIndices),
        },
      }));
      changed += 1;
    } catch {}
  }
  return changed;
}

function panelIdSafe(panel) {
  return panel?.id || panel?.dataset?.toyid || panel?.dataset?.toyId || '';
}

function emptyLoopgridPanels(panels = []) {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') return false;

  const ids = new Set((panels || []).map(panelIdSafe).filter(Boolean));
  if (ids.size === 0) return false;

  let changed = 0;
  try {
    const snap = P.getSnapshot();
    const toys = Array.isArray(snap?.toys) ? snap.toys : [];

    for (const t of toys) {
      const id = t?.id;
      if (!id || !ids.has(id)) continue;

      t.state = t.state || {};
      // Make it truly “empty” (no rendered nodes)
      t.state.steps = [];
      t.state.noteIndices = [];
      t.state.notes = [];
      changed++;
    }

    if (!changed) return false;

    const ok = !!P.applySnapshot(snap);
    if (!ok) return false;

    // Nudge visuals
    try {
      window.updateAllToys?.();
      window.scheduleAllToysRedraw?.();
      window.requestAnimationFrame?.(() => {
        window.updateAllToys?.();
        window.scheduleAllToysRedraw?.();
      });
    } catch {}

    // Nudge loopgrid panels directly too (safe, best-effort)
    try {
      ids.forEach((id) => {
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.dispatchEvent(new CustomEvent('loopgrid:update', {
          detail: { reason: 'perf-empty', steps: [], noteIndices: [] },
          bubbles: true,
        }));
      });
    } catch {}

    try { window.Persistence?.markDirty?.(); } catch {}
    return true;
  } catch {
    return false;
  }
}

function getChainHeadId(panel) {
  let current = panel;
  let sanity = 50;
  while (current && current.dataset?.prevToyId && sanity-- > 0) {
    const prev = document.getElementById(current.dataset.prevToyId);
    if (!prev || prev === current) break;
    current = prev;
  }
  return current?.id || '';
}

function syncChainInstruments(chains) {
  if (!Array.isArray(chains)) return;
  for (const panels of chains) {
    if (!Array.isArray(panels) || panels.length === 0) continue;
    const head = panels[0];
    const instrument = head?.dataset?.instrument;
    if (!instrument) continue;
    panels.forEach((panel) => {
      if (!panel?.dataset) return;
      panel.dataset.instrument = instrument;
      panel.dataset.instrumentPersisted = '1';
      try { panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrument }, bubbles: true })); } catch {}
      try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: instrument, value: instrument }, bubbles: true })); } catch {}
    });
  }
}

function buildMixedScene({
  drawRows = 3,
  drawCols = 4,
  loopRows = 3,
  loopCols = 4,
  spacing = 420,
  gap = 320,
} = {}) {
  clearSceneViaSnapshot();

  const cam = getCommittedState();
  const drawW = (drawCols - 1) * spacing;
  const loopW = (loopCols - 1) * spacing;
  const totalW = drawW + loopW + gap;
  const leftX = cam.x - totalW / 2;
  const drawCenterX = leftX + drawW / 2;
  const loopCenterX = leftX + drawW + gap + loopW / 2;
  const centerY = cam.y;

  createToyGrid({ toyType: 'drawgrid', rows: drawRows, cols: drawCols, spacing, centerX: drawCenterX, centerY });
  createToyGrid({ toyType: 'loopgrid', rows: loopRows, cols: loopCols, spacing, centerX: loopCenterX, centerY });
  return true;
}

function makeToyRandomiseOnceScript({
  selector,
  atMs = 250,
  seed = 1337,
  useSeededRandom = true,
  eventName = 'toy-random-notes',
  eventNames = null,
  readyCheck = null,
  retryMs = 250,
  timeoutMs = 4000,
  repeatCount = 1,
  repeatEveryMs = 400,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);
  const sel = selector || '.toy-panel';
  const events = (Array.isArray(eventNames) && eventNames.length) ? eventNames : [eventName];
  const retryEvery = Math.max(50, Number(retryMs) || 250);
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  const repeats = Math.max(1, Math.round(repeatCount || 1));
  const repeatEvery = Math.max(80, Number(repeatEveryMs) || 400);

  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    if (!step.__firstTryMs) step.__firstTryMs = tMs;
    if (timeout > 0 && (tMs - step.__firstTryMs) > timeout) {
      step.__didFire = true;
      return;
    }

    const panels = document.querySelectorAll(sel);
    if (!panels || panels.length === 0) return;
    if (typeof readyCheck === 'function') {
      let allReady = true;
      panels.forEach((panel) => {
        try { if (!readyCheck(panel)) allReady = false; } catch { allReady = false; }
      });
      if (!allReady) {
        const k = Math.floor((tMs - fireAt) / retryEvery);
        if (k !== step.__lastRetryK) step.__lastRetryK = k;
        return;
      }
    }

    if (!step.__fireStartMs) step.__fireStartMs = tMs;

    const fire = () => {
      panels.forEach((panel) => {
        for (const evt of events) {
          try { panel.dispatchEvent(new CustomEvent(evt, { bubbles: true })); } catch {}
        }
      });
    };

    const k = Math.floor((tMs - step.__fireStartMs) / repeatEvery);
    if (k !== step.__lastFireK && k < repeats) {
      step.__lastFireK = k;
      if (useSeededRandom) {
        const prev = Math.random;
        let s = (seed + k * 1013904223) >>> 0;
        Math.random = () => {
          s = (1664525 * s + 1013904223) >>> 0;
          return s / 4294967296;
        };
        try {
          fire();
        } finally {
          Math.random = prev;
        }
      } else {
        fire();
      }
    }
    if (k >= (repeats - 1)) step.__didFire = true;
  };
}

function makeToyClearOnceScript({
  selector,
  atMs = 250,
  readyCheck = null,
  retryMs = 250,
  timeoutMs = 4000,
  repeatCount = 1,
  repeatEveryMs = 400,
} = {}) {
  return makeToyRandomiseOnceScript({
    selector,
    atMs,
    useSeededRandom: false,
    eventName: 'toy-clear',
    readyCheck,
    retryMs,
    timeoutMs,
    repeatCount,
    repeatEveryMs,
  });
}

function silenceDrawgridPanels(panelIds) {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') return false;
  const ids = new Set(panelIds || []);
  if (ids.size === 0) return false;

  let changed = 0;
  try {
    const snap = P.getSnapshot();
    const toys = Array.isArray(snap?.toys) ? snap.toys : [];
    for (const t of toys) {
      const id = t?.id || t?.toyId;
      if (!id || !ids.has(id)) continue;
      t.state = t.state || {};
      t.state.strokes = [];
      t.state.manualOverrides = [];
      const nodes = t.state.nodes || {};
      nodes.list = [];
      nodes.active = [];
      nodes.disabled = [];
      nodes.groups = [];
      t.state.nodes = nodes;
      changed++;
      }
    if (!changed) return false;
    const ok = !!P.applySnapshot(snap);
    if (!ok) return false;
      try {
        try {
          if (typeof isRunning === 'function' && typeof startTransport === 'function') {
            if (!isRunning()) startTransport();
          }
        } catch {}
        window.updateAllToys?.();
        window.scheduleAllToysRedraw?.();
        window.requestAnimationFrame?.(() => {
          window.updateAllToys?.();
          window.scheduleAllToysRedraw?.();
        });
      } catch {}
      try {
        ids.forEach((id) => {
          const panel = document.getElementById(id);
          if (!panel) return;
          panel.dispatchEvent(new CustomEvent('toy-clear', {
            detail: { user: true, reason: 'perf-empty' },
            bubbles: true,
          }));
        });
      } catch {}
      try { window.Persistence?.markDirty?.(); } catch {}
    return true;
  } catch {
    return false;
  }
}

function makeDrawgridSilenceOnceScript({
  selector,
  atMs = 250,
  clearEvery = null,
  readyCheck = null,
  retryMs = 250,
  timeoutMs = 4000,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);
  const sel = selector || '.toy-panel[data-toy="drawgrid"]';
  const every = Number.isFinite(clearEvery) ? Math.max(1, Math.floor(clearEvery)) : null;
  const retryEvery = Math.max(50, Number(retryMs) || 250);
  const timeout = Math.max(0, Number(timeoutMs) || 0);

  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    if (!step.__firstTryMs) step.__firstTryMs = tMs;
    if (timeout > 0 && (tMs - step.__firstTryMs) > timeout) {
      step.__didFire = true;
      return;
    }

    const panels = document.querySelectorAll(sel);
    if (!panels || panels.length === 0) return;
    if (typeof readyCheck === 'function') {
      let allReady = true;
      panels.forEach((panel) => {
        try { if (!readyCheck(panel)) allReady = false; } catch { allReady = false; }
      });
      if (!allReady) {
        const k = Math.floor((tMs - fireAt) / retryEvery);
        if (k !== step.__lastRetryK) step.__lastRetryK = k;
        return;
      }
    }

    const ids = [];
    panels.forEach((panel, idx) => {
      if (every && (idx % every !== 0)) return;
      if (panel?.id) ids.push(panel.id);
    });
    if (ids.length > 0) silenceDrawgridPanels(ids);
    step.__didFire = true;
  };
}

function makeToyClearSubsetOnceScript({
  selector,
  atMs = 250,
  clearEvery = 4,
  readyCheck = null,
  retryMs = 250,
  timeoutMs = 4000,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);
  const sel = selector || '.toy-panel';
  const every = Math.max(1, Math.floor(clearEvery) || 1);
  const retryEvery = Math.max(50, Number(retryMs) || 250);
  const timeout = Math.max(0, Number(timeoutMs) || 0);

  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    if (!step.__firstTryMs) step.__firstTryMs = tMs;
    if (timeout > 0 && (tMs - step.__firstTryMs) > timeout) {
      step.__didFire = true;
      return;
    }

    const panels = document.querySelectorAll(sel);
    if (!panels || panels.length === 0) return;
    if (typeof readyCheck === 'function') {
      let allReady = true;
      panels.forEach((panel) => {
        try { if (!readyCheck(panel)) allReady = false; } catch { allReady = false; }
      });
      if (!allReady) {
        const k = Math.floor((tMs - fireAt) / retryEvery);
        if (k !== step.__lastRetryK) step.__lastRetryK = k;
        return;
      }
    }

    panels.forEach((panel, idx) => {
      if (idx % every !== 0) return;
      try { panel.dispatchEvent(new CustomEvent('toy-clear', { bubbles: true })); } catch {}
    });
    step.__didFire = true;
  };
}

function clearPanelChainData(panel) {
  if (!panel || !panel.dataset) return;
  try {
    delete panel.dataset.nextToyId;
    delete panel.dataset.prevToyId;
    delete panel.dataset.chainHasChild;
    delete panel.dataset.chainParent;
    delete panel.dataset.chainActive;
  } catch {}
}

function linkPanelsIntoChains(panels, { chainLength = 4 } = {}) {
  const list = Array.from(panels || []).filter((panel) => panel && panel.id);
  if (list.length < 2) return;
  list.forEach(clearPanelChainData);

  const size = Math.max(2, Math.floor(chainLength) || 2);
  for (let i = 0; i < list.length; i += size) {
    const chunk = list.slice(i, i + size);
    chunk.forEach((panel) => {
      if (panel?.dataset) {
        panel.dataset.chainActive = 'false';
        panel.dataset.autoplay = 'chain';
      }
    });
    for (let k = 0; k < chunk.length - 1; k++) {
      const a = chunk[k];
      const b = chunk[k + 1];
      if (!a?.id || !b?.id) continue;
      a.dataset.nextToyId = b.id;
      a.dataset.chainHasChild = '1';
      b.dataset.prevToyId = a.id;
      b.dataset.chainParent = a.id;
    }
    const head = chunk[0];
    if (head?.dataset) {
      head.dataset.chainActive = 'true';
      try { head.dispatchEvent(new CustomEvent('chain:set-active', { bubbles: true })); } catch {}
    }
  }

  try {
    window.updateChains?.();
    window.updateAllChainUIs?.();
    window.scheduleChainRedraw?.();
  } catch {}
}

function makeChainOnceScript({
  selector,
  chainLength = 4,
  atMs = 350,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);
  const sel = selector || '.toy-panel';
  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    const panels = document.querySelectorAll(sel);
    if (!panels || panels.length < 2) return;
    linkPanelsIntoChains(panels, { chainLength });
    step.__didFire = true;
  };
}

function makeEnsureTransportScript({ atMs = 400 } = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);
  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    step.__didFire = true;
    try { if (typeof startTransport === 'function') startTransport(); } catch {}
  };
}

async function runP2a() {
  // Static: no pan/zoom, no overview.
  const step = () => {};
  await runVariant('P2a_particles_static', step, 'Running P2a (static)?O');
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
  await runVariant('P2b_particles_panzoom', step, 'Running P2b (pan/zoom)?O');
}

async function runP2c() {
  // Overview spam only: no camera motion.
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P2c_particles_overview', step, 'Running P2c (overview spam)?O');
}

async function runP2d() {
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
  await runVariantPlaying('P2d_drums_panzoom', step, 'Running P2d (drums pan/zoom)...');
}

async function runP3a() {
  const step = () => {};
  await runVariant('P3a_drawgrid_static', step, 'Running P3a (static)?O');
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
  await runVariant('P3b_drawgrid_panzoom', step, 'Running P3b (pan/zoom)?O');
}

async function runP3c() {
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P3c_drawgrid_overview', step, 'Running P3c (overview spam)?O');
}

async function runP3d() {
  const step = makeOverviewOnceScript({
    idleMs: 2000,
    onMs: 6000,
  });
  await runVariant('P3d_drawgrid_overview_once', step, 'Running P3d (overview once)?O');
}
async function runP3e() {
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(randOnce);
  await withTempAnchorDisabled(false, async () => {
    await runVariantPlaying(
      'P3e_drawgrid_playing_rand_once_anchor_on',
      step,
      'Running P3e (playing + randomise once, anchor ON)...'
    );
  });
}

async function runP3e2() {
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(randOnce);
  await withTempAnchorDisabled(true, async () => {
    await runVariantPlaying(
      'P3e2_drawgrid_playing_rand_once_anchor_off',
      step,
      'Running P3e2 (playing + randomise once, anchor OFF)...'
    );
  });
}

  async function runP3f() {
    const prevDisableOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
    const prevOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
    const prevOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
    const prevDisableChainWork = window.__PERF_DISABLE_CHAIN_WORK;
    const forceOverlays =
      !window.__PERF_DG_DISABLE_OVERLAYS &&
      !window.__PERF_DG_OVERLAY_CORE_OFF &&
      !window.__PERF_DG_OVERLAY_STROKES_OFF;
    try {
      window.__PERF_DISABLE_CHAIN_WORK = false;
      if (forceOverlays) {
        window.__PERF_DG_DISABLE_OVERLAYS = false;
        window.__PERF_DG_OVERLAY_CORE_OFF = false;
        window.__PERF_DG_OVERLAY_STROKES_OFF = false;
      }
    } catch {}
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
    await withTempAnchorDisabled(false, async () => {
      // IMPORTANT: variants like runP3fNoParticles/runP3fNoOverlays wrap runP3f()
      // and set window.__PERF_RUN_TAG. If we don't bake that into the label,
      // perf-lab-results.json ends up with duplicate labels that are hard to compare.
      const __runTag = (() => {
        try { return window.__PERF_RUN_TAG; } catch { return null; }
      })();
      const __baseLabel = 'P3f_drawgrid_playing_panzoom_rand_once_anchor_on';
      const __label = (__runTag && typeof __runTag === 'string' && __runTag.trim())
        ? `${__baseLabel}__${__runTag.trim()}`
        : __baseLabel;
      await runVariantPlaying(
        __label,
        step,
        'Running P3f (playing pan/zoom + randomise once, anchor ON)...'
      );
    });
    try { window.__PERF_DISABLE_CHAIN_WORK = prevDisableChainWork; } catch {}
    try {
      window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlays;
      window.__PERF_DG_OVERLAY_CORE_OFF = prevOverlayCore;
      window.__PERF_DG_OVERLAY_STROKES_OFF = prevOverlayStrokes;
    } catch {}
  }

async function runP3fShort() {
  // Short probe run: useful for trace-on console correlation.
  const prev = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fShort'; } catch {}
  await runP3f();
  try { window.__PERF_LAB_DURATION_MS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

// Focus P3f: tuned for "we need motion NOW" and longer sampling time.
// This avoids the problem where warmup + idle consume most of the short run.
async function runP3fFocus() {
  const prevDisableOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
  const prevOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
  const prevDisableChainWork = window.__PERF_DISABLE_CHAIN_WORK;
  const forceOverlays =
    !window.__PERF_DG_DISABLE_OVERLAYS &&
    !window.__PERF_DG_OVERLAY_CORE_OFF &&
    !window.__PERF_DG_OVERLAY_STROKES_OFF;
  try {
    window.__PERF_DISABLE_CHAIN_WORK = false;
    if (forceOverlays) {
      window.__PERF_DG_DISABLE_OVERLAYS = false;
      window.__PERF_DG_OVERLAY_CORE_OFF = false;
      window.__PERF_DG_OVERLAY_STROKES_OFF = false;
    }
  } catch {}

  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 500,
    panMs: 9000,
    zoomMs: 9000,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);

  await withTempAnchorDisabled(false, async () => {
    const __runTag = (() => { try { return window.__PERF_RUN_TAG; } catch { return null; } })();
    const __baseLabel = 'P3f_focus_drawgrid_playing_panzoom_rand_once_anchor_on';
    const __label = (__runTag && typeof __runTag === 'string' && __runTag.trim())
      ? `${__baseLabel}__${__runTag.trim()}`
      : __baseLabel;
    await runVariantPlaying(
      __label,
      step,
      'Running P3f Focus (playing pan/zoom + randomise once, anchor ON)...'
    );
  });

  try { window.__PERF_DISABLE_CHAIN_WORK = prevDisableChainWork; } catch {}
  try {
    window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlays;
    window.__PERF_DG_OVERLAY_CORE_OFF = prevOverlayCore;
    window.__PERF_DG_OVERLAY_STROKES_OFF = prevOverlayStrokes;
  } catch {}
}

async function runP3fFocusShort() {
  // Focus probe: long enough to meaningfully pan/zoom, but still fast-ish.
  const prev = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const hadTag = (prevTag && typeof prevTag === 'string' && prevTag.trim());
  try { window.__PERF_LAB_DURATION_MS = 26000; } catch {}
  // IMPORTANT: allow wrapper runs (NoOverlays/NoParticles/etc.) to set their own tag.
  try { if (!hadTag) window.__PERF_RUN_TAG = 'P3fFocus'; } catch {}
  await runP3fFocus();
  try { window.__PERF_LAB_DURATION_MS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fFocusShort2() {
  // Same as runP3fFocusShort but with a different tag so we can compare run-to-run noise.
  const prevTag = window.__PERF_RUN_TAG;
  const prev = window.__PERF_LAB_DURATION_MS;
  try { window.__PERF_LAB_DURATION_MS = 26000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fFocus2'; } catch {}
  await runP3fFocus();
  try { window.__PERF_LAB_DURATION_MS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fMultiCanvasFocusShort() {
  // Focus A/B:
  // - rebuild P3Focus with multi-canvas (single-canvas OFF)
  // - run the same focus script
  // - rebuild back to baseline (single-canvas ON) so subsequent focus runs are comparable
  const prevTag = window.__PERF_RUN_TAG;
  const prevSingle = (typeof window !== 'undefined') ? window.__DG_SINGLE_CANVAS : undefined;

  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = false; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fFocus_MultiCanvas'; } catch {}

  // IMPORTANT: DrawGrid reads canvas topology at creation time.
  // So to actually A/B, we must rebuild the focus scene when toggling.
  await buildP3Focus();
  await warmupFirstAppearance();
  await warmupSettle();
  await runP3fFocusShort();

  // Restore baseline for later variants in AUTO_FOCUS_QUEUE.
  // IMPORTANT: default to multi-canvas if we don't have a previous value.
  // Single-canvas is a topology change and can blank visuals if DrawGrid's composite path regresses.
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = (prevSingle !== undefined) ? prevSingle : false; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
  await buildP3Focus();
  await warmupFirstAppearance();
  await warmupSettle();
}

async function runP3fNoOverlaysFocusShort() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevDisableOverlaysDG = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevDisableOverlaysGeneric = window.__PERF_DISABLE_OVERLAYS;
  // IMPORTANT: some paths read the generic toggle, others read the DG-specific one.
  // Set both so the run truly isolates overlays.
  try { window.__PERF_DG_DISABLE_OVERLAYS = true; } catch {}
  try { window.__PERF_DISABLE_OVERLAYS = true; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fFocus_NoOverlays'; } catch {}
  await runP3fFocusShort();
  try { window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlaysDG; } catch {}
  try { window.__PERF_DISABLE_OVERLAYS = prevDisableOverlaysGeneric; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fNoParticlesFocusShort() {
  const prevTag = window.__PERF_RUN_TAG;
  const prev = window.__PERF_DG_DISABLE_PARTICLES;
  try { window.__PERF_DG_DISABLE_PARTICLES = true; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fFocus_NoParticles'; } catch {}
  await runP3fFocusShort();
  try { window.__PERF_DG_DISABLE_PARTICLES = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fShort2() {
  // Same as P3fShort but with a different tag so we can compare run-to-run noise.
  const prev = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fShort2'; } catch {}
  await runP3f();
  try { window.__PERF_LAB_DURATION_MS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function warmupFirstAppearance() {
  // Reduce variance from first-time paints:
  // - forces initial canvas allocations
  // - triggers first raster/composite passes
  // - surfaces anything that only happens when toys first appear
  setStatus('Warmup: first appearance');
  const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(() => fn((performance?.now?.() ?? Date.now())), 16));
  const waitRafs = (n) => new Promise((resolve) => {
    let left = Math.max(0, n|0);
    const step = () => {
      left--;
      if (left <= 0) return resolve();
      raf(step);
    };
    raf(step);
  });
  const waitMs = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms|0)));

  try { overviewMode(true); } catch {}
  await waitRafs(6);
  // Small settle to allow async decode/compositor catches to land outside sampling.
  await waitMs(120);
  try { overviewMode(false); } catch {}
  await waitRafs(6);
  await waitMs(120);
  setStatus('Warmup: done');
}

async function warmupSettle() {
  // Purpose: reduce run-to-run variance that comes from async decode, compositor catch-up,
  // and late style/layout work landing immediately after first-appearance warmup.
  //
  // IMPORTANT: This is NOT trying to "improve" perf, only to make measurements stable.
  // Keep it short and tunable.
  const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(() => fn((performance?.now?.() ?? Date.now())), 16));
  const waitRafs = (n) => new Promise((resolve) => {
    let left = Math.max(0, n|0);
    const step = () => {
      left--;
      if (left <= 0) return resolve();
      raf(step);
    };
    raf(step);
  });
  const waitMs = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms|0)));

  const settleMs = (() => {
    const v = window.__PERF_WARMUP_SETTLE_MS;
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 700;
  })();
  const settleRafs = (() => {
    const v = window.__PERF_WARMUP_SETTLE_RAFS;
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? (v|0) : 12;
  })();

  setStatus(`Warmup: settle (${settleMs}ms, ${settleRafs}rafs)`);
  // Give the browser a small idle window, then a few RAFs to flush any pending visual work.
  await waitMs(settleMs);
  await waitRafs(settleRafs);
  setStatus('Warmup: settle done');
}

async function runP3fNoOverlaysShort() {
  // Short probe run with DrawGrid overlays disabled.
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevNoOverlaysGeneric = window.__PERF_DISABLE_OVERLAYS;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoOverlaysShort'; } catch {}
  window.__PERF_DG_DISABLE_OVERLAYS = true;
  // Keep result flags honest (PerfHarness often reads the generic flag).
  window.__PERF_DISABLE_OVERLAYS = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_DG_DISABLE_OVERLAYS = prevNoOverlays;
    window.__PERF_DISABLE_OVERLAYS = prevNoOverlaysGeneric;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3fNoOverlaysShort2() {
  // Same as P3fNoOverlaysShort but with a different tag for run-to-run variance checks.
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevNoOverlaysGeneric = window.__PERF_DISABLE_OVERLAYS;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoOverlaysShort2'; } catch {}
  window.__PERF_DG_DISABLE_OVERLAYS = true;
  // Keep result flags honest (PerfHarness often reads the generic flag).
  window.__PERF_DISABLE_OVERLAYS = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_DG_DISABLE_OVERLAYS = prevNoOverlays;
    window.__PERF_DISABLE_OVERLAYS = prevNoOverlaysGeneric;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3fNoParticlesShort() {
  // Short probe run with particle fields disabled (aimed at frame.nonScript / raster pressure).
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoParticles = window.__PERF_DG_DISABLE_PARTICLES;
  const prevParticleDbg = window.__PERF_PARTICLE_DBG;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoParticlesShort'; } catch {}
  try {
    window.__PERF_DG_DISABLE_PARTICLES = true;
    // Keep true for consistency with existing perf scripts (some paths gate on this).
    window.__PERF_PARTICLE_DBG = true;
    await runP3f();
  } finally {
    window.__PERF_DG_DISABLE_PARTICLES = prevNoParticles;
    window.__PERF_PARTICLE_DBG = prevParticleDbg;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3fNoParticlesShort2() {
  // Same as P3fNoParticlesShort but with a different tag for run-to-run variance checks.
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoParticles = window.__PERF_DG_DISABLE_PARTICLES;
  const prevParticleDbg = window.__PERF_PARTICLE_DBG;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoParticlesShort2'; } catch {}
  try {
    window.__PERF_DG_DISABLE_PARTICLES = true;
    window.__PERF_PARTICLE_DBG = true;
    await runP3f();
  } finally {
    window.__PERF_DG_DISABLE_PARTICLES = prevNoParticles;
    window.__PERF_PARTICLE_DBG = prevParticleDbg;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3fNoOverlayCoreShort() {
  // Short probe run with DrawGrid overlay CORE disabled.
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prev = window.__PERF_DG_OVERLAY_CORE_OFF;
  const prevGeneric = window.__PERF_DISABLE_OVERLAY_CORE;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoOverlayCoreShort'; } catch {}
  window.__PERF_DG_OVERLAY_CORE_OFF = true;
  // Keep result flags honest (PerfHarness often reads the generic flag).
  window.__PERF_DISABLE_OVERLAY_CORE = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_DG_OVERLAY_CORE_OFF = prev;
    window.__PERF_DISABLE_OVERLAY_CORE = prevGeneric;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3fNoOverlayStrokesShort() {
  // Short probe run with DrawGrid overlay STROKES disabled.
  const prevDur = window.__PERF_LAB_DURATION_MS;
  const prevTag = window.__PERF_RUN_TAG;
  const prev = window.__PERF_DG_OVERLAY_STROKES_OFF;
  const prevGeneric = window.__PERF_DISABLE_OVERLAY_STROKES;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fNoOverlayStrokesShort'; } catch {}
  window.__PERF_DG_OVERLAY_STROKES_OFF = true;
  // Keep result flags honest (PerfHarness often reads the generic flag).
  window.__PERF_DISABLE_OVERLAY_STROKES = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_DG_OVERLAY_STROKES_OFF = prev;
    window.__PERF_DISABLE_OVERLAY_STROKES = prevGeneric;
    try { window.__PERF_LAB_DURATION_MS = prevDur; } catch {}
    try { window.__PERF_RUN_TAG = prevTag; } catch {}
  }
}

async function runP3PauseDomProbe() {
  // Goal: deterministically test "Play → Pause → Wait" to catch DOM-in-RAF spam while paused.
  // Best used with traceDomInRaf enabled.
  const prev = window.__PERF_LAB_DURATION_MS;
  try { window.__PERF_LAB_DURATION_MS = 12000; } catch {}

  // Ensure starting from stopped for determinism.
  try { stopTransport(); } catch {}

  let didStart = false;
  let didStop = false;

  const step = (t) => {
    // Start immediately
    if (!didStart) {
      didStart = true;
      try { startTransport(); } catch {}
    }
    // Pause after ~2s
    if (!didStop && t >= 2000) {
      didStop = true;
      try { stopTransport(); } catch {}
    }
    // After this we just sit paused until the benchmark ends.
  };

  try {
    await runVariant(
      'P3_pause_dom_probe_play_pause_wait',
      step,
      'Running Pause DOM-in-RAF Probe (Play → Pause → Wait)…'
    );
  } finally {
    try { stopTransport(); } catch {}
    try {
      if (prev == null) delete window.__PERF_LAB_DURATION_MS;
      else window.__PERF_LAB_DURATION_MS = prev;
    } catch {}
  }
}

async function autoPauseDom() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await runAuto({
    clear: true,
    save: true,
    download: true,
    traceDomInRaf: true,
    traceCanvasResize: false,
    // Make the probe deterministic: no auto gesture/quality modulation.
    // Also enforces your "no frame skipping" preference for the probe itself.
    gestureAutoLock: true,
    particleToggles: {
      gestureDrawModulo: 1,
      gestureFieldModulo: 1,
    },
    downloadName: `perf-lab-pause-dom-probe-${ts}.json`,
    notes: 'Auto probe: enable Trace DOM-in-RAF; build P3; run play→pause→wait benchmark to catch DOM-in-RAF spam while paused.',
    queue: [
      'buildP3',
      'runP3PauseDomProbe',
    ],
  });
}

async function runP3fPlayheadSeparateOff() {
  const prev = window.__DG_PLAYHEAD_SEPARATE_CANVAS;
  const prevTag = window.__PERF_RUN_TAG;
  try { window.__DG_PLAYHEAD_SEPARATE_CANVAS = false; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fPlayheadSeparateOff'; } catch {}
  await runP3f();
  try { window.__DG_PLAYHEAD_SEPARATE_CANVAS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fPlayheadSeparateOn() {
  const prev = window.__DG_PLAYHEAD_SEPARATE_CANVAS;
  const prevTag = window.__PERF_RUN_TAG;
  try { window.__DG_PLAYHEAD_SEPARATE_CANVAS = true; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fPlayheadSeparateOn'; } catch {}
  await runP3f();
  try { window.__DG_PLAYHEAD_SEPARATE_CANVAS = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3fPlayheadEvery4() {
  const prev = window.__PERF_DG_PLAYHEAD_EVERY;
  const prevTag = window.__PERF_RUN_TAG;
  try { window.__PERF_DG_PLAYHEAD_EVERY = 4; } catch {}
  try { window.__PERF_RUN_TAG = 'P3fPlayheadEvery4'; } catch {}
  await runP3f();
  try { window.__PERF_DG_PLAYHEAD_EVERY = prev; } catch {}
  try { window.__PERF_RUN_TAG = prevTag; } catch {}
}

async function runP3f2() {
  try { window.__PERF_DISABLE_CHAIN_WORK = true; } catch {}
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(true, async () => {
    await runVariantPlaying(
      'P3f2_drawgrid_playing_panzoom_rand_once_anchor_off',
      step,
      'Running P3f2 (playing pan/zoom + randomise once, anchor OFF)...'
    );
  });
  try { window.__PERF_DISABLE_CHAIN_WORK = false; } catch {}
}

async function runP3fEmptyNoNotes() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevDisableOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
  const prevOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
  const prevForceSequencerAll = window.__PERF_FORCE_SEQUENCER_ALL;
  const prevDisableChainWork = window.__PERF_DISABLE_CHAIN_WORK;
  const forceOverlays =
    !window.__PERF_DG_DISABLE_OVERLAYS &&
    !window.__PERF_DG_OVERLAY_CORE_OFF &&
    !window.__PERF_DG_OVERLAY_STROKES_OFF;
  window.__PERF_RUN_TAG = 'P3fEmptyNoNotes';
  try {
    window.__PERF_DISABLE_CHAIN_WORK = false;
    if (forceOverlays) {
      window.__PERF_DG_DISABLE_OVERLAYS = false;
      window.__PERF_DG_OVERLAY_CORE_OFF = false;
      window.__PERF_DG_OVERLAY_STROKES_OFF = false;
    }
    window.__PERF_FORCE_SEQUENCER_ALL = false;
  } catch {}
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const silenceNotes = makeDrawgridSilenceOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 200,
  });
  const step = composeSteps(silenceNotes, panZoom);
  try {
    await withTempAnchorDisabled(false, async () => {
      await runVariantPlaying(
        'P3f_drawgrid_playing_panzoom_no_notes_anchor_on',
        step,
        'Running P3f (playing pan/zoom, no notes, no chains, anchor ON)...'
      );
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    try { window.__PERF_DISABLE_CHAIN_WORK = prevDisableChainWork; } catch {}
    try {
      window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlays;
      window.__PERF_DG_OVERLAY_CORE_OFF = prevOverlayCore;
      window.__PERF_DG_OVERLAY_STROKES_OFF = prevOverlayStrokes;
      window.__PERF_FORCE_SEQUENCER_ALL = prevForceSequencerAll;
    } catch {}
  }
}

async function runP3fEmptyChainNoNotes() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevDisableOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
  const prevOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
  const prevForceSequencerAll = window.__PERF_FORCE_SEQUENCER_ALL;
  const prevDisableChainWork = window.__PERF_DISABLE_CHAIN_WORK;
  const forceOverlays =
    !window.__PERF_DG_DISABLE_OVERLAYS &&
    !window.__PERF_DG_OVERLAY_CORE_OFF &&
    !window.__PERF_DG_OVERLAY_STROKES_OFF;
  window.__PERF_RUN_TAG = 'P3fEmptyChainNoNotes';
  try {
    window.__PERF_DISABLE_CHAIN_WORK = false;
    if (forceOverlays) {
      window.__PERF_DG_DISABLE_OVERLAYS = false;
      window.__PERF_DG_OVERLAY_CORE_OFF = false;
      window.__PERF_DG_OVERLAY_STROKES_OFF = false;
    }
    window.__PERF_FORCE_SEQUENCER_ALL = false;
  } catch {}
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const silenceNotes = makeDrawgridSilenceOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 200,
  });
  const linkChains = makeChainOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    chainLength: 4,
    atMs: 500,
  });
  const step = composeSteps(silenceNotes, linkChains, panZoom);
  try {
    await withTempAnchorDisabled(false, async () => {
      await runVariantPlaying(
        'P3f_drawgrid_playing_panzoom_chain_no_notes_anchor_on',
        step,
        'Running P3f (playing pan/zoom, chained no notes, anchor ON)...'
      );
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    try { window.__PERF_DISABLE_CHAIN_WORK = prevDisableChainWork; } catch {}
    try {
      window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlays;
      window.__PERF_DG_OVERLAY_CORE_OFF = prevOverlayCore;
      window.__PERF_DG_OVERLAY_STROKES_OFF = prevOverlayStrokes;
      window.__PERF_FORCE_SEQUENCER_ALL = prevForceSequencerAll;
    } catch {}
  }
}

async function runP3fMixedSomeEmpty() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevDisableOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  const prevOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
  const prevOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
  const prevForceSequencerAll = window.__PERF_FORCE_SEQUENCER_ALL;
  const prevDisableChainWork = window.__PERF_DISABLE_CHAIN_WORK;
  const forceOverlays =
    !window.__PERF_DG_DISABLE_OVERLAYS &&
    !window.__PERF_DG_OVERLAY_CORE_OFF &&
    !window.__PERF_DG_OVERLAY_STROKES_OFF;
  window.__PERF_RUN_TAG = 'P3fMixedSomeEmpty';
  try {
    window.__PERF_DISABLE_CHAIN_WORK = false;
    if (forceOverlays) {
      window.__PERF_DG_DISABLE_OVERLAYS = false;
      window.__PERF_DG_OVERLAY_CORE_OFF = false;
      window.__PERF_DG_OVERLAY_STROKES_OFF = false;
    }
    window.__PERF_FORCE_SEQUENCER_ALL = false;
  } catch {}
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 160,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
  });
  const silenceSomeNotes = makeDrawgridSilenceOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 260,
    clearEvery: 4,
  });
  const linkChains = makeChainOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    chainLength: 4,
    atMs: 520,
  });
  const step = composeSteps(randOnce, silenceSomeNotes, linkChains, panZoom);
  try {
    await withTempAnchorDisabled(false, async () => {
      await runVariantPlaying(
        'P3f_drawgrid_playing_panzoom_some_empty_anchor_on',
        step,
        'Running P3f (playing pan/zoom, mostly full + some empty, anchor ON)...'
      );
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    try { window.__PERF_DISABLE_CHAIN_WORK = prevDisableChainWork; } catch {}
    try {
      window.__PERF_DG_DISABLE_OVERLAYS = prevDisableOverlays;
      window.__PERF_DG_OVERLAY_CORE_OFF = prevOverlayCore;
      window.__PERF_DG_OVERLAY_STROKES_OFF = prevOverlayStrokes;
      window.__PERF_FORCE_SEQUENCER_ALL = prevForceSequencerAll;
    } catch {}
  }
}

async function runP3fNoPaint() {
  const prevTag = window.__PERF_RUN_TAG;
  window.__PERF_RUN_TAG = 'P3fNoPaint';
  try {
    await withNoPaint(async () => {
      await runP3f();
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
  }
}

async function runP3fNoDom() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoDom = window.__PERF_NO_DOM_UPDATES;
  window.__PERF_RUN_TAG = 'P3fNoDom';
  window.__PERF_NO_DOM_UPDATES = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_NO_DOM_UPDATES = prevNoDom;
  }
}

async function runP3fNoGrid() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoGrid = window.__PERF_DG_DISABLE_GRID;
  window.__PERF_RUN_TAG = 'P3fNoGrid';
  window.__PERF_DG_DISABLE_GRID = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_DG_DISABLE_GRID = prevNoGrid;
  }
}

async function runP3fNoParticles() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoParticles = window.__PERF_DG_DISABLE_PARTICLES;
  const prevParticleDbg = window.__PERF_PARTICLE_DBG;
  window.__PERF_RUN_TAG = 'P3fNoParticles';
  try {
    window.__PERF_DG_DISABLE_PARTICLES = true;
    window.__PERF_PARTICLE_DBG = true;
    await runP3f();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_DG_DISABLE_PARTICLES = prevNoParticles;
    window.__PERF_PARTICLE_DBG = prevParticleDbg;
  }
}

async function runP3fNoOverlays() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoOverlays = window.__PERF_DG_DISABLE_OVERLAYS;
  window.__PERF_RUN_TAG = 'P3fNoOverlays';
  window.__PERF_DG_DISABLE_OVERLAYS = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_DG_DISABLE_OVERLAYS = prevNoOverlays;
  }
}

  async function runP3fNoOverlayStrokes() {
    const prevTag = window.__PERF_RUN_TAG;
    const prevNoOverlayStrokes = window.__PERF_DG_OVERLAY_STROKES_OFF;
    window.__PERF_RUN_TAG = 'P3fNoOverlayStrokes';
    window.__PERF_DG_OVERLAY_STROKES_OFF = true;
    try {
      await runP3f();
    } finally {
      window.__PERF_RUN_TAG = prevTag;
      window.__PERF_DG_OVERLAY_STROKES_OFF = prevNoOverlayStrokes;
    }
  }

  async function runP3fNoOverlayCore() {
    const prevTag = window.__PERF_RUN_TAG;
    const prevNoOverlayCore = window.__PERF_DG_OVERLAY_CORE_OFF;
    window.__PERF_RUN_TAG = 'P3fNoOverlayCore';
    window.__PERF_DG_OVERLAY_CORE_OFF = true;
    try {
      await runP3f();
    } finally {
      window.__PERF_RUN_TAG = prevTag;
      window.__PERF_DG_OVERLAY_CORE_OFF = prevNoOverlayCore;
    }
  }

  async function runP3fParticleProfile() {
    const prevTag = window.__PERF_RUN_TAG;
    const prevProfile = window.__PERF_PARTICLE_FIELD_PROFILE;
    window.__PERF_RUN_TAG = 'P3fParticleProfile';
    window.__PERF_PARTICLE_FIELD_PROFILE = true;
    try {
      await runP3f();
    } finally {
      window.__PERF_RUN_TAG = prevTag;
      window.__PERF_PARTICLE_FIELD_PROFILE = prevProfile;
    }
  }

  async function runP3fFlatLayers() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevFlat = window.__PERF_DRAWGRID_FLAT_LAYERS;
  window.__PERF_RUN_TAG = 'P3fFlatLayers';
  window.__PERF_DRAWGRID_FLAT_LAYERS = true;
  try {
    await runP3f();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_DRAWGRID_FLAT_LAYERS = prevFlat;
  }
}


async function runP3g() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await runVariant(
      'P3g_drawgrid_panzoom_rand_once_anchor_on',
      step,
      'Running P3g (pan/zoom + rand once, anchor ON)...'
    );
  });
}

async function runP3g2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(true, async () => {
    await runVariant(
      'P3g2_drawgrid_panzoom_rand_once_anchor_off',
      step,
      'Running P3g2 (pan/zoom + rand once, anchor OFF)...'
    );
  });
}
async function runP3h() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await withTempPerfParticles({ gestureDrawModulo: 1 }, async () => {
      await runVariantPlaying(
        'P3h_drawgrid_playing_panzoom_rand_once_anchor_on_gesture1',
        step,
        'Running P3h (playing pan/zoom + rand once, anchor ON, gesture x1)...'
      );
    });
  });
}

async function runP3h2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await withTempPerfParticles({ gestureDrawModulo: 4 }, async () => {
      await runVariantPlaying(
        'P3h2_drawgrid_playing_panzoom_rand_once_anchor_on_gesture4',
        step,
        'Running P3h2 (playing pan/zoom + rand once, anchor ON, gesture x4)...'
      );
    });
  });
}
async function runP3i() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await withTempPerfParticles({ gestureDrawModulo: 1, gestureFieldModulo: 2 }, async () => {
      await runVariantPlaying(
        'P3i_drawgrid_playing_panzoom_rand_once_anchor_on_gesture1_field2',
        step,
        'Running P3i (playing pan/zoom + rand once, anchor ON, gesture x1, field x2)...'
      );
    });
  });
}

async function runP3i2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await withTempPerfParticles({ gestureDrawModulo: 4, gestureFieldModulo: 2 }, async () => {
      await runVariantPlaying(
        'P3i2_drawgrid_playing_panzoom_rand_once_anchor_on_gesture4_field2',
        step,
        'Running P3i2 (playing pan/zoom + rand once, anchor ON, gesture x4, field x2)...'
      );
    });
  });
}
async function runP3j() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(false, async () => {
    await withTempPerfParticles({ freezeUnfocusedDuringGesture: false }, async () => {
      await runVariantPlaying(
        'P3j_drawgrid_playing_panzoom_rand_once_anchor_on_freezeOff',
        step,
        'Running P3j (playing pan/zoom + rand once, anchor ON, freeze off)...'
      );
    });
  });
}

async function runP3j2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorDisabled(true, async () => {
    await withTempPerfParticles({ freezeUnfocusedDuringGesture: false }, async () => {
      await runVariantPlaying(
        'P3j2_drawgrid_playing_panzoom_rand_once_anchor_off_freezeOff',
        step,
        'Running P3j2 (playing pan/zoom + rand once, anchor OFF, freeze off)...'
      );
    });
  });
}

async function runP3k() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const step = composeSteps(panZoom);
  try { buildParticleWorstCase({ toyType: 'drawgrid', rows: 0, cols: 0, spacing: 420 }); } catch {}
  await withTempAnchorEnabled(async () => {
    await runVariant(
      'P3k_anchor_only_panzoom_on',
      step,
      'Running P3k (anchor-only pan/zoom, anchor ON)...'
    );
  });
}

async function runP3k2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const step = composeSteps(panZoom);
  try { buildParticleWorstCase({ toyType: 'drawgrid', rows: 0, cols: 0, spacing: 420 }); } catch {}
  await withTempAnchorDisabled(true, async () => {
    await runVariant(
      'P3k_anchor_only_panzoom_off',
      step,
      'Running P3k2 (anchor-only pan/zoom, anchor OFF)...'
    );
  });
}

async function runP3l() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorEnabled(async () => {
    await runVariantPlaying(
      'P3l_drawgrid_playing_panzoom_commitspam_anchor_on',
      step,
      'Running P3l (playing pan/zoom commitspam, anchor ON)...'
    );
  });
}

async function runP3l2() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorDisabled(true, async () => {
    await runVariantPlaying(
      'P3l2_drawgrid_playing_panzoom_commitspam_anchor_off',
      step,
      'Running P3l2 (playing pan/zoom commitspam, anchor OFF)...'
    );
  });
}


async function runP3l3() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
    commitDelayMs: 0,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorEnabled(async () => {
    await runVariantPlaying(
      'P3l3_drawgrid_playing_panzoom_commitspam_delay0',
      step,
      'Running P3l3 (playing pan/zoom commitspam, delay 0)...'
    );
  });
}

async function runP3l4() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
    commitDelayMs: 80,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorEnabled(async () => {
    await runVariantPlaying(
      'P3l4_drawgrid_playing_panzoom_commitspam_delay80',
      step,
      'Running P3l4 (playing pan/zoom commitspam, delay 80)...'
    );
  });
}
async function runP3l5() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
    commitDelayMs: 80,
    commitMinGapMs: 250,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorEnabled(async () => {
    await runVariantPlaying(
      'P3l5_drawgrid_playing_panzoom_commitspam_mingap250',
      step,
      'Running P3l5 (playing pan/zoom commitspam, min gap 250)...'
    );
  });
}

async function runP3l6() {
  const panZoom = makePanZoomCommitSpamScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
    commitEveryMs: 250,
    commitDelayMs: 80,
    commitMinGapMs: 500,
  });
  const step = composeSteps(panZoom);
  await withTempAnchorEnabled(async () => {
    await runVariantPlaying(
      'P3l6_drawgrid_playing_panzoom_commitspam_mingap500',
      step,
      'Running P3l6 (playing pan/zoom commitspam, min gap 500)...'
    );
  });
}async function runP3m() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorEnabled(async () => {
    await withTempPerfAnchor({ gestureModulo: 1 }, async () => {
      await runVariantPlaying(
        'P3m_anchor_gestureModulo1',
        step,
        'Running P3m (anchor gesture x1)...'
      );
    });
  });
}

async function runP3m2() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randOnce = makeDrawgridRandomiseOnceScript({ atMs: 250, seed: 1337, useSeededRandom: true });
  const step = composeSteps(panZoom, randOnce);
  await withTempAnchorEnabled(async () => {
    await withTempPerfAnchor({ gestureModulo: 4 }, async () => {
      await runVariantPlaying(
        'P3m2_anchor_gestureModulo4',
        step,
        'Running P3m2 (anchor gesture x4)...'
      );
    });
  });
}async function runP4a() {
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
  const prevForce = window.__PERF_FORCE_SEQUENCER_ALL;
  try {
    window.__PERF_FORCE_SEQUENCER_ALL = true;
    await runVariantPlaying('P4b_loopgrid_playing_panzoom', step, 'Running P4b (playing pan/zoom)...');
  } finally {
    window.__PERF_FORCE_SEQUENCER_ALL = prevForce;
  }
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
      'Running P4o (no border pulses)?O'
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
        'Running P4p (audio+sequencer only)?O'
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
      'Running P4u (gesture render ??2)...'
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
      'Running P4v (gesture render ??4)...'
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
      'Running P4w (gesture ??4 + no tap dots)...'
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
      'Running P4x (gesture ?4 + no tap dots + chain cache)...'
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
      'Running P4e (pan/zoom, toy draw ??2)...'
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
      'Running P4g (unfocused ??2)...'
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
      'Running P4h2 (unfocused ??4)...'
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
      'Running P4n (no chains/dots/overlays)?O'
    );
  } finally {
    window.__PERF_DISABLE_LOOPGRID_RENDER = false;
    window.__PERF_DISABLE_CHAINS = false;
    window.__PERF_DISABLE_TAP_DOTS = false;
    window.__PERF_DISABLE_OVERLAYS = false;
  }
}

async function runP5a() {
  const panZoom = makePanZoomScript({
    panPx: 2400,
    zoomMin: 0.40,
    zoomMax: 1.20,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randDraw = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
    readyCheck: (panel) => !!panel?.__dgPerfWarmup,
    retryMs: 300,
    timeoutMs: 6000,
    repeatCount: 4,
    repeatEveryMs: 500,
  });
  const randLoop = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
    readyCheck: (panel) => !!panel?.__simpleRhythmVisualState,
    retryMs: 300,
    timeoutMs: 6000,
    repeatCount: 3,
    repeatEveryMs: 500,
  });
  const step = composeSteps(panZoom, randDraw, randLoop);
  await runVariantPlaying(
    'P5a_mixed_draw_loopgrid_playing_panzoom_rand',
    step,
    'Running P5a (mixed draw + loopgrid, playing pan/zoom)...'
  );
}

async function runP5b() {
  await withTempPerfParticles({ gestureDrawModulo: 2 }, async () => {
    await runP5a();
  });
}

async function runP5c() {
  await withTempPerfParticles({ gestureFieldModulo: 2 }, async () => {
    await runP5a();
  });
}

async function runP6a() {
  const panZoom = makePanZoomScript({
    panPx: 2200,
    zoomMin: 0.45,
    zoomMax: 1.15,
    idleMs: 2500,
    panMs: 13500,
    zoomMs: 13500,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randDraw = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
    readyCheck: (panel) => !!panel?.__dgPerfWarmup,
    retryMs: 300,
    timeoutMs: 6000,
    repeatCount: 4,
    repeatEveryMs: 500,
  });
  const randLoop = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
    readyCheck: (panel) => !!panel?.__simpleRhythmVisualState,
    retryMs: 300,
    timeoutMs: 6000,
    repeatCount: 3,
    repeatEveryMs: 500,
  });
  // IMPORTANT: start the *scene* playing (not just the audio transport).
  // Some stress scenes only animate/step once the UI play state is active.
  // Without this, P6a can look "not playing" even though the transport is running.
  const ensurePlay = makeEnsureTransportScript({ atMs: 600 });
  const step = composeSteps(panZoom, randDraw, randLoop, ensurePlay);
  await runVariantPlaying(
    'P6a_avg_mix_playing_panzoom_rand',
    step,
    'Running P6a (avg mix, playing pan/zoom)...'
  );
}

async function runP6b() {
  const randDraw = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
  });
  const randLoop = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
  });
  const ensurePlay = makeEnsureTransportScript({ atMs: 600 });
  const step = composeSteps(randDraw, randLoop, ensurePlay);
  await runVariantPlaying(
    'P6b_avg_mix_playing_static_rand',
    step,
    'Running P6b (avg mix, playing static)...'
  );
}

async function runP6c() {
  const panZoom = makePanZoomScript({
    panPx: 2600,
    zoomMin: 0.2,
    zoomMax: 2.2,
    idleMs: 2000,
    panMs: 12000,
    zoomMs: 15000,
    overviewToggles: 0,
    overviewSpanMs: 0,
  });
  const randDraw = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="drawgrid"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
  });
  const randLoop = makeToyRandomiseOnceScript({
    selector: '.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]',
    atMs: 300,
    seed: 1337,
    useSeededRandom: true,
    eventNames: ['toy-random', 'toy-random-notes'],
  });
  const ensurePlay = makeEnsureTransportScript({ atMs: 600 });
  const step = composeSteps(panZoom, randDraw, randLoop, ensurePlay);
  await runVariantPlaying(
    'P6c_avg_mix_playing_extreme_zoom',
    step,
    'Running P6c (avg mix, extreme zoom)...'
  );
}

async function runP6d() {
  await withTempPerfParticles({ gestureDrawModulo: 4, gestureFieldModulo: 4 }, async () => {
    await runP6c();
  });
}

async function runP6e() {
  const prev = window.__PERF_ZOOM_PROFILE;
  const prevField = window.__PERF_PARTICLE_FIELD_PROFILE;
  const prevSlow = window.__PERF_FRAME_PROF_SLOW_MS;
  const prevMax = window.__PERF_FRAME_PROF_MAX;
  window.__PERF_ZOOM_PROFILE = true;
  window.__PERF_FRAME_PROF_SLOW_MS = 0;
  window.__PERF_FRAME_PROF_MAX = 240;
  window.__PERF_PARTICLE_FIELD_PROFILE = true;
  try {
    await runP6d();
  } finally {
    window.__PERF_ZOOM_PROFILE = prev;
    window.__PERF_FRAME_PROF_SLOW_MS = prevSlow;
    window.__PERF_FRAME_PROF_MAX = prevMax;
    window.__PERF_PARTICLE_FIELD_PROFILE = prevField;
  }
}

function installNoPaintPatch() {
  if (window.__PERF_NO_PAINT_PATCH) return;
  const proto = (typeof CanvasRenderingContext2D !== 'undefined') ? CanvasRenderingContext2D.prototype : null;
  if (!proto) return;
  const methods = [
    'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'rect', 'arc', 'arcTo', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke',
    'drawImage', 'fillText', 'strokeText', 'clip',
    'save', 'restore', 'translate', 'scale', 'rotate',
    'setTransform', 'resetTransform'
  ];
  const patch = { methods: {} };
  for (const name of methods) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    patch.methods[name] = orig;
    proto[name] = function(...args) {
      if (window.__PERF_NO_PAINT) return;
      return orig.apply(this, args);
    };
  }
  window.__PERF_NO_PAINT_PATCH = patch;
}

function setNoPaintEnabled(enabled) {
  window.__PERF_NO_PAINT = !!enabled;
  if (window.__PERF_NO_PAINT) installNoPaintPatch();
}

async function withNoPaint(fn) {
  const prev = window.__PERF_NO_PAINT;
  window.__PERF_NO_PAINT_ACTIVE = true;
  setNoPaintEnabled(true);
  try { return await fn(); }
  finally {
    window.__PERF_NO_PAINT = prev;
    window.__PERF_NO_PAINT_ACTIVE = false;
  }
}

async function runP6eNoPaint() {
  const prevTag = window.__PERF_RUN_TAG;
  window.__PERF_RUN_TAG = 'P6eNoPaint';
  try {
    await withNoPaint(async () => {
      await runP6e();
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
  }
}

async function runP6ePaintOnly() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevPaintOnly = window.__PERF_PAINT_ONLY_ACTIVE;
  window.__PERF_RUN_TAG = 'P6ePaintOnly';
  window.__PERF_PAINT_ONLY_ACTIVE = true;
  try {
    await withTempPerfParticles({ skipUpdate: true, skipDraw: false }, async () => {
      await runP6e();
    });
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_PAINT_ONLY_ACTIVE = prevPaintOnly;
  }
}

async function runP6eNoDom() {
  const prevTag = window.__PERF_RUN_TAG;
  const prevNoDom = window.__PERF_NO_DOM_UPDATES;
  window.__PERF_RUN_TAG = 'P6eNoDom';
  window.__PERF_NO_DOM_UPDATES = true;
  try {
    await runP6e();
  } finally {
    window.__PERF_RUN_TAG = prevTag;
    window.__PERF_NO_DOM_UPDATES = prevNoDom;
  }
}




async function runQueue(list = []) {
  const items = Array.isArray(list) ? list : [list];
  const results = [];
  const executed = [];
  for (const item of items) {
    // Resolve by name, with defensive aliases so Auto-runs don't become no-ops
    // if someone loses an export during merges or a stale bundle is served.
    let name = (typeof item === 'string') ? item : null;
    let fn = (typeof item === 'function') ? item : (name ? window.__PerfLab?.[name] : null);

    if (typeof fn !== 'function' && name) {
      const ALIASES = {
        // Historical / merge-safe aliases:
        traceCanvasOnlyOn: 'traceOn',              // then force domInRaf OFF below
        runP3fShort: 'runP3f',
        runP3fNoOverlaysShort: 'runP3fNoOverlays',
        // Focus queue merge-safety (avoid silently skipping intended focus tests)
        runP3fMultiCanvasFocusShort: 'runP3fFocusShort',
      };
      const alt = ALIASES[name];
      if (alt && typeof window.__PerfLab?.[alt] === 'function') {
        console.warn('[PerfLab] missing test', name, '-> using alias', alt);
        fn = window.__PerfLab[alt];
        name = alt;
      }
    }

    if (typeof fn !== 'function') {
      const known = (() => {
        try { return Object.keys(window.__PerfLab || {}).sort(); } catch { return []; }
      })();
      console.warn('[PerfLab] missing test', item, { knownCount: known.length, known });
      continue;
    }

    executed.push((typeof item === 'string') ? item : (item.name || '<fn>'));
    const isBuild = (typeof item === 'string' && item.startsWith('build'));
    if (isBuild) {
      try { clearSceneViaSnapshot(); } catch {}
      lastResult = null;
    }

    // Special-case: if we fell back from traceCanvasOnlyOn -> traceOn,
    // enforce "canvas resize trace only" by disabling dom-in-raf trace.
    if (typeof item === 'string' && item === 'traceCanvasOnlyOn') {
      try {
        window.__PERF_TRACE = window.__PERF_TRACE || {};
        window.__PERF_TRACE.traceCanvasResize = true;
        window.__PERF_TRACE.traceDomInRaf = false;
      } catch {}
    }

    // Only push a result if this step actually produced a *new* one.
    // (Otherwise “toggle” steps like traceOff would duplicate the prior benchmark result.)
    const prevResult = lastResult;
    try { await fn(); } catch (err) { console.warn('[PerfLab] test failed', item, err); }
    if (!isBuild && lastResult && lastResult !== prevResult) results.push(lastResult);
  }
  // Capture what actually ran (not just what the config said).
  window.__PERF_LAB_EXECUTED_QUEUE = executed;
  lastResults = results;
  try { console.log('[PerfLab] queue results', results); } catch {}
  return results;
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
try {
  window.__PerfLab = {
    show,
    hide,
    toggle,
    warmupFirstAppearance,
    warmupSettle,
    buildP2,
    buildP2d,
    buildP3,
    buildP3Focus,
    buildP3FocusHeavy,
    buildP3Lite,
    buildP4,
    buildP4h,
    buildP5,
    buildP6,
    buildP7,
    runP2a,
    runP2b,
    runP2c,
    runP2d,
    runP3a,
    runP3b,
    runP3c,
    runP3d,
      runP3e,
      runP3e2,
    runP3f,
    runP3fShort,
    runP3fShort2,
    runP3fFocus,
    runP3fFocusShort,
    runP3fFocusShort2,
    runP3fMultiCanvasFocusShort,
    runP3fNoOverlaysFocusShort,
    runP3fNoParticlesFocusShort,
    runP3fNoOverlaysShort,
    runP3fNoOverlaysShort2,
      runP3fNoParticlesShort,
    runP3fNoParticlesShort2,
    runP3fNoOverlayCoreShort,
    runP3fNoOverlayStrokesShort,
    runP3PauseDomProbe,
    runP3fPlayheadSeparateOff,
    runP3fPlayheadSeparateOn,
    runP3fPlayheadEvery4,
    runP3f2,
    runP3fEmptyNoNotes,
    runP3fEmptyChainNoNotes,
    runP3fMixedSomeEmpty,
    runP3fNoPaint,
    runP3fNoDom,
    runP3fNoGrid,
    runP3fNoParticles,
    runP3fNoOverlays,
    runP3fNoOverlayStrokes,
    runP3fNoOverlayCore,
    runP3fParticleProfile,
    runP3fFlatLayers,
    runP3g,
    runP3g2,
    runP3h,
    runP3h2,
    runP3i,
    runP3i2,
    runP3j,
    runP3j2,
    runP3k,
    runP3k2,
    runP3l,
    runP3l2,
    runP3l3,
    runP3l4,
    runP3l5,
    runP3l6,
    runP3m,
    runP3m2,
    runP7a,
    runP7b,
    runQueue,
    runAuto,
    runP4a,
    runP4b,
    runP4o,
    runP4p,
    runP4q,
    runP4r,
    runP4s,
    runP4t,
    runP4u,
    runP4v,
    runP4w,
    runP4x,
    runP4e,
    runP4c,
    runP4d,
    runP4f,
    runP4g,
    runP4h2,
    runP4i,
    runP4j,
    runP4k,
    runP4m,
    runP4n,
    runP5a,
    runP5b,
    runP5c,
    runP6a,
    runP6b,
    runP6c,
    runP6d,
    runP6e,
    runP6eNoPaint,
    runP6ePaintOnly,
    runP6eNoDom,
    readAutoConfig,
    readAutoConfigFromFile,
    saveResultsBundle,
    postResultsBundle,
    downloadResultsBundle,
      // Demon trace toggles (so auto-queue can flip them deterministically)
      traceDprOn: async function traceDprOn() {
        try { window.__DG_REFRESH_SIZE_TRACE = true; } catch {}
        try { window.__DG_REFRESH_SIZE_TRACE_SAMPLE = false; } catch {}
        try { window.__DG_RESIZE_TRACE_SAMPLE = false; } catch {}
        try { window.__DG_EFFECTIVE_DPR_TRACE = true; } catch {}
        try { window.__FG_EFFECTIVE_DPR_TRACE = true; } catch {}
        // Ensure adaptive DPR is enabled during perf automation runs.
        try { window.__DG_ADAPTIVE_DPR_ENABLED = true; } catch {}
        try { window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE = true; } catch {}
        // IMPORTANT: do not spam console during perf runs; buffer instead.
        try { window.__PERF_TRACE_TO_CONSOLE = false; } catch {}
        try { window.__PERF_TRACE_KEEP_BUFFER = true; } catch {}
        try { if (window.__PERF_TRACE_CLEAR) window.__PERF_TRACE_CLEAR(); } catch {}
        // Quiet size-trace by default (still captured in buffer via DG/FG hooks).
        try { window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS = 800; } catch {}
        try { window.__DG_REFRESH_SIZE_TRACE_LIMIT = 200; } catch {}
        // For focus runs where only one DrawGrid is visible, allow adaptive DPR to engage (if enabled).
        try { window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE = true; } catch {}
        try {
          console.log('[PerfLab] DPR trace ENABLED', {
            __DG_REFRESH_SIZE_TRACE: !!window.__DG_REFRESH_SIZE_TRACE,
            __DG_EFFECTIVE_DPR_TRACE: !!window.__DG_EFFECTIVE_DPR_TRACE,
            __FG_EFFECTIVE_DPR_TRACE: !!window.__FG_EFFECTIVE_DPR_TRACE,
            __DG_ADAPTIVE_DPR_ENABLED: !!window.__DG_ADAPTIVE_DPR_ENABLED,
            __DG_ADAPTIVE_DPR_ALLOW_SINGLE: !!window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE,
          });
        } catch {}
      },
      traceDprOff: async function traceDprOff() {
        try { window.__DG_REFRESH_SIZE_TRACE = false; } catch {}
        try { window.__DG_EFFECTIVE_DPR_TRACE = false; } catch {}
        try { window.__FG_EFFECTIVE_DPR_TRACE = false; } catch {}
        try { console.log('[PerfLab] DPR trace DISABLED'); } catch {}
        try { window.__PERF_TRACE_KEEP_BUFFER = false; } catch {}
      },
      dgAdaptiveOff: async function dgAdaptiveOff() {
        // Force DrawGrid adaptive DPR OFF (for A/B comparisons).
        try { window.__DG_ADAPTIVE_DPR_ENABLED = false; } catch {}
        try { console.log('[PerfLab] DrawGrid adaptive DPR OFF'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      dgAdaptiveOn: async function dgAdaptiveOn() {
        // Force DrawGrid adaptive DPR ON (for A/B comparisons).
        try { window.__DG_ADAPTIVE_DPR_ENABLED = true; } catch {}
        // Allow engagement even with a single visible DrawGrid (focus runs).
        try { window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE = true; } catch {}
        try { console.log('[PerfLab] DrawGrid adaptive DPR ON'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      traceCanvasOnlyOn: async function traceCanvasOnlyOn() {
        window.__PERF_TRACE = window.__PERF_TRACE || {};
        window.__PERF_TRACE.traceCanvasResize = true;
        window.__PERF_TRACE.traceDomInRaf = false;
        try { window.__DG_RESIZE_TRACE_SAMPLE = false; } catch {}
        try { console.log('[PerfLab] traceCanvasResize ENABLED (domInRaf OFF)', { ...window.__PERF_TRACE }); } catch {}
      },
      traceOn: async function traceOn() {
        window.__PERF_TRACE = window.__PERF_TRACE || {};
        window.__PERF_TRACE.traceCanvasResize = true;
        window.__PERF_TRACE.traceDomInRaf = true;
        try { console.log('[PerfLab] demon trace ENABLED', { ...window.__PERF_TRACE }); } catch {}
      },
      traceOff: async function traceOff() {
        window.__PERF_TRACE = window.__PERF_TRACE || {};
        window.__PERF_TRACE.traceCanvasResize = false;
        window.__PERF_TRACE.traceDomInRaf = false;
        try { console.log('[PerfLab] demon trace DISABLED', { ...window.__PERF_TRACE }); } catch {}
      },
      // Focus toggles: these MUST be exported so runQueue(AUTO_FOCUS_QUEUE) can resolve them by name.
      loopRenderOff: async function loopRenderOff() {
        try { window.__PERF_DISABLE_LOOPGRID_RENDER = true; } catch {}
        try { console.log('[PerfLab] LoopGrid render: OFF'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      loopRenderOn: async function loopRenderOn() {
        try { window.__PERF_DISABLE_LOOPGRID_RENDER = false; } catch {}
        try { console.log('[PerfLab] LoopGrid render: ON'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      chainsOff: async function chainsOff() {
        try { window.__PERF_DISABLE_CHAINS = true; } catch {}
        try { console.log('[PerfLab] Chains: OFF'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      chainsOn: async function chainsOn() {
        try { window.__PERF_DISABLE_CHAINS = false; } catch {}
        try { console.log('[PerfLab] Chains: ON'); } catch {}
        try { syncUiFromState(); } catch {}
      },
      getResults: () => lastResults,
      getBundle: () => lastBundle,
      clearResults: () => { lastResults = []; },
    };
} catch {}














try { scheduleAutoRun(); } catch {}
