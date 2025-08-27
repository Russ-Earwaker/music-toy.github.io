// src/wheel-sequencer.js — minimal per‑wheel bar sequencer (<=300 lines)
import { buildWheel } from './wheel.js';
import { getLoopInfo } from './audio-core.js';

const groups = new Map();
let _raf = 0, _lastBar = -1;

function ensureLoop(){
  if (_raf) return;
  const step = ()=>{
    try{
      const info = getLoopInfo && getLoopInfo();
      const bar = info?.barIndex|0;
      if (bar !== _lastBar){
        _lastBar = bar;
        // advance groups
        for (const [gid, G] of groups){
          if (!G.panels.length) continue;
          G.index = (G.index+1) % G.panels.length;
          G.panels.forEach((p, i)=>{
            const inst = p.__wheelInst;
            if (inst && inst.setPlaying) inst.setPlaying(i===G.index);
          });
        }
      }
    }catch{}
    _raf = requestAnimationFrame(step);
  };
  _raf = requestAnimationFrame(step);
}

function groupIdFor(panel){
  const ex = panel.dataset.seqgroup;
  if (ex) return ex;
  const id = 'seq-' + Math.random().toString(36).slice(2,8);
  panel.dataset.seqgroup = id;
  return id;
}

export function addWheelToSequence(panel){
  try{
    const board = document.getElementById('board') || panel.parentElement;
    const gid = groupIdFor(panel);
    // duplicate panel
    const sec = document.createElement('section');
    sec.className = 'toy-panel';
    sec.setAttribute('data-toy','wheel');
    if (panel.dataset.instrument) sec.dataset.instrument = panel.dataset.instrument;
    board.appendChild(sec);
    const inst = buildWheel(sec, {});
    sec.dataset.seqgroup = gid;

    // register both
    let G = groups.get(gid);
    if (!G){ G = { panels: [], index: 0 }; groups.set(gid, G); }
    if (!G.panels.includes(panel)) G.panels.push(panel);
    G.panels.push(sec);

    // share instrument changes
    [panel, sec].forEach(p=>{
      try{
        p.addEventListener('toy-instrument', (e)=>{
          const val = e?.detail?.value;
          if (!val) return;
          for (const q of G.panels){ if (q===p) continue; try{ q.querySelector('.toy-instrument').value = val; q.dispatchEvent(new CustomEvent('toy-instrument',{detail:{value:val}})); }catch{} }
        });
      }catch{}
    });

    // gate: only first plays initially
    G.panels.forEach((p,i)=>{ const wi = p.__wheelInst; if (wi && wi.setPlaying) wi.setPlaying(i===G.index); });

    ensureLoop();
  }catch(e){ console.warn('[wheel-seq] failed', e); }
}
