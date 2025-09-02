// src/drawgrid.js
// Minimal, scoped Drawing Grid — 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.

export function createDrawGrid(panel, { cols=16, rows=12, toyId, bpm=120 } = {}){
  if (!(panel instanceof HTMLElement)) throw new Error('createDrawGrid: panel must be element');
  if (!/drawgrid/i.test(panel.dataset.toy||'')) { console.warn('[drawgrid] refused: not a drawgrid panel'); return; }
  if (!panel) throw new Error('createDrawGrid: panel required');
  panel.dataset.toy = panel.dataset.toy || 'drawgrid';
  if (!panel.querySelector('.toy-body')){
    const b=document.createElement('div'); b.className='toy-body'; panel.appendChild(b);
  }
  const body = panel.querySelector('.toy-body');
  body.style.position='relative';
  body.style.aspectRatio = body.style.aspectRatio || '4 / 3';

  // Layers
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  Object.assign(grid.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  Object.assign(paint.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  body.appendChild(grid); body.appendChild(paint);

  const gctx = grid.getContext('2d');
  const pctx = paint.getContext('2d', { willReadFrequently: true });

  // State
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0;
  let drawing=false, erasing=false;
  const strokes = []; // { pts:[{x,y}], w:number }
  let cur = null;

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
    const r = body.getBoundingClientRect();
    cssW = Math.max(1, r.width|0); cssH = Math.max(1, r.height|0);
    grid.width = cssW; grid.height = cssH;
    paint.width = cssW; paint.height = cssH;
    topPad = Math.max(24, Math.round(cssH*0.12));
    cw = cssW/cols; ch=(cssH-topPad)/rows;
    drawGrid(); redraw();
  }

  function drawGrid(){
    gctx.clearRect(0,0,cssW,cssH);
    // top activation strip
    gctx.fillStyle = 'rgba(255,255,255,0.05)'; gctx.fillRect(0,0,cssW,topPad);
    // verticals
    gctx.lineWidth = 1; gctx.strokeStyle='rgba(255,255,255,0.15)';
    for(let i=1;i<cols;i++){ gctx.beginPath(); gctx.moveTo(i*cw,0); gctx.lineTo(i*cw,cssH); gctx.stroke(); }
    // horizontals (only grid area)
    for(let j=1;j<rows;j++){ gctx.beginPath(); gctx.moveTo(0, topPad+j*ch); gctx.lineTo(cssW, topPad+j*ch); gctx.stroke(); }
  }

  function redraw(){
    pctx.clearRect(0,0,cssW,cssH);
    pctx.lineCap='round'; pctx.lineJoin='round';
    for (const s of strokes){
      pctx.beginPath();
      for (let i=0;i<s.pts.length;i++){
        const pt=s.pts[i];
        if (!i) pctx.moveTo(pt.x, pt.y); else pctx.lineTo(pt.x, pt.y);
      }
      pctx.lineWidth = Math.max(6, Math.round(Math.min(cw,ch)*0.35));
      pctx.strokeStyle = 'rgba(95,179,255,0.9)';
      pctx.stroke();
    }
    if (cur && cur.pts.length>1){
      pctx.beginPath();
      for (let i=0;i<cur.pts.length;i++){
        const pt=cur.pts[i];
        if (!i) pctx.moveTo(pt.x, pt.y); else pctx.lineTo(pt.x, pt.y);
      }
      pctx.lineWidth = Math.max(6, Math.round(Math.min(cw,ch)*0.35));
      pctx.strokeStyle = erasing ? 'rgba(255,96,96,0.9)' : 'rgba(95,179,255,0.95)';
      pctx.stroke();
    }
  }

  function snapToGrid(){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const data = pctx.getImageData(0,0,cssW,cssH).data;
    const w = cssW, h = cssH;
    const radius = Math.max(1, Math.round(Math.min(cw,ch)*0.10));

    function hasInk(x,y){
      if (x<0||y<0||x>=w||y>=h) return false;
      const i=(y*w + x)*4;
      return data[i+3] > 10; // alpha threshold
    }

    for (let c=0;c<cols;c++){
      const x0 = Math.round(c*cw + cw*0.5);
      // scan grid area only
      for (let r=0;r<rows;r++){
        const yC = Math.round(topPad + r*ch + ch*0.5);
        // check a small cross around center
        let ink=false;
        for (let dx=-radius; dx<=radius && !ink; dx+=Math.max(1, Math.max(1, Math.floor(radius/3)))){
          for (let dy=-radius; dy<=radius && !ink; dy+=Math.max(1, Math.max(1, Math.floor(radius/3)))){
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
    const rect = paint.getBoundingClientRect();
    cur = { pts:[{ x:e.clientX-rect.left, y:e.clientY-rect.top }], w:1 };
    paint.setPointerCapture?.(e.pointerId);
    redraw();
  }
  function onPointerMove(e){
    if (!drawing) return;
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };
    cur.pts.push(p);
    redraw();
  }
  function onPointerUp(e){
    if (!drawing) return;
    drawing=false;
    if (cur && cur.pts.length>1){
      if (!erasing){
        strokes.push(cur);
      } else {
        const R = Math.max(8, Math.round(Math.min(cw,ch)*0.25));
        function near(p1,p2){ const dx=p1.x-p2.x, dy=p1.y-p2.y; return (dx*dx+dy*dy) <= R*R; }
        for (let si=strokes.length-1; si>=0; si--){
          const s = strokes[si];
          let hit=false;
          outer: for (const ep of cur.pts){ for (const sp of s.pts){ if (near(ep,sp)){ hit=true; break outer; } } }
          if (hit) strokes.splice(si,1);
        }
      }
    }
    cur=null;
    redraw();
    // rebuild nodes and emit event
    const map = snapToGrid();
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  new ResizeObserver(layout).observe(body); layout();

  return {
    panel,
    clear: ()=>{ strokes.length=0; redraw(); panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:{active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set())}})); },
    setErase:(v)=>{ erasing=!!v; },
  };
}
