// One geometry for Sequence and transport wires, in viewport-local coordinates.
export function connectionCurve(from, to) {
  const handle = Math.max(28, Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
  return { from, to, c1: { x: from.x + handle, y: from.y }, c2: { x: to.x - handle, y: to.y } };
}
export function curvePoint(curve, t) {
  const s = 1 - t;
  const axis = key => s ** 3 * curve.from[key] + 3 * s ** 2 * t * curve.c1[key]
    + 3 * s * t ** 2 * curve.c2[key] + t ** 3 * curve.to[key];
  return { x: axis('x'), y: axis('y') };
}
export function curvePath(curve) {
  const { from: a, to: b, c1, c2 } = curve;
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}
export function projectConnectionPoint(point, { scale = 1, tx = 0, ty = 0 } = {}) {
  return { x: point.x * scale + tx, y: point.y * scale + ty };
}
