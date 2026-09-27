import { DRAWGRID_STROKE_SPACE_LOGICAL } from './drawgrid-viewport-space.js';

// Used only to make exact boundary contact deterministic. It is deliberately
// tiny relative to the 800x600 authored surface and is not presentation based.
export const DRAWGRID_SNAP_EPSILON = 1e-7;

function finitePoint(point) {
  return {
    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : 0,
    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : 0,
  };
}

export function drawGridStrokeToLogicalPoints(stroke, geometry) {
  void geometry;
  if (stroke?.coordinateSpace !== DRAWGRID_STROKE_SPACE_LOGICAL) return [];
  return Array.isArray(stroke.pts) ? stroke.pts.map(finitePoint) : [];
}

function contributionForSegment(a, b, left, right, radius, epsilon) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const expandedLeft = left - radius - epsilon;
  const expandedRight = right + radius + epsilon;

  if (Math.abs(dx) <= epsilon) {
    if (a.x < expandedLeft || a.x > expandedRight) return null;
    return { y: (a.y + b.y) * 0.5, weight: Math.max(length, epsilon) };
  }

  let t0 = (expandedLeft - a.x) / dx;
  let t1 = (expandedRight - a.x) / dx;
  if (t0 > t1) [t0, t1] = [t1, t0];
  const start = Math.max(0, t0);
  const end = Math.min(1, t1);
  if (end < start - epsilon) return null;
  const clippedStart = Math.max(0, Math.min(1, start));
  const clippedEnd = Math.max(0, Math.min(1, end));
  const mid = (clippedStart + clippedEnd) * 0.5;
  return {
    y: a.y + dy * mid,
    weight: Math.max(length * Math.max(0, clippedEnd - clippedStart), epsilon),
  };
}

// Twelve-point Gauss-Legendre integration gives stable geometric area/centroid
// results without tying note extraction to a pixel grid.
const GAUSS_NODES = Object.freeze([
  -0.9815606342467192, -0.9041172563704749, -0.7699026741943047,
  -0.5873179542866175, -0.3678314989981802, -0.1252334085114689,
  0.1252334085114689, 0.3678314989981802, 0.5873179542866175,
  0.7699026741943047, 0.9041172563704749, 0.9815606342467192,
]);
const GAUSS_WEIGHTS = Object.freeze([
  0.04717533638651183, 0.1069393259953184, 0.1600783285433462,
  0.2031674267230659, 0.2334925365383548, 0.2491470458134029,
  0.2491470458134029, 0.2334925365383548, 0.2031674267230659,
  0.1600783285433462, 0.1069393259953184, 0.04717533638651183,
]);

function addDiskInterval(intervals, point, x, radius, epsilon) {
  const dx = x - point.x;
  if (Math.abs(dx) > radius + epsilon) return;
  const half = Math.sqrt(Math.max(0, radius * radius - dx * dx));
  intervals.push([point.y - half, point.y + half]);
}

function capsuleIntervalsAtX(a, b, x, radius, epsilon) {
  const intervals = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= epsilon * epsilon) {
    addDiskInterval(intervals, a, x, radius, epsilon);
    return intervals;
  }

  const length = Math.sqrt(lengthSq);
  if (Math.abs(dx) <= epsilon) {
    if (Math.abs(x - a.x) <= radius + epsilon) {
      intervals.push([Math.min(a.y, b.y) - radius, Math.max(a.y, b.y) + radius]);
    }
    return intervals;
  }

  const centreY = a.y + (dy / dx) * (x - a.x);
  const halfStrip = radius * length / Math.abs(dx);
  let low = centreY - halfStrip;
  let high = centreY + halfStrip;

  if (Math.abs(dy) <= epsilon) {
    const t = (x - a.x) / dx;
    if (t >= -epsilon && t <= 1 + epsilon) intervals.push([low, high]);
  } else {
    const projection0 = a.y - (dx * (x - a.x)) / dy;
    const projection1 = a.y + (lengthSq - dx * (x - a.x)) / dy;
    const projectionLow = Math.min(projection0, projection1);
    const projectionHigh = Math.max(projection0, projection1);
    low = Math.max(low, projectionLow);
    high = Math.min(high, projectionHigh);
    if (high >= low - epsilon) intervals.push([low, high]);
  }

  addDiskInterval(intervals, a, x, radius, epsilon);
  addDiskInterval(intervals, b, x, radius, epsilon);
  return intervals;
}

function mergedCoverageAtX(points, x, radius, epsilon) {
  const intervals = [];
  if (points.length === 1) {
    addDiskInterval(intervals, points[0], x, radius, epsilon);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      intervals.push(...capsuleIntervalsAtX(points[index - 1], points[index], x, radius, epsilon));
    }
  }
  intervals.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1] + epsilon) merged.push([...interval]);
    else last[1] = Math.max(last[1], interval[1]);
  }
  return merged;
}

