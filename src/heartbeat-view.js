import { clearVerticalSlot } from './graph-placement.js';
import { heartbeatModel } from './heartbeats.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';

export function installHeartbeatView({ getWorld, getMainPoint, getSpawnPoint = getMainPoint, getScale = () => 1, onChange = () => {}, onCreateToy = () => {} }) {
  const elements = new Map();
  const style = document.createElement('style');
  style.textContent = `.heartbeat-toy{position:absolute;width:176px;min-height:104px;transform:translate(-50%,-50%);border:2px solid #9189de;border-radius:26px;background:#272442;color:#fff;z-index:20;padding:8px;box-sizing:border-box;touch-action:none;text-align:center;box-shadow:0 0 18px #9384ff44;font:12px system-ui}.heartbeat-toy[data-selected="true"]{border-color:#ffe496;box-shadow:0 0 18px #ffe49666}.heartbeat-toy strong{display:block;cursor:grab;margin-bottom:5px}.heartbeat-toy button{border:0;border-radius:12px;padding:4px 7px;margin:2px;background:#565075;color:white;cursor:pointer}.heartbeat-toy input{width:44px;background:#19172c;border:1px solid #8279ac;border-radius:7px;color:white;padding:3px}.heartbeat-toy .heartbeat-delete{position:absolute;right:2px;top:0;font-size:10px}.heartbeat-toy[data-playing="true"]{border-color:#b4f5d0}`;
  document.head.append(style);
  const create = document.createElement('button');
  create.id = 'add-heartbeat'; create.textContent = '+ Heartbeat'; create.title = 'Create an independent Heartbeat';
  create.style.cssText = 'position:fixed;right:16px;bottom:20px;z-index:1100;border:1px solid #ada2ed;border-radius:18px;padding:9px 13px;background:#34304f;color:white;cursor:pointer';
  document.body.append(create);
  create.addEventListener('click', () => {
    const desired = getSpawnPoint();
    const slot = clearVerticalSlot({x:desired.x-88,y:desired.y-52,width:176,height:104},
      heartbeatModel.list().map(h => {const p=h.id===MAIN_TRANSPORT_ID?getMainPoint():h.position;return {x:p.x-88,y:p.y-52,width:176,height:104};}),48);
    const point = {x:slot.x+88,y:slot.y+52};
    const record = heartbeatModel.create({ position: point });
    heartbeatModel.select(record.id); render(); onChange();
  });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.heartbeat-toy,#add-heartbeat,#topbar,.topbar')) return;
    heartbeatModel.select(null);
  });
  function render() {
    const world = getWorld(); if (!world) return;
    const records = heartbeatModel.list();
    for (const [id, element] of elements) if (!heartbeatModel.get(id)) { element.remove(); elements.delete(id); }
    for (const record of records) {
      let el = elements.get(record.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'heartbeat-toy'; el.dataset.heartbeatId = record.id;
        const title = document.createElement('strong'); title.textContent = record.name; el.append(title);
        const controls = document.createElement('div'), actions = document.createElement('div'); el.append(controls,actions);
        const play = document.createElement('button'); play.className = 'heartbeat-play'; controls.append(play);
        play.addEventListener('click', () => {
          heartbeatModel.select(record.id);
          const transport = heartbeatModel.transport(record.id);
          if (transport.state === 'playing') transport.pause(); else transport.play();
          onChange(); render();
        });
        const bpm = document.createElement('input'); bpm.type = 'number'; bpm.min = '30'; bpm.max = '200';
        bpm.setAttribute('aria-label', `${record.name} BPM`); controls.append(bpm, document.createTextNode(' BPM'));
        const updateTempo = () => { heartbeatModel.select(record.id); heartbeatModel.transport(record.id).setBpm(bpm.value); onChange(); };
        bpm.addEventListener('input', updateTempo);
        bpm.addEventListener('change', updateTempo);
        const reset = document.createElement('button'); reset.textContent = '↤ Start'; reset.title = 'Return this Heartbeat to Start';
        reset.addEventListener('click', () => { heartbeatModel.transport(record.id).returnToStart(); onChange(); }); actions.append(reset);
        const toy = document.createElement('button'); toy.textContent = '+ Toy'; toy.title = `Create a toy on ${record.name}`;
        toy.addEventListener('click', () => onCreateToy(record.id)); actions.append(toy);
        if (record.id !== MAIN_TRANSPORT_ID) {
          const remove = document.createElement('button'); remove.className = 'heartbeat-delete'; remove.textContent = '×';
          remove.title = `Delete ${record.name}`;
          remove.addEventListener('click', () => { heartbeatModel.remove(record.id); onChange(); render(); }); el.append(remove);
          title.addEventListener('pointerdown', event => {
            event.preventDefault(); title.setPointerCapture(event.pointerId);
            const start = { ...record.position }, x = event.clientX, y = event.clientY, scale = getScale();
            const move = e => { heartbeatModel.move(record.id, { x: start.x + (e.clientX-x)/scale, y: start.y + (e.clientY-y)/scale }); render(); };
            const end = () => { title.removeEventListener('pointermove',move); title.removeEventListener('pointerup',end); title.removeEventListener('pointercancel',end); onChange(); };
            title.addEventListener('pointermove',move); title.addEventListener('pointerup',end); title.addEventListener('pointercancel',end);
          });
        }
        el.addEventListener('pointerdown', () => heartbeatModel.select(record.id));
        elements.set(record.id, el);
      }
      if (el.parentNode !== world) world.append(el);
      const point = record.id === MAIN_TRANSPORT_ID ? getMainPoint() : record.position;
      if (el.style.left !== `${point.x}px`) el.style.left = `${point.x}px`;
      if (el.style.top !== `${point.y}px`) el.style.top = `${point.y}px`;
      const transport = heartbeatModel.transport(record.id), playing = transport.state === 'playing';
      const selected = String(heartbeatModel.target().id === record.id);
      if (el.dataset.selected !== selected) el.dataset.selected = selected;
      if (el.dataset.playing !== String(playing)) el.dataset.playing = String(playing);
      const button = el.querySelector('.heartbeat-play'), label = playing ? 'Ⅱ Pause' : '▶ Play';
      if (button.textContent !== label) button.textContent = label;
      const input = el.querySelector('input');
      if (document.activeElement !== input && input.value !== String(transport.bpm)) input.value = transport.bpm;
    }
  }
  return { render };
}
