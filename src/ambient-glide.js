// src/ambient-glide.js — Ambient Glide toy (<=300 lines)
import { initToyUI } from './toyui.js';
import { ensureAudioContext, registerActiveNode } from './audio-core.js';
import { getIntensity } from './intensity.js';

export function createAmbientGlide(panel){
  // --- Canvas ---
  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  
  panel.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // --- Header UI ---
  const ui = initToyUI(panel, { toyName: 'Ambient Glide' });
  let toyId = panel.dataset.toyId || 'ambient';
  try { panel.dataset.toyId = toyId; } catch{}

  // Controls
  let enabled = false;
  let level   = 0.3;
  let semis   = 0;    // -12..+12
  let color   = 0.5;  // 0..1 (bandwidth)

  // Build minimal controls on the right side
  (function buildHeader(){ /* header uses toyui volume pod only */ })();

  // --- Audio graph (noise -> bandpass -> gain -> destination) ---
  // Hook into toyui's global volume/mute
  try { window.addEventListener('toy-volume', (e)=>{
      try{
        const id = (e?.detail?.toyId||'').toLowerCase();
        if (id === (toyId||'').toLowerCase()) setLevel(e.detail.value);
      }catch{}
    }); } catch{}
  try { window.addEventListener('toy-mute', (e)=>{
      try{
        const id = (e?.detail?.toyId||'').toLowerCase();
        if (id === (toyId||'').toLowerCase()) setEnabled(!e.detail.muted);
      }catch{}
    }); } catch{}
const ac = ensureAudioContext();
  const gain = ac.createGain(); gain.gain.value = 0;
  const filter = ac.createBiquadFilter(); filter.type='bandpass'; filter.Q.value = 1.0;
  filter.connect(gain).connect(ac.destination);

  let noiseSrc = null;
  function makeNoiseBuffer(){
    const len = ac.sampleRate * 2; // 2 seconds loop
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++){ data[i] = Math.random()*2-1; }
    return buf;
  }
  function startNoise(){
    if (noiseSrc) return;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer();
    src.loop = true;
    src.connect(filter);
    const t = ac.currentTime + 0.01;
    src.start(t);
    try{ registerActiveNode(src); }catch{}
    noiseSrc = src;
  }
  function stopNoise(){
    try{ noiseSrc?.stop(); }catch{}
    try{ noiseSrc?.disconnect(); }catch{}
    noiseSrc = null;
  }

  // --- State setters ---
  function setEnabled(v){
    enabled = !!v; try{ ui.setMuted(!enabled); }catch{};
    if (enabled){ startNoise(); } else { stopNoise(); }
    setLevel(level); // update gain
  }
  function setLevel(v){
    level = Math.max(0, Math.min(1, +v||0));
    // Respond to global intensity: 0..1 -> +0..+0.3 gain
    const boost = Math.min(0.3, Math.max(0, getIntensity()*0.3));
    const g = enabled ? (level + boost) : 0;
    gain.gain.setTargetAtTime(g, ac.currentTime, 0.04);
  }
  function setPitch(v){
    semis = Math.max(-12, Math.min(12, Math.round(+v||0)));
    // Interpret pitch as bandpass center frequency between ~200Hz..2.5kHz
    const f0 = 200 * Math.pow(2, semis/12);
    filter.frequency.setTargetAtTime(f0, ac.currentTime, 0.05);
  }
  function setColor(v){
    color = Math.max(0, Math.min(1, +v||0));
    // Color controls filter Q: wider at 0, narrower (more tonal) at 1
    const Q = 0.6 + color * 12;
    filter.Q.setTargetAtTime(Q, ac.currentTime, 0.05);
  }

  // --- Visuals ---
  const orb = { x: 0.5, y: 0.5, trail: [] };
  let targetY = 0.5;

  function resize(){
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const w = panel.clientWidth||320, h = 180;
    canvas.width = Math.floor(w*dpr); canvas.height = Math.floor(h*dpr);
    canvas.style.height = h+'px'; canvas.style.width = w+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize(); window.addEventListener('resize', resize);

  // Background particle field
  const bg = Array.from({length:220}, ()=> ({ x: Math.random(), y: Math.random(), s: Math.random()*0.8+0.2 }));
  let bgOffset = 0;

  // Particles
  function pushTrail(x,y){
    orb.trail.push({x,y,life:1});
    if (orb.trail.length>120) orb.trail.shift();
  }

  // Easing toward target
  function update(dt){
    // Move rightward with wrap
    // orb static; movement via parallax
    // Vertical easing (smooth, no wobble)
    orb.y += (targetY - orb.y) * 0.05;
    orb.y = Math.max(0.05, Math.min(0.95, orb.y));
    pushTrail(orb.x, orb.y);
    // Parallax offsets
    bgOffset = (bgOffset + dt*0.025) % 1;
    // Map orb.y to pitch continuously
    const semitone = Math.round((0.5 - orb.y) * 24); // ±12
    setPitch(semitone);
    setLevel(level);
  }

  let groundOffset = 0;
  function draw(){
    groundOffset = (groundOffset + 2.0) % 10000;
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const w = canvas.width / dpr;
    const h = w; // square
    ctx.clearRect(0,0,w,h);
    
    // Background field (slow left drift)
    ctx.fillStyle = '#0b0f15';
    for (let i=0;i<bg.length;i++){
      const p = bg[i];
      const x = ((p.x - bgOffset*0.3 + 1) % 1) * w;
      const y = p.y * h;
      ctx.globalAlpha = 0.45 * p.s;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Ground
    const baseY = h-24;
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, baseY, w, 24);
    ctx.fillStyle = '#172635'; for (let i=0;i<w;i+=16){ ctx.fillRect((i - (groundOffset*1.2)%16), baseY, 8, 24); }
    // Terrain features with intensity
    const n = Math.round(getIntensity()*10);
    ctx.fillStyle = '#1e2836';
    for (let i=0;i<n;i++){
      const x = ((i/n)*w - groundOffset*0.8 + w*4) % w;
      const ht = 6 + (i%3)*4;
      ctx.fillRect((x%w)|0, baseY-ht, 3, ht);
    }
    // Trail
    for (let i=0;i<orb.trail.length;i++){
      const p = orb.trail[i];
      p.life -= 0.01;
      if (p.life<=0){ orb.trail.splice(i,1); i--; continue; }
      const alpha = Math.max(0, p.life);
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      const tx = (p.x - (1-alpha)*0.40) * w; ctx.arc(tx, p.y*h, 6*(1-alpha*0.7)+1, 0, Math.PI*2);
      ctx.fillStyle = '#7fb2ff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Orb
    ctx.beginPath();
    ctx.arc(orb.x*w, orb.y*h, 8, 0, Math.PI*2);
    ctx.fillStyle = '#a6d1ff';
    ctx.fill();
    // Target marker
    ctx.fillStyle = '#86a3c3';
    ctx.fillRect(w-10, targetY*h-8, 4, 16);
  }

  // Input: tap/drag to set target
  function toLocal(e){ const r = canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height }; }
  let dragging=false;
  canvas.addEventListener('pointerdown', (e)=>{ dragging=true; const p=toLocal(e); targetY=p.y; try{ canvas.setPointerCapture(e.pointerId);}catch{} });
  canvas.addEventListener('pointermove', (e)=>{ if (!dragging) return; const p=toLocal(e); targetY=p.y; });
  canvas.addEventListener('pointerup',   (e)=>{ dragging=false; try{ canvas.releasePointerCapture(e.pointerId);}catch{} });
  canvas.addEventListener('pointercancel', ()=>{ dragging=false; });

  // Animation loop tied to rAF
  let last = performance.now();
  function tick(t){
    const dt = Math.min(0.05, (t-last)/1000); last = t;
    update(dt); draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Expose minimal API so main.js can set volume/mute via events if needed
  return {
    setEnabled, setLevel,
    get toyId(){ return toyId; }
  };
}
