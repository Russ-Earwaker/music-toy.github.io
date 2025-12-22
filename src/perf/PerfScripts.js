// src/perf/PerfScripts.js
// Deterministic camera / overview scripts for repeatable perf tests.

import { getCommittedState, setGestureTransform, commitGesture } from '../zoom/ZoomCoordinator.js';
import { overviewMode } from '../overview-mode.js';

function lerp(a, b, t) { return a + (b - a) * t; }

export function makePanZoomScript({
  base = null,
  panPx = 2200,
  zoomMin = 0.45,
  zoomMax = 1.15,
  // phases in ms
  idleMs = 3000,
  panMs = 9000,
  zoomMs = 9000,
  overviewToggles = 6,
  overviewSpanMs = 9000,
}) {
  const s0 = base || getCommittedState();
  const start = { x: s0.x, y: s0.y, scale: s0.scale };

  // precompute overview toggle times (deterministic)
  const panDur = Math.max(0, Number(panMs) || 0);
  const zoomDur = Math.max(0, Number(zoomMs) || 0);
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const overviewDur = Math.max(0, Number(overviewSpanMs) || 0);

  const overviewStart = idleDur + panDur + zoomDur;
  const toggleEvery = (overviewToggles > 0 && overviewDur > 0) ? (overviewDur / overviewToggles) : 0;

function setGesturing(on) {
  try { document.body.classList.toggle('is-gesturing', !!on); } catch {}
  try { window.__GESTURE_ACTIVE = !!on; } catch {}
}

  return function step(tMs /*, dtMs, progress */) {
    // Phase 1: idle (do nothing)
    if (tMs < idleDur) {
      setGesturing(false);
      return;
    }

    // Phase 2: pan (sinusoidal path)
    if (panDur > 0 && tMs < idleDur + panDur) {
      setGesturing(true);
      const u = (tMs - idleDur) / panDur; // 0..1
      const angle = u * Math.PI * 2;
      const x = start.x + Math.cos(angle) * panPx;
      const y = start.y + Math.sin(angle * 0.9) * panPx;
      setGestureTransform({ x, y, scale: start.scale });
      return;
    }

    // Phase 3: zoom in/out while gently panning
    if (zoomDur > 0 && tMs < idleDur + panDur + zoomDur) {
      setGesturing(true);
      const u = (tMs - (idleDur + panDur)) / zoomDur;
      const wobble = (Math.sin(u * Math.PI * 2) * 0.5 + 0.5); // 0..1
      const scale = lerp(zoomMin, zoomMax, wobble);
      const x = start.x + Math.cos(u * Math.PI * 2) * (panPx * 0.35);
      const y = start.y + Math.sin(u * Math.PI * 2) * (panPx * 0.25);
      setGestureTransform({ x, y, scale });
      return;
    }

    // Phase 4: overview toggle spam
    if (overviewToggles > 0 && toggleEvery > 0 && tMs < overviewStart + overviewDur) {
      setGesturing(false);
      const k = Math.floor((tMs - overviewStart) / toggleEvery);
      // toggle on integer boundary using a stable latch on the function object
      if (step.__lastToggleK !== k) {
        step.__lastToggleK = k;
        try { overviewMode.toggle(); } catch {}
      }
      return;
    }

    // End: commit any gesture state once
    if (!step.__didCommit) {
      step.__didCommit = true;
      try { commitGesture(); } catch {}
    }
    setGesturing(false);
  };
}

