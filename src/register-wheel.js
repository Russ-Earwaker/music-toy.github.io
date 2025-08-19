// src/register-wheel.js
// Registers and builds a Wheel panel at runtime without modifying main.js.
// It appends a .toy-panel to #board and calls buildWheel(panel, {...}).

import { buildWheel } from './wheel.js';

function getBpm(){
  return window.musictoyBpm || 120;
}

function playNote(midi, name, vel){
  // Try a global synth hook if present; otherwise broadcast for any listeners.
  try {
    if (typeof window.musictoyPlayNote === 'function'){
      window.musictoyPlayNote(midi, vel);
      return;
    }
  } catch {}
  try {
    document.dispatchEvent(new CustomEvent('note', { detail: { midi, name, velocity: vel } }));
  } catch {}
}

function ensureBoard(){
  let board = document.getElementById('board');
  if (!board){
    board = document.createElement('div');
    board.id = 'board';
    document.body.appendChild(board);
  }
  // Ensure positioning context
  const cs = getComputedStyle(board);
  if (cs.position === 'static') board.style.position = 'relative';
  return board;
}

function makePanel(id='wheel-1', title='Wheel'){
  const panel = document.createElement('div');
  panel.className = 'toy-panel';
  panel.id = id;

  const header = document.createElement('div');
  header.className = 'toy-header';
  const htitle = document.createElement('div');
  htitle.className = 'toy-title';
  htitle.textContent = title;
  header.appendChild(htitle);
  panel.appendChild(header);
  return panel;
}

function bootWheel(){
  const board = ensureBoard();
  let panel = document.getElementById('wheel-1');
  if (!panel){
    panel = makePanel('wheel-1', 'Wheel');
    // position reasonably (top-left gap)
    panel.style.position = 'absolute';
    panel.style.left = '16px';
    panel.style.top  = '16px';
    board.appendChild(panel);
  }

  // Build the toy
  buildWheel(panel, {
    onNote: (midi, name, vel)=> playNote(midi, name, vel),
    getBpm
  });

  console.log('[wheel] ready');
}

// Start after DOM is ready; also try to wait for samples if the app fires a 'samples-ready' event.
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bootWheel, { once: true });
} else {
  bootWheel();
}

window.addEventListener('samples-ready', ()=> {
  // If panel exists but toy not built yet, boot again (no harm if already built).
  if (!document.getElementById('wheel-1')?.dataset?.toy){
    try { bootWheel(); } catch {}
  }
});
