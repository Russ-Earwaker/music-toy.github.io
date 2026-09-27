// DrawGrid offscreen backing-store ownership.
// Visible canvases belong to createToySurfaceManager(); only non-DOM buffers
// should be passed here. The snapshot is supplied by that manager, so this
// module never measures layout or infers DPR independently.

export function resizeOffscreenCanvasFromSurface(canvas, surfaceSnapshot) {
  if (!canvas || !surfaceSnapshot) return false;
  const width = Math.max(1, Math.round(Number(surfaceSnapshot.backingWidth) || 0));
  const height = Math.max(1, Math.round(Number(surfaceSnapshot.backingHeight) || 0));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

export function resizeDrawGridOffscreenBuffers(canvases, surfaceSnapshot) {
  let changed = false;
  for (const canvas of canvases || []) {
    if (resizeOffscreenCanvasFromSurface(canvas, surfaceSnapshot)) changed = true;
  }
  return changed;
}
