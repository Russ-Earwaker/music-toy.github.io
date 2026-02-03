// src/drawgrid/dg-state-readout.js
// DrawGrid state readout helpers (Perf Lab + debug).

export function __dgEnsureStateReadoutEl(panel) {
  try {
    if (!panel) return null;
    // Ensure absolute children position correctly inside the toy.
    try {
      const cs = window.getComputedStyle(panel);
      if (cs && cs.position === 'static') panel.style.position = 'relative';
    } catch {}
    if (panel.__dgStateReadoutEl && panel.__dgStateReadoutEl.isConnected) return panel.__dgStateReadoutEl;
    const el = document.createElement('div');
    el.className = 'dg-state-readout';
    el.style.position = 'absolute';
    el.style.left = '8px';
    el.style.bottom = '8px';
    el.style.zIndex = '2147483647';
    el.style.pointerEvents = 'none';
    el.style.whiteSpace = 'pre';
    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.35';
    el.style.padding = '6px 8px';
    el.style.borderRadius = '8px';
    el.style.background = 'rgba(0,0,0,0.55)';
    el.style.color = 'rgba(255,255,255,0.92)';
    el.style.border = '1px solid rgba(255,255,255,0.18)';
    el.style.backdropFilter = 'blur(2px)';
    el.style.textShadow = '0 1px 0 rgba(0,0,0,0.6)';
    panel.appendChild(el);
    panel.__dgStateReadoutEl = el;
    return el;
  } catch {
    return null;
  }
}

export function __dgEscapeHtml(value) {
  try {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  } catch {
    return '';
  }
}

export function __dgReadoutTierToColor(tier) {
  if (tier === 'low') return 'rgba(255, 90, 90, 0.98)';
  if (tier === 'high') return 'rgba(90, 255, 140, 0.98)';
  return 'rgba(255, 200, 90, 0.98)';
}

// Expose a safe, low-noise state snapshot for Perf Lab / debugging.
// - Collect: window.__DG_COLLECT_DRAWGRID_STATES()
// - Print  : window.__DG_PRINT_STATE()
export function __dgInstallStateSnapshotGlobals() {
  try {
    if (typeof window !== 'undefined' && !window.__DG_COLLECT_DRAWGRID_STATES) {
      window.__DG_COLLECT_DRAWGRID_STATES = () => {
        try {
          const panels = Array.from(document.querySelectorAll('.toy-panel'));
          return panels
            .filter((p) => p && (p.__dgStateSnapshot || (p.classList && p.classList.contains('drawgrid'))))
            .map((p) => ({
              panelId: p.id || null,
              ...((p.__dgStateSnapshot && typeof p.__dgStateSnapshot === 'object') ? p.__dgStateSnapshot : {}),
              text: p.__dgStateSnapshotText || null,
            }));
        } catch {
          return [];
        }
      };
    }
    if (typeof window !== 'undefined' && !window.__DG_PRINT_STATE) {
      window.__DG_PRINT_STATE = () => {
        const states = (typeof window.__DG_COLLECT_DRAWGRID_STATES === 'function')
          ? window.__DG_COLLECT_DRAWGRID_STATES()
          : [];
        try {
          console.group('[DG][STATE] snapshot');
          console.table(states.map((s) => ({
            panelId: s.panelId,
            fps: s.fpsLive != null ? Number(s.fpsLive).toFixed(1) : '--',
            emergency: !!s.lowFpsEmergency,
            playhead: s.playheadSimple ? 'SIMPLE' : 'FULL',
            particles: s.particleFieldEnabled ? 'ON' : 'off',
            particleCount: s.particleCount ?? '--',
            maxScale: s.particleBudgetMaxScale != null ? Number(s.particleBudgetMaxScale).toFixed(3) : '--',
            capScale: s.particleBudgetCapScale != null ? Number(s.particleBudgetCapScale).toFixed(3) : '--',
            spawnScale: s.particleBudgetSpawnScale != null ? Number(s.particleBudgetSpawnScale).toFixed(3) : '--',
            tickMod: s.particleTickModulo ?? '--',
            qlabFps: s.qlabTargetFps ?? 0,
            qlabBurnMs: s.qlabCpuBurnMs ?? 0,
            autoQEff: s.autoQualityEffective != null ? Number(s.autoQualityEffective).toFixed(3) : '--',
            autoQScale: s.autoQualityScale != null ? Number(s.autoQualityScale).toFixed(3) : '--',
            pressureMul: s.pressureDprMul != null ? Number(s.pressureDprMul).toFixed(3) : '--',
          })));
          // Also print the full text blocks (useful when comparing sessions).
          for (const s of states) {
            if (!s || !s.panelId) continue;
            if (!s.text) continue;
            console.log(`\n[DG][STATE][${s.panelId}]\n${s.text}`);
          }
          console.groupEnd();
        } catch {}
        return states;
      };
    }
  } catch {}
}
