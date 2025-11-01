// src/zoom/WheelZoomLerper.js
import { getZoomState } from './ZoomCoordinator.js';

export class WheelZoomLerper {
  constructor(applyFn) {
    this.applyFn = applyFn; // (scale, x, y) => void
    this.onSettle = null;   // optional: invoked when lerp reaches target
    this.state = {
      currentScale: 1,
      currentX: 0,
      currentY: 0,
      targetScale: 1,
      targetX: 0,
      targetY: 0,
      easing: 0.18, // responsiveness
      running: false,
      minScale: 0.3,
      maxScale: 4.0,
    };
    const z = getZoomState();
    this.state.currentScale = this.state.targetScale = z.currentScale || 1;
    this.state.currentX = this.state.targetX = z.currentX || 0;
    this.state.currentY = this.state.targetY = z.currentY || 0;
    this._raf = 0;
  }

  cancel() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    this.state.running = false;
  }

  setTarget(scale, x, y) {
    const s = this.state;
    s.targetScale = this._clamp(scale);
    if (Number.isFinite(x)) s.targetX = x;
    if (Number.isFinite(y)) s.targetY = y;
    if (!s.running) {
      s.currentScale = Number.isFinite(s.currentScale) ? s.currentScale : s.targetScale;
      s.currentX = Number.isFinite(s.currentX) ? s.currentX : s.targetX;
      s.currentY = Number.isFinite(s.currentY) ? s.currentY : s.targetY;
      this._kick();
    }
  }

  setTargetFromWheel(delta, clientX, clientY, layoutLeft = 0, layoutTop = 0) {
    const zoom = getZoomState();
    const baseScaleCandidate =
      Number.isFinite(zoom?.targetScale) ? zoom.targetScale :
      Number.isFinite(zoom?.currentScale) ? zoom.currentScale :
      this.state.targetScale;
    const baseScale = this._clamp(baseScaleCandidate || this.state.targetScale);
    const baseX =
      Number.isFinite(zoom?.targetX) ? zoom.targetX :
      Number.isFinite(zoom?.currentX) ? zoom.currentX :
      this.state.targetX;
    const baseY =
      Number.isFinite(zoom?.targetY) ? zoom.targetY :
      Number.isFinite(zoom?.currentY) ? zoom.currentY :
      this.state.targetY;

    this.state.currentScale = baseScale;
    this.state.targetScale = baseScale;
    this.state.currentX = baseX;
    this.state.targetX = baseX;
    this.state.currentY = baseY;
    this.state.targetY = baseY;

    // Standard zoom factor per wheel "notch"
    const factor = Math.exp(-delta * 0.0018); // invert for natural feel; tweak
    const nextScale = this._clamp(baseScale * factor);
    const safeBaseScale = baseScale || 1;
    const sx = nextScale / safeBaseScale || 1;

    const px = clientX;
    const py = clientY;
    const layoutX = layoutLeft;
    const layoutY = layoutTop;

    const nextX = (px - layoutX) * (1 - sx) + sx * baseX;
    const nextY = (py - layoutY) * (1 - sx) + sx * baseY;

    this.state.targetScale = nextScale;
    this.state.targetX = nextX;
    this.state.targetY = nextY;

    this._kick();
  }

  _kick() {
    if (this.state.running) return;
    this.state.running = true;
    const step = () => {
      const s = this.state;
      const ease = s.easing;

      s.currentScale += (s.targetScale - s.currentScale) * ease;
      s.currentX += (s.targetX - s.currentX) * ease;
      s.currentY += (s.targetY - s.currentY) * ease;

      this.applyFn(s.currentScale, s.currentX, s.currentY);

      const done =
        Math.abs(s.targetScale - s.currentScale) < 0.0005 &&
        Math.abs(s.targetX - s.currentX) < 0.2 &&
        Math.abs(s.targetY - s.currentY) < 0.2;

      if (!done) {
        this._raf = requestAnimationFrame(step);
      } else {
        // Snap to exact end
        this.applyFn(s.targetScale, s.targetX, s.targetY);
        this.state.running = false;
        this._raf = 0;
        try { this.onSettle?.(s.targetScale, s.targetX, s.targetY); } catch {}
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  _clamp(v) {
    return Math.min(this.state.maxScale, Math.max(this.state.minScale, v));
  }
}
