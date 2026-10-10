import { DEFAULT_CHORDS, normalizeChords, normalizeChordStep, resolveChordAtTick } from './chord-progression.js';
import { normalizeSemitones } from './modifier-types.js';
export const isHarmonyLabEnabled = url => {
  const parsed=new URL(url);return ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||parsed.searchParams.get('debug')==='1';
};
export const LAB_PRESETS = Object.freeze({
  A:Object.freeze({name:'A — Chord-tone friendly',bass:'C G E G',melody:'E G C G E G C -'}),
  B:Object.freeze({name:'B — Scale melody',bass:'C G E G',melody:'E G A G E F# D C'}),
  C:Object.freeze({name:'C — Repeated-note motif',bass:'C C G C',melody:'E E E G E E D -'}),
  D:Object.freeze({name:'D — Chromatic stress',bass:'C F# E G#',melody:'E F# G# G E D# C# -'})
});
export const LAB_PROGRESSIONS=Object.freeze([
 ['C','Am','F','G'],['C','F','G','C'],['Am','F','C','G'],['C','G','Am','F']
].map(labels=>Object.freeze({label:labels.join(' | '),chords:normalizeChords(labels.map(note=>({root:note.replace('m',''),quality:note.endsWith('m')?'minor':'major'})))})));
export function parseLabNotes(text,defaultOctave) {
  const tokens=String(text).trim().split(/[\s,|]+/).filter(Boolean);
  if(!tokens.length||tokens.length>32)throw new Error('Use 1–32 notes or rests (— or -).');
  return Object.freeze(tokens.map(token=>{
    if(['-','—','rest'].includes(token.toLowerCase()))return null;
    const m=/^([A-G])([#b]?)(-?\d+)?$/i.exec(token);
    if(!m)throw new Error('Use notes such as C, F#, Bb3, or - for a rest.');
    const octave=m[3]==null?defaultOctave:Number(m[3]);
    if(octave<0||octave>8)throw new Error('Use octaves 0–8.');
    return m[1].toUpperCase()+m[2]+octave;
  }));
}
export function createHarmonyLabModel() {
  let state;
  const reset=()=>{state=Object.freeze({mode:'original',preset:'B',bassText:LAB_PRESETS.B.bass,melodyText:LAB_PRESETS.B.melody,
    bassNotes:parseLabNotes(LAB_PRESETS.B.bass,3),melodyNotes:parseLabNotes(LAB_PRESETS.B.melody,4),
    bassRole:'bass',melodyRole:'melody',bassInstrument:'retro-triangle',soloPart:'melody',
    mix:Object.freeze({bass:Object.freeze({volume:.6,muted:false}),melody:Object.freeze({volume:1,muted:false}),drums:Object.freeze({volume:.45,muted:false})}),chords:normalizeChords(DEFAULT_CHORDS),stepTicks:384,transpose:0,bpm:120});return state;};
  reset();
  const update=patch=>{state=Object.freeze({...state,...patch});return state;};
  return {
    getState:()=>state, reset,
    setMode:mode=>{if(!['original','follow'].includes(mode))throw new Error('Unknown Harmony Lab mode: '+mode);return update({mode});},
    setBassInstrument:instrument=>{if(!['sine','retro-triangle','retro-square'].includes(instrument))throw new Error('Unknown bass tone');return update({bassInstrument:instrument});},
    setSolo:part=>{if(part!==null&&!['bass','melody','drums'].includes(part))throw new Error('Unknown solo part');return update({soloPart:part});},
    setMix:(part,patch)=>{if(!state.mix[part])throw new Error('Unknown mix part');const current=state.mix[part];return update({mix:Object.freeze({...state.mix,[part]:Object.freeze({volume:patch.volume==null?current.volume:Math.max(0,Math.min(1,Number(patch.volume)||0)),muted:patch.muted==null?current.muted:!!patch.muted})})});},
    setRole:(part,role)=>['bass','melody'].includes(part)&&['bass','melody'].includes(role)?update({[part+'Role']:role}):state,
    setNotes:(part,text)=>{if(!['bass','melody'].includes(part))return state;const notes=parseLabNotes(text,part==='bass'?3:4);return update({[part+'Text']:text,[part+'Notes']:notes,preset:'custom'});},
    loadProgression:index=>{const p=LAB_PROGRESSIONS[index];if(!p)throw new Error('Unknown progression preset');return update({chords:p.chords});},
    setProgression:({chords=state.chords,stepTicks=state.stepTicks}={})=>update({chords:normalizeChords(chords),stepTicks:normalizeChordStep(stepTicks)}),
    setTranspose:value=>update({transpose:normalizeSemitones(value)}),
    setBpm:value=>update({bpm:Math.max(30,Math.min(200,Number(value)||120))}),
    loadPreset:id=>{const p=LAB_PRESETS[id];if(!p)return state;return update({preset:id,bassText:p.bass,melodyText:p.melody,bassNotes:parseLabNotes(p.bass,3),melodyNotes:parseLabNotes(p.melody,4)});},
    resolveChord:tick=>resolveChordAtTick({harmony:{originTick:0,stepTicks:state.stepTicks,chords:state.chords}},tick)
  };
}
