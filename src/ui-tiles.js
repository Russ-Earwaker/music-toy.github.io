// src/ui-tiles.js — shared helpers for note/cube tile visuals
export function drawTileLabelAndArrows(ctx, rect, { label='', active=true, zoomed=false } = {}){
  if (!ctx || !rect) return;
  const { x, y, w, h } = rect;
  ctx.save();

  // Label: only in zoomed mode (solid band behind text; black active / white inactive)
  if (zoomed && label){
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = x + w/2;
    const cy = y + h/2;
    const bandH = Math.max(16, Math.round(Math.min(h * 0.36, 22)));
    const bandW = Math.max(32, Math.round(w - 10)); // leave border visible
    ctx.fillStyle = active ? '#f4932f' : '#293042';
    ctx.fillRect(cx - bandW/2, cy - bandH/2, bandW, bandH);

    ctx.fillStyle = active ? '#000000' : '#FFFFFF';
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }

  // Centered up/down arrows (zoom-only), constrained to top/bottom thirds
  if (zoomed){
    const cx = x + w/2;
    const margin = Math.max(6, Math.min(w,h) * 0.08);
    const thirdH = h / 3;

    // Slightly reduced arrow size
    let baseSize = Math.max(9, Math.min(w,h) * (zoomed ? 0.32 : 0.22));

    ctx.fillStyle = '#ffffff';

    // --- UP arrow (top third) ---
    {
      const apexY = y + margin;
      const maxSizeTop = Math.max(0, (y + thirdH - margin) - apexY);
      const size = Math.min(baseSize, maxSizeTop);
      const halfW = size * 0.65;
      const baseY = apexY + size;

      if (size > 0.5){
        ctx.beginPath();
        ctx.moveTo(cx, apexY);
        ctx.lineTo(cx - halfW, baseY);
        ctx.lineTo(cx + halfW, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }

    // --- DOWN arrow (bottom third) ---
    {
      const apexY = y + h - margin;
      const minBaseY = y + 2*thirdH + margin;
      const maxSizeBottom = Math.max(0, apexY - minBaseY);
      const size = Math.min(baseSize, maxSizeBottom);
      const halfW = size * 0.65;
      const baseY = apexY - size;

      if (size > 0.5){
        ctx.beginPath();
        ctx.moveTo(cx, apexY);
        ctx.lineTo(cx - halfW, baseY);
        ctx.lineTo(cx + halfW, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
