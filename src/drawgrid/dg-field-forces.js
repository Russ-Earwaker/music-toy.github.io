// src/drawgrid/dg-field-forces.js

export function createDgFieldForces(getState) {
  function pokeFieldToy(source, xToy, yToy, radiusToy, strength, extra = {}) {
    try {
      const S = getState();
      const config = S.DG_KNOCK[source] || {};

      const zoomSnapshot = typeof S.getOverlayZoomSnapshot === 'function'
        ? S.getOverlayZoomSnapshot()
        : null;
      const zoomScale = zoomSnapshot?.scale || 1;

      // radiusToy already defined in toy/world space; the field converts to CSS when needed.
      const radius = radiusToy;

      const strengthToy = strength * (config.strengthMul ?? 1);

      if (!Number.isFinite(radius) || radius <= 0) {
        console.warn('[DG][pokeFieldToy] skipping invalid radius', {
          source,
          radiusToy,
          radius,
          xToy,
          yToy,
        });
        return;
      }

      if (S.DG_DEBUG && S.DG_DEBUG.poke) {
        console.log('[DG][POKE][DEBUG]', {
          source,
          zoomScale,
          xToy,
          yToy,
          radiusToy,
          radiusWorld: radius,
          radiusPx: radius * zoomScale,
          strength,
          strengthToy,
          extra,
        });
      }

      S.__dgParticlePokeTs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      if (typeof window !== 'undefined' && window.DG_ZOOM_AUDIT) {
        try {
          // Visual crosshair at the toy coordinate we are poking
          S.R.withLogicalSpace(S.ghostCtx, () => {
            if (!S.ghostCtx) return;
            S.ghostCtx.save();
            S.ghostCtx.strokeStyle = 'rgba(255,80,80,0.9)';
            S.ghostCtx.lineWidth = 1;
            S.ghostCtx.beginPath();
            S.ghostCtx.moveTo(xToy - 6, yToy);
            S.ghostCtx.lineTo(xToy + 6, yToy);
            S.ghostCtx.moveTo(xToy, yToy - 6);
            S.ghostCtx.lineTo(xToy, yToy + 6);
            S.ghostCtx.stroke();
            S.ghostCtx.restore();
          });
        } catch {}

        const camSnapshot = S.getOverlayZoomSnapshot();
        const auditZoom = camSnapshot?.scale || 1;
        const view = S.dgMap?.size ? S.dgMap.size() : null;
        /*console.log('[DG][POKE]', {
          source,
          zoomScale: auditZoom,
          xToy,
          yToy,
          radiusToy,
          radiusWorld: radius,
          radiusPx: radius * auditZoom,
          strength,
          strengthToy,
          gridArea: S.gridArea && { ...S.gridArea },
          gridAreaLogical: { ...S.gridAreaLogical },
          viewportSize: view,
        });*/
      }

      S.dgField?.poke?.(xToy, yToy, {
        radius,
        strength: strengthToy,
        ...extra,
      });
      S.dbgPoke(source || 'poke');
    } catch (err) {
      console.warn('[DG][pokeFieldToy] failed', { source, err });
    }
  }

  function pushAlongSegment(field, ax, ay, bx, by, opts = {}) {
    if (!field?.pushDirectional) return;
    const coords = [ax, ay, bx, by];
    if (coords.some((v) => !Number.isFinite(v))) return;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    const radius = Math.max(1, Number.isFinite(opts.radius) ? opts.radius : 32);
    const spacing = Math.max(4, Number.isFinite(opts.spacing) ? opts.spacing : Math.round(radius * 0.6));
    let steps = segLen > 0 ? Math.max(1, Math.ceil(segLen / spacing)) : 0;
    const maxSteps = Number.isFinite(opts.maxSteps) ? Math.max(1, Math.floor(opts.maxSteps)) : null;
    if (maxSteps && steps > maxSteps) {
      steps = maxSteps;
    }
    let dirX;
    let dirY;
    if (Number.isFinite(opts.dirX) || Number.isFinite(opts.dirY)) {
      dirX = Number.isFinite(opts.dirX) ? opts.dirX : 0;
      dirY = Number.isFinite(opts.dirY) ? opts.dirY : 0;
    } else if (segLen > 0) {
      dirX = dx / segLen;
      dirY = dy / segLen;
    } else {
      dirX = 1;
      dirY = 0;
    }
    const payload = {
      radius,
      strength: Number.isFinite(opts.strength) ? opts.strength : 1200,
      falloff: typeof opts.falloff === 'string' ? opts.falloff : 'gaussian',
      forceMul: opts.forceMul,
      highlight: opts.highlight,
      highlightMs: opts.highlightMs,
      highlightDur: opts.highlightDur,
      highlightAmp: opts.highlightAmp,
    };
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const sx = ax + dx * t;
      const sy = ay + dy * t;
      field.pushDirectional(sx, sy, dirX, dirY, payload);
    }
  }

  function pushHeaderSweepAt(xToy, { lineWidthPx, maxSteps, forceMul } = {}) {
    try {
      const S = getState();
      // Do not inject forces while camera is in motion / settling.
      if (S.headerPushSuppressed()) return;

      if (!S.dgField?.pushDirectional || !Number.isFinite(xToy)) return;
      const area = (S.gridArea && S.gridArea.w > 0 && S.gridArea.h > 0)
        ? S.gridArea
        : null;
      if (!area || area.h <= 0) return;
      const zoomScale = S.getOverlayZoomSnapshot()?.scale || 1;
      const columnWidth = (Number.isFinite(S.cw) && S.cw > 0)
        ? S.cw
        : Math.max(6, (area.w || 0) / Math.max(1, S.cols || 1));
      const headerLineWidthPx = Number.isFinite(lineWidthPx) ? lineWidthPx : columnWidth;
      const lineWidthWorld = headerLineWidthPx / Math.max(zoomScale, 1e-3);
      const fallbackRadius = typeof S.DG_KNOCK?.headerLine?.radiusToy === 'function'
        ? S.DG_KNOCK.headerLine.radiusToy(area)
        : null;
      const radius = Number.isFinite(fallbackRadius) && fallbackRadius > 0
        ? fallbackRadius
        : Math.max(8, lineWidthWorld * (S.HeaderSweepForce.radiusMul || 2));
      const spacing = Math.max(4, radius * (S.HeaderSweepForce.spacingMul || 0.6));
        const headerStrength = Number.isFinite(S.DG_KNOCK?.headerLine?.strength)
          ? S.DG_KNOCK.headerLine.strength
          : null;
        const baseStrength = (headerStrength != null)
          ? headerStrength
          : (Number.isFinite(S.HeaderSweepForce.strength) ? S.HeaderSweepForce.strength : 1600);
        const fieldState = S.dgField?._state;
        let baseCount = S.panel.__dgParticleBaseCount;
        if (
          (!Number.isFinite(baseCount) || baseCount <= 0) &&
          Number.isFinite(fieldState?.targetDesired) &&
          fieldState.targetDesired > 0
        ) {
          baseCount = Math.max(1, Math.round(fieldState.targetDesired));
          S.panel.__dgParticleBaseCount = baseCount;
        }
        const currentCount = Math.max(1, Number(fieldState?.particles?.length) || 0);
        const countComp = baseCount ? Math.min(8, baseCount / currentCount) : 1;
        const strengthMul = Number.isFinite(forceMul) && forceMul > 0 ? forceMul : 1;
        const knockbackMul = Number.isFinite(S.panel.__dgParticleKnockbackMul)
          ? S.panel.__dgParticleKnockbackMul
          : 1;
        const strength = baseStrength * strengthMul * countComp * knockbackMul;
        pushAlongSegment(
          S.dgField,
          xToy,
          area.y,
        xToy,
        area.y + area.h,
        {
          radius,
          strength,
          spacing,
          falloff: S.HeaderSweepForce.falloff || 'gaussian',
          dirX: S.headerSweepDirX || 1,
          dirY: 0,
          maxSteps,
          highlight: true,
          highlightMs: 1800,
        },
      );
      const lettersRadius = Math.max(40, radius * 1.6);
      const localX = xToy - (area.x || 0);
      const localY = (area.h || 0) * 0.5;
      S.knockLettersAt(localX, localY, {
        radius: lettersRadius,
        strength: S.DG_KNOCK.lettersMove.strength,
        source: 'header',
      });
    } catch (err) {
      const S = getState();
      if (S.DG_DEBUG) console.warn('[DG][pushHeaderSweepAt] failed', err);
    }
  }

  // Poke a thick band along a stroke from (x0,y0)->(x1,y1), sampling along the path and across its width.
  function pokeAlongStrokeBand(x0, y0, x1, y1, widthPx, preset = {}) {
    try {
      const S = getState();
      const { radiusToy, strength } = preset || {};
      const area = (S.gridArea && S.gridArea.w > 0 && S.gridArea.h > 0)
        ? S.gridArea
        : { x: 0, y: 0, w: S.cssW || 0, h: S.cssH || 0 };
      const r = typeof radiusToy === 'function' ? radiusToy(area) : radiusToy;
      const s = strength;
      if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(s) || s <= 0) return;
      const dx = (x1 ?? 0) - (x0 ?? 0);
      const dy = (y1 ?? 0) - (y0 ?? 0);
      const len = Math.hypot(dx, dy) || 0;
      const ux = len > 0 ? (dx / len) : 1;
      const uy = len > 0 ? (dy / len) : 0;
      const nx = -uy;
      const ny = ux;
      const stepAlong = Math.max(4, r * 0.6);
      const stepAcross = Math.max(4, r * 0.6);
      const baseWidth = Number.isFinite(widthPx) ? widthPx : r;
      const halfW = Math.max(r, baseWidth * 0.5);
      const samplesAlong = Math.max(1, Math.ceil(len / stepAlong));
      const samplesAcross = Math.max(1, Math.ceil((halfW * 2) / stepAcross));
      for (let i = 0; i <= samplesAlong; i++) {
        const t = samplesAlong === 0 ? 0 : (i / samplesAlong);
        const cx = x0 + dx * t;
        const cy = y0 + dy * t;
        for (let j = -samplesAcross; j <= samplesAcross; j++) {
          const off = j * stepAcross * 0.5;
          const sx = cx + nx * off;
          const sy = cy + ny * off;
          pokeFieldToy('drag-band', sx, sy, r, s, { mode: 'plow' });
        }
      }
    } catch {}
  }

  return {
    pokeFieldToy,
    pushAlongSegment,
    pushHeaderSweepAt,
    pokeAlongStrokeBand,
  };
}
