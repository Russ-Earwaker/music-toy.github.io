import { CHORD_ROOTS, CHORD_STEP_TICKS, chordStepLabel, progressionLabel } from './chord-progression.js';
// Native controls retain keyboard and touch behavior inside the board's SVG.
export function createChordProgressionControls(model,id,onChange,onInteract = () => {}) {
  const body=document.createElement('div');body.className='progression-controls';
  body.addEventListener('pointerdown',e=>{e.stopPropagation();onInteract();});
  body.addEventListener('keydown',e=>e.stopPropagation());
  let signature=null, focusedLabel=null;
  const select=(label,values,value,change)=>{
    const node=document.createElement('select');node.setAttribute('aria-label',label);
    for(const [v,text] of values){const option=document.createElement('option');option.value=String(v);option.textContent=text;node.append(option);}
    node.value=String(value);if(label===focusedLabel)queueMicrotask(()=>node.focus?.({preventScroll:true}));node.addEventListener('change',()=>{change(node.value);onChange();});return node;
  };
  const button=(label,disabled,action)=>{
    const node=document.createElement('button');node.type='button';node.textContent=label;node.disabled=disabled;
    node.addEventListener('click',e=>{e.stopPropagation();action();onChange();});return node;
  };
  const render=s=>{
    const next=JSON.stringify([s.chords,s.stepTicks]);if(signature===next)return;signature=next;
    focusedLabel=body.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
    body.replaceChildren();
    const summary=document.createElement('div');summary.className='progression-summary';summary.textContent=progressionLabel(s.chords);body.append(summary);
    // Read the current record inside every handler; edits never replace playback.
    s.chords.forEach((chord,index)=>{
      const row=document.createElement('div');row.className='progression-row';
      const number=document.createElement('span');number.textContent=String(index+1);
      const change=patch=>{const current=model.get(id);model.setProgression(id,{chords:current.chords.map((c,i)=>i===index?{...c,...patch}:c)});};
      row.append(number,select('Chord '+(index+1)+' root',CHORD_ROOTS.map(r=>[r,r]),chord.root,root=>change({root})),
        select('Chord '+(index+1)+' quality',[['major','Major'],['minor','Minor']],chord.quality,quality=>change({quality})),
        button('Remove '+(index+1),s.chords.length===1,()=>model.setProgression(id,{chords:model.get(id).chords.filter((_,i)=>i!==index)})));
      body.append(row);
    });
    body.append(button('Add chord',s.chords.length===8,()=>model.setProgression(id,{chords:[...model.get(id).chords,{root:'C',quality:'major'}]})));
    const duration=document.createElement('label');duration.textContent='Change every ';
    duration.append(select('Chord step duration',CHORD_STEP_TICKS.map(t=>[t,chordStepLabel(t)]),s.stepTicks,stepTicks=>model.setProgression(id,{stepTicks})));body.append(duration);
  };
  return {body,render};
}

export function createChordProgressionEditor(model,id,onChange,onInteract) {
  const controls=createChordProgressionControls(model,id,onChange,onInteract);
  const object=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
  object.setAttribute('class','chord-progression-editor');object.append(controls.body);
  return {object,render:controls.render};
}
