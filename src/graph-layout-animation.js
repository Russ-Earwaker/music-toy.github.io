// Presentation only: targets live in the graph/DOM, never in this transient map.
export const GRAPH_REPAIR_DURATION_MS = 200;
export const GRAPH_REPAIR_EPSILON = 0.5;
export function createGraphLayoutAnimation({ now = () => performance.now(), reducedMotion = () => false, render = () => {} } = {}) {
  const motions = new Map();
  let batchTime = null;
  const sample = (m, time) => {
    const t = Math.min(1, Math.max(0, (time - m.started) / GRAPH_REPAIR_DURATION_MS));
    const eased = 1 - (1 - t) ** 3;
    return { x: m.from.x + (m.to.x - m.from.x) * eased, y: m.from.y + (m.to.y - m.from.y) * eased };
  };
  return {
    batch(action) {
      const previous = batchTime;
      batchTime = previous ?? now();
      try { return action(); } finally { batchTime = previous; }
    },
    position(id, target) { return motions.get(id)?.displayed || target; },
    move(id, from, to) {
      const time = batchTime ?? now(), old = motions.get(id);
      if (old && old.to.x === to.x && old.to.y === to.y) return;
      from = old ? old.displayed : from;
      if (reducedMotion() || Math.hypot(to.x - from.x, to.y - from.y) <= GRAPH_REPAIR_EPSILON) {
        motions.delete(id); render(id, to, to); return;
      }
      // Keep only coordinates: stale presentation fields (type/collapse/count)
      // must never override a live Structure record during interpolation.
      motions.set(id, { from: { x:from.x,y:from.y }, to: { x:to.x,y:to.y }, displayed: { x:from.x,y:from.y }, started: time });
      render(id, from, to);
    },
    tick(time = now()) {
      for (const [id, m] of motions) {
        const done = reducedMotion() || time - m.started >= GRAPH_REPAIR_DURATION_MS;
        m.displayed = done ? m.to : sample(m, time);
        render(id, m.displayed, m.to);
        if (done) motions.delete(id);
      }
    },
    cancel(id, target) {
      const m = motions.get(id); if (!m) return target;
      const current = m.displayed; motions.delete(id); render(id, target || m.to, target || m.to);
      return current;
    },
    clear() { for (const [id, m] of motions) render(id, m.to, m.to); motions.clear(); },
    has: id => motions.has(id),
  };
}
