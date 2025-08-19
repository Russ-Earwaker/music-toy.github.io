// src/bouncer-helpers.js — tiny helpers for Bouncer to keep main under 300 lines
import { clamp } from './utils.js';

export function circleRectHit(cx, cy, r, R){
  const nx = Math.max(R.x, Math.min(cx, R.x + R.w));
  const ny = Math.max(R.y, Math.min(cy, R.y + R.h));
  const dx = cx - nx, dy = cy - ny;
  return (dx*dx + dy*dy) <= (r*r);
}
