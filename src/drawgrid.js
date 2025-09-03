// src/drawgrid.js
// Minimal, scoped Drawing Grid — 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.

export function createDrawGrid(panel, { cols = 16, rows = 12, toyId, bpm = 120 } = {}) {
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');
  if (!body) {
    console.error('[drawgrid] Fatal: could not find .toy-body element!');
    return;
  }

  // Layers
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  Object.assign(grid.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  Object.assign(paint.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  body.appendChild(grid);  // Grid canvas is on the bottom
  body.appendChild(paint); // Paint canvas is on top

  const gctx = grid.getContext('2d');
  const pctx = paint.getContext('2d', { willReadFrequently: true });

  // State
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0, dpr=1;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  // For live-drawing, we save the canvas state and restore it on each move.
  let savedImageData = null;

  // UI: ensure Eraser button exists in header
  const header = panel.querySelector('.toy-header');
  if (header){
    const right = header.querySelector('.toy-controls-right') || header;
    let er = header.querySelector('[data-erase]');
    if (!er){
      er = document.createElement('button'); er.type='button'; er.textContent='Eraser'; er.className='toy-btn'; er.setAttribute('data-erase','1');
      right.appendChild(er);
    }
    er.addEventListener('click', ()=>{ erasing = !erasing; er.setAttribute('aria-pressed', String(erasing)); });
  }

  function layout(){
    const newDpr = window.devicePixelRatio || 1;
    const r = body.getBoundingClientRect();
    const newW = Math.max(1, r.width|0);
    const newH = Math.max(1, r.height|0);

    if (newW !== cssW || newH !== cssH || newDpr !== dpr) {
      dpr = newDpr;
      cssW = newW;
      cssH = newH;
      const w = cssW * dpr;
      const h = cssH * dpr;
      grid.width = w; grid.height = h;
      paint.width = w; paint.height = h;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      topPad = Math.max(24, Math.round(cssH*0.12));
      cw = cssW/cols; ch=(cssH-topPad)/rows;
      drawGrid();
      // On resize, the drawing is cleared. This is a simple way to handle complex redraw logic.
      pctx.clearRect(0,0,cssW,cssH);
    }
  }

  function drawGrid(){
    gctx.clearRect(0,0,cssW,cssH);
    // top activation strip
    gctx.fillStyle = 'rgba(255,255,255,0.08)'; gctx.fillRect(0,0,cssW,topPad);

    // Draw a border between activation strip and grid
    gctx.strokeStyle = 'rgba(255,255,255,0.5)';
    gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(0, topPad); gctx.lineTo(cssW, topPad); gctx.stroke();

    // Internal grid lines
    gctx.strokeStyle='rgba(255,255,255,0.4)';
    // verticals (full height, to show columns in activation strip)
    for(let i=1;i<cols;i++){ gctx.beginPath(); gctx.moveTo(i*cw,0); gctx.lineTo(i*cw,cssH); gctx.stroke(); }
    // horizontals (grid area only)
    for(let j=1;j<rows;j++){ gctx.beginPath(); gctx.moveTo(0, topPad+j*ch); gctx.lineTo(cssW, topPad+j*ch); gctx.stroke(); }
  }

  function drawCurrentStroke(ctx, stroke, isErasing){
    if (!stroke || stroke.pts.length < 2) return;
    ctx.beginPath();
    for (let i=0; i<stroke.pts.length; i++){
      const pt=stroke.pts[i];
      if (!i) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    pctx.lineCap='round'; pctx.lineJoin='round';
    ctx.lineWidth = Math.max(4, Math.round(Math.min(cw,ch)*0.35));
    ctx.strokeStyle = isErasing ? 'rgba(255,96,96,0.9)' : 'rgba(95,179,255,0.95)';
    ctx.stroke();
  }

  function eraseAtPoint(p) {
    const R = Math.max(8, Math.round(Math.min(cw,ch)*0.30));
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.beginPath();
    pctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    pctx.fillStyle = '#000';
    pctx.fill();
    pctx.restore();
  }

  function snapToGrid(){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const data = pctx.getImageData(0,0,cssW*dpr,cssH*dpr).data;
    const w = cssW*dpr;
    const radius = Math.max(1, Math.round(Math.min(cw,ch)*0.10)) * dpr;

    function hasInk(x,y){
      if (x<0||y<0||x>=w||y>=cssH*dpr) return false;
      const i=(Math.round(y)*w + Math.round(x))*4;
      return data[i+3] > 10; // alpha threshold
    }

    for (let c=0;c<cols;c++){
      const x0 = (c*cw + cw*0.5) * dpr;
      // scan grid area only
      for (let r=0;r<rows;r++){
        const yC = (topPad + r*ch + ch*0.5) * dpr;
        // check a small cross around center
        let ink=false;
        const step = Math.max(1, Math.floor(radius/3));
        for (let dx=-radius; dx<=radius && !ink; dx+=step){
          for (let dy=-radius; dy<=radius && !ink; dy+=step){
            if (hasInk(x0+dx, yC+dy)) ink=true;
          }
        }
        if (ink){
          nodes[c].add(r);
          active[c]=true;
        }
      }
    }
    return {active, nodes};
  }

  function onPointerDown(e){
    drawing=true;
    paint.setPointerCapture?.(e.pointerId);
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    if (erasing) {
      eraseAtPoint(p);
    } else {
      cur = { pts:[p] };
      savedImageData = pctx.getImageData(0, 0, paint.width, paint.height);
      drawCurrentStroke(pctx, cur, false);
    }
  }
  function onPointerMove(e){
    if (!drawing) return;
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    if (erasing) {
      eraseAtPoint(p);
    } else if (cur) {
      cur.pts.push(p);
      if (savedImageData) pctx.putImageData(savedImageData, 0, 0);
      drawCurrentStroke(pctx, cur, false);
    }
  }
  function onPointerUp(e){
    if (!drawing) return;
    drawing=false;

    if (!erasing && cur && cur.pts.length > 1) {
      // Make the current stroke permanent on the canvas
      if (savedImageData) pctx.putImageData(savedImageData, 0, 0);
      drawCurrentStroke(pctx, cur, false);
    }

    cur = null;
    savedImageData = null;

    // rebuild nodes and emit event
    const map = snapToGrid();
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  const api = {
    panel,
    clear: ()=>{ pctx.clearRect(0,0,cssW,cssH); panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:{active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set())}})); },
    setErase:(v)=>{ erasing=!!v; },
  };

  panel.addEventListener('toy-clear', api.clear);
  new ResizeObserver(layout).observe(body);

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(layout);

  return api;
}
