// Uses the same descendants and board coordinates as layout. Only the dragged
// root gains manual provenance; its children retain their local layout freedom.
export function createGraphBranchDrag({ descendants, getPosition, setPosition, cancelAnimation = () => {} }) {
  let gesture = null;
  function sync() {
    if (!gesture) return;
    const root = getPosition(gesture.id);
    if (!root) { gesture = null; return; }
    const origin = gesture.positions.get(gesture.id);
    const dx = root.x - origin.x, dy = root.y - origin.y;
    if (Math.abs(dx - gesture.dx) < 1e-6 && Math.abs(dy - gesture.dy) < 1e-6) return;
    gesture.dx = dx; gesture.dy = dy;
    for (const [id, p] of gesture.positions) {
      if (!getPosition(id)) continue;
      setPosition(id, p.x + dx, p.y + dy, { manual: id === gesture.id });
    }
  }
  return {
    start(id) {
      if (gesture?.id === id) return;
      const ids = [...descendants(id)];
      for (const child of ids) cancelAnimation(child);
      const positions = new Map(ids.map(child => [child, getPosition(child)]).filter(([, p]) => p).map(([child,p])=>[child,{x:p.x,y:p.y}]));
      gesture = positions.has(id) ? { id, positions, dx: 0, dy: 0 } : null;
    },
    move(id, x, y) {
      if (gesture?.id !== id) this.start(id);
      setPosition(id, x, y, { manual: false });
      sync();
    },
    sync,
    translateDescendants(id,dx,dy) {
      for(const child of descendants(id)) {
        if(child===id)continue;
        const p=getPosition(child);if(p)setPosition(child,p.x+dx,p.y+dy,{manual:false});
      }
    },
    end() { sync(); gesture = null; },
    clear() { gesture = null; },
    get active() { return !!gesture; },
  };
}
