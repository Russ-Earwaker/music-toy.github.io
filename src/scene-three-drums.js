// src/scene-three-drums.js
// Minimal, isolated 3‑drum scene: cubes at top, drum centered lower, no external deps.
// Keeps each file <300 lines.

(function(){
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const log = (...a)=> DEBUG && console.info('[scene3]', ...a);

  class Beep {
    constructor(){ this.ctx = null; this.mute = false; this.gain = 0.3; }
    ensure(){
      if (!this.ctx){ const C=window.AudioContext||window.webkitAudioContext; this.ctx=new C(); }
    }
    play(freq=150, dur=0.08){
      if (this.mute) return;
      this.ensure();
      const t=this.ctx.currentTime;
      const osc=this.ctx.createOscillator();
      const g=this.ctx.createGain();
      osc.type='sine'; osc.frequency.value=freq;
      g.gain.setValueAtTime(this.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t); osc.stop(t+dur+0.02);
    }
    setMute(v){ this.mute = !!v; }
    setVolume01(v){ this.gain = Math.max(0, Math.min(1, v)); }
  }

  function makePanel(panel){
    const body = panel.querySelector('.toy-body');
    // cube row
    const cubes = document.createElement('div'); cubes.className='cube-row';
    for (let i=0;i<8;i++){ const c=document.createElement('div'); c.className='cube'; cubes.appendChild(c); }
    body.appendChild(cubes);

    // drum
    const pad = document.createElement('div'); pad.className='drum-pad'; pad.textContent='DRUM';
    body.appendChild(pad);

    // sizing
    function sizePad(){
      const r=body.getBoundingClientRect();
      const W=Math.max(120, r.width|0), H=Math.max(120, r.height|0);
      let px = Math.round(Math.max(84, Math.min(W*0.18, 140)));
      pad.style.width = px+'px';
      pad.style.height= px+'px';
    }
    new ResizeObserver(sizePad).observe(body); sizePad();

    // audio & controls
    const beep = new Beep();
    const range = panel.querySelector('input[type="range"]');
    const muteBtn = panel.querySelector('[data-mute]');
    range.addEventListener('input', e=> beep.setVolume01(e.target.value/100));
    muteBtn.addEventListener('click', ()=>{
      const on = muteBtn.getAttribute('aria-pressed')==='true';
      const next = !on; muteBtn.setAttribute('aria-pressed', String(next)); muteBtn.textContent = next ? 'Unmute' : 'Mute';
      beep.setMute(next);
    });

    pad.addEventListener('pointerdown', ()=>{
      pad.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(.94)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:140,easing:'ease-out'});
      beep.play(160, 0.09);
      // flash first active cube (nearest beat) for feedback
      const cs = cubes.children; const now = performance.now(); const idx = Math.floor((now/250)%8); // 120 bpm quarter-ish
      const c = cs[idx]; c.classList.add('active'); setTimeout(()=> c.classList.remove('active'), 120);
    });

    log('panel ready', panel.id);
  }

  document.querySelectorAll('.toy-panel[data-toy="loopgrid"]').forEach(makePanel);
  log('boot complete');
})();