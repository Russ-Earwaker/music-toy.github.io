// src/bouncer-notes.js — palette + note helpers for Bouncer (split to keep bouncer.js < 300 lines)
import { noteList } from './utils.js';

// palette helpers: minor pentatonic aligned with Wheel/Rippler
export function buildPentatonicPalette(noteListArg, rootName='C4', mode='minor', octaves=1){
  const baseIx = noteListArg.indexOf(rootName)>=0 ? noteListArg.indexOf(rootName) : 48;
  const offs = (mode==='minor') ? [0,3,5,7,10] : [0,2,4,7,9];
  const out=[];
  for (let o=0;o<octaves;o++){
    for (let k=0;k<offs.length;k++){
      const ix = baseIx + offs[k] + o*12;
      if (ix>=0 && ix<noteListArg.length) out.push(ix);
    }
  }
  return out.length ? out : [Math.floor(noteListArg.length/2)];
}

// Move to next/prev index in the palette sequence nearest to current index
export function stepIdxInPalette(palette, currIdx, dir){
  if (!Array.isArray(palette) || !palette.length) return currIdx||0;
  let nearest = 0, bestd = Infinity;
  for (let i=0;i<palette.length;i++){
    const d = Math.abs((currIdx||0) - palette[i]);
    if (d < bestd){ bestd = d; nearest = i; }
  }
  const next = (nearest + (dir>0?1:-1) + palette.length) % palette.length;
  return palette[next];
}

// Randomize four edge note controllers using a cyclic spread on the palette
export function randomizeEdgeNotes(edgeNotes, palette){
  const pal = (Array.isArray(palette) && palette.length) ? palette : [0];
  const r = Math.floor(Math.random()*pal.length);
  edgeNotes.left.noteIndex  = pal[(r+0) % pal.length];
  edgeNotes.right.noteIndex = pal[(r+2) % pal.length];
  edgeNotes.top.noteIndex   = pal[(r+3) % pal.length];
  edgeNotes.bot.noteIndex   = pal[(r+1) % pal.length];
}
