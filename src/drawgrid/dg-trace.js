// src/drawgrid/dg-trace.js
// DrawGrid input/ghost/particle trace helpers (debug-only, opt-in via console flags).

export function initDgTraceFlags() {
  if (typeof window === 'undefined') return;
  if (window.__DG_INPUT_TRACE == null) {
    window.__DG_INPUT_TRACE = false;
  }
  if (window.__DG_GHOST_TRACE == null) {
    window.__DG_GHOST_TRACE = false;
  }
  if (window.__DG_PARTICLE_BOOT_DEBUG == null) {
    window.__DG_PARTICLE_BOOT_DEBUG = false;
  }
  // Optional: include stacks for key ghost-guide start/stop events.
  //   window.__DG_GHOST_TRACE_STACK = true
  if (window.__DG_GHOST_TRACE_STACK == null) {
    window.__DG_GHOST_TRACE_STACK = false;
  }
}

export function createDgTraceHelpers({ drawgridLog } = {}) {
  let __dgInputTraceArmed = false;
  let __dgGhostTraceArmed = false;

  function dgInputTrace(tag, data = null) {
    try {
      if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
        // NOTE: makeDebugLogger may not output to console; force console visibility too.
        if (!__dgInputTraceArmed) {
          __dgInputTraceArmed = true;
          try { console.log('[DG][input] TRACE ARMED'); } catch {}
        }
        try { console.log(`[DG][input] ${tag}`, data || {}); } catch {}
        try { drawgridLog?.(`[DG][input] ${tag}`, data || {}); } catch {}
      }
    } catch {}
  }

  function dgGhostTrace(tag, data = null) {
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        if (!__dgGhostTraceArmed) {
          __dgGhostTraceArmed = true;
          try { console.log('[DG][ghost] TRACE ARMED'); } catch {}
        }
        try { console.log(`[DG][ghost] ${tag}`, data || {}); } catch {}
        try { drawgridLog?.(`[DG][ghost] ${tag}`, data || {}); } catch {}
      }
    } catch {}
  }

  function dgParticleBootLog(tag, data = null) {
    try {
      if (typeof window === 'undefined' || !window.__DG_PARTICLE_BOOT_DEBUG) return;
      const payload = data || {};
      console.log(`[DG][particles] ${tag}`, JSON.stringify(payload));
    } catch {}
  }

  return {
    dgInputTrace,
    dgGhostTrace,
    dgParticleBootLog,
  };
}
