// src/ui-tiles.js — shared helpers for note/cube tile visuals
export function drawTileLabelAndArrows(ctx, rect, { label='', active=true, zoomed=false } = {}){
  if (!ctx || !rect) return;
  const { x, y, w, h } = rect;
  ctx.save();

  // Label: only in zoomed mode
  if (zoomed && label){
    ctx.fillStyle = active ? '#0b0f16' : '#e6e8ef';
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w/2, y + h/2);
  }

  // Centered up/down arrows (zoom-only), constrained to top/bottom thirds
  if (zoomed){
    const cx = x + w/2;
    const margin = Math.max(6, Math.min(w,h) * 0.08);
    const thirdH = h / 3;

    // Base arrow size (slightly reduced)
    let baseSize = Math.max(9, Math.min(w,h) * 0.22);

    ctx.fillStyle = '#ffffff';

    // --- UP arrow (top third) ---
    {
      const apexY = y + margin;
      // Limit size so base does not exceed top third minus margin
      const maxSizeTop = Math.max(0, (y + thirdH - margin) - apexY);
      const size = Math.min(baseSize, maxSizeTop);
      const halfW = size * 0.65;
      const baseY = apexY + size;

      if (size > 0.5){
        ctx.beginPath();
        ctx.moveTo(cx, apexY);                 // apex (top)
        ctx.lineTo(cx - halfW, baseY);         // base left
        ctx.lineTo(cx + halfW, baseY);         // base right
        ctx.closePath();
        ctx.fill();
      }
    }

    // --- DOWN arrow (bottom third) ---
    {
      const apexY = y + h - margin;
      // Limit size so base does not cross above bottom third + margin
      const minBaseY = y + 2*thirdH + margin;
      const maxSizeBottom = Math.max(0, apexY - minBaseY);
      const size = Math.min(baseSize, maxSizeBottom);
      const halfW = size * 0.65;
      const baseY = apexY - size;

      if (size > 0.5){
        ctx.beginPath();
        ctx.moveTo(cx, apexY);                 // apex (bottom)
        ctx.lineTo(cx - halfW, baseY);         // base left
        ctx.lineTo(cx + halfW, baseY);         // base right
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
