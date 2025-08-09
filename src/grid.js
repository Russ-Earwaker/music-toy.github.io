// src/grid.js
import { noteList, clamp } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio.js';

const INSTRUMENT_OPTIONS = ['tone','Kick','Snare','Hat','Clap'];

export function buildGrid(TOYS, NUM_STEPS){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  grid.style.gridTemplateRows = `repeat(${TOYS.length}, auto)`;

  const state = {}; // rowName -> { instrument, steps: [ {active, get noteIndex()} ] }

  TOYS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';

    // Label + instrument select
    const label = document.createElement('div');
    label.className = 'label';

    const title = document.createElement('span');
    title.textContent = row.name + ' ';

    const sel = document.createElement('select');
    INSTRUMENT_OPTIONS.forEach(opt => {
      const o = document.createElement('option'); o.value = opt; o.textContent = opt;
      if (opt.toLowerCase() === row.name.toLowerCase()) o.selected = true;
      sel.appendChild(o);
    });

    label.appendChild(title);
    label.appendChild(sel);
    rowEl.appendChild(label);

    const steps = [];
    for (let i=0;i<NUM_STEPS;i++){
      const step = document.createElement('div');
      step.className = 'step';

      let noteIndex = noteList.indexOf('C4'); // default center
      const noteEl = document.createElement('div');
      noteEl.className = 'note';
      noteEl.textContent = noteList[noteIndex];

      const controls = document.createElement('div');
      controls.className = 'note-controls';

      const up = document.createElement('button');   up.textContent = '▲';
      const down = document.createElement('button'); down.textContent = '▼';

      up.onclick = (e)=>{ e.stopPropagation(); noteIndex = clamp(noteIndex+1, 0, noteList.length-1); noteEl.textContent = noteList[noteIndex]; };
      down.onclick = (e)=>{ e.stopPropagation(); noteIndex = clamp(noteIndex-1, 0, noteList.length-1); noteEl.textContent = noteList[noteIndex]; };

      controls.appendChild(up); controls.appendChild(down);
      step.appendChild(noteEl); step.appendChild(controls);

      const stepState = { active:false, get noteIndex(){ return noteIndex; } };
      steps[i] = stepState;

      step.onclick = ()=>{ stepState.active = !stepState.active; step.classList.toggle('active', stepState.active); };

      rowEl.appendChild(step);
    }

    grid.appendChild(rowEl);
    state[row.name] = { instrument: sel.value, steps };
    sel.addEventListener('change', ()=> state[row.name].instrument = sel.value);
  });

  return state;
}

export function markPlayingColumn(stepIndex, TOYS){
  document.querySelectorAll('.step.playing').forEach(el=>el.classList.remove('playing'));
  TOYS.forEach((row, r)=>{
    const rowEl = document.querySelectorAll('.row')[r];
    const stepEl = rowEl.children[stepIndex + 1];
    if (stepEl) stepEl.classList.add('playing');
  });
}

