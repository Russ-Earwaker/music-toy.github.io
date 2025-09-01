// src/drawgrid.js
// Drawing Grid Toy: draw thick lines, build grid-snapped nodes on release, eraser toggle, auto‑tune.

import { noteList } from './utils.js';
import { buildPentatonicPalette } from './bouncer-notes.js';

export function createDrawGrid(panel, opts = {}){
  const cols = 16, rows = 12;
  const baseMidi = opts.baseMidi ?? 60;
  const toyId = opts.toyId || panel.id || 'drawgrid';

  // State
  const activeCols = Array(cols).fill(false);
  const points = new Map(); for (let c=0;c<cols;c++) points.set(c, new Set());
  const strokes = []; // { pts:[{x,y}], erase:boolean, w:number }
  let current = null;
  let drawMode = 'draw';
  let autoTuneEnabled = true;

  // Elements
  let body = panel.querySelector('.toy-body');
  if (!body){
    body = document.createElement('div');
    body.className = 'toy-body';
    Object.assign(body.style, { position:'relative', width:'100%', aspectRatio:'16 / 10', minHeight:'180px', overflow:'hidden' });
    panel.appendChild(body);
  }
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', cursor:'crosshair', touchAction:'none', pointerEvents:'auto', zIndex:'1' });
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Offscreen mask (read-heavy)
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently:true });

  // Geometry helpers
  const colW = ()=> canvas.width/cols;
  const topBar = ()=> Math.max(24, Math.round(canvas.height*0.12));
  const gridH = ()=> canvas.height - topBar();
  const rowH = ()=> gridH()/rows;
  const strokeW = ()=> Math.max(18, Math.min(colW(), rowH())*0.9);

  function midiFromRow(r){ return baseMidi + (rows-1-r); }
  function emitNote(col,row){ panel.dispatchEvent(new CustomEvent('toy:note',{ detail:{ midi:midiFromRow(row), col, row, toyId } })); }

  // Draw & rebuild
  function redrawMask(){
    mask.width = canvas.width; mask.height = canvas.height;
    mctx.clearRect(0,0,mask.width,mask.height);
    for (const s of strokes){
      if (!s.pts.length) continue;
      mctx.save();
      mctx.lineJoin='round'; mctx.lineCap='round'; mctx.lineWidth=s.w;
      mctx.strokeStyle='rgba(255,255,255,1)';
      mctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      mctx.beginPath();
      for (let i=0;i<s.pts.length;i++){ const p=s.pts[i]; if(i===0)mctx.moveTo(p.x,p.y); else mctx.lineTo(p.x,p.y); }
      mctx.stroke();
      mctx.restore();
    }
  }

  function rebuildNodesFromMask(){
    const MAX_PER_COL = 3;
    for (let c=0;c<cols;c++){
      const set = points.get(c); set.clear();
      const cx=c*colW(), cw=colW();
      const xs=[cx+cw*0.25, cx+cw*0.5, cx+cw*0.75];
      const scores = new Array(rows).fill(0);
      for (const sx of xs){
        for (let r=0;r<rows;r++){
          const cy=topBar()+r*rowH(), ch=rowH();
          const ys=[cy+ch*0.25, cy+ch*0.5, cy+ch*0.75];
          for (const sy of ys){
            const px=Math.max(0,Math.min(mask.width-1,Math.round(sx)));
            const py=Math.max(0,Math.min(mask.height-1,Math.round(sy)));
            const a=mctx.getImageData(px,py,1,1).data[3];
            if (a>24) scores[r]+=a;
          }
        }
      }
      const pairs=scores.map((s,i)=>[s,i]).filter(p=>p[0]>60).sort((a,b)=>b[0]-a[0]);
      const chosen=[];
      for (const [sc,ri] of pairs){
        if (chosen.length>=MAX_PER_COL) break;
        if (chosen.some(j=>Math.abs(j-ri)<=1)) continue;
        chosen.push(ri);
      }
      chosen.sort((a,b)=>a-b);
      for (const r of chosen) set.add(r);
      activeCols[c]=set.size>0;
    }
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // bg
    ctx.fillStyle='rgba(255,255,255,0.02)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // activation row
    for (let c=0;c<cols;c++){ const x=c*colW(); ctx.fillStyle=activeCols[c]?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)'; ctx.fillRect(x+4,4,colW()-8, topBar()-8); }
    // grid
    ctx.strokeStyle='rgba(255,255,255,0.12)';
    for (let c=0;c<=cols;c++){ const x=(c*colW())|0; ctx.beginPath(); ctx.moveTo(x, topBar()); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let r=0;r<=rows;r++){ const y=(topBar()+r*rowH())|0; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // strokes (behind links)
    ctx.save();
    for (const s of strokes){ if (s.erase||!s.pts.length) continue;
      ctx.lineJoin='round'; ctx.lineCap='round'; ctx.lineWidth=Math.max(18, s.w*1.5);
      ctx.strokeStyle='rgba(72,110,220,0.9)';
      ctx.beginPath(); for (let i=0;i<s.pts.length;i++){ const p=s.pts[i]; if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    }
    if (current && current.pts.length){
      ctx.lineJoin='round'; ctx.lineCap='round'; ctx.lineWidth=Math.max(18, current.w*1.5);
      ctx.strokeStyle = current.erase ? 'rgba(255,80,80,0.85)' : 'rgba(72,110,220,0.9)';
      ctx.beginPath(); for (let i=0;i<current.pts.length;i++){ const p=current.pts[i]; if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    }
    ctx.restore();

    // links & nodes
    ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,0.35)';
    for (let c=0;c<cols;c++){
      const ys=[...points.get(c)].sort((a,b)=>a-b);
      const nextC=(c+1)%cols; const ysN=[...points.get(nextC)].sort((a,b)=>a-b);
      ys.forEach(yRow=>{
        const x1=c*colW()+colW()/2; const y1=topBar()+(yRow+0.5)*rowH();
        if(ysN[0]!=null){ const x2=nextC*colW()+colW()/2; const y2=topBar()+(ysN[0]+0.5)*rowH(); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
        if(ysN[1]!=null){ const x2=nextC*colW()+colW()/2; const y2=topBar()+(ysN[1]+0.5)*rowH(); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
      });
    }
    ctx.fillStyle='rgba(255,255,255,0.9)';
    for (let c=0;c<cols;c++){ for (const r of points.get(c)){ const x=c*colW()+colW()/2; const y=topBar()+(r+0.5)*rowH(); ctx.beginPath(); ctx.arc(x,y, Math.max(3, Math.min(colW(),rowH())*0.18), 0, Math.PI*2); ctx.fill(); } }
  }

  // Input
  function pos(e){ const r=canvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
  function onDown(e){
    const {x,y}=pos(e);
    const c=Math.max(0,Math.min(cols-1,Math.floor(x/colW())));
    if (y<topBar()){ activeCols[c]=!activeCols[c]; draw(); return; }
    const erasing = panel.classList.contains('eraser-on') || (drawMode==='erase');
    current = { pts:[{x,y}], erase:erasing, w:strokeW() };
    draw();
  }
  function onMove(e){ if (!current) return; const {x,y}=pos(e); current.pts.push({x,y}); draw(); }
  function finishStroke(){
    if (!current) return;
    strokes.push(current); current=null; redrawMask(); rebuildNodesFromMask(); if (autoTuneEnabled) tuneToPalette(); draw();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointerleave', finishStroke);
  panel.addEventListener('pointerdown', (ev)=>{ if (ev.target!==canvas) onDown(ev); }, true);
  panel.addEventListener('pointermove', (ev)=>{ if (current) onMove(ev); }, true);
  panel.addEventListener('pointerup',   ()=> finishStroke(), true);
  panel.addEventListener('pointerleave',()=> finishStroke(), true);

  // Header integration
  panel.addEventListener('toy-random', ()=>{ for(let c=0;c<cols;c++){ activeCols[c]=Math.random()>0.5; } draw(); });
  function clearAll(){ strokes.length=0; for(let c=0;c<cols;c++) points.get(c).clear(); activeCols.fill(false); mctx.clearRect(0,0,mask.width,mask.height); draw(); }
  panel.addEventListener('toy-reset', clearAll);
  panel.addEventListener('toy-clear', clearAll);

  // Auto‑Tune to minor pentatonic (C4) within visible 12 rows
  function tuneToPalette(){
    const palIdx = buildPentatonicPalette(noteList, 'C4', 'minor', 3);
    const pcToMidi = (name)=>{
      const m=String(name).match(/^([A-G])(#|b)?(\d+)$/);
      if(!m) return 60; const MAP={C:0,D:2,E:4,F:5,G:7,A:9,B:11}; let n=MAP[m[1]]; if(m[2]==='#')n++; if(m[2]==='b')n--; const o=parseInt(m[3],10); return n + (o+1)*12;
    };
    const palMidi = palIdx.map(ix => pcToMidi(noteList[ix]));
    const allowed = []; for (let r=0;r<rows;r++){ const midi = baseMidi + (rows-1-r); if (palMidi.includes(midi)) allowed.push(r); }
    if (!allowed.length) return;
    for (let c=0;c<cols;c++){
      const set = points.get(c); if (!set.size) continue;
      const mapped = new Set();
      for (const r of set){
        let best=allowed[0], bd=Math.abs(r-best);
        for (let k=1;k<allowed.length;k++){ const rr=allowed[k]; const d=Math.abs(r-rr); if(d<bd){ bd=d; best=rr; } }
        mapped.add(best);
      }
      points.set(c, mapped);
    }
    for (let c=0;c<cols;c++) activeCols[c] = points.get(c).size>0;
  }

  // Resize & render
  function ensureProportions(){
    const bodyEl = panel.querySelector('.toy-body') || panel;
    const zoomed = panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
    if (zoomed){
      const maxW = Math.min(1400, Math.floor(window.innerWidth*0.94));
      const w = Math.max(560, maxW); const h = Math.floor(w * 10/16);
      bodyEl.style.setProperty('width', w+'px', 'important');
      bodyEl.style.setProperty('height', h+'px', 'important');
    } else {
      bodyEl.style.removeProperty('width'); bodyEl.style.removeProperty('height');
    }
  }
  function resize(){
    ensureProportions();
    const r=(panel.querySelector('.toy-body')||panel).getBoundingClientRect();
    const W=Math.max(320, Math.round(r.width));
    const H=Math.max(200, Math.round(r.height));
    const dpr=Math.max(1, Math.min(2, window.devicePixelRatio||1));
    canvas.width=Math.max(64, Math.round(W*dpr));
    canvas.height=Math.max(64, Math.round(H*dpr));
    draw();
  }
  try{ new ResizeObserver(resize).observe(body); }catch{}
  new MutationObserver(resize).observe(panel, { attributes:true, attributeFilter:['class'] });
  resize();

  // Simple playback (left->right)
  let bpm = 120; const loopMS = ()=> (60_000/bpm)*4; let colMs = loopMS()/cols;
  let playhead=0, lastT=performance.now(), lastCol=-1;
  function step(){
    const now=performance.now(); const dt=now-lastT; lastT=now; playhead=(playhead+dt)%(cols*colMs);
    const colIdx=Math.floor((playhead%(cols*colMs))/colMs);
    if (colIdx!==lastCol){ lastCol=colIdx; if (activeCols[colIdx]) for (const r of points.get(colIdx)) emitNote(colIdx,r); draw(); }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  return {
    setMode(m){ drawMode = (m==='erase')?'erase':'draw'; },
    getAutoTune(){ return !!autoTuneEnabled; },
    setAutoTune(v){ autoTuneEnabled = !!v; },
    setBpm(newBpm){ if (newBpm>0){ const loopFrac=playhead/(cols*colMs); bpm=Math.max(30,Math.min(300,newBpm)); colMs=loopMS()/cols; playhead=loopFrac*(cols*colMs); } }
  };
}
