import { createChordProgressionEditor } from './chord-progression-editor.js';
import { progressionLabel, chordStepLabel } from './chord-progression.js';
import { isModifier, logicNodeLabel, signedSemitones } from './modifier-types.js';
import { GRAPH_ENDPOINT_DIAMETER, GRAPH_ENDPOINT_HIT_DIAMETER, GRAPH_MIDPOINT_DIAMETER, GRAPH_MIDPOINT_HIT_DIAMETER } from './graph-visuals.js';
import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { HEARTBEAT_OUTPUT_OFFSET } from './graph-placement.js';
import { connectionCurve, curvePath, curvePoint, projectConnectionPoint } from './connection-geometry.js';
import { structurePortPoint, structureToyHeight, structureToyWidth } from './structure-toys.js';
import { TICKS_PER_BEAT } from './audio-core.js';
import { STRUCTURE_TYPES, MAX_REPEAT_COUNT, structureTypeLabel } from './structure-types.js';
import { BASIC_LOGIC_TYPES, openAdvancedLogic, closeAdvancedLogic } from './logic-creation-menu.js';

const NS = 'http://www.w3.org/2000/svg';
const set = (node, key, value) => { if (node.getAttribute(key) !== String(value)) node.setAttribute(key, value); };
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) set(node, key, value);
  return node;
}

