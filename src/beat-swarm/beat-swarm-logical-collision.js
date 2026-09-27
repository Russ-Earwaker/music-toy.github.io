function finitePoint(point) {
  if (!point) return null;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function logicalDistanceSquared(a, b) {
  const pa = finitePoint(a);
  const pb = finitePoint(b);
  if (!pa || !pb) return Infinity;
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return (dx * dx) + (dy * dy);
}

export function isLogicalPointWithinRadius(point, center, radiusLogical) {
  const radius = Math.max(0, Number(radiusLogical) || 0);
  const radiusSquared = radius * radius;
  return logicalDistanceSquared(point, center) <= radiusSquared + (Math.max(1, radiusSquared) * 1e-12);
}

export function logicalDistanceToSegment(point, start, end) {
  const p = finitePoint(point);
  const a = finitePoint(start);
  const b = finitePoint(end);
  if (!p || !a || !b) return Infinity;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= 0.0001) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, (((p.x - a.x) * dx) + ((p.y - a.y) * dy)) / lengthSquared));
  return Math.hypot(p.x - (a.x + (dx * t)), p.y - (a.y + (dy * t)));
}

export function isLogicalPointWithinSegment(point, start, end, radiusLogical) {
  const radius = Math.max(0, Number(radiusLogical) || 0);
  return logicalDistanceToSegment(point, start, end) <= radius + (Math.max(1, radius) * 1e-12);
}

export function createWorldLogicalCollision(worldToLogical) {
  const project = typeof worldToLogical === 'function' ? worldToLogical : ((point) => point);
  return Object.freeze({
    pointWithinRadius(pointWorld, centerWorld, radiusLogical) {
      return isLogicalPointWithinRadius(project(pointWorld), project(centerWorld), radiusLogical);
    },
    pointWithinSegment(pointWorld, startWorld, endWorld, radiusLogical) {
      return isLogicalPointWithinSegment(project(pointWorld), project(startWorld), project(endWorld), radiusLogical);
    },
  });
}
