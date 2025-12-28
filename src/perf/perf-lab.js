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
    title: 'P2 � Particles',
    build: btn('buildP2', 'Build P2: Particle Worst-Case', 'primary'),
    runs: sortByLabel([
      { act: 'runP2a', label: 'Run P2a: Static (30s)' },
      { act: 'runP2b', label: 'Run P2b: Pan/Zoom (30s)' },
      { act: 'runP2c', label: 'Run P2c: Overview (30s)' },
    ]),
  };

  const P3 = {
    title: 'P3 � DrawGrid',
    build: btn('buildP3', 'Build P3: DrawGrid Worst-Case', 'primary'),
    runs: sortByLabel([
      { act: 'runP3a', label: 'Run P3a: Static (30s)' },
      { act: 'runP3b', label: 'Run P3b: Pan/Zoom (30s)' },
      { act: 'runP3c', label: 'Run P3c: Overview (30s)' },
      { act: 'runP3d', label: 'Run P3d: Overview Once (30s)' },
      { act: 'runP3g', label: 'Run P3g: Pan/Zoom + Rand Once (Anchor ON)' },
      { act: 'runP3g2', label: 'Run P3g2: Pan/Zoom + Rand Once (Anchor OFF)' },
      { act: 'runP3h', label: 'Run P3h: Playing Pan/Zoom + Rand Once (Anchor ON, Gesture x1)' },
      { act: 'runP3h2', label: 'Run P3h2: Playing Pan/Zoom + Rand Once (Anchor ON, Gesture x4)' },
      { act: 'runP3i', label: 'Run P3i: Playing Pan/Zoom + Rand Once (Anchor ON, Gesture x1, Field x2)' },
      { act: 'runP3i2', label: 'Run P3i2: Playing Pan/Zoom + Rand Once (Anchor ON, Gesture x4, Field x2)' },
      { act: 'runP3j', label: 'Run P3j: Playing Pan/Zoom + Rand Once (Anchor ON, Freeze Off)' },
      { act: 'runP3j2', label: 'Run P3j2: Playing Pan/Zoom + Rand Once (Anchor OFF, Freeze Off)' },
      { act: 'runP3k', label: 'Run P3k: Anchor Only Pan/Zoom (Anchor ON)' },
      { act: 'runP3k2', label: 'Run P3k2: Anchor Only Pan/Zoom (Anchor OFF)' },
      { act: 'runP3l', label: 'Run P3l: Playing Pan/Zoom CommitSpam (Anchor ON)' },
      { act: 'runP3l2', label: 'Run P3l2: Playing Pan/Zoom CommitSpam (Anchor OFF)' },
      { act: 'runP3l3', label: 'Run P3l3: Playing Pan/Zoom CommitSpam (Delay 0)' },
      { act: 'runP3l4', label: 'Run P3l4: Playing Pan/Zoom CommitSpam (Delay 80)' },
      { act: 'runP3l5', label: 'Run P3l5: Playing Pan/Zoom CommitSpam (MinGap 250)' },
      { act: 'runP3l6', label: 'Run P3l6: Playing Pan/Zoom CommitSpam (MinGap 500)' },
      { act: 'runP3m', label: 'Run P3m: Playing Pan/Zoom + Rand Once (Anchor Gesture x1)' },
      { act: 'runP3m2', label: 'Run P3m2: Playing Pan/Zoom + Rand Once (Anchor Gesture x4)' },
      { act: 'runP3e',  label: 'Run P3e: Playing + Random Notes (Anchor ON)' },
      { act: 'runP3e2', label: 'Run P3e2: Playing + Random Notes (Anchor OFF)' },
      { act: 'runP3f',  label: 'Run P3f: Playing Pan/Zoom + Random Notes (Anchor ON)' },
      { act: 'runP3f2', label: 'Run P3f2: Playing Pan/Zoom + Random Notes (Anchor OFF)' },
    ]),
  };

  const P4 = {
    title: 'P4 � Chained Simple Rhythm (Loopgrid)',
    build: [
      btn('buildP4',  'Build P4: Chained Simple Rhythm (Random)', 'primary'),
      btn('buildP4h', 'Build P4H: Chained SR (Heavy Play)', 'primary'),
    ].join(''),
    runs: sortByLabel([
      { act: 'runP4a',  label: 'Run P4a: Playing Static (30s)' },
      { act: 'runP4b',  label: 'Run P4b: Playing Pan/Zoom (30s)' },
      { act: 'runP4c',  label: 'Run P4c: Playing Static (No Particle Draw)' },
      { act: 'runP4d',  label: 'Run P4d: Playing Static (No Particle Update+Draw)' },
      { act: 'runP4e',  label: 'Run P4e: Pan/Zoom (Toy Draw �2)' },
      { act: 'runP4f',  label: 'Run P4f: Pan/Zoom (Freeze Unfocused)' },
      { act: 'runP4g',  label: 'Run P4g: Pan/Zoom (Unfocused �2)' },
      { act: 'runP4h2', label: 'Run P4h2: Pan/Zoom (Unfocused �4)' },
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
      { act: 'runP4u',  label: 'Run P4u: Playing Pan/Zoom (Gesture Render �2)' },
      { act: 'runP4v',  label: 'Run P4v: Playing Pan/Zoom (Gesture Render �4)' },
      { act: 'runP4w',  label: 'Run P4w: Playing Pan/Zoom (Gesture �4 + No Tap Dots)' },
      { act: 'runP4x',  label: 'Run P4x: Pan/Zoom (Gesture �4 + No Tap Dots + Chain Cache)' },
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

  const tests = [...P2.runs, ...P3.runs, ...P4.runs, ...P5.runs, ...P6.runs];
  if (!window.__PERF_LAB_TESTS_LOGGED) {
    window.__PERF_LAB_TESTS_LOGGED = true;
    try { console.log('[perf-lab] tests:', tests.map(t => t.label)); } catch {}
  }

  const sectionsHtml = [
    section(P2.title, `${P2.build}${P2.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P3.title, `${P3.build}${P3.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P4.title, `${P4.build}${P4.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P5.title, `${P5.build}${P5.runs.map(r => btn(r.act, r.label)).join('')}`),
    section(P6.title, `${P6.build}${P6.runs.map(r => btn(r.act, r.label)).join('')}`),
  ].join('');

  ov.innerHTML = `
    <div class="perf-lab-panel">
      <div class="perf-lab-header">
        <div>
          <div class="perf-lab-title">Perf Lab</div>
          <div class="perf-lab-sub">Repeatable stress tests</div>
        </div>
        <button class="perf-lab-btn" data-act="close">?</button>
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
            <button class="perf-lab-btn" data-act="auto">Run Auto (Saved)</button>
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
    if (act === 'buildP3') await buildP3();
    if (act === 'runP3a') await runP3a();
    if (act === 'runP3b') await runP3b();
    if (act === 'runP3c') await runP3c();
    if (act === 'runP3d') await runP3d();
    if (act === 'runP3g') await runP3g();
    if (act === 'runP3g2') await runP3g2();
    if (act === 'runP3h') await runP3h();
    if (act === 'runP3h2') await runP3h2();
    if (act === 'runP3i') await runP3i();
    if (act === 'runP3i2') await runP3i2();
    if (act === 'runP3j') await runP3j();
    if (act === 'runP3j2') await runP3j2();
    if (act === 'runP3k') await runP3k();
    if (act === 'runP3k2') await runP3k2();
    if (act === 'runP3l') await runP3l();
    if (act === 'runP3l2') await runP3l2();
    if (act === 'runP3l3') await runP3l3();
    if (act === 'runP3l4') await runP3l4();
    if (act === 'runP3l5') await runP3l5();
    if (act === 'runP3l6') await runP3l6();
    if (act === 'runP3m') await runP3m();
    if (act === 'runP3m2') await runP3m2();
    if (act === 'runP3e') await runP3e();
    if (act === 'runP3e2') await runP3e2();
    if (act === 'runP3f') await runP3f();
    if (act === 'runP3f2') await runP3f2();
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
    if (act === 'buildP5') buildP5();
    if (act === 'runP5a') await runP5a();
    if (act === 'runP5b') await runP5b();
    if (act === 'runP5c') await runP5c();
    if (act === 'buildP6') await buildP6();
    if (act === 'runP6a') await runP6a();
    if (act === 'runP6b') await runP6b();
    if (act === 'runP6c') await runP6c();
    if (act === 'runP6d') await runP6d();
    if (act === 'runP6e') await runP6e();
    if (act === 'runP6eNoPaint') await runP6eNoPaint();
    if (act === 'runP6ePaintOnly') await runP6ePaintOnly();
    if (act === 'runP6eNoDom') await runP6eNoDom();
    if (act === 'auto') {
      const cfgFile = await readAutoConfigFromFile();
      const cfg = cfgFile || readAutoConfig();
      if (!cfg || !cfg.queue || !cfg.queue.length) {
        setStatus('Auto-run: no saved config');
        return;
      }
      await runAuto(cfg);
    }
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

  if (cfg.download) downloadResultsBundle(bundle, cfg.downloadName || 'perf-lab-results.json');
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
  window.__PERF_LAB_RUN_CONTEXT = 'auto';
  if (cfg.runTag != null) window.__PERF_RUN_TAG = String(cfg.runTag);
  let results;
  try {
    results = await runQueue(queue);
  } finally {
    window.__PERF_LAB_RUN_CONTEXT = __prevCtx;
    window.__PERF_RUN_TAG = __prevRunTag;
  }
  const bundle = buildResultsBundle(results, {
    queue,
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
  setStatus('Building P2�Ǫ');
  // Particles worst-case: lots of loopgrids (heavy particle fields).
  buildParticleWorstCase({ toyType: 'loopgrid', rows: 8, cols: 10, spacing: 400 });
  setStatus('P2 built');
}

async function buildP3() {
  try { clearSceneViaSnapshot(); } catch {}
  setStatus('Building P3�Ǫ');
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

function buildP4() {
  try { clearSceneViaSnapshot(); } catch {}
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

async function runVariant(label, step, statusText) {
  setStatus(statusText || `Running ${label}�Ǫ`);
  setOutput(null);
  lastResult = null;

  try { window.__PERF_CAM_BOUNDS = null; } catch {}

  // Lock particle quality so FPS-driven LOD doesn���t �ǣsave us��� during the test.
  setParticleQualityLock('ultra');

  const result = await runBenchmark({
    label,
    durationMs: 30000,
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
  const maxSamples = (typeof window !== 'undefined' && Number.isFinite(window.__PERF_FRAME_PROF_MAX))
    ? window.__PERF_FRAME_PROF_MAX
    : 120;
  const prof = makeFrameProfiler({ slowMs, maxSamples });
  window.__PerfFrameProf = prof; // so you can dump it from console
  const scriptStep = step;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let warmupDid = false;
  const profStep = (tMs, dtMs, progress) => {
    const t0 = nowMs();
    const s0 = nowMs();
    try { if (scriptStep) scriptStep(tMs, dtMs, progress); } catch {}
    let forceSample = false;
    let warmupTag = false;
    if (!warmupDid && tMs >= warmupMs * 0.5) {
      warmupDid = true;
      forceSample = true;
      warmupTag = true;
      try { forcePerfWarmup(); } catch {}
    }
    prof.mark('script', nowMs() - s0);
    const frameDt = Number.isFinite(dtMs) ? dtMs : (nowMs() - t0);
    const workMs = Math.max(0, nowMs() - t0);
    const idleMs = Math.max(0, frameDt - workMs);
    prof.endFrame(frameDt, { workMs, idleMs, forceSample, warmupTag });
  };
  setStatus(statusText || `Running ${label}...`);
  setOutput(null);
  lastResult = null;

  try { window.__PERF_CAM_BOUNDS = null; } catch {}

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
    window.__PERF_WARMUP_COUNT = 0;
  } catch {}

  const result = await runBenchmark({
    label,
    durationMs: 30000,
    warmupMs,
    step: profStep,
  });

  try {
    result.pulseCount = window.__PERF_PULSE_COUNT || 0;
    result.outlineSyncCount = window.__PERF_OUTLINE_SYNC_COUNT || 0;
    result.warmupCount = window.__PERF_WARMUP_COUNT || 0;
    result.warmupTs = window.__PERF_WARMUP_TS || null;
  } catch {}

  try {
    result.frameProfile = summarizeFrameProfile(prof.snapshot());
    result.warmupProfile = prof.getWarmup ? prof.getWarmup() : null;
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
      noPaint: !!window.__PERF_NO_PAINT,
      noPaintActive: !!window.__PERF_NO_PAINT_ACTIVE,
      paintOnlyActive: !!window.__PERF_PAINT_ONLY_ACTIVE,
      noDomUpdates: !!window.__PERF_NO_DOM_UPDATES,
      runTag: String(window.__PERF_RUN_TAG || ''),
    };
    result.gestureSkipCount = window.__PERF_LOOPGRID_GESTURE_SKIP || 0;
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
      if (frameDt >= slowMs || meta.forceSample) {
        out.push({ t: cur.t, frameDt, parts, workMs: meta.workMs, idleMs: meta.idleMs });
        if (out.length > maxSamples) out.shift();
      }
    },
    snapshot() { return out.slice(); },
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
  return !!P.applySnapshot(snap);
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
  await runVariant('P2a_particles_static', step, 'Running P2a (static)�Ǫ');
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
  await runVariant('P2b_particles_panzoom', step, 'Running P2b (pan/zoom)�Ǫ');
}

async function runP2c() {
  // Overview spam only: no camera motion.
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P2c_particles_overview', step, 'Running P2c (overview spam)�Ǫ');
}

async function runP3a() {
  const step = () => {};
  await runVariant('P3a_drawgrid_static', step, 'Running P3a (static)�Ǫ');
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
  await runVariant('P3b_drawgrid_panzoom', step, 'Running P3b (pan/zoom)�Ǫ');
}

async function runP3c() {
  const step = makeOverviewSpamScript({
    idleMs: 2000,
    toggles: 12,
    spanMs: 26000,
  });
  await runVariant('P3c_drawgrid_overview', step, 'Running P3c (overview spam)�Ǫ');
}

async function runP3d() {
  const step = makeOverviewOnceScript({
    idleMs: 2000,
    onMs: 6000,
  });
  await runVariant('P3d_drawgrid_overview_once', step, 'Running P3d (overview once)�Ǫ');
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
    await runVariantPlaying(
      'P3f_drawgrid_playing_panzoom_rand_once_anchor_on',
      step,
      'Running P3f (playing pan/zoom + randomise once, anchor ON)...'
    );
  });
}

async function runP3f2() {
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
      'Running P4o (no border pulses)�Ǫ'
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
        'Running P4p (audio+sequencer only)�Ǫ'
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
      'Running P4u (gesture render ?�2)...'
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
      'Running P4v (gesture render ?�4)...'
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
      'Running P4w (gesture ?�4 + no tap dots)...'
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
      'Running P4x (gesture �4 + no tap dots + chain cache)...'
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
      'Running P4e (pan/zoom, toy draw ?�2)...'
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
      'Running P4g (unfocused ?�2)...'
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
      'Running P4h2 (unfocused ?�4)...'
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
      'Running P4n (no chains/dots/overlays)�Ǫ'
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
  const step = composeSteps(panZoom, randDraw, randLoop);
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
  for (const item of items) {
    const fn = (typeof item === 'function') ? item : window.__PerfLab?.[item];
    if (typeof fn !== 'function') {
      console.warn('[PerfLab] missing test', item);
      continue;
    }
    if (typeof item === 'string' && item.startsWith('build')) {
      try { clearSceneViaSnapshot(); } catch {}
    }
    try { await fn(); } catch (err) { console.warn('[PerfLab] test failed', item, err); }
    if (lastResult) results.push(lastResult);
  }
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
try { window.__PerfLab = { show, hide, toggle, buildP2, buildP3, buildP4, buildP4h, buildP5, buildP6, runP2a, runP2b, runP2c, runP3a, runP3b, runP3c, runP3d, runP3e, runP3e2, runP3f, runP3f2, runP3g, runP3g2, runP3h, runP3h2, runP3i, runP3i2, runP3j, runP3j2, runP3k, runP3k2, runP3l, runP3l2, runP3l3, runP3l4, runP3l5, runP3l6, runP3m, runP3m2, runQueue, runAuto, runP4a, runP4b, runP4o, runP4p, runP4q, runP4r, runP4s, runP4t, runP4u, runP4v, runP4w, runP4x, runP4e, runP4c, runP4d, runP4f, runP4g, runP4h2, runP4i, runP4j, runP4k, runP4m, runP4n, runP5a, runP5b, runP5c, runP6a, runP6b, runP6c, runP6d, runP6e, runP6eNoPaint, runP6ePaintOnly, runP6eNoDom, readAutoConfig, readAutoConfigFromFile, saveResultsBundle, postResultsBundle, downloadResultsBundle, getResults: () => lastResults, getBundle: () => lastBundle, clearResults: () => { lastResults = []; } }; } catch {}














try { scheduleAutoRun(); } catch {}

