import { MAIN_TRANSPORT_ID, transportRegistry } from './transport-registry.js';
import { connectionModel, HEARTBEAT_PORTS } from './connections.js';

export function createHeartbeatModel({ registry = transportRegistry, connections = connectionModel, changed = () => {} } = {}) {
  const records = new Map();
  let selected = null;
  function register(record) {
    records.set(record.id, record);
    connections.registerObject(record.id, { ports: HEARTBEAT_PORTS, transportId: record.transportId });
    return record;
  }
  register({ id: MAIN_TRANSPORT_ID, transportId: MAIN_TRANSPORT_ID, name: 'Main', position: { x: 0, y: 0 } });
  const model = {
    get: id => records.get(id), list: () => [...records.values()],
    get selectedId() { return selected; },
    target() { return records.get(selected) || records.get(MAIN_TRANSPORT_ID); },
    transport(id = model.target().id) { return registry.get(records.get(id)?.transportId); },
    select(id) { const next = records.has(id) ? id : null; if (selected === next) return; selected = next; changed(); try { document.dispatchEvent(new CustomEvent('heartbeat:selection')); } catch {} },
    create({ id, transportId, name, position = { x: 200, y: 0 }, bpm = 120, positionTick = 0 } = {}) {
      const transport = registry.create({ id: transportId || id, bpm, positionTick });
      const record = register({ id: id || transport.id, transportId: transport.id,
        name: name || `Heartbeat ${records.size + 1}`, position: { ...position } });
      changed(); return record;
    },
    move(id, position) { const record = records.get(id); if (record) { record.position = { ...position }; changed(); } },
    remove(id) {
      const record = records.get(id); if (!record || id === MAIN_TRANSPORT_ID) return false;
      connections.removeObject(id); registry.remove(record.transportId); records.delete(id);
      if (selected === id) model.select(null);
      changed(); return true;
    },
    snapshot() { return model.list().map(record => ({ ...record, position: { ...record.position },
      bpm: registry.get(record.transportId).bpm, positionTick: registry.get(record.transportId).positionTick,
      state: registry.get(record.transportId).state })); },
    restore(saved, legacyBpm = 120) {
      for (const record of model.list()) if (record.id !== MAIN_TRANSPORT_ID) model.remove(record.id);
      model.transport(MAIN_TRANSPORT_ID).pause();
      const main = saved?.find(record => record.id === MAIN_TRANSPORT_ID);
      model.transport(MAIN_TRANSPORT_ID).setBpm(main?.bpm ?? legacyBpm);
      model.transport(MAIN_TRANSPORT_ID).seekTick(main?.positionTick || 0);
      if (main) Object.assign(records.get(MAIN_TRANSPORT_ID), { name: main.name || 'Main', position: { ...main.position } });
      for (const record of saved || []) if (record.id !== MAIN_TRANSPORT_ID) model.create(record);
      model.select(null); changed(); // Reload stays paused; retained positions survive.
    },
  };
  return model;
}
export const heartbeatModel = createHeartbeatModel();

export function transportLoopInfo(transport, now) {
  if (!transport) return null;
  const state = transport.getState(), tick = state.currentTick, barLen = 240 / state.bpm;
  return { loopStartTime: transport.tickToAudioTime(0), barLen, barSec: barLen, beatLen: 60 / state.bpm,
    phase01: (tick % 384) / 384, now, tick, currentTick: tick, tickInBar: tick % 384,
    beatIndex: state.currentBeat, beatInBar: Math.floor((tick % 384) / 96), barIndex: state.currentBar, state: state.state };
}
