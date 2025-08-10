// src/toyui.js (dynamic instruments + CSV status indicator)
import { ensureAudioContext, getInstrumentNames } from './audio.js';

export function initToyUI(shell, {
  defaultInstrument = 'Tone (Sine)',
  addText = 'Add Node',
  delText = '',
  hintAdd = 'Tap to add a node',
  hintDelete = 'Tap to delete',
  autoReturnAdd = true,
  autoReturnDelete = true,
  showAdd = true,
  showDelete = true
, deleteMode = 'toggle', getDeletableCount = null } = {}){
  let header = shell.querySelector('.toy-header');
  if (!header) {
    header = document.createElement('div');
    header.className = 'toy-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '6px 8px';
    shell.prepend(header);
  }

  const right  = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';
  right.style.alignItems = 'center';
  header.style.position='relative'; header.style.zIndex='5';

  // CSV status dot (left)
  const left = document.createElement('div');
  left.style.display='flex'; left.style.alignItems='center'; left.style.gap='6px';
  const dot = document.createElement('span');
  dot.title = 'Sample CSV status';
  dot.style.width='10px'; dot.style.height='10px'; dot.style.borderRadius='50%';
  dot.style.display='inline-block'; dot.style.background='#b91c1c'; // red until ready
  left.appendChild(dot);
  header.appendChild(left);

  const label  = document.createElement('span'); label.textContent = 'Instrument:';
  const select = document.createElement('select');

  function rebuild(){
    const names = getInstrumentNames();
    const cur = select.value;
    select.innerHTML = '';
    names.forEach(n => {
      const o = document.createElement('option'); o.value=o.textContent=n; select.appendChild(o);
    });
    select.value = names.includes(cur) ? cur : (names[0] || defaultInstrument);
  }

  // initial + async rebuild when CSV finishes
  rebuild();
  setTimeout(()=>{ try{ rebuild(); }catch(e){} }, 800);
  window.addEventListener('samples-ready', ()=>{
    try{ rebuild(); dot.style.background = '#16a34a'; }catch(e){}
  });

  let addBtn = null, delBtn = null;
  if (showAdd){ addBtn = document.createElement('button'); addBtn.textContent = addText; }
  if (showDelete){
    delBtn = document.createElement('button');
    delBtn.setAttribute('aria-label','Delete (trash)');
    delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm2 3h2V5h-2v1Zm-3 4h2v8H8V10Zm6 0h2v8h-2V10Z"/></svg>`;
  }

  // compose right side
  right.appendChild(label);
  right.appendChild(select);
  if (addBtn) right.appendChild(addBtn);
  if (delBtn) right.appendChild(delBtn);
  header.appendChild(right);

  const styleBtn = (btn, on)=>{
    const disabled = btn?.disabled === true;
    if (!btn) return;
    btn.style.transform   = on && !disabled ? 'translateY(1px)' : '';
    btn.style.boxShadow   = on && !disabled ? 'inset 0 2px 4px rgba(0,0,0,.25)' : '';
    btn.style.background  = disabled ? '#222' : (on ? '#333' : '');
    btn.style.color       = disabled ? '#777' : (on ? '#fff' : '');
    btn.style.border      = '1px solid #444';
    btn.style.padding     = '4px 8px';
    btn.style.borderRadius= '6px';
    btn.style.display     = 'inline-flex';
    btn.style.alignItems  = 'center';
    btn.style.gap         = '6px';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  let instrument = select.value;
  let tool = 'aim';

  function reflectTool(){
    styleBtn(addBtn, tool==='add');
    styleBtn(delBtn, tool==='delete');
  }
  reflectTool();
  maybeExitDeleteMode();

  const setTool = (t)=>{ tool = t; reflectTool();
  maybeExitDeleteMode(); updateHint(); console.log('[toyui] tool ->', tool); };
  const setInstrument = (name)=>{ instrument = name; select.value = name; };
  select.addEventListener('change', ()=>{ instrument = select.value; });

  const stop = ev => { ev.stopPropagation(); };
  addBtn && addBtn.addEventListener('click', e=>{ e.preventDefault(); stop(e); });
  delBtn && delBtn.addEventListener('click', e=>{ e.preventDefault(); stop(e); });
  addBtn && addBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); stop(e); setTool(tool==='add'?'aim':'add'); });
  delBtn && delBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); stop(e); setTool(tool==='delete'?'aim':'delete'); });
  select.addEventListener('pointerdown', stop);
  select.addEventListener('click', stop);

  // Hint / toast
  const hint = document.createElement('div');
  hint.style.cssText = `position:absolute; left:12px; bottom:12px; z-index:4;
    background:rgba(0,0,0,.7); color:#fff; padding:6px 8px;
    border:1px solid #333; border-radius:8px; font:12px system-ui,sans-serif;
    pointer-events:none; display:none;`;
  shell.appendChild(hint);
  let toastTimer = null;
  
function maybeExitDeleteMode(){
    if (tool !== 'delete') return;
    if (deleteMode !== 'until-empty') return;
    try{
      const n = typeof getDeletableCount === 'function' ? Number(getDeletableCount()) : NaN;
      if (!Number.isFinite(n)) return;
      if (n <= 0){ setTool('aim'); }
      else { styleBtn(delBtn, true); }
    }catch{}
  }

  function updateHint(){
    if (tool === 'add')      { hint.textContent = hintAdd;    hint.style.display='block'; }
    else if (tool === 'delete'){ hint.textContent = hintDelete; hint.style.display='block'; }
    else                     { hint.style.display='none'; }
  }
  function toast(msg){
    hint.textContent = msg;
    hint.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(updateHint, 900);
  }
  function setAddEnabled(on){ if (addBtn){ addBtn.disabled = !on; styleBtn(addBtn, tool==='add'); } }
  return {
    get instrument(){ return instrument; },
    setInstrument,
    get tool(){ return tool; },
    setTool,
    setAddEnabled,
    onDeleted: maybeExitDeleteMode,
    toast,
    autoReturnAdd,
    autoReturnDelete
  };
}


// Legacy compatibility (top-level)
export const DEFAULT_INSTRUMENTS = [
  'Tone (Sine)','Keypad','Pop','Pad',
  'Retro Square','Retro Saw','Retro Triangle',
  'Laser','Windy','Alien','Organish','Droplet'
];
