// src/drawgrid/dg-note-effects.js
// Note flashes/toggles/bursts for DrawGrid.

export function createDgNoteEffects({ state, deps } = {}) {
  const s = state;
  const d = deps;

  const cellFlashes = [];
  const noteToggleEffects = [];
  const noteBurstEffects = [];

  function addCellFlash(col, row) {
    cellFlashes.push({ col, row, age: 1.0 });
  }

  function spawnNoteRingEffect(cx, cy, baseRadius) {
    const r =
      Math.max(
        6,
        baseRadius ||
          (Number.isFinite(s.cw) && Number.isFinite(s.ch)
            ? Math.min(s.cw, s.ch) * 0.5
            : 12),
      );
    noteToggleEffects.push({ x: cx, y: cy, radius: r, progress: 0 });

    // Keep a reasonable cap so we don't leak
    if (noteToggleEffects.length > 48) {
      noteToggleEffects.splice(0, noteToggleEffects.length - 48);
    }
  }

  function spawnNoteBurst(cx, cy, baseRadius) {
    // We want small particles that travel about half a grid cell
    // IMPORTANT: `cw/ch` are *canvas* dimensions in logical space, NOT a grid-cell size.
    // Using them here makes bursts travel/offset by hundreds of pixels (especially after zoom).
    const cell = (() => {
      const w = Number.isFinite(s.gridArea?.w) ? s.gridArea.w : null;
      const h = Number.isFinite(s.gridArea?.h) ? s.gridArea.h : null;
      const c = Number.isFinite(s.cols) && s.cols > 0 ? s.cols : null;
      const r = Number.isFinite(s.rows) && s.rows > 0 ? s.rows : null;
      const cellW = (w != null && c != null) ? (w / c) : null;
      const cellH = (h != null && r != null) ? (h / r) : null;
      const cellPx = (cellW != null && cellH != null) ? Math.min(cellW, cellH) : (cellW != null ? cellW : (cellH != null ? cellH : null));
      return (cellPx != null && cellPx > 0) ? cellPx : 24;
    })();
    const lowFps = s.__dgLowFpsMode || (() => {
      const fpsSample = Number.isFinite(window.__MT_SM_FPS)
        ? window.__MT_SM_FPS
        : (Number.isFinite(window.__MT_FPS) ? window.__MT_FPS : null);
      return Number.isFinite(fpsSample) && fpsSample <= s.DG_PLAYHEAD_FPS_SIMPLE_ENTER;
    })();
    const emergency = s.__dgLowFpsMode;
    const count = emergency ? 20 : (lowFps ? 28 : 48);
    const sizeBoost = emergency ? 2.0 : (lowFps ? 1.7 : 1);
    const lifeBase = emergency ? 0.42 : (lowFps ? 0.55 : 0.8);

    // Travel radius target: ~0.5 of a grid square
    const travelRadius =
      Math.max(
        6,
        baseRadius && baseRadius > 0
          ? baseRadius * 0.5
          : cell * 0.5
      );

    const particles = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;

      // Speed tuned so, over the particle lifetime, they move visibly across the cell
      const speed = travelRadius * (10.0 + Math.random() * 10.0);

      // Bigger jitter so motion is obvious from the start
      const jitter = travelRadius * 0.3 * Math.random();

      particles.push({
        x: cx + Math.cos(angle) * jitter,
        y: cy + Math.sin(angle) * jitter,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        // Enough life so the faster particles can travel visibly
        life: lifeBase,
        // Larger, more obvious dots
        size: (0.25 + Math.random() * 2) * sizeBoost,
      });
    }

    noteBurstEffects.push({ particles });
    d.markOverlayDirty?.();

    // Cap the number of active bursts so we don't leak
    const maxBursts = emergency ? 16 : (lowFps ? 24 : 32);
    if (noteBurstEffects.length > maxBursts) {
      noteBurstEffects.splice(0, noteBurstEffects.length - maxBursts);
    }
  }

  function reset() {
    cellFlashes.length = 0;
    noteToggleEffects.length = 0;
    noteBurstEffects.length = 0;
  }

  function getCounts() {
    return {
      cellFlashes: cellFlashes.length,
      noteToggleEffects: noteToggleEffects.length,
      noteBurstEffects: noteBurstEffects.length,
    };
  }

  function renderNoteEffects({
    allowOverlayDraw = false,
    allowOverlayDrawHeavy = false,
    disableOverlayCore = false,
    overlayFlashesEnabled = false,
    overlayBurstsEnabled = false,
    overlayCompositeNeeded = false,
    frameCam = null,
    perfOn = false,
  } = {}) {
    const panel = s.panel;
    const gridArea = s.gridArea;
    const cw = s.cw;
    const ch = s.ch;
    const topPad = s.topPad;
    const fctx = s.fctx;
    const R = d.R;
    const __dgWithLogicalSpace = d.__dgWithLogicalSpace;
    const __dgWithLogicalSpaceDpr = d.__dgWithLogicalSpaceDpr;
    const __dgGetCanvasDprFromCss = d.__dgGetCanvasDprFromCss;

    if (!overlayFlashesEnabled && !overlayBurstsEnabled && !cellFlashes.length && !noteToggleEffects.length && !noteBurstEffects.length) {
      return { overlayCompositeNeeded };
    }

    if (cellFlashes.length > 0) {
      if (disableOverlayCore) {
        for (let i = cellFlashes.length - 1; i >= 0; i--) {
          const flash = cellFlashes[i];
          flash.age -= 0.05;
          if (flash.age <= 0) cellFlashes.splice(i, 1);
        }
      } else {
        const __dgOverlayStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
          ? performance.now()
          : 0;
        try {
          if (allowOverlayDraw) {
            overlayCompositeNeeded = true;
            d.markFlashLayerActive();
            // Draw cell flashes
            // IMPORTANT:
            // Draw in the flash canvas' logical space so bursts stay aligned after zoom/DPR shifts.
            R.resetCtx(fctx);
            __dgWithLogicalSpace(fctx, () => {
              R.withOverlayClip(fctx, gridArea, false, () => {
                fctx.save();
                for (let i = cellFlashes.length - 1; i >= 0; i--) {
                  const flash = cellFlashes[i];
                  const x = gridArea.x + flash.col * cw;
                  const y = gridArea.y + topPad + flash.row * ch;

                  fctx.globalAlpha = flash.age * 0.6; // Match grid line color
                  fctx.fillStyle = 'rgb(143, 168, 255)';
                  fctx.fillRect(x, y, cw, ch);

                  flash.age -= 0.05; // Decay rate
                  if (flash.age <= 0) {
                    cellFlashes.splice(i, 1);
                  }
                }
                fctx.restore();
              });
            });
          } else {
            for (let i = cellFlashes.length - 1; i >= 0; i--) {
              const flash = cellFlashes[i];
              flash.age -= 0.05;
              if (flash.age <= 0) {
                cellFlashes.splice(i, 1);
              }
            }
          }
        } catch (e) { /* fail silently */ }
        if (__dgOverlayStart && allowOverlayDrawHeavy) {
          const __dgOverlayDt = performance.now() - __dgOverlayStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.cellFlashes', __dgOverlayDt); } catch {}
        }
      }
    }

    if (noteToggleEffects.length > 0) {
      try {
        if (!disableOverlayCore && allowOverlayDraw) {
          overlayCompositeNeeded = true;
          d.markFlashLayerActive();
          const __dgOverlayStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          const __noteToggleStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          R.resetCtx(fctx);
          __dgWithLogicalSpace(fctx, () => {
            R.withOverlayClip(fctx, gridArea, false, () => {
              fctx.save();
              for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
                const effect = noteToggleEffects[i];
                effect.progress += 0.12;
                const alpha = Math.max(0, 1 - effect.progress);
                if (alpha <= 0) {
                  noteToggleEffects.splice(i, 1);
                  continue;
                }
                const radius = effect.radius * (1 + effect.progress * 1.6);
                const lineWidth = Math.max(1.2, effect.radius * 0.28 * (1 - effect.progress * 0.5));
                fctx.globalAlpha = alpha;
                fctx.lineWidth = lineWidth;
                fctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                fctx.beginPath();
                fctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
                fctx.stroke();
              }
              fctx.restore();
            });
          });
          if (__dgOverlayStart) {
            const __dgOverlayDt = performance.now() - __dgOverlayStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.toggles', __dgOverlayDt); } catch {}
          }
          if (__noteToggleStart) {
            const __noteToggleDt = performance.now() - __noteToggleStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.noteToggles', __noteToggleDt); } catch {}
          }
        } else {
          // Even if we skip drawing, continue advancing animations so they stay in sync.
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
            }
          }
        }
      } catch {}
    }

    // Pink radial bursts for active notes
    if (typeof window !== 'undefined' && window.__DG_NOTE_BURST_TRACE) {
      try {
        console.log('[DG][burst][draw]', {
          panelId: panel?.id || null,
          burstCount: noteBurstEffects.length,
          gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
          paintDpr: s.paintDpr,
          flash: fctx?.canvas ? { w: fctx.canvas.width, h: fctx.canvas.height } : null,
        });
      } catch {}
    }
    if (noteBurstEffects.length > 0) {
      try {
        if (s.__dgLowFpsMode || !overlayBurstsEnabled) {
          noteBurstEffects.length = 0;
          // Skip burst draw work, but keep the rest of the overlay rendering.
        } else if (disableOverlayCore) {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
          for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
            const burst = noteBurstEffects[i];
            for (let j = burst.particles.length - 1; j >= 0; j--) {
              const p = burst.particles[j];
              p.life -= dt * 2.8;
              if (p.life <= 0) {
                burst.particles.splice(j, 1);
              }
            }
            if (!burst.particles.length) {
              noteBurstEffects.splice(i, 1);
            }
          }
        } else {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);

          if (allowOverlayDrawHeavy || s.__dgLowFpsMode) {
            overlayCompositeNeeded = true;
            const __dgOverlayStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            R.resetCtx(fctx);
            __dgWithLogicalSpace(fctx, () => {
              R.withOverlayClip(fctx, gridArea, false, () => {
                fctx.save();
                d.markFlashLayerActive();
                fctx.globalCompositeOperation = 'lighter';
                for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
                  const burst = noteBurstEffects[i];
                  let anyAlive = false;

                  for (let j = burst.particles.length - 1; j >= 0; j--) {
                    const p = burst.particles[j];

                    // Fade out - faster fade so the burst clears quickly
                    p.life -= dt * 2.0;
                    if (p.life <= 0) {
                      burst.particles.splice(j, 1);
                      continue;
                    }

                    anyAlive = true;

                    // Integrate
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;

                    // Gentle damping so they slow as they fade
                    p.vx *= 0.9;
                    p.vy *= 0.9;

                    const alpha = p.life;
                    const radius = p.size;

                    fctx.globalAlpha = alpha;
                    fctx.fillStyle = 'rgba(255, 180, 210, 1)';
                    fctx.beginPath();
                    fctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    fctx.fill();
                  }

                  if (!anyAlive) {
                    noteBurstEffects.splice(i, 1);
                  }
                }
                fctx.restore();
              });
            });
            if (__dgOverlayStart) {
              const __dgOverlayDt = performance.now() - __dgOverlayStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.bursts', __dgOverlayDt); } catch {}
            }
          } else {
            for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
              const burst = noteBurstEffects[i];
              for (let j = burst.particles.length - 1; j >= 0; j--) {
                const p = burst.particles[j];
                p.life -= dt * 2.8;
                if (p.life <= 0) {
                  burst.particles.splice(j, 1);
                }
              }
              if (!burst.particles.length) {
                noteBurstEffects.splice(i, 1);
              }
            }
          }
        }
      } catch {}
    }

    return { overlayCompositeNeeded };
  }

  return {
    addCellFlash,
    spawnNoteRingEffect,
    spawnNoteBurst,
    reset,
    getCounts,
    renderNoteEffects,
  };
}
