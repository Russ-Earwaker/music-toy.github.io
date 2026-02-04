// src/drawgrid/dg-layout-sizing.js
// Layout + sizing helpers for DrawGrid.

export function createDgLayoutSizing({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  let __dgLastEnsureSizeAtMs = 0;
  const DG_ENSURE_SIZE_COOLDOWN_MS = 250;
  let __dgEnsureSizeCandW = 0;
  let __dgEnsureSizeCandH = 0;
  let __dgEnsureSizeCandSinceMs = 0;
  let __dgLastSizeCommitMs = 0;
  const DG_ENSURE_SIZE_HYSTERESIS_MS = 120;

  function getLayoutSize() {
    return measureCSSSize(s.wrap);
  }

  function markLayoutSizeDirty() {
    s.layoutSizeDirty = true;
  }

  function installLayoutObserver() {
    try {
      if (!s.wrap) { d.dgRefreshTrace('ro:skip no wrap'); return; }
      if (s.__dgLayoutObserverInstalled) { d.dgRefreshTrace('ro:skip already exists'); return; }
      if (typeof ResizeObserver === 'undefined') { d.dgRefreshTrace('ro:skip no ResizeObserver'); return; }
      if (s.__dgLayoutObs) { d.dgRefreshTrace('ro:skip already exists'); return; }

      // Coalesce RO-triggered resnaps to at most once per frame per instance.
      // IMPORTANT:
      // - RO callbacks can fire multiple times per frame (and across many toys).
      // - Doing real work inside RO increases churn and can line up expensive redraws badly.
      // - We still do NOT "defer until gesture end" here; resnapAndRedraw itself controls that policy.
      let __dgROResnapRAF = 0;
      const scheduleROResnap = () => {
        if (__dgROResnapRAF) return;
        __dgROResnapRAF = requestAnimationFrame(() => {
          __dgROResnapRAF = 0;
          try { if (!s.panel?.isConnected) return; } catch { return; }
          try { d.resnapAndRedraw(false); } catch {}
        });
      };
      try {
        s.panel?.addEventListener?.('toy:remove', () => {
          try { if (__dgROResnapRAF) cancelAnimationFrame(__dgROResnapRAF); } catch {}
          __dgROResnapRAF = 0;
        }, { once: true });
      } catch {}
      s.__dgLayoutObs = new ResizeObserver((entries) => {
        const e = entries && entries[0];
        const cr = e && e.contentRect;
        if (!cr) return;
        const w = Math.max(1, Math.round(cr.width || 0));
        const h = Math.max(1, Math.round(cr.height || 0));
        if (!w || !h) return;
        if (w === s.__dgLayoutW && h === s.__dgLayoutH) return;
        d.dgRefreshTrace('ro:size', { w, h, prevW: s.__dgLayoutW, prevH: s.__dgLayoutH });
        s.__dgLayoutW = w;
        s.__dgLayoutH = h;
        // Remember a stable non-zero size for callers that need continuity on refresh.
        s.__dgLayoutGoodW = w;
        s.__dgLayoutGoodH = h;
        s.layoutSizeDirty = true;

        // IMPORTANT:
        // Keep RO callback lightweight; schedule resnap for next frame (coalesced).
        // Policy about gesturing/visibility is handled inside resnapAndRedraw().
        scheduleROResnap();
      });
      s.__dgLayoutObs.observe(s.wrap);
      s.__dgLayoutObserverInstalled = true;
      s.panel?.addEventListener?.('toy:remove', () => {
        try { s.__dgLayoutObs?.disconnect?.(); } catch {}
        s.__dgLayoutObs = null;
        s.__dgLayoutObserverInstalled = false;
      }, { once: true });
    } catch {}
  }

  function getStableWrapSize() {
    // Single source of truth for "toy logical size".
    // Prefer RO cache; if RO hasn't reported yet (common just after refresh),
    // fall back to last known-good non-zero size; otherwise return 0 to force retry.
    if (s.__dgLayoutW > 0 && s.__dgLayoutH > 0) return { w: s.__dgLayoutW, h: s.__dgLayoutH };
    if (s.__dgLayoutGoodW > 0 && s.__dgLayoutGoodH > 0) return { w: s.__dgLayoutGoodW, h: s.__dgLayoutGoodH };
    return { w: 0, h: 0 };
  }

  function getLayoutGoodSize() {
    // Return last known-good RO size only (no current RO size).
    if (s.__dgLayoutGoodW > 0 && s.__dgLayoutGoodH > 0) return { w: s.__dgLayoutGoodW, h: s.__dgLayoutGoodH };
    return { w: 0, h: 0 };
  }

  function measureCSSSize(el) {
    if (!el) return { w: 0, h: 0 };

    // If we're measuring the drawgrid wrap, prefer cached RO size (no layout read).
    // IMPORTANT: If RO is installed but hasn't reported yet (common on refresh/boot),
    // do NOT fall back to offset/client/getBoundingClientRect() (can reflect transient zoom/transform).
    // Returning 0 forces callers to retry next frame.
    if (el === s.wrap && s.__dgLayoutObs && (s.__dgLayoutW <= 0 || s.__dgLayoutH <= 0)) {
      // RO is installed but hasn't reported yet (common on refresh/boot).
      // Prefer last-known-good RO size if we have it; otherwise return 0 to force callers to retry.
      const good = getLayoutGoodSize();
      if (good.w > 0 && good.h > 0) {
        d.dgRefreshTrace('size:wrap zero (RO pending) -> use good', { w: s.__dgLayoutW, h: s.__dgLayoutH, goodW: good.w, goodH: good.h });
        return good;
      }
      d.dgRefreshTrace('size:wrap zero (RO pending)', { w: s.__dgLayoutW, h: s.__dgLayoutH });
      return { w: 0, h: 0 };
    }
    if (el === s.wrap && s.__dgLayoutW > 0 && s.__dgLayoutH > 0) {
      return { w: s.__dgLayoutW, h: s.__dgLayoutH };
    }

    const w = el.offsetWidth || el.clientWidth || 0;
    const h = el.offsetHeight || el.clientHeight || 0;
    if (w > 0 && h > 0) return { w, h };
    // IMPORTANT:
    // Do NOT fall back to getBoundingClientRect() for sizing. During zoom/pan (CSS transforms),
    // it reflects transformed geometry and causes mixed-scale layers (steppy zoom + extra scaling).
    // If we can't read stable layout size yet, return 0 and let RO / next frame provide it.
    d.dgRefreshTrace('size:zero (no layout size yet)', { role: el?.getAttribute?.('data-role') || null });
    return { w: 0, h: 0 };
  }

  function ensureSizeReady({ force = false } = {}) {
    let changed = false;
    if (!force && d.zoomFreezeActive()) return true;
    if (!force && !s.layoutSizeDirty) return true;
    const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    if (!force) {
      try {
        // Never resize surfaces during zoom commit pipeline; it causes backing-store churn.
        if (window.__ZOOM_COMMIT_PHASE) return true;
      } catch {}
    }
    if (!force && d.HY?.inCommitWindow?.(nowTs)) {
      return true;
    }
    // IMPORTANT: Single source of truth for sizing is the wrap RO cache (or last known-good).
    // Do not fall back to body/parent measurements, which can be transient during boot/refresh/zoom.
    const measured = getStableWrapSize();
    let { w, h } = measured;
    if (!w || !h) return false;
    s.layoutSizeDirty = false;
    // Prevent resize jitter from fractional CSS pixels (and downstream DPR rounding).
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    if (!force) {
      // Kill 1px oscillation (e.g. 599 <-> 600) which can repeatedly trigger expensive
      // backing-store resizes and compositor churn. We treat +/-1px changes as noise
      // unless the caller explicitly forces a resize.
      if (s.cssW > 0 && Math.abs(w - s.cssW) === 1) w = s.cssW;
      if (s.cssH > 0 && Math.abs(h - s.cssH) === 1) h = s.cssH;
    }

    if (!force) {
      // Debounce frequent size commits during camera/focus/zoom animations.
      // During motion, wrap size can change every frame by a few pixels; resizing backing stores
      // each frame triggers expensive snapshot/restore and (in some cases) stroke redraws.
      const minMs = (typeof window !== 'undefined' && Number.isFinite(window.__DG_RESIZE_COMMIT_MIN_MS))
        ? window.__DG_RESIZE_COMMIT_MIN_MS
        : 120;
      const minPx = (typeof window !== 'undefined' && Number.isFinite(window.__DG_RESIZE_COMMIT_MIN_PX))
        ? window.__DG_RESIZE_COMMIT_MIN_PX
        : 4;
      if (__dgLastSizeCommitMs && (nowTs - __dgLastSizeCommitMs) < minMs) {
        if (s.cssW > 0 && s.cssH > 0 && Math.abs(w - s.cssW) < minPx && Math.abs(h - s.cssH) < minPx) {
          return true;
        }
      }
    }

    if (!force) {
      // If the measured size flips briefly (e.g. during gesture/zoom settle), wait for it to
      // remain stable for a short window before committing an expensive backing-store resize.
      const wouldChange = (w !== s.cssW) || (h !== s.cssH);
      if (wouldChange) {
        const bigDelta = (Math.abs(w - s.cssW) >= 8) || (Math.abs(h - s.cssH) >= 8);
        if (!bigDelta) {
          if (__dgEnsureSizeCandW !== w || __dgEnsureSizeCandH !== h) {
            __dgEnsureSizeCandW = w;
            __dgEnsureSizeCandH = h;
            __dgEnsureSizeCandSinceMs = nowTs;
            s.layoutSizeDirty = true;
            return true;
          }
          if ((nowTs - (__dgEnsureSizeCandSinceMs || 0)) < DG_ENSURE_SIZE_HYSTERESIS_MS) {
            s.layoutSizeDirty = true;
            return true;
          }
        }
      } else {
        __dgEnsureSizeCandW = 0;
        __dgEnsureSizeCandH = 0;
        __dgEnsureSizeCandSinceMs = 0;
      }
    }

    // Cooldown: avoid repeated backing-store churn during camera/overview turbulence.
    // If we *do* see a size change during cooldown, keep dirty=true so we try again soon.
    if (!force) {
      const dt = nowTs - (__dgLastEnsureSizeAtMs || 0);
      if (dt >= 0 && dt < DG_ENSURE_SIZE_COOLDOWN_MS) {
        // If size would change, defer it to the next window.
        const wouldChange = (w !== s.cssW) || (h !== s.cssH);
        if (wouldChange) {
          s.layoutSizeDirty = true;
        }
        return true;
      }
    }

    // IMPORTANT: "force" should bypass cooldown/hysteresis, but must NOT cause a resize
    // when the size is already correct. Otherwise we churn backing stores and spam
    // [perf][canvas-resize] even at stable dimensions.
    const sizeDiff = (w !== s.cssW) || (h !== s.cssH);
    const forceResize = !!force && (s.cssW === 0 || s.cssH === 0);
    changed = sizeDiff || forceResize;
    if (changed) {
      d.dgSizeTrace('ensureSizeReady:apply', {
        force,
        prevCssW: s.cssW,
        prevCssH: s.cssH,
        nextCssW: w,
        nextCssH: h,
        sizeDiff,
        forceResize,
      });
      __dgLastEnsureSizeAtMs = nowTs;
      // Snapshot current paint to preserve drawn lines across resize.
      let paintSnapshot = null;
      let paintSnapshotDpr = null;
      try {
        // IMPORTANT: only use back buffers when they are actually enabled.
        // Using backCanvas/backCtx while usingBackBuffers===false causes the paint layer
        // (flat colour line) to desync scale vs the animated overlay line after zoom.
        const snapSrc = (s.usingBackBuffers && s.backCanvas)
          ? s.backCanvas
          : ((typeof d.getActivePaintCanvas === 'function' ? d.getActivePaintCanvas() : s.paint) || s.paint);
        if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
          paintSnapshot = document.createElement('canvas');
          paintSnapshot.width = snapSrc.width;
          paintSnapshot.height = snapSrc.height;
          paintSnapshot.getContext('2d')?.drawImage(snapSrc, 0, 0);
          paintSnapshotDpr = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : null;
        }
      } catch {}

      s.cssW = w; s.cssH = h;
      __dgLastSizeCommitMs = nowTs;
      s.progressMeasureW = s.cssW; s.progressMeasureH = s.cssH;

      try { s.dgViewport?.refreshSize?.({ snap: true }); } catch {}

      // If ensureSize changes canvas dimensions frequently, this can cause huge nonScript stalls.
      d.traceCanvasResize(s.frontCanvas || s.paint || s.backCanvas, 'drawgrid.ensureSize');
      // IMPORTANT:
      // ensureSizeReady must not "accidentally" apply adaptive DPR, otherwise you get
      // delayed snapping after RO settles / cooldown expires.
      const __ensureDpr =
        (Number.isFinite(s.paintDpr) && s.paintDpr > 0)
          ? s.paintDpr
          : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
      resizeSurfacesFor(s.cssW, s.cssH, __ensureDpr, 'ensureSizeReady:paintDpr');
      try { d.markStaticDirty('ensure-size'); } catch {}
      if (paintSnapshot) {
        try {
          const ctx = (s.usingBackBuffers && s.backCtx)
            ? s.backCtx
            : ((typeof d.getActivePaintCtx === 'function' ? d.getActivePaintCtx() : s.pctx) || s.pctx);
          if (ctx) {
            const dprMismatch =
              Number.isFinite(paintSnapshotDpr) &&
              Number.isFinite(s.paintDpr) &&
              Math.abs(paintSnapshotDpr - s.paintDpr) > 1e-3;
            const hasStrokeData = Array.isArray(s.strokes) && s.strokes.length > 0;
            const skipByCount = s.__dgSkipPaintSnapshotCount > 0 && hasStrokeData;
            const skipSnapshot = skipByCount || (dprMismatch && hasStrokeData);
            if (skipByCount) s.__dgSkipPaintSnapshotCount = Math.max(0, (s.__dgSkipPaintSnapshotCount || 0) - 1);
            if (skipSnapshot) {
              // Avoid scaling old pixels across DPR changes; redraw from strokes for correct scale.
              try {
                if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                  const payload = {
                    panelId: s.panel?.id || null,
                    source: 'ensureSizeReady',
                    skipByCount,
                    dprMismatch,
                    paintSnapshotDpr,
                    paintDpr: s.paintDpr,
                  };
                  console.log('[DG][paint] snapshot-skip', JSON.stringify(payload));
                }
              } catch {}
              d.__dgPaintDebugLog('snapshot-skip', {
                source: 'ensureSizeReady',
                skipByCount,
                dprMismatch,
                paintSnapshotDpr,
              });
              try { d.clearAndRedrawFromStrokes(null, 'paintSnapshot-skip:dpr'); } catch {}
            } else {
              d.resetPaintBlend?.(ctx);
              d.R.resetCtx(ctx);
              d.R.withLogicalSpace(ctx, () => {
                ctx.clearRect(0, 0, s.cssW, s.cssH);
                ctx.drawImage(
                  paintSnapshot,
                  0, 0, paintSnapshot.width, paintSnapshot.height,
                  0, 0, s.cssW, s.cssH
                );
              });
              try {
                if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                  const payload = {
                    panelId: s.panel?.id || null,
                    source: 'ensureSizeReady',
                    paintSnapshotDpr,
                    paintDpr: s.paintDpr,
                  };
                  console.log('[DG][paint] snapshot-restore', JSON.stringify(payload));
                }
              } catch {}
              d.__dgPaintDebugLog('snapshot-restore', {
                source: 'ensureSizeReady',
                paintSnapshotDpr,
              });
            }
          }
        } catch {}
      }
    }

    s.__dgFrontSwapNextDraw = true;
    d.dglog('ensureSizeReady:update', { cssW: s.cssW, cssH: s.cssH });
    s.__dgLastEnsureSizeChanged = changed;
    return true;
  }

  function resizeSurfacesFor(nextCssW, nextCssH, nextDpr, reason) {
    return d.F.perfMarkSection('drawgrid.resize', () => {
      if (!s.__dgCommitResizeCount && (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })()) {
        s.__dgCommitResizeCount = 1;
        if (d.DG_DEBUG) { try { console.warn('[DG] resizeSurfacesFor during commit'); } catch {} }
      }
      // Allow backing-store DPR < 1 (critical for perf when zoomed out / under pressure).
      const dpr = Math.max(0.25, Number.isFinite(nextDpr) ? nextDpr : (window.devicePixelRatio || 1));

      const __prevCssW = s.cssW, __prevCssH = s.cssH, __prevPaintDpr = s.paintDpr;
      const __reason = (typeof reason === 'string' && reason) ? reason : 'unknown';
      // IMPORTANT:
      // __dgCapDprForBackingStore includes hysteresis to prevent thrash (good),
      // but during explicit zoom commits it can cause "only shrinks over time"
      // because small ramp-ups are blocked while ramp-downs are allowed.
      // So: disable hysteresis on zoom-commit paths.
      const __prevForCap = (__reason.indexOf('zoom-commit') === 0) ? null : s.paintDpr;
      if (__reason.indexOf('zoom-commit') !== -1) {
        s.__dgLastZoomCommitTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      }
      const __nextPaintDpr = d.__dgCapDprForBackingStore(nextCssW, nextCssH, Math.min(dpr, 3), __prevForCap);
      // Quantize DPR to avoid tiny float jitter causing 1-2px backing-store oscillation.
      const __quantizeDpr = (v) => {
        const n = Number.isFinite(v) ? v : 1;
        return Math.max(0.25, Math.round(n * 64) / 64);
      };
      s.paintDpr = __quantizeDpr(__nextPaintDpr);
      if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
        const __changed = (__prevCssW !== nextCssW) || (__prevCssH !== nextCssH) || (Math.abs(__prevPaintDpr - __nextPaintDpr) > 1e-6);
        if (__changed) {
          try {
            d.dgRefreshTrace('resizeSurfacesFor', {
              reason: __reason,
              prev: { cssW: __prevCssW, cssH: __prevCssH, paintDpr: __prevPaintDpr },
              next: { cssW: nextCssW, cssH: nextCssH, paintDpr: __nextPaintDpr },
              zoomMode: d.__dgIsGesturing() ? 'gesturing' : 'idle',
            });
          } catch {}
        }
      }
      const __quant2 = (v) => Math.max(1, Math.round(v / 2) * 2); // reduce 1px resize churn
      const __quantTarget = (v) => {
        const n = Number.isFinite(v) ? v : 1;
        const r = Math.round(n);
        // If already (very nearly) an integer, keep it exact to avoid 599->600 drift.
        if (Math.abs(n - r) < 1e-6) return Math.max(1, r);
        return __quant2(n);
      };
      let prevCssW = s.cssW;
      let prevCssH = s.cssH;
      let prevTargetW = s.frontCanvas?.width;
      let prevTargetH = s.frontCanvas?.height;
      // IMPORTANT:
      // If CSS size has not changed, do NOT allow backing-store dimensions
      // to drift due to rounding (e.g. 599 -> 600).
      // This prevents resize churn that causes compositor stalls.
      let targetW = __quantTarget(nextCssW * s.paintDpr);
      let targetH = __quantTarget(nextCssH * s.paintDpr);
      const dprChanged = Math.abs(s.paintDpr - s.__dgLastResizeDpr) > 0.001;
      let sizeChanged = targetW !== s.__dgLastResizeTargetW || targetH !== s.__dgLastResizeTargetH;
      const cssChanged = nextCssW !== s.__dgLastResizeCssW || nextCssH !== s.__dgLastResizeCssH;
      // Drift-lock:
      // If CSS size is stable, treat tiny target changes as noise and keep the previous backing-store.
      // This avoids 1-2px oscillation (e.g. 599 <-> 600) causing expensive resizes.
      if (prevCssW === nextCssW && prevCssH === nextCssH) {
        if (Number.isFinite(prevTargetW) && Number.isFinite(prevTargetH)) {
          const dw = Math.abs(targetW - prevTargetW);
          const dh = Math.abs(targetH - prevTargetH);
          if (dw <= 2 && dh <= 2) {
            targetW = prevTargetW;
            targetH = prevTargetH;
          }
        }
        sizeChanged = targetW !== s.__dgLastResizeTargetW || targetH !== s.__dgLastResizeTargetH;
      }
      // Fast no-op exit: avoids DOM writes + potential compositor churn when we only differ by float jitter.
      if (!dprChanged && !sizeChanged && !cssChanged) {
        d.dgSizeTrace('resizeSurfacesFor(no-op)', { reason, nextCssW, nextCssH, nextDpr, paintDpr: s.paintDpr, targetW, targetH, sizeChanged: false, dprChanged: false });
        return;
      }
      // Any size/DPR change should force overlays dirty.
      try { d.__dgMarkOverlayDirty(s.panel); } catch {}
      // Optional: when hunting "mystery scale jumps", capture who triggered a real resize.
      // Enable with: window.__DG_RESIZE_TRACE = true; window.__DG_RESIZE_TRACE_STACK = true;
      try {
        if (typeof window !== 'undefined' && window.__DG_RESIZE_TRACE) {
          let stack = null;
          try {
            if (window.__DG_RESIZE_TRACE_STACK) {
              const e = new Error('DG resizeSurfacesFor');
              stack = (e && e.stack) ? String(e.stack).split('\n').slice(1, 7).join('\n') : null;
            }
          } catch {}
          console.log('[DG][resize]', reason, {
            nextCssW, nextCssH, nextDpr, paintDpr: s.paintDpr,
            targetW, targetH,
            cssChanged, sizeChanged, dprChanged,
            zoomMode: s.zoomMode,
            stack,
          });
        }
      } catch {}
      s.__dgLastResizeCssW = nextCssW;
      s.__dgLastResizeCssH = nextCssH;
      // Track the last committed backing-store target so we can no-op out next frame.
      // Without these assignments, every tick looks like a 'sizeChanged/dprChanged' and we thrash canvases.
      s.__dgLastResizeTargetW = targetW;
      s.__dgLastResizeTargetH = targetH;
      s.__dgLastResizeDpr = s.paintDpr;
      d.__dgPaintDebugLog('resizeSurfacesFor', {
        reason,
        nextCssW,
        nextCssH,
        nextDpr,
        paintDpr: s.paintDpr,
        targetW,
        targetH,
        sizeChanged,
        dprChanged,
      });

      // === NEW: single applier for managed canvases ===
      // If the generic surface manager is present, let it apply:
      // - CSS sizes
      // - backing-store sizes for managed canvases
      // - ctx.setTransform(dpr,0,0,dpr,0,0) for managed canvases
      //
      // Particles are registered as policy:'css' (field-generic owns backing store),
      // so they'll only get CSS sizing here.
      const setCssSize = (canvasEl) => {
        if (!canvasEl) return;
        // Accept either a canvas element or a 2D context (ctx.canvas).
        const el = (canvasEl && canvasEl.canvas) ? canvasEl.canvas : canvasEl;
        if (!el || !el.style) return;
        // Avoid repeated style writes inside RAF; these can be surprisingly expensive at scale.
        if (el.__dgCssW === nextCssW && el.__dgCssH === nextCssH) return;
        el.__dgCssW = nextCssW;
        el.__dgCssH = nextCssH;
        el.style.width = `${nextCssW}px`;
        el.style.height = `${nextCssH}px`;
      };

      try {
        if (s.dgSurfaces && typeof s.dgSurfaces.applyExplicit === 'function') {
          // Keep local state in sync with the manager-applied state.
          s.cssW = nextCssW;
          s.cssH = nextCssH;
          s.dgSurfaces.applyExplicit(nextCssW, nextCssH, s.paintDpr);
          d.__dgListAllLayerRefs().forEach(setCssSize);
          const resizeBack = (canvas) => {
            if (!canvas) return;
            if (canvas.width === targetW && canvas.height === targetH) return;
            canvas.width = targetW;
            canvas.height = targetH;
          };
          resizeBack(s.gridBackCanvas);
          resizeBack(s.nodesBackCanvas);
          resizeBack(s.flashBackCanvas);
          resizeBack(s.ghostBackCanvas);
          resizeBack(s.tutorialBackCanvas);
          resizeBack(s.backCanvas);
          d.dgSizeTrace('resizeSurfacesFor(surfaceMgr)', { reason, nextCssW, nextCssH, paintDpr: s.paintDpr, targetW, targetH });
          try { d.__dgEnsureLayerSizes('resizeSurfacesFor(surfaceMgr)'); } catch {}
          return;
        }
      } catch (e) {
        try { console.warn('[DG] surfaceMgr applyExplicit failed, falling back', e); } catch {}
      }
      // Keep *all* drawgrid canvases pinned to the same CSS size as the panel.
      // Otherwise, when paintDpr/backing-store sizes are reduced (< 1) for perf while zoomed out,
      // some overlays (nodes/connectors/labels) can end up with a smaller intrinsic CSS size and appear scaled down.
      d.__dgListAllLayerRefs().forEach(setCssSize);
      const resize = (canvas) => {
        if (!canvas) return;
        if (canvas.width === targetW && canvas.height === targetH) return;
        canvas.width = targetW;
        canvas.height = targetH;
      };
      resize(s.gridFrontCtx?.canvas);
      resize(s.gridBackCanvas);
      // particleCanvas sizing is managed by field-generic (it owns DPR/size)
      resize(s.nodesFrontCtx?.canvas);
      resize(s.nodesBackCanvas);
      resize(s.flashFrontCtx?.canvas);
      resize(s.flashBackCanvas);
      resize(s.ghostFrontCtx?.canvas);
      resize(s.ghostBackCanvas);
      resize(s.tutorialFrontCtx?.canvas);
      resize(s.tutorialBackCanvas);
      resize(s.playheadCanvas);
      resize(s.frontCanvas);
      resize(s.backCanvas);
      try { d.__dgEnsureLayerSizes('resizeSurfacesFor'); } catch {}
      try {
        if (s.playheadFrontCtx?.canvas) {
          d.R.resetCtx(s.playheadFrontCtx);
          d.__dgWithLogicalSpace(s.playheadFrontCtx, () => {
            const surface = s.playheadFrontCtx.canvas;
            const w = surface?.width || 0;
            const h = surface?.height || 0;
            s.playheadFrontCtx.clearRect(0, 0, w, h);
          });
          d.markPlayheadLayerCleared();
        }
      } catch {}

      // Non-spammy: only logs when a meaningful scale signature changes.
      // This should catch cases where nodes/lines/text appear "smaller" than other layers.
      try {
        const wrapRect = s.wrap?.getBoundingClientRect?.();
        const sigPayload = {
          panelId: s.panel?.id || null,
          reason,
          zoomMode: s.zoomMode,
          cssW: nextCssW,
          cssH: nextCssH,
          paintDpr: s.paintDpr,
          wrap: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
          paint: d.__dgDescribeCanvasScale(s.paint, wrapRect),
          nodes: d.__dgDescribeCanvasScale(s.nodesCanvas, wrapRect),
          grid: d.__dgDescribeCanvasScale(s.grid, wrapRect),
          ghost: d.__dgDescribeCanvasScale(s.ghostCanvas, wrapRect),
          flash: d.__dgDescribeCanvasScale(s.flashCanvas, wrapRect),
          tutorial: d.__dgDescribeCanvasScale(s.tutorialCanvas, wrapRect),
          playhead: d.__dgDescribeCanvasScale(s.playheadCanvas, wrapRect),
        };
        d.dgScaleTrace('resizeSurfacesFor', sigPayload);
        // Emit a single WARN line when nodes (note nodes + connecting lines + note text)
        // are physically scaled differently than paint. Logs only on state change.
        d.__dgEmitScaleMismatchIfChanged(sigPayload);
      } catch {}

      d.dgSizeTrace('resizeSurfacesFor', {
        reason,
        nextCssW,
        nextCssH,
        nextDpr,
        paintDpr: s.paintDpr,
        targetW,
        targetH,
        sizeChanged,
        dprChanged,
      });
      d.dgSizeTraceCanvas('after-resizeSurfacesFor', {
        targetW,
        targetH,
      });
      d.dgEffectiveDprTrace('resizeSurfacesFor', { reason, nextCssW, nextCssH, nextDpr, paintDpr: s.paintDpr, targetW, targetH, sizeChanged, dprChanged });
      // Optional, non-spammy: trace when any layer's CSS/rect scale signature changes.
      d.__dgTraceCanvasScaleSnapshot(__reason, s.panel?.id || null, [
        { role: 'wrap', el: s.wrap },
        { role: 'front', el: s.frontCanvas },
        { role: 'grid', el: s.grid },
        { role: 'paint', el: s.paint },
        { role: 'nodes', el: s.nodesCanvas },
        { role: 'ghost', el: s.ghostCanvas },
        { role: 'flash', el: s.flashCanvas },
        { role: 'tutorial', el: s.tutorialCanvas },
        { role: 'particles', el: s.particleCanvas },
        { role: 'playhead', el: s.playheadCanvas },
      ]);
      if (dprChanged || sizeChanged) {
        try { d.markStaticDirty('resize-surfaces'); } catch {}
        // BUGFIX: overlay caches must not survive a DPR/size change.
        // If caches persist, nodes/connectors/labels can redraw later using stale
        // assumptions and "jump" or appear scaled from the top-left.
        try {
          d.resetGridCache?.();
          d.resetNodesCache?.();
          d.resetBlocksCache?.();
          s.panel.__dgGridHasPainted = false;
          s.__dgForceFullDrawNext = true;
        } catch {}
        d.updatePaintBackingStores({ force: true, target: 'both' });
        if (Array.isArray(s.strokes) && s.strokes.length > 0) {
          try { d.useFrontBuffers(); } catch {}
          try { d.clearAndRedrawFromStrokes(s.DG_SINGLE_CANVAS ? s.backCtx : s.frontCtx, 'resize-surfaces'); } catch {}
          try { d.ensureBackVisualsFreshFromFront?.(); } catch {}
        }
        // In single-canvas mode, composite immediately so the user doesn't see a
        // temporarily stale overlay stack until another camera move.
        if (s.DG_SINGLE_CANVAS && s.isPanelVisible) {
          try { d.compositeSingleCanvas?.(); } catch {}
          try { s.panel.__dgSingleCompositeDirty = false; } catch {}
        }
      } else {
        d.updatePaintBackingStores({ force: false, target: 'both' });
      }
      d.debugPaintSizes('resizeSurfacesFor');
      try { d.ensureBackVisualsFreshFromFront?.(); } catch {}
    });
  }

  return {
    ensureSizeReady,
    resizeSurfacesFor,
    getLayoutSize,
    markLayoutSizeDirty,
    installLayoutObserver,
    getStableWrapSize,
    getLayoutGoodSize,
    measureCSSSize,
  };
}
