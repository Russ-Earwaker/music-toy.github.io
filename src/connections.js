// Canonical logical connections. Coordinates and DOM elements never enter this model.
export const TOY_PORTS = Object.freeze({
  input: Object.freeze({ direction: 'in', accepts: Object.freeze(['sequence', 'transport']),
    capacity: Object.freeze({ sequence: 1, transport: 1 }), parentCapacity: 1, occupied: 'replace-parent' }),
  output: Object.freeze({ direction: 'out', accepts: Object.freeze(['sequence']),
    capacity: Object.freeze({ sequence: 1 }), occupied: 'requires-promotion' }),
});
export const HEARTBEAT_PORTS = Object.freeze({
  output: Object.freeze({ direction: 'out', accepts: Object.freeze(['transport']),
    capacity: Object.freeze({ transport: Infinity }) }),
});
export function createStructurePorts(outputCount = 2, type = 'sequence') {
  const ports = { input: TOY_PORTS.input };
  for (let i = 0; i < (type === 'repeat' ? 1 : Math.max(2, outputCount)); i++) ports[`child:${i}`] = Object.freeze({
    direction: 'out', accepts: Object.freeze(['sequence']), capacity: Object.freeze({ sequence: 1 }),
    ...(type === 'repeat' ? {occupied:'replace-child'} : {}),
  });
  return Object.freeze(ports);
}
const endpoint = value => Object.freeze({ objectId: String(value.objectId), portId: String(value.portId) });
const same = (a, b) => a?.objectId === b?.objectId && a?.portId === b?.portId;