// Pan/zoom with periodic commits during gesture (stress commit path).
export function makePanZoomCommitSpamScript({
  base = null,
  panPx = 2200,
  zoomMin = 0.45,
  zoomMax = 1.15,
  // phases in ms
  idleMs = 3000,
  panMs = 9000,
  zoomMs = 9000,
  overviewToggles = 6,
  overviewSpanMs = 9000,
  commitEveryMs = 250,
  commitDelayMs = 80,
  commitMinGapMs = 0,
} = {}) {
  const s0 = base || getCommittedState();
  const start = { x: s0.x, y: s0.y, scale: s0.scale };

  const panDur = Math.max(0, Number(panMs) || 0);
  const zoomDur = Math.max(0, Number(zoomMs) || 0);
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const overviewDur = Math.max(0, Number(overviewSpanMs) || 0);
  const commitEvery = Math.max(50, Number(commitEveryMs) || 250);
  const commitGap = Math.max(0, Number(commitMinGapMs) || 0);

  const overviewStart = idleDur + panDur + zoomDur;
  const toggleEvery = (overviewToggles > 0 && overviewDur > 0) ? (overviewDur / overviewToggles) : 0;

  function setGesturing(on) {
    try { document.body.classList.toggle('is-gesturing', !!on); } catch {}
    try { window.__GESTURE_ACTIVE = !!on; } catch {}
  }

  return function step(tMs /*, dtMs, progress */) {
    const commitK = Math.floor(tMs / commitEvery);
    const shouldCommitNow = () => {
      if (commitGap <= 0) return true;
      if (!step.__lastCommitAtMs && step.__lastCommitAtMs !== 0) {
        step.__lastCommitAtMs = tMs;
        return true;
      }
      if ((tMs - step.__lastCommitAtMs) >= commitGap) {
        step.__lastCommitAtMs = tMs;
        return true;
      }
      return false;
    };

    if (tMs < idleDur) {
      setGesturing(false);
      return;
    }

    if (panDur > 0 && tMs < idleDur + panDur) {
      setGesturing(true);
      const u = (tMs - idleDur) / panDur;
      const angle = u * Math.PI * 2;
      const x = start.x + Math.cos(angle) * panPx;
      const y = start.y + Math.sin(angle * 0.9) * panPx;
      setGestureTransform({ x, y, scale: start.scale });
      if (step.__lastCommitK !== commitK) {
        step.__lastCommitK = commitK;
        if (shouldCommitNow()) {
          try { commitGesture({ x, y, scale: start.scale }, { delayMs: commitDelayMs }); } catch {}
        }
      }
      return;
    }

    if (zoomDur > 0 && tMs < idleDur + panDur + zoomDur) {
      setGesturing(true);
      const u = (tMs - (idleDur + panDur)) / zoomDur;
      const wobble = (Math.sin(u * Math.PI * 2) * 0.5 + 0.5);
      const scale = lerp(zoomMin, zoomMax, wobble);
      const x = start.x + Math.cos(u * Math.PI * 2) * (panPx * 0.35);
      const y = start.y + Math.sin(u * Math.PI * 2) * (panPx * 0.25);
      setGestureTransform({ x, y, scale });
      if (step.__lastCommitK !== commitK) {
        step.__lastCommitK = commitK;
        if (shouldCommitNow()) {
          try { commitGesture({ x, y, scale }, { delayMs: commitDelayMs }); } catch {}
        }
      }
      return;
    }

    if (overviewToggles > 0 && toggleEvery > 0 && tMs < overviewStart + overviewDur) {
      setGesturing(false);
      const k = Math.floor((tMs - overviewStart) / toggleEvery);
      if (step.__lastToggleK !== k) {
        step.__lastToggleK = k;
        try { overviewMode.toggle(); } catch {}
      }
      return;
    }

    if (!step.__didCommit) {
      step.__didCommit = true;
      try { commitGesture(); } catch {}
    }
    setGesturing(false);
  };
}

// Overview-only script: no pan/zoom, just toggles at a fixed cadence.
export function makeOverviewSpamScript({
  idleMs = 2000,
  toggles = 10,
  spanMs = 12000,
} = {}) {
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const n = Math.max(0, Number(toggles) || 0);
  const dur = Math.max(0, Number(spanMs) || 0);
  const every = (n > 0 && dur > 0) ? (dur / n) : 0;
  return function step(tMs) {
    if (tMs < idleDur) return;
    if (n <= 0 || every <= 0) return;
    const k = Math.floor((tMs - idleDur) / every);
    if (k < 0 || k > n) return;
    if (step.__lastK !== k) {
      step.__lastK = k;
      try { overviewMode.toggle(); } catch {}
    }
  };
}

// Single overview toggle: on once, then off once after a delay.
export function makeOverviewOnceScript({
  idleMs = 2000,
  onMs = 6000,
} = {}) {
  return function step(tMs) {
    if (tMs < idleMs) return;
    if (!step.__didOn) {
      step.__didOn = true;
      try { (overviewMode.enable?.() ?? overviewMode.toggle?.()); } catch {}
      return;
    }
    if (!step.__didOff && tMs > idleMs + onMs) {
      step.__didOff = true;
      try { (overviewMode.disable?.() ?? overviewMode.toggle?.()); } catch {}
    }
  };
}

// DrawGrid random-notes spam while playing.
// Dispatches `toy-random-notes` to all drawgrid panels at a fixed cadence.
// Optionally runs with a seeded Math.random to make the pattern repeatable.
export function makeDrawgridRandomNotesScript({
  everyMs = 900,
  seed = 1337,
  useSeededRandom = true,
} = {}) {
  const every = Math.max(50, Number(everyMs) || 900);
  let lastK = -1;

  return function step(tMs) {
    const k = Math.floor((tMs) / every);
    if (k === lastK) return;
    lastK = k;

    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    if (!panels || panels.length === 0) return;

    if (useSeededRandom) {
      const prev = Math.random;
      let s = (seed + k * 1013904223) >>> 0;
      Math.random = () => {
        // LCG (Numerical Recipes)
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
      try {
        panels.forEach((panel) => {
          try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
        });
      } finally {
        Math.random = prev;
      }
    } else {
      panels.forEach((panel) => {
        try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
      });
    }
  };
}

// DrawGrid randomise notes ONCE (deterministic optional).
// Fires `toy-random-notes` a single time after a short delay so panels exist.
export function makeDrawgridRandomiseOnceScript({
  atMs = 250,
  seed = 1337,
  useSeededRandom = true,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);

  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    step.__didFire = true;

    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    if (!panels || panels.length === 0) return;

    if (useSeededRandom) {
      const prev = Math.random;
      let s = (seed >>> 0);
      Math.random = () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
      try {
        panels.forEach((panel) => {
          try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
        });
      } finally {
        Math.random = prev;
      }
    } else {
      panels.forEach((panel) => {
        try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
      });
    }
  };
}
