// Geometry uses logical arena units; callers project world positions once.
export function sweepLeadBallCircle(from, to, center, radius) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ox = from.x - center.x, oy = from.y - center.y;
  const a = dx * dx + dy * dy;
  const c = ox * ox + oy * oy - radius * radius;
  let t = 0;
  if (c > 0) {
    if (a < 1e-12) return null;
    const b = ox * dx + oy * dy;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return null;
    t = (-b - Math.sqrt(discriminant)) / a;
    if (t < 0 || t > 1) return null;
  }
  const position = { x: from.x + dx * t, y: from.y + dy * t };
  let nx = position.x - center.x, ny = position.y - center.y;
  let length = Math.hypot(nx, ny);
  if (length < 1e-9) { nx = -dx; ny = -dy; length = Math.hypot(nx, ny); }
  const normal = length > 1e-9 ? { x: nx / length, y: ny / length } : { x: 1, y: 0 };
  return { t, normal, position: { x: center.x + normal.x * (radius + 0.01), y: center.y + normal.y * (radius + 0.01) } };
}
export function reflectLeadBallVelocity(velocity, normal) {
  const dot = velocity.x * normal.x + velocity.y * normal.y;
  return dot < 0 ? { x: velocity.x - 2 * dot * normal.x, y: velocity.y - 2 * dot * normal.y } : { ...velocity };
}
