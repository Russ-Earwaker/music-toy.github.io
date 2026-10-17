// Presentation projection only. The editable Sequence definition and its ordered
// edges remain the scheduler/persistence authority, including Linked Copies.
export function horizontalPhraseProjection(model, connections = model.list(), { layout = false } = {}) {
  const hidden = new Set(), replacements = new Map(), first = new Map();
  for (const id of model.getObjectIds()) {
    const s = model.getObject(id)?.structure;
    if (s?.type !== 'sequence' || !s.autoArrangePhrase) continue;
    const children = connections.filter(c => c.kind === 'sequence' && c.from.objectId === id)
      .sort((a,b) => Number(a.from.portId.split(':')[1]) - Number(b.from.portId.split(':')[1]));
    if (children.length < 2 || children.some(c => model.getObject(c.to.objectId)?.structure || c.to.portId !== 'input')) continue;
    // Editing a generated phrase into a mixed/nested branch restores its wrapper.
    const types = children.map(c => typeof document === 'undefined' ? null : document.getElementById(c.to.objectId)?.dataset?.toy);
    if (types.some(type => type && type !== 'drawgrid') || children.some(c => connections.some(e => e.from.objectId === c.to.objectId))) continue;
    hidden.add(id); first.set(id, children[0].to);
    children.forEach((c,i) => replacements.set(c.id, i ? { ...c, from: { objectId: children[i-1].to.objectId, portId: 'output' } } : layout ? c : null));
  }
  return { hidden, connections: connections.flatMap(c => {
    if (replacements.has(c.id)) { const projected = replacements.get(c.id); return projected ? [projected] : []; }
    return [!layout && first.has(c.to.objectId) ? { ...c, to: first.get(c.to.objectId) } : c];
  }) };
}