export function createConnectionView({ model, getContext, getPanels, getToyPoint, getHeartbeatPoint,
  onConnectionDrag = () => {}, getPulse = () => null, getStructurePulse = () => 0, onFrame = () => {}, getRenderedStructure = s => s, onStructureDrag = () => {},
  onStructureMove = null, onStructureDragUpdate = () => {}, onStructureDragEnd = () => {}, isBranchDragging = () => false, structureToys = null, onQuickAdd = () => {} }) {
  const svg = svgNode('svg', { class: 'connection-layer', 'aria-label': 'Musical connections' });
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
    // The board viewport clips this overlay. Clipping the SVG again would hide
    // sockets on visible toys when native focus scrolling offsets the layer.
    overflow: 'visible', pointerEvents: 'none', zIndex: '120' });
  const style = document.createElement('style');
  style.textContent = `
    .connection-layer .connection-path { fill:none; pointer-events:stroke; cursor:pointer; }
    .connection-layer .connection-hit { fill:none; stroke:transparent; stroke-width:18; pointer-events:stroke; cursor:pointer; }
    .connection-layer .connection-port { fill:#172539; stroke:#a3c6ff; stroke-width:2; pointer-events:all; cursor:crosshair; touch-action:none; }
    .connection-layer .transport-port { stroke:#b1a5ee; }
    .connection-layer .connection-path:hover { stroke:#e1ebff; }
    .connection-layer .graph-extend-object { overflow:visible; pointer-events:none; }
    .connection-layer .graph-extend { pointer-events:all; touch-action:none; }
    .graph-endpoint-overlay { position:absolute; inset:0; display:grid; place-items:center; color:#eef5ff; font:bold 18px system-ui; pointer-events:none; z-index:3; text-shadow:0 1px 3px #000; }
    .structure-activation { fill:none; stroke:#d9e8ff; pointer-events:none; }
    .graph-extend.compatible { --accent:#7ef1cb; }
    .graph-extend.requires-promotion { --accent:#ffcc7c; }
    .connection-layer .connection-port { stroke-width:2.5; fill:#263c59; }
    .connection-layer .connection-port.connected { fill:#1b2d43; stroke:#aec7e8; }
    .connection-layer .compatible { fill:#265f55; stroke:#7ef1cb; }
    .connection-layer .requires-promotion { fill:#634529; stroke:#ffcc7c; }
    .connection-layer .connection-midpoint { fill:#20304a; stroke:#93b1e5; stroke-width:1.5; pointer-events:all; cursor:pointer; }
    .connection-layer .selected .connection-path { stroke:#e1ebff; }
    .connection-layer .selected .connection-midpoint { fill:#6689c9; }
    .connection-layer .connection-midpoint { transition:filter .15s ease,stroke-width .15s ease; }
    .connection-layer .connection-midpoint-hit:hover + .connection-midpoint, .connection-layer .connection-midpoint:hover { filter:brightness(1.6) drop-shadow(0 0 5px #93b1e5); stroke-width:3; }
    .connection-layer .connection-midpoint-hit:active + .connection-midpoint, .connection-layer .connection-midpoint:active { filter:brightness(1.9); stroke-width:5; }
    .connection-layer .connection-label { fill:#dbe9ff; font-family:system-ui; pointer-events:none; }
    .connection-layer .connection-delete { fill:#422d3e; stroke:#ec9ba6; pointer-events:all; cursor:pointer; }
    .connection-layer .connection-preview { fill:none; stroke:#c2d7ff; stroke-width:6; pointer-events:none; }
    .connection-status { position:absolute; left:50%; bottom:24px; transform:translateX(-50%); padding:8px 14px; border-radius:12px; background:#243044; color:white; font:13px system-ui; pointer-events:none; z-index:121; }
    .connection-menu { position:absolute; padding:5px; border:1px solid #718fc2; border-radius:10px; background:#172539; color:white; z-index:122; box-shadow:0 5px 18px #0008; }
    .connection-menu button { display:block; min-height:44px; min-width:115px; padding:7px 12px; border:0; border-radius:6px; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .connection-menu button:hover,.connection-menu button[aria-pressed=true] { background:#344c72; }
    .connection-menu input { display:block; box-sizing:border-box; width:115px; margin:4px 0; padding:6px 10px; color:inherit; background:#263c59; border:1px solid #718fc2; border-radius:6px; }
    .connection-layer .structure-card { fill:#192f48; stroke:#7eb9e9; stroke-width:2; pointer-events:all; cursor:grab; touch-action:none; }
    .connection-layer .structure-card.transpose, .connection-layer .structure-card.chord-progression { fill:#243b33; stroke:#88d9b2; }
    .progression-controls { font:14px system-ui; color:#e8f1ff; pointer-events:auto; padding:0 12px; }
    .progression-summary { min-height:28px; text-align:center; font-weight:600; white-space:normal; overflow-wrap:anywhere; }
    .progression-row { display:flex; gap:6px; align-items:center; height:48px; }
    .progression-row span { width:16px; }
    .progression-controls select, .progression-controls button { min-height:44px; border:1px solid #88d9b2; border-radius:6px; background:#315849; color:#fff; font:14px system-ui; padding:4px 8px; }
    .progression-controls button:disabled { opacity:.35; }
    .progression-controls label { display:block; margin-top:4px; }
    .connection-layer .modifier-step { fill:#315849; stroke:#88d9b2; pointer-events:all; cursor:pointer; touch-action:none; }
    .connection-layer .modifier-step[aria-disabled=true] { opacity:.35; }
    .connection-menu .modifier-choice { color:#a2ebc4; border-top:1px solid #476455; }
    .connection-layer .structure-card.together { fill:#30254c; stroke:#b7a0f0; }
    .connection-layer .structure-card.selected { stroke:#fff; }
    .connection-layer .structure-name { fill:#e8f1ff; font-family:system-ui; font-weight:600; pointer-events:none; }
    .connection-layer .structure-count { pointer-events:all; cursor:pointer; }
    .connection-layer .timeline-entry { fill:#557daa; stroke:#9ccfff; pointer-events:all; cursor:ew-resize; touch-action:none; }
    .connection-layer .structure-move { fill:#4a6283; pointer-events:all; cursor:grab; touch-action:none; }
    .connection-layer .structure-minimise { fill:#263c59; stroke:#7eb9e9; pointer-events:all; cursor:pointer; }
    .connection-menu[aria-label="Add musical material"],.connection-menu[aria-label="Used material"] { min-width:180px; max-height:60vh; overflow:auto; }
    .connection-menu[aria-label="Add musical material"] button button,.connection-menu[aria-label="Used material"] button { min-height:44px; }
  `;
  document.head.append(style);
  const edgesGroup = svgNode('g'), cardsGroup = svgNode('g'), midpointsGroup = svgNode('g'), portsGroup = svgNode('g'), actionsGroup = svgNode('g');
  const previewPath = svgNode('path', { class: 'connection-preview', display: 'none' });
  const looseEndpoint=svgNode('circle',{class:'connection-loose-endpoint',r:10,fill:'#6689c9',stroke:'#dbe9ff','stroke-width':2,'pointer-events':'none',display:'none'});
  svg.append(edgesGroup, cardsGroup, midpointsGroup, portsGroup, actionsGroup, previewPath,looseEndpoint);
  const status = document.createElement('div');
  status.className = 'connection-status'; status.setAttribute('role', 'status'); status.hidden = true;
  const menu = document.createElement('div'); menu.className = 'connection-menu'; menu.hidden = true;
  menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Relationship');
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  const edges = new Map(), ports = new Map(), points = new Map();
  const cards = new Map();
  let selected = null, pointerId = null, pointer = null, dragOrigin = null, viewport = null, frameId = null, disposed = false;
  let selectedStructure = null, moving = null, editingEntry = null;
  let tapPoint = null, gestureMoved = false;
  let statusTimer = null;
  let menuOwner = null;
  let menuReturnFocus = null;
  let worldMode = false;
  const socketIntent=(point,kind)=>model.socketDragIntent(point,kind);
  function quickAdd(point){onQuickAdd(point);}
  function pointerPoint(event) {
    const rect=svg.getBoundingClientRect(), scale=worldMode?(getContext().transform?.scale||1):1;
    return {x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};
  }
  const closeMenu = () => { const wasOpen=!menu.hidden;menu.hidden = true; menuOwner = null;if(wasOpen)menuReturnFocus?.focus?.(); };
  const ownerOf = target => { for(let n=target;n;n=n.parentNode){const id=n.getAttribute?.('data-structure-id');if(id)return id;}return null; };
  function selectStructure(id) {
    if(selectedStructure&&selectedStructure!==id&&!moving&&!model.getEditing())structureToys?.setCollapsed(selectedStructure,true);
    selected=null;selectedStructure=id;structureToys?.setCollapsed(id,false);
  }
  const key = point => `${point.objectId}|${point.portId}`;
  function notify(message) {
    status.textContent = message; status.hidden = false;
    clearTimeout(statusTimer); statusTimer = setTimeout(() => { status.hidden = true; }, 2500);
  }
  function select(id) {
    selected = id;
    if (selectedStructure) structureToys?.setCollapsed(selectedStructure, true);
    selectedStructure = null;
    const connection = model.get(id);
    document.dispatchEvent(new CustomEvent('connection:selected', {
      detail: connection ? { id, kind: connection.kind } : null,
    }));
    render();
  }
  function start(event, point, options) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    closeMenu();
    if (!model.beginDrag(point, options)) return;
    tapPoint = !options?.connectionId && model.getPort(point)?.direction === 'out'
      && ['sequence','transport'].includes(options.kind) && !model.list().some(c => c.from.objectId === point.objectId && c.from.portId === point.portId) ? point : null;
    gestureMoved = false;
    pointerId = event.pointerId;
    pointer = { x: event.clientX, y: event.clientY };
    dragOrigin = pointer;
    svg.setPointerCapture?.(pointerId);
    render();
  }
  function position(node, point) { set(node, 'cx', point.x); set(node, 'cy', point.y); }
  function makePort(point, kind) {
    const group = svgNode('g', { class: 'connection-endpoint' });
    const hit=svgNode('circle',{fill:'transparent','pointer-events':'all',class:'connection-port-hit'});
    const circle = svgNode('circle', { r: 12, class: `connection-port${kind === 'transport' ? ' transport-port' : ''}`,
      tabindex: 0, role: 'button', 'data-object-id': point.objectId, 'data-port-id': point.portId,
      'aria-label': `${point.objectId} ${point.portId === 'input' ? 'input: connect a preceding toy' : kind === 'transport' ? 'output' : 'output: connect a following toy'}` });
    const title = svgNode('title'); title.textContent = circle.getAttribute('aria-label'); circle.append(title);
    circle.addEventListener('pointerdown', e => start(e, point, socketIntent(point, kind)));
    hit.addEventListener('pointerdown',e=>start(e,point,socketIntent(point,kind)));
    const label = svgNode('text', { class: 'connection-label', 'text-anchor': 'middle' });
    label.textContent = model.getPort(point)?.direction === 'out' ? '+' : '‹';
    const extendObject=svgNode('foreignObject',{class:'graph-extend-object',display:'none'});
    const extendButton=document.createElement('button');extendButton.type='button';extendButton.className='c-btn graph-extend';
    extendButton.setAttribute('data-socket-key',key(point));
    extendButton.setAttribute('aria-label',circle.getAttribute('aria-label'));
    for(const name of ['outer','glow','core']){const layer=document.createElement('div');layer.className=`c-btn-${name}`;extendButton.append(layer);}
    extendButton.addEventListener('pointerdown',e=>start(e,point,socketIntent(point,kind)));
    extendButton.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(extendButton.getAttribute('data-extend')==='true')quickAdd(point);render();}});
    const overlay=document.createElement('span');overlay.className='graph-endpoint-overlay';extendButton.append(overlay);
    extendObject.append(extendButton);
    group.append(hit,circle, label,extendObject); portsGroup.append(group);
    return { group, hit, circle, label, point, kind, extendObject, extendButton, overlay };
  }
  function openMenu(connectionId = null, structureId = null, anchorElement = null) {
    if (!structureToys) return;
    menu.replaceChildren();
    const c = model.get(connectionId);
    const s = structureId ? structureToys.get(structureId) : null;
    if (!c && !s) { closeMenu(); return; }
    menuOwner = s ? {structureId:s.id} : {connectionId:c.id};
    menuReturnFocus = anchorElement || (c ? edges.get(connectionId)?.midpoint : cards.get(structureId)?.typeButton);
    menu.setAttribute('aria-label', c ? 'Structure insertion' : 'Change structure type');
    const kind = c?.kind || 'sequence';
    const currentType = s?.type || 'sequence';
    const button = (label, action, pressed = null) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (pressed != null) b.setAttribute('aria-pressed', pressed);
      b.addEventListener('click', e => { e.stopPropagation(); closeMenu(); action(); render(); });
      menu.append(b);
    };
    if ((kind === 'sequence' || kind === 'transport')) {
      if (!isModifier(s?.type)) for (const type of (s ? STRUCTURE_TYPES : BASIC_LOGIC_TYPES)) button(structureTypeLabel(type), () => {
        if (s && structureToys.conversion(s.id,type).lossy) {
          menu.replaceChildren();
          const explanation=document.createElement('div');explanation.textContent=structureToys.conversion(s.id,type).message;menu.append(explanation);
          button(`Convert to ${structureTypeLabel(type)}`,()=>structureToys.setType(s.id,type,{allowLossy:true}));
          button('Keep Timeline',()=>{});menuOwner={structureId:s.id};menu.hidden=false;
        }
        else if (s) structureToys.setType(s.id, type);
        else structureToys.promote(connectionId, type);
      }, currentType === type);
    }
    if (c) {
      button('Advanced >', () => openAdvancedLogic({anchor:menuReturnFocus,returnFocus:menuReturnFocus,
        onChoose:type=>{if(model.get(connectionId))structureToys.promote(connectionId,type);render();}}));
    }
    if (s?.type === 'repeat') {
      const count=document.createElement('input');count.type='number';count.min='1';count.max=String(MAX_REPEAT_COUNT);count.value=String(s.count);
      count.setAttribute('aria-label','Repeat count');
      count.addEventListener('input',()=>{if(count.value !== '') {structureToys.setCount(s.id,count.value);render();}});
      count.addEventListener('change',()=>{structureToys.setCount(s.id,count.value);count.value=String(structureToys.get(s.id).count);render();});
      menu.append(count);
    }
    if (c) button('Disconnect', () => { model.disconnect(c.id); select(null); });
    const visual = edges.get(connectionId);
    let at = s && structureId ? projectConnectionPoint({ x: s.x + structureToyWidth(s)/2, y: s.y + 30 }, getContext().transform)
      : { x: Number(visual?.midpoint.getAttribute('cx')) || 0, y: Number(visual?.midpoint.getAttribute('cy')) || 0 };
    if(anchorElement){const r=anchorElement.getBoundingClientRect(),v=viewport.getBoundingClientRect();at={x:r.left-v.left+r.width/2,y:r.top-v.top+r.height/2};}
    else if(worldMode && !(s && structureId)) at=projectConnectionPoint(at,getContext().transform);
    menu.style.left = `${Math.max(8, Math.min((viewport.clientWidth || 1000) - 135, at.x - 55))}px`;
    menu.style.top = `${Math.max(8, at.y + 24)}px`; menu.hidden = false;menu.querySelector?.('button')?.focus?.();
  }
  const selectionHook = e => { if (e.detail) openMenu(e.detail.id); else closeMenu(); };
  document.addEventListener('connection:selected', selectionHook);
  function makeCard(s) {
    const group = svgNode('g', { id: s.id, 'data-structure-id': s.id });
    const rect = svgNode('rect', { rx: 12, tabindex: 0, role: 'button' });
    const activation = svgNode('rect', { rx:12, class:'structure-activation' });
    const name = svgNode('text', { class: 'structure-name', 'text-anchor': 'middle' });
    const count = svgNode('text', { class:'structure-name structure-count', 'text-anchor':'middle',role:'button',tabindex:0,'aria-label':'Edit repeat count' });
    const moveHandle = svgNode('rect', { class: 'structure-move', rx: 3, role: 'button', 'aria-label': 'Move structure' });
    const minimise = svgNode('rect', {class:'structure-minimise',rx:4,role:'button',tabindex:0,'aria-label':'Collapse structure'});
    const minimiseLabel=svgNode('text', {class:'structure-name','text-anchor':'middle'});
    const transposeControls=svgNode('g'), transposeSteps=[];
    for (const delta of [-1,1]) {
      const button=svgNode('rect',{class:'modifier-step',rx:8,role:'button',tabindex:0,
        'aria-label':delta<0?'Lower transpose by one semitone':'Raise transpose by one semitone'});
      const label=svgNode('text',{class:'structure-name','text-anchor':'middle'});label.textContent=delta<0?'−':'+';
      const change=e=>{e.preventDefault();e.stopPropagation();const current=structureToys.get(s.id);
        if(current?.type==='transpose') {structureToys.setSemitones(s.id,current.semitones+delta);render();}};
      button.addEventListener('pointerdown',change);
      button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')change(e);});
      transposeControls.append(button,label);transposeSteps.push({button,label,delta});
    }
    const progressionEditor=createChordProgressionEditor(structureToys,s.id,()=>render(),()=>{closeMenu();selectStructure(s.id);render();});
    const tracksGroup=svgNode('g'),tracks=new Map();
    const choose = e => {
      e.preventDefault(); e.stopPropagation(); closeMenu();selectStructure(s.id);
      render();
    };
    const typeButton = svgNode('rect', {class:'structure-minimise structure-type',rx:4,role:'button',tabindex:0,'aria-label':'Change structure type'});
    const editType = e => { choose(e); openMenu(null,s.id); };
    typeButton.addEventListener('pointerdown',editType);
    typeButton.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')editType(e);});
    const beginMove = (e, selectOnTap=false) => {
      if(e.button!=null&&e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      if(moving){moving=null;onStructureDragEnd(null,true);}
      onStructureDrag(s.id,e);
      closeMenu();
      const current=structureToys.get(s.id);
      moving={id:s.id,x:current.x,y:current.y,onTap:selectOnTap?()=>choose(e):null};gestureMoved=false;
      pointerId=e.pointerId;pointer=dragOrigin={x:e.clientX,y:e.clientY};
      svg.setPointerCapture?.(pointerId);
    };
    rect.addEventListener('pointerdown', e=>beginMove(e,true));
    count.addEventListener('pointerdown',editType);
    count.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')editType(e);});
    rect.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') choose(e); });
    moveHandle.addEventListener('pointerdown', e=>beginMove(e));
    const toggle=e=>{e.preventDefault();e.stopPropagation();closeMenu();const current=structureToys.get(s.id);structureToys.setCollapsed(s.id,!current.collapsed);if(!current.collapsed)selectedStructure=null;else selectStructure(s.id);render();};
    minimise.addEventListener('pointerdown',toggle);
    minimise.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')toggle(e);});
    group.append(rect, activation, typeButton, name, count, transposeControls, progressionEditor.object, tracksGroup, moveHandle,minimise,minimiseLabel); cardsGroup.append(group);
    return { group, rect, activation, typeButton, name, count, transposeControls, transposeSteps, progressionEditor, moveHandle, minimise,minimiseLabel, tracksGroup, tracks };
  }
  function makeEdge(c) {
    const group = svgNode('g', { 'data-connection-id': c.id });
    const middleGroup = svgNode('g', { 'data-connection-id': c.id });
    const actions = svgNode('g', { 'data-connection-id': c.id });
    const hit = svgNode('path', { class: 'connection-hit', tabindex: 0, role: 'button', 'aria-label': 'Select connection' });
    const path = svgNode('path', { class: 'connection-path' });
    const pulse = svgNode('path', { fill: 'none', stroke: 'rgba(180,205,255,.65)',
      'stroke-width': 12, 'pointer-events': 'none', class:'connection-transition', opacity:'.55' });
    const midpointHit=svgNode('circle',{r:GRAPH_MIDPOINT_HIT_DIAMETER/2,class:'connection-midpoint-hit',fill:'transparent','pointer-events':'all'});
    const midpoint = svgNode('circle', { r: GRAPH_MIDPOINT_DIAMETER/2, class: 'connection-midpoint', tabindex: 0, role: 'button', 'aria-label': 'Connection options' });
    const remove = svgNode('circle', { r: 10, class: 'connection-delete', tabindex: 0, role: 'button', 'aria-label': 'Disconnect connection' });
    const cross = svgNode('text', { class: 'connection-label', 'text-anchor': 'middle' }); cross.textContent = '×';
    for (const node of [hit, path, midpoint,midpointHit]) node.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); select(c.id); });
    for (const node of [hit, midpoint]) node.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c.id); }
    });
    const disconnect = e => { e.stopPropagation(); e.preventDefault(); model.disconnect(c.id); select(null); };
    remove.addEventListener('pointerdown', disconnect);
    remove.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') disconnect(e); });
    group.append(hit, path, pulse); edgesGroup.append(group);
    middleGroup.append(midpointHit,midpoint); midpointsGroup.append(middleGroup);
    actions.append(remove, cross); actionsGroup.append(actions);
    return { group, middleGroup, actions, hit, path, pulse, midpoint,midpointHit, remove, cross };
  }
  function render() {
    if (disposed) return;
    if (menuOwner && (menuOwner.structureId ? !structureToys?.get(menuOwner.structureId) : !model.get(menuOwner.connectionId))) closeMenu();
    const context = getContext();
    if (!context?.viewportEl) return;
    if (viewport !== context.viewportEl) {
      viewport = context.viewportEl; viewport.append(status);
      if (structureToys) viewport.append(menu);
    }
    worldMode=!!context.worldEl;
    const host=context.worldEl||viewport;
    if(svg.parentNode!==host)host.append(svg);
    Object.assign(svg.style,{width:worldMode?'1px':'100%',height:worldMode?'1px':'100%'});
    const geometryTransform=worldMode?{scale:1,tx:0,ty:0}:context.transform;
    const desired = new Map();
    for (const panel of getPanels()) {
      if (context.visible && !context.visible(panel)) continue;
      for (const portId of ['input', 'output']) {
        const point = { objectId: panel.id, portId };
        const anchor = getToyPoint(panel, portId !== 'output' ? 'left' : 'right');
        const world=anchor;
        if (world && Number.isFinite(world.x) && Number.isFinite(world.y)) desired.set(key(point), { point, world, kind: 'sequence' });
      }
    }
    const visibleStructures = new Set();
    for (const logical of structureToys?.list() || []) {
      const s=getRenderedStructure(structureToys.get(logical.id));
      if (context.visible && !context.visible({ dataset: { artOwnerId: s.artOwnerId } })) continue;
      visibleStructures.add(s.id);
      let card = cards.get(s.id);
      if (!card) { card = makeCard(s); cards.set(s.id, card); }
      const pos = projectConnectionPoint(s, geometryTransform), scale = geometryTransform?.scale || 1;
      set(card.rect, 'x', pos.x); set(card.rect, 'y', pos.y);
      const width=structureToyWidth(s);
      set(card.rect, 'width', width * scale); set(card.rect, 'height', structureToyHeight(s) * scale);
      set(card.rect, 'class', `structure-card ${s.type}${selectedStructure === s.id ? ' selected' : ''}`);
      const flash=getStructurePulse(s.id);
      for(const attr of ['x','y','width','height'])set(card.activation,attr,card.rect.getAttribute(attr));
      set(card.activation,'opacity',flash);set(card.activation,'stroke-width',(3+5*flash)*scale);
      card.activation.style.filter='drop-shadow(0 0 '+10*scale+'px #d9e8ff)';
      set(card.rect, 'aria-label', `${s.name?s.name+' · ':''}${logicNodeLabel(s.type)}${isModifier(s.type)?'':' structure'}`);
      set(card.rect, 'aria-expanded', !s.collapsed);
      set(card.group,'data-collapsed',!!s.collapsed);set(card.group,'data-node-kind',isModifier(s.type)?'modifier':'structure');
      set(card.typeButton,'display',s.collapsed||isModifier(s.type)?'none':'inline');
      set(card.typeButton,'x',pos.x+36*scale);set(card.typeButton,'y',pos.y+5*scale);
      set(card.typeButton,'width',(width-72)*scale);set(card.typeButton,'height',30*scale);
      set(card.name, 'x', pos.x + width/2 * scale); set(card.name, 'y', pos.y + 30 * scale);
      set(card.name, 'font-size', (s.collapsed?14:18) * scale);
      const label = s.type==='chord-progression' ? (s.collapsed ? 'Chords: '+progressionLabel(s.chords) : 'Chord Progression') : s.type==='transpose' ? (s.collapsed?'Tr '+signedSemitones(s.semitones):'Transpose') : s.collapsed ? (s.type==='repeat'?`×${s.count}`:s.type==='sequence'?'Seq':structureTypeLabel(s.type)) : `${structureTypeLabel(s.type)} ▾`;
      if (card.name.textContent !== (s.name || label)) card.name.textContent = s.name || label;
      set(card.count,'display',(s.type === 'repeat'||s.type==='transpose')&&!s.collapsed?'inline':'none');
      set(card.count,'class',s.type==='transpose'?'structure-name modifier-value':'structure-name structure-count');
      set(card.count,'role',s.type==='transpose'?'status':'button');
      set(card.count,'tabindex',s.type==='transpose'?-1:0);
      set(card.count,'aria-label',s.type==='transpose'?'Transpose '+signedSemitones(s.semitones)+' semitones':'Edit repeat count');
      set(card.count,'x',pos.x+width/2*scale);set(card.count,'y',pos.y+85*scale);set(card.count,'font-size',24*scale);
      set(card.progressionEditor.object,'display',s.type==='chord-progression'&&!s.collapsed?'inline':'none');
      if(s.type==='chord-progression'){
        set(card.progressionEditor.object,'x',0);set(card.progressionEditor.object,'y',0);
        set(card.progressionEditor.object,'width',width-24);set(card.progressionEditor.object,'height',structureToyHeight(s)-48);
        set(card.progressionEditor.object,'transform',`translate(${pos.x+12*scale} ${pos.y+44*scale}) scale(${scale})`);
        card.progressionEditor.render(s);
        set(card.name,'font-size',s.collapsed?(s.chords.length>6?12:14)*scale:16*scale);
        if(s.collapsed){set(card.count,'display','inline');set(card.count,'x',pos.x+width/2*scale);set(card.count,'y',pos.y+58*scale);set(card.count,'font-size',14*scale);set(card.count,'class','structure-name');set(card.count,'role','status');set(card.count,'aria-label','Chord step duration');set(card.count,'tabindex',-1);card.count.textContent=chordStepLabel(s.stepTicks);}
      }
      set(card.transposeControls,'display',s.type==='transpose'&&!s.collapsed?'inline':'none');
      if(s.type==='transpose')card.count.textContent=signedSemitones(s.semitones);
      for(const control of card.transposeSteps){
        const x=pos.x+(control.delta<0?32:148)*scale;
        set(control.button,'x',x);set(control.button,'y',pos.y+57*scale);set(control.button,'width',44*scale);set(control.button,'height',44*scale);
        set(control.button,'aria-disabled',control.delta<0?s.semitones<=-12:s.semitones>=12);
        set(control.label,'x',x+22*scale);set(control.label,'y',pos.y+85*scale);set(control.label,'font-size',24*scale);
      }
      if(s.type === 'repeat')card.count.textContent=`× ${s.count}`;
      const entries=s.type==='timeline'&&!s.collapsed?structureToys.getTimelineEntries(s.id):[];
      const endTick=Math.max(TICKS_PER_BEAT*4,...entries.map(e=>e.offsetTick+e.durationTicks));
      const pixelsPerTick=(width-124)/endTick;
      const retained=new Set();
      for(const [i,entry] of entries.entries()) {
        retained.add(entry.portId);let track=card.tracks.get(entry.portId);
        if(!track) {
          const group=svgNode('g'),bar=svgNode('rect',{class:'timeline-entry',rx:4,role:'slider',tabindex:0,'aria-valuemin':0,'data-timeline-id':s.id,'data-entry-port':entry.portId});
          const label=svgNode('text',{class:'structure-name'}),title=svgNode('title');bar.append(title);group.append(label,bar);card.tracksGroup.append(group);
          track={group,bar,label,title};card.tracks.set(entry.portId,track);
          bar.addEventListener('pointerdown',e=>{
            if(e.button!=null&&e.button!==0)return;e.preventDefault();e.stopPropagation();
            const current=structureToys.getTimelineEntries(s.id).find(e=>e.portId===entry.portId);if(!current)return;
            closeMenu();selectStructure(s.id);pointerId=e.pointerId;pointer=dragOrigin={x:e.clientX,y:e.clientY};
            editingEntry={id:s.id,portId:entry.portId,offsetTick:current.offsetTick,ticksPerPixel:1/(card.pixelsPerTick*(getContext().transform?.scale||1))};
            svg.setPointerCapture?.(pointerId);
          });
          bar.addEventListener('keydown',e=>{
            if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();
            const current=structureToys.getTimelineEntries(s.id).find(e=>e.portId===entry.portId);
            if(current)structureToys.setOffset(s.id,entry.portId,current.offsetTick+(e.key==='ArrowRight'?1:-1)*TICKS_PER_BEAT);render();
          });
        }
        const y=projectConnectionPoint(structurePortPoint(s,entry.portId),geometryTransform).y;
        set(track.label,'x',pos.x+8*scale);set(track.label,'y',y+4*scale);set(track.label,'font-size',12*scale);
        track.label.textContent=`${i+1} ${entry.label}`;set(track.label,'display','inline');
        set(track.bar,'x',pos.x+(102+entry.offsetTick*pixelsPerTick)*scale);set(track.bar,'y',y-8*scale);
        set(track.bar,'width',Math.max(6,entry.durationTicks*pixelsPerTick*scale));set(track.bar,'height',16*scale);
        set(track.bar,'aria-label',`Timeline entry ${i+1}: ${entry.label}`);set(track.bar,'aria-valuenow',entry.offsetTick);
        set(track.bar,'aria-valuetext',`Start +${entry.offsetTick/TICKS_PER_BEAT} beats`);
        track.title.textContent=`${entry.label}: +${entry.offsetTick/TICKS_PER_BEAT} beats, length ${entry.durationTicks/TICKS_PER_BEAT} beats`;
      }
      card.pixelsPerTick=pixelsPerTick;
      for(const [port,track]of card.tracks)if(!retained.has(port)){track.group.remove();card.tracks.delete(port);}

      set(card.moveHandle, 'x', pos.x + 7 * scale); set(card.moveHandle, 'y', pos.y + 5 * scale);
      set(card.moveHandle, 'width', 24 * scale); set(card.moveHandle, 'height', 24 * scale);
      set(card.minimise,'x',pos.x+(width-30)*scale);set(card.minimise,'y',pos.y+5*scale);
      set(card.minimise,'width',24*scale);set(card.minimise,'height',24*scale);
      set(card.minimise,'aria-label',s.collapsed?'Expand structure':'Collapse structure');
      set(card.minimiseLabel,'x',pos.x+(width-18)*scale);set(card.minimiseLabel,'y',pos.y+22*scale);set(card.minimiseLabel,'font-size',18*scale);
      card.minimiseLabel.textContent=s.collapsed?'+':'−';
      for (const portId of Object.keys(model.getObject(s.id)?.ports || {})) {
        const point = { objectId: s.id, portId };
        desired.set(key(point), { point, world: structurePortPoint(s, portId), kind: 'sequence' });
      }
    }
    for (const [id, card] of cards) if (!visibleStructures.has(id)) { card.group.remove(); cards.delete(id); }
    for (const id of model.getObjectIds().filter(id => model.getObject(id)?.ports.output?.accepts.includes('transport'))) {
      const heartbeat = { objectId: id, portId: 'output' };
      if (context.showHeartbeat !== false) desired.set(key(heartbeat), { point: heartbeat, world: getHeartbeatPoint(id), kind: 'transport' });
    }
    points.clear();
    const editing = model.getEditing();
    for (const [id, value] of desired) {
      let visual = ports.get(id);
      if (!visual) { visual = makePort(value.point, value.kind); ports.set(id, visual); }
      const projected = projectConnectionPoint(value.world, geometryTransform);
      if (value.kind === 'transport') projected.x += HEARTBEAT_OUTPUT_OFFSET*(geometryTransform?.scale||1);
      points.set(id, projected); position(visual.circle, projected);position(visual.hit,projected);
      const structure = structureToys?.get(value.point.objectId);
      if(structure)set(visual.group,'data-structure-id',structure.id);
      const attached = model.list(null,{includeSuspended:true}).some(c =>
        (key(c.from)===key(value.point) && !(editing?.suspended && editing.connectionId===c.id && editing.end==='from'))
        || ((key(c.to)===key(value.point)) && !(editing?.suspended && editing.connectionId===c.id && editing.end==='to')));
      set(visual.circle, 'data-connected', attached);
      const extend = !attached && model.getPort(value.point)?.direction==='out';
      const scale=geometryTransform?.scale||1,diameter=GRAPH_ENDPOINT_DIAMETER*scale,padding=(GRAPH_ENDPOINT_HIT_DIAMETER-GRAPH_ENDPOINT_DIAMETER)/2*scale;
      set(visual.extendObject,'display','inline');
      set(visual.extendObject,'x',projected.x-diameter/2-padding);set(visual.extendObject,'y',projected.y-diameter/2-padding);
      set(visual.extendObject,'width',diameter+padding*2);set(visual.extendObject,'height',diameter+padding*2);
      visual.extendButton.style.cssText=`--c-btn-size:${diameter}px;--c-btn-icon-url:url('./assets/UI/${extend?'T_ButtonExtend':'T_ButtonEmpty'}.png');position:absolute;left:${padding}px;top:${padding}px`;
      set(visual.circle,'display','none');set(visual.label,'display','none');
      set(visual.extendButton,'data-extend',extend);
      set(visual.circle,'tabindex',-1);set(visual.circle,'aria-hidden','true');
      if (structure) {
        const childEdge = attached && model.list('sequence',{includeSuspended:true}).find(c => c.from.objectId === structure.id && c.from.portId === value.point.portId);
        const text = value.point.portId === 'input' ? '‹' : childEdge ? String(Number(value.point.portId.split(':')[1]) + 1) : '+';
        if (visual.label.textContent !== text) visual.label.textContent = text;
      }
      else {
        const text = value.point.portId === 'input' ? '‹' : attached ? '·' : '+';
        if (visual.label.textContent !== text) visual.label.textContent = text;
      }
      set(visual.label, 'x', projected.x); set(visual.label, 'y', projected.y + (structure?6:4)*(geometryTransform?.scale||1));
      set(visual.hit,'r',GRAPH_ENDPOINT_HIT_DIAMETER/2*scale);
      set(visual.circle,'r',GRAPH_ENDPOINT_DIAMETER/2*scale);
      visual.overlay.textContent=extend?'':visual.label.textContent;
      visual.overlay.style.fontSize=18*scale+'px';
      const result = editing ? model.preview(value.point) : null;
      set(visual.extendButton,'class',`c-btn graph-extend${result?.ok?' compatible':result?.reason==='requires-promotion'?' requires-promotion':''}`);
      set(visual.circle, 'class', `connection-port${attached ? ' connected' : ''}${value.kind === 'transport' ? ' transport-port' : ''}${result?.ok ? ' compatible' : result?.reason === 'requires-promotion' ? ' requires-promotion' : ''}`);
    }
    for (const [id, visual] of ports) if (!desired.has(id)) { visual.group.remove(); ports.delete(id); }
    // Shared uses terminate at the same visible input artwork. No extra socket.
    const present = new Set();
    for (const c of model.list(null,{includeSuspended:true})) {
      let a = points.get(key(c.from)), b = points.get(key(c.to));
      const reconnect=editing?.connectionId===c.id && gestureMoved && pointer;
      if(reconnect){const loose=pointerPoint({clientX:pointer.x,clientY:pointer.y});if(editing.end==='from')a=loose;else b=loose;}
      if (!a || !b) continue;
      present.add(c.id);
      let visual = edges.get(c.id);
      if (!visual) { visual = makeEdge(c); edges.set(c.id, visual); }
      set(visual.hit,'aria-label','Select connection');
      set(visual.midpoint,'aria-label','Connection options');
      set(visual.group, 'class', `${c.kind}${selected === c.id ? ' selected' : ''}`);
      set(visual.middleGroup, 'class', `${c.kind}${selected === c.id ? ' selected' : ''}`);
      set(visual.group, 'display', 'inline');
      set(visual.middleGroup, 'display', reconnect ? 'none' : 'inline');
      set(visual.actions,'display',reconnect?'none':'inline');
      set(visual.hit,'pointer-events',reconnect?'none':'stroke');
      const geometryKey=[a.x,a.y,b.x,b.y].join(',');
      if(visual.geometryKey!==geometryKey){
        const curve=connectionCurve(a,b);visual.geometry={path:curvePath(curve),middle:curvePoint(curve,.5)};visual.geometryKey=geometryKey;
      }
      const {path,middle}=visual.geometry;
      set(visual.path, 'd', path); set(visual.hit, 'd', path); position(visual.midpoint, middle);position(visual.midpointHit,middle);
      const controlScale=geometryTransform?.scale||1;
      set(visual.midpoint,'r',GRAPH_MIDPOINT_DIAMETER/2*controlScale);set(visual.midpointHit,'r',GRAPH_MIDPOINT_HIT_DIAMETER/2*controlScale);
      set(visual.remove,'r',10*controlScale);set(visual.cross,'font-size',12*controlScale);
      position(visual.remove, { x: middle.x, y: middle.y - 40*controlScale });
      set(visual.cross, 'x', middle.x); set(visual.cross, 'y', middle.y - 36*controlScale);
      for (const node of [visual.remove, visual.cross]) set(node, 'display', selected === c.id ? 'inline' : 'none');
      const pulsing = getPulse(c);
      set(visual.path, 'stroke-width', pulsing ? 10 : 6);
      set(visual.path, 'stroke', pulsing ? '#f5fbff' : '#99b9ff');
      set(visual.path,'stroke-dasharray','none');
      set(visual.pulse, 'display', pulsing ? 'inline' : 'none');
      set(visual.pulse, 'd', path);

    }
    for (const [id, visual] of edges) if (!present.has(id)) { visual.group.remove(); visual.middleGroup.remove(); visual.actions.remove(); edges.delete(id); }
    // Paths sit below all midpoint controls and ports.
    set(looseEndpoint,'display',editing&&pointer&&gestureMoved?'inline':'none');
    if(editing&&pointer&&gestureMoved){position(looseEndpoint,pointerPoint({clientX:pointer.x,clientY:pointer.y}));set(looseEndpoint,'r',10*(geometryTransform?.scale||1));}
    if (editing && !editing.connectionId && pointer) {
      const fixed = points.get(key(editing.fixed));
      const loose = pointerPoint({clientX:pointer.x,clientY:pointer.y});
      if (fixed) {
        set(previewPath, 'display', 'inline');
        set(previewPath, 'd', curvePath(connectionCurve(editing.end === 'to' ? fixed : loose, editing.end === 'to' ? loose : fixed)));
      }
    } else set(previewPath, 'display', 'none');
  }
  function targetAt(event) {
    // A viewport may have a native scroll offset (including focus scrolling).
    // Pointer coordinates belong to the rendered SVG, not its container box.
    const point = pointerPoint(event);
    let target = null, nearest = Infinity;
    for (const [id, projected] of points) {
      if(!ports.has(id))continue;
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance <= Number(ports.get(id).hit.getAttribute('r')) && distance < nearest) { nearest = distance; target = ports.get(id).point; }
    }
    return target;
  }
  const move = e => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault(); pointer = { x: e.clientX, y: e.clientY };
    if (dragOrigin && Math.hypot(pointer.x - dragOrigin.x, pointer.y - dragOrigin.y) >= 4) gestureMoved = true;
    if(gestureMoved&&model.getEditing()?.connectionId&&!model.getEditing().suspended){onConnectionDrag();model.detachDrag();}
    if(editingEntry)structureToys.setOffset(editingEntry.id,editingEntry.portId,
      editingEntry.offsetTick+(pointer.x-dragOrigin.x)*editingEntry.ticksPerPixel);
    if (moving && Math.hypot(pointer.x - dragOrigin.x, pointer.y - dragOrigin.y) >= 4) {
      closeMenu();
      onStructureDragUpdate(e);
      const scale = getContext().transform?.scale || 1;
      const x=moving.x+(pointer.x-dragOrigin.x)/scale,y=moving.y+(pointer.y-dragOrigin.y)/scale;
      if(onStructureMove)onStructureMove(moving.id,x,y);else structureToys.move(moving.id,x,y);
    }
    render();
  };
  const end = e => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault(); e.stopPropagation();
    if(editingEntry) {
      structureToys.setOffset(editingEntry.id,editingEntry.portId,editingEntry.offsetTick+(e.clientX-dragOrigin.x)*editingEntry.ticksPerPixel);
      editingEntry=null;pointerId=null;pointer=dragOrigin=null;render();return;
    }
    if (moving) {
      const onTap=!gestureMoved?moving.onTap:null;
      moving = null; pointerId = null; pointer = dragOrigin = null;onStructureDragEnd(e,!gestureMoved);
      onTap?.();render();return;
    }
    const moved = gestureMoved || (dragOrigin && Math.hypot(e.clientX - dragOrigin.x, e.clientY - dragOrigin.y) >= 4);
    const result = moved ? model.drop(targetAt(e)) : (model.cancelDrag(), { ok: true });
    if (!moved && tapPoint) quickAdd(tapPoint);
    tapPoint = null;
    if (!result.ok) notify(result.reason === 'requires-promotion' ? 'This junction needs a Structure toy. Existing connection kept.' : 'These ports cannot connect. Existing connection kept.');
    if (result.connection){
      selected = result.connection.id;
    }
    pointerId = null; pointer = dragOrigin = null; render();
  };
  const cancel = () => { if(moving)onStructureDragEnd(null,true);tapPoint = null; moving = null; editingEntry=null; pointerId = null; pointer = dragOrigin = null; model.cancelDrag(); render(); };
  const reset = () => { closeAdvancedLogic();closeMenu(); selected = selectedStructure = null; cancel(); status.hidden=true; clearTimeout(statusTimer); };
  const outside = e => {
    for (let node=e.target;node;node=node.parentNode) if(node===menu)return;
    if(selectedStructure && ownerOf(e.target)===selectedStructure)return;
    closeMenu();
    if(selectedStructure&&!moving&&!isBranchDragging()&&!model.getEditing()&&!editingEntry){structureToys?.setCollapsed(selectedStructure,true);selectedStructure=null;}render();
  };
  const keyboard = e => {
    if (e.key === 'Escape') { reset(); select(null); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) && !e.target?.isContentEditable) {
      e.preventDefault(); model.disconnect(selected); select(null);
    }
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', cancel);
  svg.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancel(); });
  document.addEventListener('keydown', keyboard);
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('blur', cancel);
  const unsubscribe = model.subscribe(event => {
    if((moving&&!structureToys?.get(moving.id))||(editingEntry&&!structureToys?.get(editingEntry.id)))cancel();
    if(selected&&!model.get(selected))selected=null;
    if(selectedStructure&&!structureToys?.get(selectedStructure))selectedStructure=null;
    for (const change of event.events || [event]) {
      if (change.structureCreated && structureToys?.get(change.objectId)) selectStructure(change.objectId);
    }
    if (event.type === 'promotion-required') notify('This junction needs a Structure toy. Existing connection kept.');
    globalThis.__CONNECTION_DEBUG = model.snapshot(); render();
  });
  function frame() { if (disposed) return; onFrame(); render(); frameId = requestAnimationFrame(frame); }
  frameId = requestAnimationFrame(frame);
  return { render, select, focusStructure:selectStructure, reset, dispose() {
    closeAdvancedLogic({restoreFocus:false}); disposed = true; cancelAnimationFrame(frameId); clearTimeout(statusTimer); unsubscribe();
    document.removeEventListener('keydown', keyboard); window.removeEventListener('blur', cancel);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('connection:selected', selectionHook);
    svg.remove(); menu.remove(); status.remove(); style.remove();
  } };
}
