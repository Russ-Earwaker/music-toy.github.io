import { initializeToyMusicalRole, setToyMusicalRole } from './musical-role.js';
import { classifyMusicalRole } from './harmonic-adaptation.js';
import { advancedGroup } from './toy-advanced.js';
import { normalizeLocalTranspose, restoreToyLocalTranspose } from './toy-local-transpose.js';

export function installMusicalRoleUI(panel) {
  if (panel.dataset.toy !== 'drawgrid' || panel.querySelector('.musical-role-control')) return;
  initializeToyMusicalRole(panel);
  const group=advancedGroup(panel,'musical','Musical');
  if(!group)return;
  restoreToyLocalTranspose(panel,{localTranspose:panel.dataset.localTranspose});
  const roleLabel=document.createElement('label');roleLabel.textContent='Role: ';
  const select=document.createElement('select');select.className='toy-btn musical-role-control';
  select.setAttribute('aria-label','Musical role');
  select.title='Musical role controls harmony behavior; instrument controls timbre.';
  for(const [value,label] of [['melody','Melody'],['accompaniment','Accompaniment']]){
    const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
  }
  const refresh=()=>{select.value=classifyMusicalRole({toyType:'drawgrid',instrument:panel.dataset.instrument,options:{toyMusicalRole:panel.dataset.musicalRole}})==='accompaniment'?'accompaniment':'melody';};
  select.addEventListener('change',()=>{setToyMusicalRole(panel,select.value);window.Persistence?.markDirty?.();});
  panel.addEventListener('toy:role',refresh);panel.addEventListener('toy:instrument',refresh);
  roleLabel.append(select);group.append(roleLabel);
  const transposeLabel=document.createElement('label');transposeLabel.textContent='Transpose: ';
  const transpose=document.createElement('select');transpose.className='toy-btn local-transpose-control';transpose.setAttribute('aria-label','Local transpose');
  transpose.title='Semitones for this toy; adds to graph Transpose.';
  for(let value=-12;value<=12;value++){const option=document.createElement('option');option.value=String(value);option.textContent=value>0?'+'+value:String(value);transpose.append(option);}
  const refreshTranspose=()=>{transpose.value=String(normalizeLocalTranspose(panel.dataset.localTranspose));};
  transpose.addEventListener('change',()=>{restoreToyLocalTranspose(panel,{localTranspose:transpose.value});window.Persistence?.markDirty?.();});
  panel.addEventListener('toy:transpose',refreshTranspose);
  transposeLabel.append(transpose);group.append(transposeLabel);
  // Allow Escape to reach the shared Advanced handler; other keys edit controls.
  for(const control of [select,transpose]){control.addEventListener('pointerdown',event=>event.stopPropagation());control.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});}
  refresh();refreshTranspose();
}