function geometricCoverageInColumn(points, left, right, radius, epsilon) {
  const midpoint = (left + right) * 0.5;
  const halfWidth = (right - left) * 0.5;
  let area = 0;
  let firstMomentY = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const x = midpoint + halfWidth * GAUSS_NODES[index];
    const intervals = mergedCoverageAtX(points, x, radius, epsilon);
    let sliceArea = 0;
    let sliceMoment = 0;
    for (const [low, high] of intervals) {
      sliceArea += Math.max(0, high - low);
      sliceMoment += (high * high - low * low) * 0.5;
    }
    const weight = GAUSS_WEIGHTS[index] * halfWidth;
    area += sliceArea * weight;
    firstMomentY += sliceMoment * weight;
  }
  return { area, firstMomentY };
}

function middleSafeRow({ rows, chromaticPalette, pentatonicPalette }) {
  let row = Math.max(0, Math.min(rows - 1, Math.floor(rows * 0.5)));
  try {
    const visible = pentatonicPalette.filter((pitch) => chromaticPalette.includes(pitch));
    if (visible.length) {
      const target = visible[Math.floor(visible.length * 0.5)];
      const matched = chromaticPalette.indexOf(target);
      if (matched !== -1) row = matched;
    }
  } catch {}
  return row;
}

function autoTuneRow(row, chromaticPalette, pentatonicPalette) {
  try {
    const drawnMidi = chromaticPalette[row];
    let nearestMidi = pentatonicPalette[0];
    let minDiff = Math.abs(drawnMidi - nearestMidi);
    for (const pitch of pentatonicPalette) {
      const diff = Math.abs(drawnMidi - pitch);
      if (diff < minDiff) {
        minDiff = diff;
        nearestMidi = pitch;
      }
    }
    const min = chromaticPalette[chromaticPalette.length - 1];
    const max = chromaticPalette[0];
    let wrapped = nearestMidi | 0;
    while (wrapped > max) wrapped -= 12;
    while (wrapped < min) wrapped += 12;
    const corrected = chromaticPalette.indexOf(wrapped);
    return corrected === -1 ? row : corrected;
  } catch {
    return row;
  }
}

export function snapDrawGridStrokeLogical({
  stroke,
  geometry,
  strokeWidth = geometry?.strokeWidth ?? 36,
  autoTune = false,
  chromaticPalette = [],
  pentatonicPalette = [],
  epsilon = DRAWGRID_SNAP_EPSILON,
} = {}) {
  const cols = geometry.cols;
  const rows = geometry.rows;
  const active = Array(cols).fill(false);
  const nodes = Array.from({ length: cols }, () => new Set());
  const disabled = Array.from({ length: cols }, () => new Set());
  const representativeY = Array(cols).fill(null);
  const defaultRow = Math.max(0, Math.min(rows - 1, Math.floor(rows * 0.5)));
  const points = drawGridStrokeToLogicalPoints(stroke, geometry);
  const radius = Math.max(0, Number(strokeWidth) || 0) * 0.5;
  const gridTop = geometry.gridRect.y + geometry.topPad;
  const gridBottom = gridTop + rows * geometry.cellHeight;

  for (let col = 0; col < cols; col += 1) {
    const left = geometry.gridRect.x + col * geometry.cellWidth;
    const right = left + geometry.cellWidth;
    const coverage = geometricCoverageInColumn(points, left, right, radius, epsilon);
    let averageY = coverage.area > epsilon ? coverage.firstMomentY / coverage.area : null;

    // A zero-area exact tangent is explicitly admitted on both neighboring
    // columns. It receives epsilon weight and therefore cannot destabilize a
    // non-zero coverage centroid.
    if (averageY == null && points.length === 1) {
      const point = points[0];
      if (point.x + radius >= left - epsilon && point.x - radius <= right + epsilon) averageY = point.y;
    } else if (averageY == null) {
      let weightedY = 0;
      let totalWeight = 0;
      for (let index = 1; index < points.length; index += 1) {
        const contribution = contributionForSegment(points[index - 1], points[index], left, right, radius, epsilon);
        if (!contribution) continue;
        weightedY += contribution.y * contribution.weight;
        totalWeight += contribution.weight;
      }
      if (totalWeight > 0) averageY = weightedY / totalWeight;
    }

    if (averageY == null) {
      nodes[col].add(defaultRow);
      disabled[col].add(defaultRow);
      continue;
    }
    representativeY[col] = averageY;
    if (averageY <= gridTop + epsilon || averageY >= gridBottom - epsilon) {
      const safeRow = middleSafeRow({ rows, chromaticPalette, pentatonicPalette });
      nodes[col].add(safeRow);
      disabled[col].add(safeRow);
      continue;
    }

    let row = Math.max(0, Math.min(
      rows - 1,
      Math.round((averageY - gridTop) / geometry.cellHeight),
    ));
    if (autoTune) row = autoTuneRow(row, chromaticPalette, pentatonicPalette);
    nodes[col].add(row);
    active[col] = true;
  }

  return { active, nodes, disabled, representativeY };
}