export function createConnectionModel() {
  const objects = new Map(), connections = new Map(), listeners = new Set();
  let serial = 1, editing = null, promotionResolver = null, transactionDepth = 0, pending = [];
  const emit = event => {
    if (transactionDepth) { pending.push(event); return; }
    for (const listener of listeners) listener(event);
  };
  const port = point => objects.get(point?.objectId)?.ports[point?.portId] || null;
  const list = kind => [...connections.values()].filter(c => !kind || c.kind === kind);
  const getParent = id => list().find(c => c.to.objectId === id) || null;
  function getTransportId(id) {
    const visited = new Set();
    while (id && !visited.has(id)) {
      visited.add(id);
      const parent = getParent(id);
      if (!parent) return null;
      if (parent.kind === 'transport') return objects.get(parent.from.objectId)?.transportId || parent.from.objectId;
      id = parent.from.objectId;
    }
    return null;
  }
  function transaction(fn) {
    if (transactionDepth) return fn();
    const oldConnections = new Map(connections), oldObjects = new Map(objects), oldSerial = serial;
    transactionDepth++;
    let result;
    try { result = fn(); }
    catch (error) {
      connections.clear(); objects.clear();
      for (const [id, value] of oldConnections) connections.set(id, value);
      for (const [id, value] of oldObjects) objects.set(id, value);
      serial = oldSerial; pending = []; transactionDepth--; throw error;
    }
    transactionDepth--;
    const events = pending; pending = [];
    if (events.length) emit({ type: 'change', batch: true,
      sequenceChanged: events.some(e => e.connection?.kind === 'sequence' || e.removed?.kind === 'sequence' || e.removedObjectId),
      structureChanged: events.some(e => e.structureChanged), events });
    return result;
  }
  const dragKind = (a, b, preferred) => [preferred, 'sequence', 'transport'].find(kind =>
    kind && port(a)?.accepts.includes(kind) && port(b)?.accepts.includes(kind));
  function validate(kind, a, b, excludeId = null) {
    const pa = port(a), pb = port(b);
    if (!pa || !pb) return { ok: false, reason: 'missing-port' };
    if (pa.direction === pb.direction) return { ok: false, reason: 'invalid-direction' };
    const from = pa.direction === 'out' ? a : b, to = pa.direction === 'in' ? a : b;
    if (from.objectId === to.objectId) return { ok: false, reason: 'self-connection' };
    if (![port(from), port(to)].every(p => p.accepts.includes(kind))) return { ok: false, reason: 'invalid-kind' };
    if (kind === 'sequence') {
      const visited = new Set(), queue = [to.objectId];
      while (queue.length) {
        const current = queue.pop();
        if (current === from.objectId) return { ok: false, reason: 'cycle' };
        if (visited.has(current)) continue;
        visited.add(current);
        for (const c of list(kind)) if (c.id !== excludeId && c.from.objectId === current) queue.push(c.to.objectId);
      }
    }
    for (const point of [from, to]) {
      const metadata = port(point);
      if (metadata.direction === 'in' && metadata.parentCapacity === 1) continue;
      const used = list(kind).filter(c => c.id !== excludeId && (same(c.from, point) || same(c.to, point))).length;
      if (used >= (metadata.capacity[kind] ?? 0) && metadata.occupied !== 'replace-child') {
        return { ok: false, reason: kind === 'sequence' && metadata.occupied === 'requires-promotion' ? 'requires-promotion' : 'occupied-port',
          port: endpoint(point), kind, from: endpoint(from), to: endpoint(to) };
      }
    }
    return { ok: true, from: endpoint(from), to: endpoint(to) };
  }
  function connect(kind, a, b, { id = null } = {}) {
    const duplicate = list(kind).find(c => (same(c.from, a) && same(c.to, b)) || (same(c.from, b) && same(c.to, a)));
    if (duplicate && (!id || id === duplicate.id)) return { ok: true, connection: duplicate };
    const result = validate(kind, a, b, id);
    if (!result.ok) {
      if (result.reason === 'requires-promotion') {
        const promoted = promotionResolver?.({ ...result, connectionId: id });
        if (promoted?.ok) return promoted;
        emit({ type: 'promotion-required', ...result });
      }
      return result;
    }
    let connectionId = id;
    if (!connectionId) do { connectionId = `connection:${serial++}`; } while (connections.has(connectionId));
    const connection = Object.freeze({ id: connectionId, kind, from: result.from, to: result.to });
    transaction(() => {
      if (port(result.from)?.occupied === 'replace-child') {
        for (const previous of list(kind)) if (same(previous.from,result.from) && previous.id !== connection.id) disconnect(previous.id);
      }
      // Both kinds occupy the same logical parent slot. Publish only the final
      // topology so observers never see a child simultaneously rooted twice.
      for (const previous of list()) if (previous.to.objectId === result.to.objectId && previous.id !== connection.id) disconnect(previous.id);
      const previous = connections.get(connection.id);
      if (previous && previous.kind !== kind) disconnect(previous.id);
      connections.set(connection.id, connection);
      emit({ type: 'change', connection });
    });
    return { ok: true, connection };
  }
  function disconnect(id) {
    const connection = connections.get(id);
    if (!connection) return false;
    connections.delete(id);
    if (editing?.connectionId === id) editing = null;
    emit({ type: 'change', removed: connection });
    return true;
  }
  return {
    registerObject(id, { ports = TOY_PORTS, transportId = null, structure = null } = {}) {
      objects.set(String(id), { ports, transportId: transportId ?? objects.get(String(id))?.transportId ?? null, structure });
    },
    touchObject(id) { emit({ type: 'change', structureChanged: true, objectId: id }); },
    setPromotionResolver(resolver) { promotionResolver = resolver; },
    transaction,
    removeObject(id) {
      const affected = list().filter(c => c.from.objectId === id || c.to.objectId === id);
      objects.delete(id);
      if (editing?.fixed.objectId === id || editing?.original?.from.objectId === id || editing?.original?.to.objectId === id) editing = null;
      for (const c of affected) connections.delete(c.id);
      if (affected.length) emit({ type: 'change', removedObjectId: id });
    },
    getObject: id => objects.get(id) || null,
    getObjectIds: () => [...objects.keys()],
    getPort: port, getParent, getTransportId, isRooted: id => !!getTransportId(id), list, validate, connect, disconnect,
    get: id => connections.get(id) || null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    beginDrag(point, { kind = 'sequence', connectionId = null, end = null } = {}) {
      const parent = port(point)?.direction === 'in' ? getParent(point.objectId) : null;
      if (!connectionId && parent) { connectionId = parent.id; end = 'from'; }
      const original = connectionId ? connections.get(connectionId) : null;
      if (connectionId && (!original || !['from', 'to'].includes(end))) return false;
      if (!original && !port(point)?.accepts.includes(kind)) return false;
      editing = Object.freeze(original
        ? { connectionId, kind: original.kind, end, original, fixed: original[end === 'from' ? 'to' : 'from'] }
        : { connectionId: null, kind, end: port(point).direction === 'out' ? 'to' : 'from', fixed: endpoint(point) });
      emit({ type: 'editing', editing });
      return true;
    },
    preview(target) {
      return editing ? validate(dragKind(editing.fixed, target, editing.kind), editing.fixed, target, editing.connectionId) : { ok: false, reason: 'not-editing' };
    },
    drop(target) {
      const edit = editing;
      if (!edit) return { ok: false, reason: 'not-editing' };
      editing = null;
      let result;
      if (!target) {
        if (edit.connectionId) disconnect(edit.connectionId);
        result = { ok: true, deleted: !!edit.connectionId };
      } else result = connect(dragKind(edit.fixed, target, edit.kind), edit.fixed, target, { id: edit.connectionId });
      emit({ type: 'editing', editing: null });
      return result;
    },
    cancelDrag() { editing = null; emit({ type: 'editing', editing: null }); },
    getEditing: () => editing,
    snapshot() { return Object.freeze({ connections: Object.freeze(list()), editing }); },
  };
}

export const connectionModel = createConnectionModel();
