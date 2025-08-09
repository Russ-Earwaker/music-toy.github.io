// src/toyui.js
// Shared header UI for canvas toys: instrument dropdown + Add/Delete one-shot tools + hint/toast
import { ensureAudioContext, getLoopInfo } from './audio.js';

export const DEFAULT_INSTRUMENTS = [
  'tone','keypad','pop','pad','retro-square','retro-saw','retro-tri','laser','windy','alien','organish','droplet',
  'Kick','Snare','Hat','Clap'
];

function press(btn, on){
  btn.classList.toggle('active', on);
  btn.style.transform   = on ? 'translateY(1px)' : '';
  btn.style.boxShadow   = on ? 'inset 0 2px 4px rgba(0,0,0,.25)' : '';
  btn.style.background  = on ? '#333' : '';
  btn.style.color       = on ? '#fff' : '';
  btn.style.borderColor = on ? '#555' : '';
}

export function initToyUI(shell, {
  instrumentOptions = DEFAULT_INSTRUMENTS,
  defaultInstrument = 'tone',
  addText = 'Add',
  delText = 'Delete',
  hintAdd = 'Tap to place',
  hintDelete = 'Tap to delete',
  showProgress = false
} = {}){
  const header = shell.querySelector('.toy-header') || shell;
  header.style.position='relative'; header.style.zIndex='5';

  // container on the right
  // progress bar (top of header)
  let progress = null;
  if (showProgress) {
    progress = document.createElement('div');
    progress.style.cssText = 'position:absolute;left:0;top:0;height:2px;width:0;background:#6cf;opacity:0.9;pointer-events:none;';
    header.appendChild(progress);
  }

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';
  right.style.alignItems = 'center';

  const label = document.createElement('span'); label.textContent = 'Instrument:';
  const select = document.createElement('select');
  instrumentOptions.forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; select.appendChild(o); });

  const addBtn = document.createElement('button'); addBtn.textContent = addText;
  const delBtn = document.createElement('button'); delBtn.textContent = delText;

  right.appendChild(label);
  right.appendChild(select);
  right.appendChild(addBtn);
  right.appendChild(delBtn);
  header.appendChild(right);

  let instrument = defaultInstrument;
  select.value = instrument;
  select.addEventListener('change', ()=>{ instrument = select.value; console.log('[toyui] instrument ->', instrument); });

  // hint / toast
  let hint = document.createElement('div');
  hint.style.cssText = `
    position:absolute; left:12px; bottom:12px; z-index:4;
    background:rgba(0,0,0,.7); color:#fff; padding:6px 8px;
    border:1px solid #333; border-radius:8px; font:12px system-ui,sans-serif;
    pointer-events:none; display:none;
  `;
  shell.appendChild(hint);
  let toastTimer = null;
  function updateHint(tool){
    if (tool === 'add')      { hint.textContent = hintAdd;    hint.style.display='block'; }
    else if (tool === 'delete'){ hint.textContent = hintDelete; hint.style.display='block'; }
    else                     { hint.style.display='none'; }
  }
  function toast(msg){
    hint.textContent = msg;
    hint.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>updateHint(tool), 900);
  }

  // tool state
  let tool = 'aim'; // 'aim' | 'add' | 'delete'
  function reflectTool(){
    press(addBtn, tool==='add');
    press(delBtn, tool==='delete');
    updateHint(tool);
  }
  function setTool(t){
    tool = t;
    reflectTool();
    console.log('[toyui] tool ->', tool);
  }
  reflectTool();

  addBtn.addEventListener('pointerdown', (e)=>{
    e.preventDefault(); e.stopPropagation();
    setTool(tool==='add' ? 'aim' : 'add');
  });
  delBtn.addEventListener('pointerdown', (e)=>{
    e.preventDefault(); e.stopPropagation();
    setTool(tool==='delete' ? 'aim' : 'delete');
  });

  
  // loop progress animation
  let rafId = null;
  function animateProgress(){
    if (!progress) { rafId = requestAnimationFrame(animateProgress); return; }
    const ac = ensureAudioContext();
    const { loopStartTime, barLen } = getLoopInfo();
    const now = ac.currentTime;
    const t = ((now - loopStartTime) % barLen + barLen) % barLen;
    const pct = Math.max(0, Math.min(1, barLen ? (t / barLen) : 0));
    progress.style.width = (pct * 100).toFixed(3) + '%';
    rafId = requestAnimationFrame(animateProgress);
  }
  animateProgress();
console.log('[toyui] init', { instrument, tool });

  return {
    get instrument(){ return instrument; },
    setInstrument(name){ instrument = name; select.value = name; },
    get tool(){ return tool; },
    setTool,
    hint,
    toast,
    addBtn,
    delBtn,
    select,
    reflectTool,
    updateHint: ()=>updateHint(tool),
  };
}
