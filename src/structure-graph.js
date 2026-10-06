// Compile shared Connection topology into the same Structure runtime. Implicit
// chains stay flattened; explicit branch children may themselves be chains.
export function compileStructureGraph({ panels, structures, connections, runtime, currentTick, getDuration, getTransportId = () => undefined, getCurrentTick = () => currentTick }) {
  const toys = new Map(panels.map(p => [p.id, p]));
  const explicit = new Map(structures.map(s => [s.id, s]));
  const incoming = new Map(connections.map(c => [c.to.objectId, c]));
  const outgoing = id => connections.filter(c => c.from.objectId === id)
    .sort((a, b) => (Number(a.from.portId.split(':')[1]) || 0) - (Number(b.from.portId.split(':')[1]) || 0));
  const defined = new Set(), resolving = new Set();
  const leaf = id => ({ toyId: id, durationTicks: getDuration(id) });
  function expression(id) {
    if (explicit.has(id)) return structure(id);
    if (!toys.has(id)) return null;
    const next = outgoing(id)[0];
    if (!next) return { type: 'sequence', children: [leaf(id)], members: [id] };
    const downstream = expression(next.to.objectId);
    return { type: 'sequence', children: [leaf(id), ...(downstream ? downstream.reference ? [downstream.reference] : downstream.children : [])],
      members: [id, ...(downstream?.members || [])] };
  }
  function structure(id) {
    const s = explicit.get(id);
    if (resolving.has(id)) throw new Error('Cyclic Structure graph');
    resolving.add(id);
    // Only output edges are children. The input toy remains a predecessor.
    const children = [], members = [];
    for (const edge of outgoing(id)) {
      const child = expression(edge.to.objectId);
      if (!child) continue;
      members.push(...child.members);
      let reference;
      if (child.reference) reference=child.reference;
      else if (child.children.length === 1) reference=child.children[0];
      else {
        const branchId = `branch:${id}:${edge.from.portId}`;
        runtime.defineStructure(branchId, child.type, child.children, getCurrentTick(id), {transportId:getTransportId(id)});
        defined.add(branchId); reference={ structureId: branchId };
      }
      children.push({...reference,...(s.type==='timeline'?{offsetTick:s.entries?.find(e=>e.portId===edge.from.portId)?.offsetTick||0}:{})});
    }
    runtime.defineStructure(s.definitionId, s.type, children, getCurrentTick(id), { representationId: s.definitionId, transportId: getTransportId(id) ?? s.transportId, count:s.count });
    defined.add(s.definitionId); resolving.delete(id);
    return { type: s.type, count:s.count, children, members, representationId: s.definitionId,
      reference: { structureId: s.definitionId }, preferredId: s.definitionId };
  }
  const roots = [];
  for (const id of [...toys.keys(), ...explicit.keys()]) {
    if (incoming.has(id)) continue;
    if (!explicit.has(id) && !outgoing(id).length) continue;
    const node = expression(id);
    if (node) roots.push({ headId: id, ...node });
  }
  for (const id of explicit.keys()) if (!defined.has(explicit.get(id).definitionId)) structure(id);
  return { roots, defined };
}
